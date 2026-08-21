import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_number: number;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  extracted_text: string | null;
  ocr_status: string | null;
  page_count: number | null;
  processing_status: string;
  created_by: string;
  created_at: Date;
}

export interface DocumentVersionCreateInput {
  document_id: string;
  version_number: number;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_by: string;
}

function mapVersionRow(row: Record<string, unknown>): DocumentVersionRow {
  return {
    id: row.id as string,
    document_id: row.document_id as string,
    version_number: Number(row.version_number),
    storage_key: row.storage_key as string,
    mime_type: row.mime_type as string,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256 as string,
    extracted_text: (row.extracted_text as string | null) ?? null,
    ocr_status: (row.ocr_status as string | null) ?? null,
    page_count: (row.page_count as number | null) ?? null,
    processing_status: (row.processing_status as string | null) ?? 'QUEUED',
    created_by: row.created_by as string,
    created_at: row.created_at as Date,
  };
}

const SELECT_COLUMNS = [
  'id',
  'document_id',
  'version_number',
  'storage_key',
  'mime_type',
  'size_bytes',
  'sha256',
  'extracted_text',
  'ocr_status',
  'page_count',
  'processing_status',
  'created_by',
  'created_at',
].join(', ');

const SELECT_COLUMNS_PREFIXED = [
  'v.id',
  'v.document_id',
  'v.version_number',
  'v.storage_key',
  'v.mime_type',
  'v.size_bytes',
  'v.sha256',
  'v.extracted_text',
  'v.ocr_status',
  'v.page_count',
  'v.processing_status',
  'v.created_by',
  'v.created_at',
].join(', ');

export class DocumentVersionsRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async create(
    institutionId: string,
    input: DocumentVersionCreateInput,
  ): Promise<DocumentVersionRow> {
    // Fail-fast tenant validation; the row inherits its scope from the
    // (already tenant-validated) document.
    this.tenantId(institutionId);
    const result = await this.pool.query(
      `INSERT INTO document_versions
         (document_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.document_id,
        input.version_number,
        input.storage_key,
        input.mime_type,
        input.size_bytes,
        input.sha256,
        input.created_by,
      ],
    );
    return mapVersionRow(result.rows[0] as Record<string, unknown>);
  }

  async findVersionNumber(
    institutionId: string,
    documentId: string,
    versionNumber: number,
  ): Promise<DocumentVersionRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS_PREFIXED} FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE v.document_id = $2 AND v.version_number = $3 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, documentId, versionNumber],
    );
    const row = result.rows[0];
    return row ? mapVersionRow(row as Record<string, unknown>) : null;
  }

  async listByDocumentId(institutionId: string, documentId: string): Promise<DocumentVersionRow[]> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS_PREFIXED} FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE v.document_id = $2 AND ${this.tenantCondition('d', 1)}
       ORDER BY v.version_number ASC`,
      [tenantId, documentId],
    );
    return result.rows.map((row) => mapVersionRow(row as Record<string, unknown>));
  }
}
