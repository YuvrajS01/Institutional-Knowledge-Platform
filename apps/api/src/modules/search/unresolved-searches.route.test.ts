import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';

const TEST_AUTH = {
  secret: 'unresolved-test-secret-0123456789-0123456789-unres',
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
let student: SeedIdentity;
let admin: SeedIdentity;
let studentToken: string;
let adminToken: string;

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

describe('POST /api/v1/search/unresolved (P5-013)', () => {
  it('saves an unresolved query', async () => {
    const query = `unresolved-${Math.random().toString(36).slice(2, 8)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/search/unresolved',
      headers: headers(studentToken, institutionId),
      payload: { query, context: {} },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { query: string } };
    expect(body.data.query).toBe(query);
  });

  it('validates missing query', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/search/unresolved',
      headers: headers(studentToken, institutionId),
      payload: {},
    });
    expect(res.statusCode).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/search/unresolved',
      payload: { query: 'test' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('admin can see unresolved via analytics', async () => {
    const query = `unresolved-admin-${Math.random().toString(36).slice(2, 8)}`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/search/unresolved',
      headers: headers(studentToken, institutionId),
      payload: { query },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/unresolved-searches?limit=5',
      headers: headers(adminToken, institutionId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ query: string }> };
    expect(Array.isArray(body.data)).toBe(true);
  });
});
