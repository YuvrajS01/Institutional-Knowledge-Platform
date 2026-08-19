import type { DocumentStatus, DocumentType } from '@ikp/shared';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface DocumentRow {
  id: string;
  institution_id: string;
  current_version_id: string | null;
  title: string;
  slug: string;
  document_type: DocumentType;
  status: DocumentStatus;
  department_id: string | null;
  published_at: Date | null;
  effective_from: Date | null;
  effective_to: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentCreateInput {
  title: string;
  slug: string;
  document_type: DocumentType;
  department_id?: string;
  created_by: string;
}

function mapDocumentRow(row: Record<string, unknown>): DocumentRow {
  return {
    id: row.id as string,
    institution_id: row.institution_id as string,
    current_version_id: (row.current_version_id as string | null) ?? null,
    title: row.title as string,
    slug: row.slug as string,
    document_type: row.document_type as DocumentType,
    status: row.status as DocumentStatus,
    department_id: (row.department_id as string | null) ?? null,
    published_at: (row.published_at as Date | null) ?? null,
    effective_from: (row.effective_from as Date | null) ?? null,
    effective_to: (row.effective_to as Date | null) ?? null,
    created_by: row.created_by as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

const SELECT_COLUMNS = [
  'id',
  'institution_id',
  'current_version_id',
  'title',
  'slug',
  'document_type',
  'status',
  'department_id',
  'published_at',
  'effective_from',
  'effective_to',
  'created_by',
  'created_at',
  'updated_at',
].join(', ');

export class DocumentsRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async create(institutionId: string, input: DocumentCreateInput): Promise<DocumentRow> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `INSERT INTO documents (institution_id, title, slug, document_type, department_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [
        tenantId,
        input.title,
        input.slug,
        input.document_type,
        input.department_id ?? null,
        input.created_by,
      ],
    );
    return mapDocumentRow(result.rows[0] as Record<string, unknown>);
  }

  async findById(institutionId: string, id: string): Promise<DocumentRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM documents d
       WHERE d.id = $2 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, id],
    );
    const row = result.rows[0];
    return row ? mapDocumentRow(row as Record<string, unknown>) : null;
  }

  async existsSlug(institutionId: string, slug: string): Promise<boolean> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT 1 FROM documents d WHERE d.slug = $2 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, slug],
    );
    return result.rows.length > 0;
  }

  async setCurrentVersion(institutionId: string, id: string, versionId: string): Promise<void> {
    const tenantId = this.tenantId(institutionId);
    await this.pool.query(
      `UPDATE documents d
       SET current_version_id = $3, updated_at = now()
       WHERE d.id = $2 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, id, versionId],
    );
  }
}
