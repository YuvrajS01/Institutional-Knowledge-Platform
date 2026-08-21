import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface UnresolvedSearchRow {
  id: string;
  institution_id: string;
  user_id: string;
  query: string;
  context: Record<string, unknown>;
  created_at: Date;
}

export class UnresolvedSearchesRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async create(
    institutionId: string,
    userId: string,
    query: string,
    context: Record<string, unknown> = {},
  ): Promise<UnresolvedSearchRow> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `INSERT INTO unresolved_searches (institution_id, user_id, query, context)
       VALUES ($1, $2, $3, $4)
       RETURNING id, institution_id, user_id, query, context, created_at`,
      [tenantId, userId, query, JSON.stringify(context)],
    );
    return result.rows[0] as UnresolvedSearchRow;
  }

  async list(
    institutionId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<UnresolvedSearchRow[]> {
    const tenantId = this.tenantId(institutionId);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const result = await this.pool.query(
      `SELECT id, institution_id, user_id, query, context, created_at
       FROM unresolved_searches
       WHERE institution_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    );
    return result.rows as UnresolvedSearchRow[];
  }
}
