import type { DocumentStatus, DocumentType } from '@ikp/shared';

import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface VectorSearchOptions {
  limit?: number;
  offset?: number;
  statuses?: DocumentStatus[];
  departmentId?: string;
  documentType?: DocumentType;
  academicYear?: string;
  course?: string;
  semester?: number;
  tag?: string;
  publishedFrom?: Date;
  publishedTo?: Date;
}

export interface VectorSearchResult {
  document_id: string;
  document_title: string;
  document_slug: string;
  document_type: DocumentType;
  document_status: DocumentStatus;
  department_id: string | null;
  published_at: Date | null;
  version_id: string;
  chunk_id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  token_count: number;
  distance: number;
  similarity: number;
}

/**
 * Vector search repository (P5-006).
 *
 * Performs pgvector cosine search over `document_chunks.embedding vector(1024)`
 * (populated by P5-004 via `ProcessingService` → `EmbeddingProvider`). Tenant-
 * scoped via `documents.institution_id` and filtered to `PUBLISHED` by default
 * so students never see draft vectors (AGENTS.md §5.3 / TECHNICAL_SPEC §15).
 *
 * Uses `embedding <=> $2::vector` (cosine distance, 0 = identical) and returns
 * `1 - distance` as `similarity` for ranking. No HNSW/IVFFLAT index is required
 * for correctness; an HNSW index can be added when data volume justifies it
 * (IMPLEMENTATION_GUIDE §3).
 */
export class VectorSearchRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async searchByEmbedding(
    institutionId: string,
    queryEmbedding: number[],
    options: VectorSearchOptions = {},
  ): Promise<VectorSearchResult[]> {
    const tenantId = this.tenantId(institutionId);

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error('queryEmbedding must be a non-empty array');
    }
    for (const v of queryEmbedding) {
      if (!Number.isFinite(v)) {
        throw new Error('queryEmbedding contains non-finite value');
      }
    }

    const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const statuses = options.statuses ?? (['PUBLISHED'] as DocumentStatus[]);

    const embeddingString = `[${queryEmbedding.join(',')}]`;

    const params: unknown[] = [tenantId, embeddingString, statuses];
    let paramIndex = 4;

    const where: string[] = [
      this.tenantCondition('d', 1),
      'c.embedding IS NOT NULL',
      'd.status = ANY($3)',
    ];

    if (options.departmentId) {
      where.push(`d.department_id = $${paramIndex}`);
      params.push(options.departmentId);
      paramIndex++;
    }
    if (options.documentType) {
      where.push(`d.document_type = $${paramIndex}`);
      params.push(options.documentType);
      paramIndex++;
    }
    if (options.academicYear) {
      where.push(`m.academic_year = $${paramIndex}`);
      params.push(options.academicYear);
      paramIndex++;
    }
    if (options.course) {
      where.push(`m.course = $${paramIndex}`);
      params.push(options.course);
      paramIndex++;
    }
    if (options.semester !== undefined) {
      where.push(`m.semester = $${paramIndex}`);
      params.push(options.semester);
      paramIndex++;
    }
    if (options.tag) {
      where.push(`m.tags @> $${paramIndex}::jsonb`);
      params.push(JSON.stringify([options.tag]));
      paramIndex++;
    }
    if (options.publishedFrom) {
      where.push(`d.published_at >= $${paramIndex}`);
      params.push(options.publishedFrom);
      paramIndex++;
    }
    if (options.publishedTo) {
      where.push(`d.published_at <= $${paramIndex}`);
      params.push(options.publishedTo);
      paramIndex++;
    }

    const limitIndex = paramIndex++;
    const offsetIndex = paramIndex++;
    params.push(limit, offset);

    const whereSql = where.join(' AND ');

    const sql = `
      SELECT
        d.id AS document_id,
        d.title AS document_title,
        d.slug AS document_slug,
        d.document_type AS document_type,
        d.status AS document_status,
        d.department_id,
        d.published_at,
        c.document_version_id AS version_id,
        c.id AS chunk_id,
        c.chunk_index,
        c.page_number,
        c.content,
        c.token_count,
        (c.embedding <=> $2::vector) AS distance,
        (1 - (c.embedding <=> $2::vector)) AS similarity
      FROM document_chunks c
      JOIN document_versions v ON v.id = c.document_version_id
      JOIN documents d ON d.id = v.document_id
      LEFT JOIN document_metadata m ON m.document_id = d.id
      WHERE ${whereSql}
      ORDER BY c.embedding <=> $2::vector ASC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const result = await this.pool.query(sql, params);
    return (result.rows as Record<string, unknown>[]).map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): VectorSearchResult {
  return {
    document_id: row.document_id as string,
    document_title: row.document_title as string,
    document_slug: row.document_slug as string,
    document_type: row.document_type as DocumentType,
    document_status: row.document_status as DocumentStatus,
    department_id: (row.department_id as string | null) ?? null,
    published_at: (row.published_at as Date | null) ?? null,
    version_id: row.version_id as string,
    chunk_id: row.chunk_id as string,
    chunk_index: Number(row.chunk_index),
    page_number: (row.page_number as number | null) ?? null,
    content: row.content as string,
    token_count: Number(row.token_count),
    distance: Number(row.distance),
    similarity: Number(row.similarity),
  };
}
