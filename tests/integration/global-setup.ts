import path from 'node:path';
import { createRequire } from 'node:module';

import { apiRequire } from './helpers/require.js';

const require = apiRequire();
const { Client } = require('pg') as {
  Client: new (options: { connectionString: string; connectionTimeoutMillis?: number }) => {
    connect: () => Promise<void>;
    query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number }>;
    end: () => Promise<void>;
  };
};
const nodePgMigrateModule = require('node-pg-migrate') as
  { default?: MigrationRunner } | MigrationRunner;

type MigrationRunner = (options: {
  databaseUrl: string;
  dir: string;
  direction: 'up' | 'down';
  migrationsTable: string;
  logger?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
}) => Promise<unknown>;

const runMigrations: MigrationRunner =
  'default' in nodePgMigrateModule && typeof nodePgMigrateModule.default === 'function'
    ? nodePgMigrateModule.default
    : (nodePgMigrateModule as MigrationRunner);

// dotenv is a dependency of @ikp/config, not @ikp/api.
const configRequire = createRequire(path.resolve(process.cwd(), 'packages/config/package.json'));

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'infra/migrations');

function deriveTestUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = '/institutional_knowledge_test';
  return url.toString();
}

function databaseName(testUrl: string): string {
  const name = new URL(testUrl).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe test database name: ${name}`);
  }
  return name;
}

async function ensureTestDatabase(testUrl: string, adminUrl: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const dbName = databaseName(testUrl);
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.end();
  }
}

async function applyMigrations(testUrl: string): Promise<void> {
  await runMigrations({
    databaseUrl: testUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
  });
}

export default async function globalSetup(): Promise<void> {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_TEST) {
    const dotenv = configRequire('dotenv') as { config: (options: { path: string }) => void };
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  }

  if (process.env.DATABASE_URL_TEST) {
    // explicit URL: use as-is (CI service databases)
  } else if (process.env.DATABASE_URL) {
    const testUrl = deriveTestUrl(process.env.DATABASE_URL);
    await ensureTestDatabase(testUrl, process.env.DATABASE_URL);
    process.env.DATABASE_URL_TEST = testUrl;
  } else {
    throw new Error(
      'Integration tests require a database. Set DATABASE_URL_TEST or DATABASE_URL (or run tests from the repository root with .env present).',
    );
  }

  await applyMigrations(process.env.DATABASE_URL_TEST);
}
