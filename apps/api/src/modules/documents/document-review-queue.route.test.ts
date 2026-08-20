import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'review-queue-test-secret-0123456789-0123456789',
  accessTtlMinutes: 15,
  refreshTtlDays: 30,
};
const TEST_RATE_LIMIT = { max: 1000, timeWindow: '1 minute' };
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
let approver: SeedIdentity;
let student: SeedIdentity;
let adminToken: string;
let approverToken: string;
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

function headers(token: string, instId = institutionId) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': instId };
}

async function createDocument(token: string, title = 'Review Doc'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title, mime_type: 'application/pdf' },
  });
  if (res.statusCode !== 201) throw new Error(`create failed ${res.statusCode} ${res.body}`);
  return (res.json().data.document.id as string);
}

async function submitForReview(token: string, docId: string): Promise<void> {
  // Need to have a version first — bypass via direct DB for speed, or via upload flow
  // For this test, we mock the version creation and set status via direct DB, but we need to ensure the document has a version so submit-review passes
  // Instead, we will use the service's transition logic: create a doc, then directly set status to IN_REVIEW via DB for simplicity, but we need to test the review-queue which just lists IN_REVIEW
  // So we can just update the document status directly
  await pool.query("UPDATE documents SET status = 'IN_REVIEW' WHERE id = $1", [docId]);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);
  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN', 'APPROVER']);
  institutionId = tenant.institutionId;
  student = tenant.users[0]!;
  admin = tenant.users[1]!;
  approver = tenant.users[2]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  studentToken = await login(student);
  adminToken = await login(admin);
  approverToken = await login(approver);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /api/v1/documents/review-queue (P4-001)', () => {
  it('allows approver to list IN_REVIEW documents', async () => {
    const docId = await createDocument(adminToken, 'For Review');
    await submitForReview(adminToken, docId);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/review-queue?page=1&limit=10',
      headers: headers(approverToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    const ids = body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(docId);
    for (const d of body.data) {
      expect(d.status).toBe('IN_REVIEW');
    }
  });

  it('denies student from review-queue (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/review-queue?page=1&limit=10',
      headers: headers(studentToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('enforces tenant isolation for review-queue', async () => {
    const docId = await createDocument(adminToken, 'Tenant Review Doc');
    await submitForReview(adminToken, docId);

    const other = await seedInstitutionWithUsers(pool, ['APPROVER']);
    const otherTokenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: other.users[0]!.userEmail, password: SEED_PASSWORD },
    });
    const otherToken = (otherTokenRes.json() as { data: { access_token: string } }).data.access_token;

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/review-queue?page=1&limit=10',
      headers: headers(otherToken, other.institutionId),
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(docId);
  });

  it('supports search filter in review-queue', async () => {
    const uniqueTitle = `Unique Review ${Date.now()}`;
    const docId = await createDocument(adminToken, uniqueTitle);
    await submitForReview(adminToken, docId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/review-queue?search=${encodeURIComponent(uniqueTitle)}&page=1&limit=10`,
      headers: headers(approverToken),
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((d: { id: string }) => d.id);
    expect(ids).toContain(docId);
  });
});

describe('GET /api/v1/documents status RBAC (P4-001)', () => {
  it('rejects student filtering by IN_REVIEW via list (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents?status=IN_REVIEW&page=1&limit=10',
      headers: headers(studentToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows approver to filter by IN_REVIEW via list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents?status=IN_REVIEW&page=1&limit=10',
      headers: headers(approverToken),
    });
    expect(res.statusCode).toBe(200);
  });
});
