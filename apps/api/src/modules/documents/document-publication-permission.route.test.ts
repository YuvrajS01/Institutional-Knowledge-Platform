import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'pub-perm-test-secret-0123456789-0123456789',
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
let faculty: SeedIdentity;
let deptAdmin: SeedIdentity;
let approver: SeedIdentity;
let institutionAdmin: SeedIdentity;
let studentToken: string;
let facultyToken: string;
let deptAdminToken: string;
let approverToken: string;
let institutionAdminToken: string;

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

async function createDocument(token: string, title = 'Perm Doc'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title, mime_type: 'application/pdf' },
  });
  if (res.statusCode !== 201) throw new Error(`create failed ${res.statusCode} ${res.body}`);
  const documentId = res.json().data.document.id as string;
  const uploadUrl = res.json().data.upload.upload_url as string;
  await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: new Uint8Array(Buffer.from('perm content')) });
  await app.inject({ method: 'POST', url: `/api/v1/documents/${documentId}/upload-complete`, headers: headers(token) });
  return documentId;
}

async function submitReview(token: string, docId: string) {
  return app.inject({ method: 'POST', url: `/api/v1/documents/${docId}/submit-review`, headers: headers(token) });
}
async function approve(token: string, docId: string) {
  return app.inject({ method: 'POST', url: `/api/v1/documents/${docId}/approve`, headers: headers(token) });
}
async function publish(token: string, docId: string) {
  return app.inject({ method: 'POST', url: `/api/v1/documents/${docId}/publish`, headers: headers(token) });
}
async function supersede(token: string, oldId: string, newId: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/documents/${oldId}/supersede`,
    headers: headers(token),
    payload: { superseded_by_document_id: newId },
  });
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'FACULTY', 'DEPARTMENT_ADMIN', 'APPROVER', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  student = tenant.users[0]!;
  faculty = tenant.users[1]!;
  deptAdmin = tenant.users[2]!;
  approver = tenant.users[3]!;
  institutionAdmin = tenant.users[4]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  studentToken = await login(student);
  facultyToken = await login(faculty);
  deptAdminToken = await login(deptAdmin);
  approverToken = await login(approver);
  institutionAdminToken = await login(institutionAdmin);
});

afterAll(async () => {
  await app.close();
});

describe('Publication permission (P4-006)', () => {
  it('student and faculty cannot approve or publish', async () => {
    const docId = await createDocument(deptAdminToken);
    await submitReview(deptAdminToken, docId);

    const approveStudent = await approve(studentToken, docId);
    expect(approveStudent.statusCode).toBe(403);
    const publishStudent = await publish(studentToken, docId);
    expect(publishStudent.statusCode).toBe(403);

    const approveFaculty = await approve(facultyToken, docId);
    expect(approveFaculty.statusCode).toBe(403);
    const publishFaculty = await publish(facultyToken, docId);
    expect(publishFaculty.statusCode).toBe(403);
  });

  it('department admin cannot approve or publish', async () => {
    const docId = await createDocument(deptAdminToken);
    await submitReview(deptAdminToken, docId);

    const approveDept = await approve(deptAdminToken, docId);
    expect(approveDept.statusCode).toBe(403);
    const publishDept = await publish(deptAdminToken, docId);
    expect(publishDept.statusCode).toBe(403);
  });

  it('approver and institution admin can approve and publish', async () => {
    const docIdApprover = await createDocument(deptAdminToken);
    await submitReview(deptAdminToken, docIdApprover);
    const approved = await approve(approverToken, docIdApprover);
    expect(approved.statusCode).toBe(200);
    const published = await publish(approverToken, docIdApprover);
    expect(published.statusCode).toBe(200);
    expect(published.json().data.status).toBe('PUBLISHED');

    const docIdAdmin = await createDocument(deptAdminToken);
    await submitReview(deptAdminToken, docIdAdmin);
    const approvedAdmin = await approve(institutionAdminToken, docIdAdmin);
    expect(approvedAdmin.statusCode).toBe(200);
    const publishedAdmin = await publish(institutionAdminToken, docIdAdmin);
    expect(publishedAdmin.statusCode).toBe(200);
  });

  it('student can see PUBLISHED but not DRAFT/IN_REVIEW/APPROVED', async () => {
    const draftId = await createDocument(deptAdminToken, 'Draft Visible Test');
    // Draft
    const getDraft = await app.inject({ method: 'GET', url: `/api/v1/documents/${draftId}`, headers: headers(studentToken) });
    expect(getDraft.statusCode).toBe(404);

    const reviewId = await createDocument(deptAdminToken, 'In Review Visible Test');
    await submitReview(deptAdminToken, reviewId);
    const getReview = await app.inject({ method: 'GET', url: `/api/v1/documents/${reviewId}`, headers: headers(studentToken) });
    expect(getReview.statusCode).toBe(404);

    const approvedId = await createDocument(deptAdminToken, 'Approved Visible Test');
    await submitReview(deptAdminToken, approvedId);
    await approve(approverToken, approvedId);
    const getApproved = await app.inject({ method: 'GET', url: `/api/v1/documents/${approvedId}`, headers: headers(studentToken) });
    expect(getApproved.statusCode).toBe(404);

    const publishedId = await createDocument(deptAdminToken, 'Published Visible Test');
    await submitReview(deptAdminToken, publishedId);
    await approve(approverToken, publishedId);
    await publish(approverToken, publishedId);
    const getPublished = await app.inject({ method: 'GET', url: `/api/v1/documents/${publishedId}`, headers: headers(studentToken) });
    expect(getPublished.statusCode).toBe(200);
    expect(getPublished.json().data.status).toBe('PUBLISHED');
  });

  it('student list only returns PUBLISHED', async () => {
    const draftId = await createDocument(deptAdminToken, 'List Draft Test');
    const publishedId = await createDocument(deptAdminToken, 'List Published Test');
    await submitReview(deptAdminToken, publishedId);
    await approve(approverToken, publishedId);
    await publish(approverToken, publishedId);

    const res = await app.inject({ method: 'GET', url: '/api/v1/documents?page=1&limit=100', headers: headers(studentToken) });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(draftId);
    expect(ids).toContain(publishedId);
    for (const d of res.json().data) {
      expect(d.status).toBe('PUBLISHED');
    }
  });

  it('superseded document is not returned as PUBLISHED to students, new document is', async () => {
    const oldId = await createDocument(deptAdminToken, 'Old Superseded');
    const newId = await createDocument(deptAdminToken, 'New Current');
    await submitReview(deptAdminToken, oldId);
    await approve(approverToken, oldId);
    await publish(approverToken, oldId);
    await submitReview(deptAdminToken, newId);
    await approve(approverToken, newId);
    await publish(approverToken, newId);

    const supersedeRes = await supersede(approverToken, oldId, newId);
    expect(supersedeRes.statusCode).toBe(200);
    expect(supersedeRes.json().data.status).toBe('SUPERSEDED');

    // Student list should contain new but not old when filtering PUBLISHED (default)
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/documents?page=1&limit=100', headers: headers(studentToken) });
    const ids = listRes.json().data.map((d: { id: string }) => d.id);
    expect(ids).toContain(newId);
    // Old is SUPERSEDED, not PUBLISHED, so not in default list (which is PUBLISHED for student)
    expect(ids).not.toContain(oldId);

    // Student can fetch superseded directly as historical (P6-001: SUPERSEDED visible with is_current false)
    const getOld = await app.inject({ method: 'GET', url: `/api/v1/documents/${oldId}`, headers: headers(studentToken) });
    expect(getOld.statusCode).toBe(200);
    expect(getOld.json().data.status).toBe('SUPERSEDED');
    expect(getOld.json().data.is_current).toBe(false);
    expect(getOld.json().data.superseded_by.id).toBe(newId);
  });

  it('cross-tenant cannot approve/publish', async () => {
    const docId = await createDocument(deptAdminToken);
    await submitReview(deptAdminToken, docId);
    const other = await seedInstitutionWithUsers(pool, ['APPROVER']);
    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: other.users[0]!.userEmail, password: SEED_PASSWORD },
    });
    const otherToken = (otherLogin.json() as { data: { access_token: string } }).data.access_token;

    const approveOther = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/approve`,
      headers: { authorization: `Bearer ${otherToken}`, 'x-institution-id': other.institutionId },
    });
    expect(approveOther.statusCode).toBe(404);
  });

  it('search does not return drafts/superceded to students', async () => {
    const draftTitle = `Search Draft ${Date.now()}`;
    await createDocument(deptAdminToken, draftTitle);
    const publishedTitle = `Search Published ${Date.now()}`;
    const publishedId = await createDocument(deptAdminToken, publishedTitle);
    await submitReview(deptAdminToken, publishedId);
    await approve(approverToken, publishedId);
    await publish(approverToken, publishedId);

    // Student search
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(publishedTitle)}`,
      headers: headers(studentToken),
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json().data.results.map((r: { title: string }) => r.title);
    expect(titles).toContain(publishedTitle);
    expect(titles).not.toContain(draftTitle);

    // Also verify that superseded not in search (if we supersede published)
    const newTitle = `New For Search ${Date.now()}`;
    const newId = await createDocument(deptAdminToken, newTitle);
    await submitReview(deptAdminToken, newId);
    await approve(approverToken, newId);
    await publish(approverToken, newId);
    await supersede(approverToken, publishedId, newId);
    const res2Old = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(publishedTitle)}`,
      headers: headers(studentToken),
    });
    const titles2Old = res2Old.json().data.results.map((r: { title: string }) => r.title);
    expect(titles2Old).not.toContain(publishedTitle);
    const res2New = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(newTitle)}`,
      headers: headers(studentToken),
    });
    const titles2New = res2New.json().data.results.map((r: { title: string }) => r.title);
    expect(titles2New).toContain(newTitle);
  });
});
