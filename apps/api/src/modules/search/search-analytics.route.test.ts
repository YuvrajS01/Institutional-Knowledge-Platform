import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import {
  SEED_PASSWORD,
  seedInstitutionWithUsers,
  type SeedIdentity,
} from '../../../../../tests/integration/helpers/seed.js';
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from '../../infrastructure/storage/s3-object-storage.js';

const TEST_AUTH = {
  secret: 'search-analytics-test-secret-0123456789-0123456789',
  accessTtlMinutes: 15,
  refreshTtlDays: 30,
};

const STORAGE_CONFIG: S3ObjectStorageConfig = {
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'institutional-documents',
  accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
};

type App = Awaited<ReturnType<typeof buildApp>>;

let pool: Pool;
let app: App;
let institutionId: string;
let admin: SeedIdentity;
let student: SeedIdentity;
let adminToken: string;
let studentToken: string;

async function login(identity: SeedIdentity): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: identity.userEmail, password: SEED_PASSWORD },
  });
  const body = res.json() as { data?: { access_token?: string } };
  if (!body.data?.access_token) throw new Error(`login failed for ${identity.userEmail}`);
  return body.data.access_token;
}

function headers(token: string, instId: string) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': instId };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN', 'STUDENT']);
  institutionId = tenant.institutionId;
  admin = tenant.users[0]!;
  student = tenant.users[1]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: { max: 1000, timeWindow: '1 minute' },
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  adminToken = await login(admin);
  studentToken = await login(student);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('Search Analytics (P5-012)', () => {
  it('logs search and admin can fetch popular queries', async () => {
    const query = `analytics test ${Math.random().toString(36).slice(2, 6)}`;
    const searchRes = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(query)}`,
      headers: headers(studentToken, institutionId),
    });
    expect(searchRes.statusCode).toBe(200);

    // Admin fetches popular
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/analytics/searches?limit=5`,
      headers: headers(adminToken, institutionId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ query: string; count: number }> };
    expect(Array.isArray(body.data)).toBe(true);
    // Our query should be in popular (at least 1 count)
    expect(body.data.some((r) => r.query === query)).toBe(true);
  });

  it('fetches unresolved searches (zero results)', async () => {
    const query = `unresolved-${Math.random().toString(36).slice(2, 8)}-no-results`;
    await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(query)}`,
      headers: headers(studentToken, institutionId),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/analytics/unresolved-searches?limit=5`,
      headers: headers(adminToken, institutionId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ query: string; count: number }> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((r) => r.query === query)).toBe(true);
  });

  it('student cannot fetch analytics (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/searches',
      headers: headers(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/searches',
    });
    expect(res.statusCode).toBe(401);
  });
});
