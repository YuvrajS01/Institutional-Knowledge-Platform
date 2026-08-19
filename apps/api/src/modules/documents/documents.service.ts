import { createHash } from 'node:crypto';

import type {
  CreateDocumentUploadResponse,
  DocumentType,
  UploadCompleteResponse,
} from '@ikp/shared';
import { ERROR_CODES } from '@ikp/shared';

import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import { originalFileKey } from '../../infrastructure/storage/storage-keys.js';
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
}

export class DocumentsService {
  private readonly documents: DocumentsRepository;
  private readonly metadata: DocumentMetadataRepository;
  private readonly versions: DocumentVersionsRepository;

  constructor(
    private readonly pool: DbPool,
    private readonly storage: ObjectStorage,
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

    return { document_id: documentId, processing_status: 'QUEUED' };
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
