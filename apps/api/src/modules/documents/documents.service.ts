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
import type { JobQueue } from '@ikp/queue';

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
  is_current: boolean;
  superseded_by: { id: string; title: string } | null;
  superseded_at: string | null;
  superseded_reason: string | null;
  current_version_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  summary: string | null;
  metadata: {
    academic_year: string | null;
    course: string | null;
    semester: number | null;
    audience: Record<string, unknown>;
    tags: string[];
    extracted_dates: unknown[];
  };
}

function extractSummary(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 2) {
    const summary = sentences.slice(0, 2).join(' ').trim();
    return summary.length > 500 ? `${summary.slice(0, 500).trimEnd()}…` : summary;
  }
  const fallback = trimmed.slice(0, 300).trim();
  return fallback.length === 0 ? null : fallback;
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
    private readonly queue?: JobQueue,
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

    if (this.queue) {
      await this.queue.enqueue({
        name: 'document.process',
        jobId: `${documentId}-v${version.version_number}-document.process`,
        institutionId: actor.institutionId,
        documentId,
        versionId: version.id,
      });
    }

    return { document_id: documentId, processing_status: 'QUEUED' };
  }

  async list(
    actor: UploadActor,
    query: DocumentListQuery,
  ): Promise<{ data: DocumentListItemView[]; total: number }> {
    let statuses: DocumentStatus[] | undefined;
    if (query.status) {
      // Enforce RBAC for status-filtered listing: non-PUBLISHED statuses require approver/publisher
      if (
        query.status !== 'PUBLISHED' &&
        !hasCapability(actor.role as Role, 'document.approve') &&
        !hasCapability(actor.role as Role, 'document.publish') &&
        !isDocumentManager(actor.role)
      ) {
        throw AppError.forbidden('Insufficient permissions to filter by this status.');
      }
      statuses = [query.status];
    } else {
      statuses = visibleStatusesForRole(actor.role);
    }
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

  async reviewQueue(
    actor: UploadActor,
    query: Omit<DocumentListQuery, 'status'>,
  ): Promise<{ data: DocumentListItemView[]; total: number }> {
    if (!hasCapability(actor.role as Role, 'document.approve')) {
      throw AppError.forbidden();
    }
    return this.list(actor, { ...query, status: 'IN_REVIEW' });
  }

  async get(actor: UploadActor, documentId: string): Promise<DocumentDetailView | null> {
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      return null;
    }
    if (
      document.status !== 'PUBLISHED' &&
      document.status !== 'SUPERSEDED' &&
      actor.role === 'STUDENT'
    ) {
      // Never leak unpublished documents to ordinary users; SUPERSEDED remains visible as historical.
      return null;
    }
    if (
      document.status !== 'PUBLISHED' &&
      document.status !== 'SUPERSEDED' &&
      actor.role === 'FACULTY'
    ) {
      return null;
    }

    const metadata = await this.metadata.findByDocumentId(actor.institutionId, documentId);
    const department = document.department_id
      ? await this.departmentName(actor.institutionId, document.department_id)
      : null;

    let supersededBy: { id: string; title: string } | null = null;
    if (document.superseded_by_document_id) {
      const superseding = await this.documents.findById(
        actor.institutionId,
        document.superseded_by_document_id,
      );
      if (superseding) {
        supersededBy = { id: superseding.id, title: superseding.title };
      } else {
        supersededBy = { id: document.superseded_by_document_id, title: '' };
      }
    }

    const isCurrent = document.status === 'PUBLISHED' && !document.superseded_by_document_id;

    // Summary: prefer extracted_metadata.summary stored by AI, else heuristic from extracted_text
    let summary: string | null = null;
    if (metadata?.extra) {
      const extra = metadata.extra as Record<string, unknown>;
      const candidate =
        (extra as { summary?: unknown }).summary ??
        (extra as { extracted_metadata?: { summary?: unknown } }).extracted_metadata?.summary ??
        (extra as { extractedMetadata?: { summary?: unknown } }).extractedMetadata?.summary;
      if (typeof candidate === 'string' && candidate.trim()) {
        summary = candidate.trim().slice(0, 500);
      }
    }
    if (!summary && document.current_version_id) {
      try {
        const versions = await this.versions.listByDocumentId(actor.institutionId, documentId);
        const current = versions.find((v) => v.id === document.current_version_id);
        const text = current?.extracted_text ?? versions.find((v) => v.extracted_text && v.extracted_text.trim())?.extracted_text ?? null;
        summary = extractSummary(text);
      } catch {
        // leave summary null
      }
    }

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
      is_current: isCurrent,
      superseded_by: supersededBy,
      superseded_at: document.superseded_at ? document.superseded_at.toISOString() : null,
      superseded_reason: document.superseded_reason ?? null,
      current_version_id: document.current_version_id,
      created_by: document.created_by,
      created_at: document.created_at.toISOString(),
      updated_at: document.updated_at.toISOString(),
      summary,
      metadata: {
        academic_year: metadata?.academic_year ?? null,
        course: metadata?.course ?? null,
        semester: metadata?.semester ?? null,
        audience: metadata?.audience ?? {},
        tags: (metadata?.tags as string[]) ?? [],
        extracted_dates: (metadata?.extracted_dates as unknown[]) ?? [],
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

  async supersede(
    actor: UploadActor,
    documentId: string,
    supersededByDocumentId: string,
    reason?: string | null,
  ): Promise<DocumentDetailView | null> {
    if (!hasCapability(actor.role as Role, 'document.publish')) {
      throw AppError.forbidden();
    }
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      return null;
    }
    if (document.status !== 'PUBLISHED') {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'Only PUBLISHED documents can be superseded.',
        409,
        { status: document.status },
      );
    }
    if (documentId === supersededByDocumentId) {
      throw new AppError(ERROR_CODES.CONFLICT, 'A document cannot supersede itself.', 409, {});
    }
    const supersededBy = await this.documents.findById(actor.institutionId, supersededByDocumentId);
    if (!supersededBy) {
      throw AppError.notFound('Superseding document not found.');
    }
    if (!canTransitionDocument(document.status, 'SUPERSEDED')) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        `Cannot transition from ${document.status} to SUPERSEDED.`,
        409,
        { from: document.status, to: 'SUPERSEDED' },
      );
    }
    await this.documents.supersede(
      actor.institutionId,
      documentId,
      supersededByDocumentId,
      reason ?? null,
    );
    await this.audit.record(actor, {
      action: 'document.superseded',
      entityType: 'document',
      entityId: documentId,
      metadata: { superseded_by: supersededByDocumentId, reason: reason ?? null },
    });
    return this.get(actor, documentId);
  }

  async listVersions(
    actor: UploadActor,
    documentId: string,
  ): Promise<Array<{ id: string; version_number: number; created_at: string; is_current: boolean }> | null> {
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      return null;
    }
    const versions = await this.versions.listByDocumentId(actor.institutionId, documentId);
    return versions.map((v) => ({
      id: v.id,
      version_number: v.version_number,
      created_at: v.created_at.toISOString(),
      is_current: document.current_version_id === v.id,
    }));
  }

  async getProcessingStatus(
    actor: UploadActor,
    documentId: string,
  ): Promise<
    | Array<{
        id: string;
        version_number: number;
        processing_status: string;
        ocr_status: string | null;
        page_count: number | null;
        has_extracted_text: boolean;
        created_at: string;
        is_current: boolean;
      }>
    | null
  > {
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      return null;
    }
    // Visibility: same as get() for drafts
    if (
      document.status !== 'PUBLISHED' &&
      document.status !== 'SUPERSEDED' &&
      actor.role === 'STUDENT'
    ) {
      return null;
    }
    if (
      document.status !== 'PUBLISHED' &&
      document.status !== 'SUPERSEDED' &&
      actor.role === 'FACULTY'
    ) {
      return null;
    }
    // Only creator or manager can see processing status for non-published? For PUBLISHED any member can see
    // But for DRAFT/IN_REVIEW/APPROVED restrict to creator/manager
    if (
      document.status !== 'PUBLISHED' &&
      document.status !== 'SUPERSEDED' &&
      document.created_by !== actor.userId &&
      !isDocumentManager(actor.role)
    ) {
      throw AppError.forbidden('Only the creator or a document manager can view processing status.');
    }

    const versions = await this.versions.listByDocumentId(actor.institutionId, documentId);
    return versions.map((v) => ({
      id: v.id,
      version_number: v.version_number,
      processing_status: v.processing_status,
      ocr_status: v.ocr_status,
      page_count: v.page_count,
      has_extracted_text: Boolean(v.extracted_text && v.extracted_text.trim().length > 0),
      created_at: v.created_at.toISOString(),
      is_current: document.current_version_id === v.id,
    }));
  }

  async retryProcessing(
    actor: UploadActor,
    documentId: string,
  ): Promise<{ document_id: string; version_id: string; processing_status: string } | null> {
    const document = await this.documents.findById(actor.institutionId, documentId);
    if (!document) {
      return null;
    }
    if (document.created_by !== actor.userId && !isDocumentManager(actor.role)) {
      throw AppError.forbidden('Only the creator or a document manager can retry processing.');
    }
    const versions = await this.versions.listByDocumentId(actor.institutionId, documentId);
    if (versions.length === 0) {
      throw new AppError(ERROR_CODES.CONFLICT, 'No version available to process.', 409, {});
    }
    // Pick latest version (highest version_number)
    const latest = versions.reduce((a, b) => (a.version_number > b.version_number ? a : b));
    if (!this.queue) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Processing queue not configured.', 409, {});
    }
    // Idempotent enqueue — same jobId as confirmUpload
    await this.queue.enqueue({
      name: 'document.process',
      jobId: `${documentId}-v${latest.version_number}-document.process`,
      institutionId: actor.institutionId,
      documentId,
      versionId: latest.id,
    });
    // Optionally reset status to QUEUED if it was FAILED (best-effort, ignore errors)
    try {
      if (latest.processing_status === 'FAILED') {
        await this.pool.query(
          'UPDATE document_versions SET processing_status = $2 WHERE id = $1',
          [latest.id, 'QUEUED'],
        );
      }
    } catch {
      // ignore
    }
    await this.audit.record(actor, {
      action: 'document.updated',
      entityType: 'document',
      entityId: documentId,
      metadata: { processing_retried: true, version_id: latest.id, version_number: latest.version_number },
    });
    return { document_id: documentId, version_id: latest.id, processing_status: 'QUEUED' };
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
