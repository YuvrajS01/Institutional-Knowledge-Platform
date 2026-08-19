import type { DbPool } from '../../infrastructure/db/db-pool.js';

export interface ChunkRow {
  id: string;
  document_version_id: string;
  page_number: number | null;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface CreateChunkInput {
  page_number: number | null;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding?: number[] | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Tenant-agnostic chunk persistence — tenant scope is enforced via the
 * version → document → institution join by callers (like processing pipeline).
 * Chunks themselves are version-owned; no direct institution_id column.
 */
export class DocumentChunksRepository {
  constructor(private readonly pool: DbPool) {}

  async createMany(documentVersionId: string, inputs: CreateChunkInput[]): Promise<ChunkRow[]> {
    if (inputs.length === 0) {
      return [];
    }
    // Build a single INSERT with multiple rows for efficiency.
    const values: unknown[] = [];
    const rowsSql = inputs
      .map((input, idx) => {
        const base = idx * 6;
        values.push(
          documentVersionId,
          input.page_number,
          input.chunk_index,
          input.content,
          input.token_count,
          input.metadata ?? {},
        );
        // embedding is nullable; we store null for now (P5-004 will populate).
        // Use $ placeholders; pgvector column accepts string "[0,0,...]" or null.
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, NULL, $${base + 6})`;
      })
      .join(', ');

    const result = await this.pool.query(
      `INSERT INTO document_chunks
         (document_version_id, page_number, chunk_index, content, token_count, embedding, metadata)
       VALUES ${rowsSql}
       RETURNING id, document_version_id, page_number, chunk_index, content, token_count, embedding, metadata, created_at`,
      values,
    );
    return result.rows as ChunkRow[];
  }

  async listByVersion(documentVersionId: string): Promise<ChunkRow[]> {
    const result = await this.pool.query(
      `SELECT id, document_version_id, page_number, chunk_index, content, token_count, embedding, metadata, created_at
       FROM document_chunks
       WHERE document_version_id = $1
       ORDER BY chunk_index ASC`,
      [documentVersionId],
    );
    return result.rows as ChunkRow[];
  }

  async deleteByVersion(documentVersionId: string): Promise<void> {
    await this.pool.query('DELETE FROM document_chunks WHERE document_version_id = $1', [
      documentVersionId,
    ]);
  }

  async countByVersion(documentVersionId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*)::int AS count FROM document_chunks WHERE document_version_id = $1',
      [documentVersionId],
    );
    return Number((result.rows[0] as { count: number }).count);
  }
}
