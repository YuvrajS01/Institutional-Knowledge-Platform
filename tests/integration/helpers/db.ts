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
