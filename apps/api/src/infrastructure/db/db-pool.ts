import type { Pool } from 'pg';

/**
 * Structural view of the database pool used by repositories and services.
 *
 * Repositories depend on this interface rather than on `pg.Pool` directly so
 * tests (including the cross-tenant security suite) can provide any pool with
 * a compatible shape.
 */
export interface DbPool {
  query: Pool['query'];
  end: Pool['end'];
}
