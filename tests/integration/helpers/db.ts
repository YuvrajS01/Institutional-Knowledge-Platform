import type { DbPool } from '../../../apps/api/src/infrastructure/db/db-pool.js';
import { apiRequire } from './require.js';

export interface PoolLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

const pools: PoolLike[] = [];

/** Registers a pool so the global teardown can close it. */
export function registerPool(pool: PoolLike): void {
  pools.push(pool);
}

export async function closeTestPools(): Promise<void> {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
}

export function requireTestDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL_TEST;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL_TEST is not set. The integration test global setup should have configured it.',
    );
  }
  return connectionString;
}

/**
 * Creates a real `pg` pool bound to the test database (resolved via the api
 * package so it works from any directory) and registers it for teardown.
 */
export function createTestPgPool(): DbPool {
  const require = apiRequire();
  const { Pool } = require('pg') as unknown as {
    Pool: new (options: { connectionString: string }) => DbPool;
  };
  const pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  return pool;
}
