import { createHash } from 'node:crypto';

import type {
  CreateDocumentUploadResponse,
  DocumentStatus,
  DocumentType,
  UploadCompleteResponse,
} from '@ikp/shared';
import {
  canTransitionDocument,
  ERROR_CODES,
  hasCapability,
  type AuditAction,
  type Role,
} from '@ikp/shared';

import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import { originalFileKey } from '../../infrastructure/storage/storage-keys.js';
import type { AuditLogService } from '../audit/audit-log.service.js';
import { DocumentMetadataRepository } from './document-metadata.repository.js';
import { DocumentVersionsRepository } from './document-versions.repository.js';
import { DocumentsRepository } from './documents.repository.js';
import { slugify } from './slug.js';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function extensionForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  return map[mimeType] ?? 'bin';
}

export interface DocumentUploadInput {
  title: string;
  document_type: DocumentType;
  department_id?: string;
  mime_type: string;
  academic_year?: string | null;
  course?: string | null;
  semester?: number | null;
  audience?: Record<string, unknown> | null;
}

export interface UploadActor {
  institutionId: string;
  userId: string;
  role: string;
}

export interface DocumentListQuery {
  search?: string;
  department_id?: string;
  document_type?: DocumentType;
  status?: DocumentStatus;
  academic_year?: string;
  course?: string;
  semester?: number;
  tag?: string;
  published_from?: string;
  published_to?: string;
  sort?: 'recent' | 'oldest';
  page: number;
  limit: number;
}

export interface DocumentListItemView {
  id: string;
  title: string;
  document_type: DocumentType;
  department: { id: string; name: string } | null;
  status: DocumentStatus;
  published_at: string | null;
  summary: string | null;
}

export interface DocumentDetailView {
  id: string;
  title: string;
  slug: string;
  document_type: DocumentType;
  status: DocumentStatus;
  department: { id: string; name: string } | null;
  published_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  metadata: {
    academic_year: string | null;
    course: string | null;
    semester: number | null;
    audience: Record<string, unknown>;
    tags: string[];
  };
}

/**
 * Ordinary users (STUDENT/FACULTY) only see published documents; staff roles
 * see the full workflow. Drafts never leak to ordinary users
 * (`.agent/AGENTS.md` §5.3 / `.agent/architecture/TECHNICAL_SPEC.md` §15).
 */
function visibleStatusesForRole(role: string): DocumentStatus[] | undefined {
  if (role === 'STUDENT' || role === 'FACULTY') {
    return ['PUBLISHED'];
  }
  return undefined;
}

function isDocumentManager(role: string): boolean {
  return role === 'APPROVER' || role === 'INSTITUTION_ADMIN' || role === 'PLATFORM_ADMIN';
}

function transitionAuditAction(toStatus: DocumentStatus): AuditAction {
  switch (toStatus) {
    case 'IN_REVIEW':
      return 'document.submitted_for_review';
    case 'APPROVED':
      return 'document.approved';
    case 'PUBLISHED':
      return 'document.published';
    case 'ARCHIVED':
      return 'document.archived';
    case 'SUPERSEDED':
      return 'document.superseded';
    case 'DRAFT':
      return 'document.returned_to_draft';
  }
}

interface TransitionRule {
  capability: 'document.edit_draft' | 'document.approve' | 'document.publish';
  creatorOnly?: boolean;
}

/**
 * Authorization per transition. "Optional" capabilities in the API
 * authorization matrix default to the stricter interpretation.
 */
const TRANSITION_RULES: Record<string, TransitionRule> = {
  'DRAFT->IN_REVIEW': { capability: 'document.edit_draft', creatorOnly: true },
  'DRAFT->ARCHIVED': { capability: 'document.edit_draft' },
  'IN_REVIEW->APPROVED': { capability: 'document.approve' },
  'IN_REVIEW->DRAFT': { capability: 'document.approve' },
  'APPROVED->PUBLISHED': { capability: 'document.publish' },
  'APPROVED->DRAFT': { capability: 'document.approve' },
  'PUBLISHED->SUPERSEDED': { capability: 'document.publish' },
  'PUBLISHED->ARCHIVED': { capability: 'document.publish' },
  'SUPERSEDED->ARCHIVED': { capability: 'document.publish' },
};

export class DocumentsService {
  private readonly documents: DocumentsRepository;
  private readonly metadata: DocumentMetadataRepository;
  private readonly versions: DocumentVersionsRepository;

  constructor(
    private readonly pool: DbPool,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditLogService,
  ) {
    this.documents = new DocumentsRepository(pool);
    this.metadata = new DocumentMetadataRepository(pool);
    this.versions = new DocumentVersionsRepository(pool);
  }

  async createUpload(
    actor: UploadActor,
    input: DocumentUploadInput,
  ): Promise<CreateDocumentUploadResponse> {
    this.assertAllowedMimeType(input.mime_type);

    const baseSlug = slugify(input.title);
    let slug = baseSlug;
    let attempts = 0;
    while ((await this.documents.existsSlug(actor.institutionId, slug)) && attempts < 5) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
      attempts += 1;
    }
    if (attempts >= 5) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Could not allocate a unique slug.', 409, {});
    }

    const document = await this.documents.create(actor.institutionId, {
      title: input.title,
      slug,
      document_type: input.document_type,
      department_id: input.department_id,
      created_by: actor.userId,
    });

    const storageKey = originalFileKey(
      { institutionId: actor.institutionId, documentId: document.id, version: 1 },
      extensionForMimeType(input.mime_type),
    );
    await this.metadata.create(document.id, actor.institutionId, {
      academic_year: input.academic_year,
      course: input.course,
      semester: input.semester,
      audience: input.audience,
      extra: { pending_upload: { storage_key: storageKey, mime_type: input.mime_type } },
    });

    const uploadUrl = await this.storage.presignPut(storageKey, input.mime_type, 15 * 60);

    await this.audit.record(actor, {
      action: 'document.created',
      entityType: 'document',
      entityId: document.id,
      metadata: { title: document.title, document_type: document.document_type },
    });

    return {
      document: { id: document.id, status: document.status, title: document.title },
      upload: {
        upload_url: uploadUrl,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    };
  }

  async confirmUpload(actor: UploadActor, documentId: string): Promise<UploadCompleteResponse> {
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      throw AppError.notFound('Document not found.');
    }
    if (document.status !== 'DRAFT') {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'Only draft documents can receive an initial upload.',
        409,
        {},
      );
    }
    if (document.created_by !== actor.userId) {
      throw AppError.forbidden('Only the creator can confirm the upload.');
    }

    const existingVersion = await this.versions.findVersionNumber(
      actor.institutionId,
      documentId,
      1,
    );
    if (existingVersion) {
      // Idempotent replay: the upload was already confirmed.
      return { document_id: documentId, processing_status: 'QUEUED' };
    }

    const metadata = await this.metadata.findByDocumentId(actor.institutionId, documentId);
    const pendingUpload = metadata?.extra?.pending_upload as
      { storage_key?: unknown; mime_type?: unknown } | undefined;
    if (!pendingUpload || typeof pendingUpload.storage_key !== 'string') {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'No upload has been initiated for this document.',
        409,
        {},
      );
    }
    const storageKey = pendingUpload.storage_key;

    const head = await this.storage.head(storageKey);
    if (!head) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'The upload has not been received by object storage.',
        409,
        {},
      );
    }

    const maxBytes = await this.maxUploadBytes(actor.institutionId);
    if (head.sizeBytes > maxBytes) {
      throw new AppError(
        ERROR_CODES.FILE_TOO_LARGE,
        `File exceeds the maximum allowed size of ${maxBytes} bytes.`,
        413,
        { max_bytes: maxBytes },
      );
    }

    const object = await this.storage.get(storageKey);
    if (!object) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'The upload has not been received by object storage.',
        409,
        {},
      );
    }
    this.assertAllowedMimeType(object.contentType);

    const sha256 = createHash('sha256').update(object.body).digest('hex');

    const version = await this.versions.create(actor.institutionId, {
      document_id: documentId,
      version_number: 1,
      storage_key: storageKey,
      mime_type: object.contentType,
      size_bytes: object.sizeBytes,
      sha256,
      created_by: actor.userId,
    });
    await this.documents.setCurrentVersion(actor.institutionId, documentId, version.id);

    await this.audit.record(actor, {
      action: 'document.uploaded',
      entityType: 'document',
      entityId: documentId,
      metadata: {
        version: version.version_number,
        mime_type: version.mime_type,
        size_bytes: version.size_bytes,
        sha256: version.sha256,
      },
    });

    return { document_id: documentId, processing_status: 'QUEUED' };
  }

  async list(
    actor: UploadActor,
    query: DocumentListQuery,
  ): Promise<{ data: DocumentListItemView[]; total: number }> {
    const statuses = query.status ? [query.status] : visibleStatusesForRole(actor.role);
    const rows = await this.documents.list(actor.institutionId, {
      search: query.search,
      department_id: query.department_id,
      document_type: query.document_type,
      statuses,
      academic_year: query.academic_year,
      course: query.course,
      semester: query.semester,
      tag: query.tag,
      published_from: query.published_from ? new Date(query.published_from) : undefined,
      published_to: query.published_to ? new Date(query.published_to) : undefined,
      sort: query.sort,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    const total = await this.documents.listCount(actor.institutionId, {
      search: query.search,
      department_id: query.department_id,
      document_type: query.document_type,
      statuses,
      academic_year: query.academic_year,
      course: query.course,
      semester: query.semester,
      tag: query.tag,
      published_from: query.published_from ? new Date(query.published_from) : undefined,
      published_to: query.published_to ? new Date(query.published_to) : undefined,
    });

    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        document_type: row.document_type,
        department: row.department_id
          ? { id: row.department_id, name: row.department_name ?? '' }
          : null,
        status: row.status,
        published_at: row.published_at ? row.published_at.toISOString() : null,
        summary: null,
      })),
      total,
    };
  }

  async get(actor: UploadActor, documentId: string): Promise<DocumentDetailView | null> {
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      return null;
    }
    if (document.status !== 'PUBLISHED' && actor.role === 'STUDENT') {
      // Never leak unpublished documents to ordinary users.
      return null;
    }
    if (document.status !== 'PUBLISHED' && actor.role === 'FACULTY') {
      return null;
    }

    const metadata = await this.metadata.findByDocumentId(actor.institutionId, documentId);
    const department = document.department_id
      ? await this.departmentName(actor.institutionId, document.department_id)
      : null;

    return {
      id: document.id,
      title: document.title,
      slug: document.slug,
      document_type: document.document_type,
      status: document.status,
      department,
      published_at: document.published_at ? document.published_at.toISOString() : null,
      effective_from: document.effective_from ? document.effective_from.toISOString() : null,
      effective_to: document.effective_to ? document.effective_to.toISOString() : null,
      created_by: document.created_by,
      created_at: document.created_at.toISOString(),
      updated_at: document.updated_at.toISOString(),
      metadata: {
        academic_year: metadata?.academic_year ?? null,
        course: metadata?.course ?? null,
        semester: metadata?.semester ?? null,
        audience: metadata?.audience ?? {},
        tags: (metadata?.tags as string[]) ?? [],
      },
    };
  }

  async updateMetadata(
    actor: UploadActor,
    documentId: string,
    input: {
      title?: string;
      tags?: string[];
      document_type?: DocumentType;
      academic_year?: string | null;
      course?: string | null;
      semester?: number | null;
      audience?: Record<string, unknown> | null;
    },
  ): Promise<DocumentDetailView | null> {
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      return null;
    }
    if (document.created_by !== actor.userId && !isDocumentManager(actor.role)) {
      throw AppError.forbidden('Only the creator or a document manager can edit this document.');
    }

    if (input.title !== undefined) {
      await this.documents.update(actor.institutionId, documentId, { title: input.title });
    }
    if (
      input.tags !== undefined ||
      input.academic_year !== undefined ||
      input.course !== undefined ||
      input.semester !== undefined ||
      input.audience !== undefined
    ) {
      await this.metadata.update(documentId, actor.institutionId, {
        tags: input.tags,
        academic_year: input.academic_year,
        course: input.course,
        semester: input.semester,
        audience: input.audience,
      });
    }

    const changed = Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    await this.audit.record(actor, {
      action: 'document.updated',
      entityType: 'document',
      entityId: documentId,
      metadata: { fields: changed },
    });

    return this.get(actor, documentId);
  }

  /**
   * Applies a lifecycle transition with per-transition authorization.
   * Throws 409 for invalid transitions, 403 for insufficient rights, and
   * 409 when submitting a document that has no content yet.
   */
  async transition(
    actor: UploadActor,
    documentId: string,
    toStatus: DocumentStatus,
  ): Promise<DocumentDetailView | null> {
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      return null;
    }

    if (!canTransitionDocument(document.status, toStatus)) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        `Cannot transition a document from ${document.status} to ${toStatus}.`,
        409,
        { from: document.status, to: toStatus },
      );
    }

    const rule = TRANSITION_RULES[`${document.status}->${toStatus}`];
    if (!rule) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        `Transition ${document.status} -> ${toStatus} is not permitted.`,
        409,
        { from: document.status, to: toStatus },
      );
    }

    if (rule.creatorOnly && document.created_by !== actor.userId) {
      throw AppError.forbidden('Only the creator can perform this action.');
    }
    if (!hasCapability(actor.role as Role, rule.capability)) {
      throw AppError.forbidden();
    }

    if (toStatus === 'IN_REVIEW' && !document.current_version_id) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'A document must have content before it can be submitted for review.',
        409,
        {},
      );
    }

    await this.documents.updateStatus(actor.institutionId, documentId, toStatus, {
      published_at: toStatus === 'PUBLISHED' ? new Date() : undefined,
    });

    await this.audit.record(actor, {
      action: transitionAuditAction(toStatus),
      entityType: 'document',
      entityId: documentId,
      metadata: { from: document.status, to: toStatus },
    });

    return this.get(actor, documentId);
  }

  private async departmentName(
    institutionId: string,
    departmentId: string,
  ): Promise<{ id: string; name: string } | null> {
    const result = await this.pool.query(
      'SELECT id, name FROM departments WHERE id = $1 AND institution_id = $2',
      [departmentId, institutionId],
    );
    const row = result.rows[0];
    return row ? { id: row.id as string, name: row.name as string } : null;
  }

  private async maxUploadBytes(institutionId: string): Promise<number> {
    const result = await this.pool.query('SELECT settings FROM institutions WHERE id = $1', [
      institutionId,
    ]);
    const row = result.rows[0] as { settings?: Record<string, unknown> } | undefined;
    const configured = row?.settings?.max_upload_mb;
    const mb = typeof configured === 'number' && Number.isFinite(configured) ? configured : 25;
    return Math.max(1, Math.floor(mb * 1024 * 1024));
  }

  private assertAllowedMimeType(mimeType: string): void {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new AppError(
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        `Unsupported file type: ${mimeType}.`,
        415,
        { mime_type: mimeType },
      );
    }
  }
}
