import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface DocumentMetadataUpdateInput {
  academic_year?: string | null;
  course?: string | null;
  semester?: number | null;
  audience?: Record<string, unknown> | null;
  tags?: string[];
  extra?: Record<string, unknown> | null;
}

export interface DocumentMetadataRow {
  id: string;
  document_id: string;
  academic_year: string | null;
  course: string | null;
  semester: number | null;
  audience: Record<string, unknown>;
  tags: unknown[];
  extra: Record<string, unknown>;
}

/**
 * Metadata is document-owned; the institution scope is required for
 * consistency with the tenant pattern even though the row is reached via the
 * document id (validated by the caller against the tenant).
 */
export class DocumentMetadataRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async create(
    documentId: string,
    institutionId: string,
    input: DocumentMetadataUpdateInput = {},
  ): Promise<void> {
    this.tenantId(institutionId);
    await this.pool.query(
      `INSERT INTO document_metadata (document_id, academic_year, course, semester, audience, extra)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        documentId,
        input.academic_year ?? null,
        input.course ?? null,
        input.semester ?? null,
        input.audience ?? {},
        input.extra ?? {},
      ],
    );
  }

  async update(
    documentId: string,
    institutionId: string,
    input: DocumentMetadataUpdateInput,
  ): Promise<void> {
    this.tenantId(institutionId);
    await this.pool.query(
      `UPDATE document_metadata
       SET academic_year = COALESCE($2, academic_year),
           course = COALESCE($3, course),
           semester = COALESCE($4, semester),
           audience = COALESCE($5, audience),
           tags = COALESCE($6, tags),
           extra = COALESCE($7, extra),
           updated_at = now()
       WHERE document_id = $1`,
      [
        documentId,
        input.academic_year === undefined ? null : input.academic_year,
        input.course === undefined ? null : input.course,
        input.semester === undefined ? null : input.semester,
        input.audience === undefined ? null : input.audience,
        input.tags === undefined ? null : JSON.stringify(input.tags),
        input.extra === undefined ? null : input.extra,
      ],
    );
  }

  async findByDocumentId(
    institutionId: string,
    documentId: string,
  ): Promise<DocumentMetadataRow | null> {
    this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT id, document_id, academic_year, course, semester, audience, tags, extra
       FROM document_metadata
       WHERE document_id = $1`,
      [documentId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id as string,
      document_id: row.document_id as string,
      academic_year: (row.academic_year as string | null) ?? null,
      course: (row.course as string | null) ?? null,
      semester: (row.semester as number | null) ?? null,
      audience: (row.audience as Record<string, unknown>) ?? {},
      tags: (row.tags as unknown[]) ?? [],
      extra: (row.extra as Record<string, unknown>) ?? {},
    };
  }
}
