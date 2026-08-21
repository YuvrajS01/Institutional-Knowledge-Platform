import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';

const TEST_AUTH = {
  secret: 'bookmarks-test-secret-0123456789-0123456789-book',
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
let otherInstitutionId: string;
let admin: SeedIdentity;
let student: SeedIdentity;
let otherStudent: SeedIdentity;
let adminToken: string;
let studentToken: string;
let otherStudentToken: string;
let publishedDocId: string;

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

  const otherTenant = await seedInstitutionWithUsers(pool, ['STUDENT']);
  otherInstitutionId = otherTenant.institutionId;
  otherStudent = otherTenant.users[0]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: { max: 1000, timeWindow: '1 minute' },
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  adminToken = await login(admin);
  void adminToken;
  studentToken = await login(student);
  otherStudentToken = await login(otherStudent);

  // Create a published doc for bookmarking
  const suffix = Math.random().toString(36).slice(2, 8);
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
    [institutionId, `Bookmark Test ${suffix}`, `bookmark-${suffix}`, admin.userId, 'PUBLISHED'],
  );
  publishedDocId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [publishedDocId]);
  const version = await pool.query(
    `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
    [publishedDocId, `test/${suffix}/original.pdf`, 'a'.repeat(64), 'content', admin.userId],
  );
  const versionId = (version.rows[0] as { id: string }).id;
  await pool.query('UPDATE documents SET current_version_id = $2 WHERE id = $1', [publishedDocId, versionId]);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('Bookmarks API (P6-005)', () => {
  it('student can bookmark a published document', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/bookmarks',
      headers: headers(studentToken, institutionId),
      payload: { document_id: publishedDocId },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { document_id: string } };
    expect(body.data.document_id).toBe(publishedDocId);
  });

  it('student can list bookmarks', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/bookmarks',
      headers: headers(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ document_id: string }> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((b) => b.document_id === publishedDocId)).toBe(true);
  });

  it('idempotent: bookmarking same doc twice does not duplicate', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/bookmarks',
      headers: headers(studentToken, institutionId),
      payload: { document_id: publishedDocId },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/bookmarks',
      headers: headers(studentToken, institutionId),
      payload: { document_id: publishedDocId },
    });
    expect(second.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/bookmarks',
      headers: headers(studentToken, institutionId),
    });
    const body = list.json() as { data: Array<{ document_id: string }> };
    const count = body.data.filter((b) => b.document_id === publishedDocId).length;
    expect(count).toBe(1);
  });

  it('student can remove bookmark', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/bookmarks/${publishedDocId}`,
      headers: headers(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/bookmarks',
      headers: headers(studentToken, institutionId),
    });
    const body = list.json() as { data: Array<{ document_id: string }> };
    expect(body.data.some((b) => b.document_id === publishedDocId)).toBe(false);
  });

  it('cannot bookmark non-existent or draft document as student', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000000';
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/bookmarks',
      headers: headers(studentToken, institutionId),
      payload: { document_id: fakeId },
    });
    expect(res.statusCode).toBe(404);

    // Create a draft doc
    const suffix = Math.random().toString(36).slice(2, 8);
    const draft = await pool.query(
      'INSERT INTO documents (institution_id, title, slug, created_by, status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [institutionId, `Draft Bookmark ${suffix}`, `draft-bm-${suffix}`, admin.userId, 'DRAFT'],
    );
    const draftId = (draft.rows[0] as { id: string }).id;
    const resDraft = await app.inject({
      method: 'POST',
      url: '/api/v1/bookmarks',
      headers: headers(studentToken, institutionId),
      payload: { document_id: draftId },
    });
    expect(resDraft.statusCode).toBe(404);
  });

  it('enforces tenant isolation for bookmarks', async () => {
    // Student from other institution cannot bookmark A's doc (should be 404 because doc not in B)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/bookmarks',
      headers: headers(otherStudentToken, otherInstitutionId),
      payload: { document_id: publishedDocId },
    });
    expect(res.statusCode).toBe(404);

    // Student from other institution cannot see A's bookmarks
    const listOther = await app.inject({
      method: 'GET',
      url: '/api/v1/bookmarks',
      headers: headers(otherStudentToken, otherInstitutionId),
    });
    expect(listOther.statusCode).toBe(200);
    const body = listOther.json() as { data: Array<{ document_id: string }> };
    expect(body.data.some((b) => b.document_id === publishedDocId)).toBe(false);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/bookmarks',
    });
    expect(res.statusCode).toBe(401);
  });
});
