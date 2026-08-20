import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedIdentity, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'detail-route-test-secret-0123456789-0123456789',
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
let student: SeedIdentity;
let admin: SeedIdentity;
let approver: SeedIdentity;
let studentToken: string;
let adminToken: string;
let approverToken: string;

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

async function createUploadedDocument(token: string, title = 'Detail Doc'): Promise<string> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title, mime_type: 'application/pdf' },
  });
  const documentId = create.json().data.document.id as string;
  const uploadUrl = create.json().data.upload.upload_url as string;
  await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: new Uint8Array(Buffer.from('detail content')) });
  await app.inject({ method: 'POST', url: `/api/v1/documents/${documentId}/upload-complete`, headers: headers(token) });
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

describe('GET /api/v1/documents/:id (P6-001)', () => {
  it('returns is_current true and superseded_by null for PUBLISHED', async () => {
    const docId = await createUploadedDocument(adminToken, 'Current Doc');
    await publishDocument(adminToken, approverToken, docId);

    const res = await app.inject({ method: 'GET', url: `/api/v1/documents/${docId}`, headers: headers(adminToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.is_current).toBe(true);
    expect(data.superseded_by).toBeNull();
    expect(data.superseded_at).toBeNull();
    expect(data.superseded_reason).toBeNull();
    expect(data.current_version_id).toBeTruthy();
    expect(data.status).toBe('PUBLISHED');
  });

  it('returns is_current false and superseded_by for SUPERSEDED, visible to student', async () => {
    const oldId = await createUploadedDocument(adminToken, 'Old Superseded Detail');
    const newId = await createUploadedDocument(adminToken, 'New Current Detail');
    await publishDocument(adminToken, approverToken, oldId);
    await publishDocument(adminToken, approverToken, newId);
    const supersedeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${oldId}/supersede`,
      headers: headers(approverToken),
      payload: { superseded_by_document_id: newId, reason: 'Updated schedule' },
    });
    expect(supersedeRes.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: `/api/v1/documents/${oldId}`, headers: headers(studentToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.is_current).toBe(false);
    expect(data.status).toBe('SUPERSEDED');
    expect(data.superseded_by).not.toBeNull();
    expect(data.superseded_by.id).toBe(newId);
    expect(data.superseded_by.title).toBe('New Current Detail');
    expect(data.superseded_at).toBeTruthy();
    expect(data.superseded_reason).toBe('Updated schedule');
  });

  it('enforces tenant isolation for detail', async () => {
    const docId = await createUploadedDocument(adminToken, 'Tenant Detail');
    await publishDocument(adminToken, approverToken, docId);
    const other = await seedInstitutionWithUsers(pool, ['STUDENT']);
    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: other.users[0]!.userEmail, password: SEED_PASSWORD },
    });
    const otherToken = (otherLogin.json() as { data: { access_token: string } }).data.access_token;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}`,
      headers: { authorization: `Bearer ${otherToken}`, 'x-institution-id': other.institutionId },
    });
    expect(res.statusCode).toBe(404);
  });

  it('hides DRAFT from student but shows to admin', async () => {
    const docId = await createUploadedDocument(adminToken, 'Draft Detail');
    const studentRes = await app.inject({ method: 'GET', url: `/api/v1/documents/${docId}`, headers: headers(studentToken) });
    expect(studentRes.statusCode).toBe(404);
    const adminRes = await app.inject({ method: 'GET', url: `/api/v1/documents/${docId}`, headers: headers(adminToken) });
    expect(adminRes.statusCode).toBe(200);
    expect(adminRes.json().data.is_current).toBe(false);
  });
});
