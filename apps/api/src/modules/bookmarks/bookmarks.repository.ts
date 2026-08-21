import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface BookmarkRow {
  id: string;
  user_id: string;
  document_id: string;
  institution_id: string;
  created_at: Date;
}

export interface BookmarkWithDocument extends BookmarkRow {
  document_title: string;
  document_slug: string;
  document_type: string;
  document_status: string;
  published_at: Date | null;
}

export class BookmarksRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async create(institutionId: string, userId: string, documentId: string): Promise<BookmarkRow> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `INSERT INTO bookmarks (user_id, document_id, institution_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, document_id) DO NOTHING
       RETURNING id, user_id, document_id, institution_id, created_at`,
      [userId, documentId, tenantId],
    );
    if (result.rows.length > 0) {
      return result.rows[0] as BookmarkRow;
    }
    // Already exists, fetch it
    const existing = await this.pool.query(
      `SELECT id, user_id, document_id, institution_id, created_at FROM bookmarks WHERE user_id = $1 AND document_id = $2`,
      [userId, documentId],
    );
    return existing.rows[0] as BookmarkRow;
  }

  async delete(institutionId: string, userId: string, documentId: string): Promise<boolean> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `DELETE FROM bookmarks WHERE user_id = $1 AND document_id = $2 AND institution_id = $3`,
      [userId, documentId, tenantId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async list(institutionId: string, userId: string): Promise<BookmarkWithDocument[]> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT b.id, b.user_id, b.document_id, b.institution_id, b.created_at,
              d.title AS document_title, d.slug AS document_slug, d.document_type, d.status AS document_status, d.published_at
       FROM bookmarks b
       JOIN documents d ON d.id = b.document_id
       WHERE b.user_id = $1 AND b.institution_id = $2
       ORDER BY b.created_at DESC`,
      [userId, tenantId],
    );
    return result.rows as BookmarkWithDocument[];
  }

  async exists(institutionId: string, userId: string, documentId: string): Promise<boolean> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT 1 FROM bookmarks WHERE user_id = $1 AND document_id = $2 AND institution_id = $3`,
      [userId, documentId, tenantId],
    );
    return result.rows.length > 0;
  }
}
