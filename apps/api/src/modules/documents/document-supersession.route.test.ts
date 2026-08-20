import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedIdentity, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'supersession-test-secret-0123456789-0123456789',
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

function headers(token: string) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': institutionId };
}

async function createUploadedDocument(token: string, title = 'Supersession Doc'): Promise<string> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title, mime_type: 'application/pdf' },
  });
  const documentId = create.json().data.document.id as string;
  const uploadUrl = create.json().data.upload.upload_url as string;
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf' },
    body: new Uint8Array(Buffer.from('content for supersession')),
  });
  await app.inject({
    method: 'POST',
    url: `/api/v1/documents/${documentId}/upload-complete`,
    headers: headers(token),
  });
  return documentId;
}

async function publishDocument(token: string, approverTok: string, docId: string): Promise<void> {
  await app.inject({ method: 'POST', url: `/api/v1/documents/${docId}/submit-review`, headers: headers(token) });
  await app.inject({ method: 'POST', url: `/api/v1/documents/${docId}/approve`, headers: headers(approverTok) });
  await app.inject({ method: 'POST', url: `/api/v1/documents/${docId}/publish`, headers: headers(approverTok) });
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  student = tenant.users[0]!;
  admin = tenant.users[1]!;

  const approverUser = await seedIdentity(pool);
  await pool.query("INSERT INTO institution_memberships (institution_id, user_id, role) VALUES ($1, $2, 'APPROVER')", [
    institutionId,
    approverUser.userId,
  ]);
  approver = approverUser;

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
});

describe('POST /api/v1/documents/:id/supersede (P4-003)', () => {
  it('marks a PUBLISHED document as SUPERSEDED', async () => {
    const oldId = await createUploadedDocument(adminToken, 'Old Notice');
    const newId = await createUploadedDocument(adminToken, 'New Notice');
    await publishDocument(adminToken, approverToken, oldId);
    await publishDocument(adminToken, approverToken, newId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${oldId}/supersede`,
      headers: headers(approverToken),
      payload: { superseded_by_document_id: newId, reason: 'Replaced by new schedule' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('SUPERSEDED');

    const row = await pool.query('SELECT status, superseded_by_document_id, superseded_reason FROM documents WHERE id = $1', [oldId]);
    expect(row.rows[0].status).toBe('SUPERSEDED');
    expect(row.rows[0].superseded_by_document_id).toBe(newId);
    expect(row.rows[0].superseded_reason).toBe('Replaced by new schedule');
  });

  it('rejects superseding a non-PUBLISHED document (409)', async () => {
    const oldId = await createUploadedDocument(adminToken, 'Draft Doc');
    const newId = await createUploadedDocument(adminToken, 'New Doc');
    await publishDocument(adminToken, approverToken, newId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${oldId}/supersede`,
      headers: headers(approverToken),
      payload: { superseded_by_document_id: newId },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects self-supersession (409)', async () => {
    const docId = await createUploadedDocument(adminToken, 'Self Doc');
    await publishDocument(adminToken, approverToken, docId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/supersede`,
      headers: headers(approverToken),
      payload: { superseded_by_document_id: docId },
    });
    expect(res.statusCode).toBe(409);
  });

  it('denies student supersession (403)', async () => {
    const oldId = await createUploadedDocument(adminToken, 'Old');
    const newId = await createUploadedDocument(adminToken, 'New');
    await publishDocument(adminToken, approverToken, oldId);
    await publishDocument(adminToken, approverToken, newId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${oldId}/supersede`,
      headers: headers(studentToken),
      payload: { superseded_by_document_id: newId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('enforces tenant isolation', async () => {
    const oldId = await createUploadedDocument(adminToken, 'Old Tenant');
    const newId = await createUploadedDocument(adminToken, 'New Tenant');
    await publishDocument(adminToken, approverToken, oldId);
    await publishDocument(adminToken, approverToken, newId);

    const other = await seedInstitutionWithUsers(pool, ['APPROVER']);
    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: other.users[0]!.userEmail, password: SEED_PASSWORD },
    });
    const otherToken = (otherLogin.json() as { data: { access_token: string } }).data.access_token;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${oldId}/supersede`,
      headers: { authorization: `Bearer ${otherToken}`, 'x-institution-id': other.institutionId },
      payload: { superseded_by_document_id: newId },
    });
    expect(res.statusCode).toBe(404);
  });

  it('validates superseded_by_document_id is uuid', async () => {
    const oldId = await createUploadedDocument(adminToken, 'Old');
    await publishDocument(adminToken, approverToken, oldId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${oldId}/supersede`,
      headers: headers(approverToken),
      payload: { superseded_by_document_id: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('GET /api/v1/documents/:id/versions (P4-003)', () => {
  it('lists versions ordered by version_number', async () => {
    const docId = await createUploadedDocument(adminToken, 'Versioned Doc');
    // Create a second version via direct DB (simulate an update)
    const oldVersion = await pool.query('SELECT id, version_number FROM document_versions WHERE document_id = $1 ORDER BY version_number ASC', [docId]);
    const firstVersionId = (oldVersion.rows[0] as { id: string }).id;
    // Insert a second version manually
    const secondVersion = await pool.query(
      `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by) VALUES ($1,2,$2,'application/pdf',100,$3,$4) RETURNING id`,
      [docId, `test/${docId}/v2`, '0'.repeat(64), admin.userId],
    );
    const secondVersionId = (secondVersion.rows[0] as { id: string }).id;
    await pool.query('UPDATE documents SET current_version_id = $2 WHERE id = $1', [docId, secondVersionId]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}/versions`,
      headers: headers(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body[0].version_number).toBe(1);
    expect(body[1].version_number).toBe(2);
    expect(body.find((v: { id: string }) => v.id === secondVersionId).is_current).toBe(true);
    expect(body.find((v: { id: string }) => v.id === firstVersionId).is_current).toBe(false);
  });

  it('returns 404 for unknown document', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000000';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${fakeId}/versions`,
      headers: headers(adminToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it('enforces tenant isolation for versions', async () => {
    const docId = await createUploadedDocument(adminToken, 'Tenant Version Doc');
    const other = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: other.users[0]!.userEmail, password: SEED_PASSWORD },
    });
    const otherToken = (otherLogin.json() as { data: { access_token: string } }).data.access_token;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}/versions`,
      headers: { authorization: `Bearer ${otherToken}`, 'x-institution-id': other.institutionId },
    });
    expect(res.statusCode).toBe(404);
  });
});
