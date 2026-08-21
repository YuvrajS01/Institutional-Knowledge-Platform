import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface SearchAnalyticsRow {
  id: string;
  institution_id: string;
  user_id: string;
  query: string;
  results_count: number;
  latency_ms: number;
  filters: Record<string, unknown>;
  created_at: Date;
}

export class SearchAnalyticsRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async log(
    institutionId: string,
    userId: string,
    query: string,
    resultsCount: number,
    latencyMs: number,
    filters: Record<string, unknown> = {},
  ): Promise<void> {
    const tenantId = this.tenantId(institutionId);
    await this.pool.query(
      `INSERT INTO search_analytics (institution_id, user_id, query, results_count, latency_ms, filters)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, userId, query, resultsCount, latencyMs, JSON.stringify(filters)],
    );
  }

  async popularQueries(
    institutionId: string,
    options: { from?: Date; to?: Date; limit?: number } = {},
  ): Promise<Array<{ query: string; count: number }>> {
    const tenantId = this.tenantId(institutionId);
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
    const where: string[] = ['institution_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (options.from) {
      where.push(`created_at >= $${idx}`);
      params.push(options.from);
      idx++;
    }
    if (options.to) {
      where.push(`created_at <= $${idx}`);
      params.push(options.to);
      idx++;
    }
    const limitIdx = idx;
    params.push(limit);
    const result = await this.pool.query(
      `SELECT query, COUNT(*)::int AS count
       FROM search_analytics
       WHERE ${where.join(' AND ')}
       GROUP BY query
       ORDER BY count DESC, query ASC
       LIMIT $${limitIdx}`,
      params,
    );
    return result.rows as Array<{ query: string; count: number }>;
  }

  async unresolvedQueries(
    institutionId: string,
    options: { limit?: number } = {},
  ): Promise<Array<{ query: string; count: number; last_searched_at: Date }>> {
    const tenantId = this.tenantId(institutionId);
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
    const result = await this.pool.query(
      `SELECT query, COUNT(*)::int AS count, MAX(created_at) AS last_searched_at
       FROM search_analytics
       WHERE institution_id = $1 AND results_count = 0
       GROUP BY query
       ORDER BY count DESC, last_searched_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );
    return result.rows as Array<{ query: string; count: number; last_searched_at: Date }>;
  }
}
