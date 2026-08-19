/**
 * Structural view of the database pool used by worker repositories.
 * (Mirrors the contract used by `@ikp/api` without depending on it.)
 */
export interface WorkerDbPool {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
  end: () => Promise<void>;
}
