import type { WorkerDbPool } from '../db-pool.js';

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
 * Chunk persistence for the worker (mirrors API repository but uses WorkerDbPool).
 * Embedding is stored as pgvector `vector(1024)` — P5-004 populates it.
 */
export class DocumentChunksRepository {
  constructor(private readonly pool: WorkerDbPool) {}

  async createMany(documentVersionId: string, inputs: CreateChunkInput[]): Promise<ChunkRow[]> {
    if (inputs.length === 0) {
      return [];
    }
    const values: unknown[] = [];
    const rowsSql = inputs
      .map((input, idx) => {
        const base = idx * 7;
        const embeddingValue =
          input.embedding && input.embedding.length > 0 ? `[${input.embedding.join(',')}]` : null;
        values.push(
          documentVersionId,
          input.page_number,
          input.chunk_index,
          input.content,
          input.token_count,
          embeddingValue,
          input.metadata ?? {},
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::vector, $${base + 7})`;
      })
      .join(', ');

    const result = await this.pool.query(
      `INSERT INTO document_chunks
         (document_version_id, page_number, chunk_index, content, token_count, embedding, metadata)
       VALUES ${rowsSql}
       RETURNING id, document_version_id, page_number, chunk_index, content, token_count, embedding, metadata, created_at`,
      values,
    );
    return result.rows as unknown as ChunkRow[];
  }

  async listByVersion(documentVersionId: string): Promise<ChunkRow[]> {
    const result = await this.pool.query(
      `SELECT id, document_version_id, page_number, chunk_index, content, token_count, embedding, metadata, created_at
       FROM document_chunks
       WHERE document_version_id = $1
       ORDER BY chunk_index ASC`,
      [documentVersionId],
    );
    return result.rows as unknown as ChunkRow[];
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
