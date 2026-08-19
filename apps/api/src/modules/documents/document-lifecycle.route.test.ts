import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from '../../infrastructure/storage/s3-object-storage.js';
import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import {
  SEED_PASSWORD,
  seedIdentity,
  seedInstitutionWithUsers,
  type SeedIdentity,
} from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'lifecycle-route-test-secret-0123456789-0123456789',
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
let student: SeedIdentity;
let approver: SeedIdentity;
let deptAdmin: SeedIdentity;
let studentToken: string;
let approverToken: string;
let deptAdminToken: string;

async function login(identity: SeedIdentity): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: identity.userEmail, password: SEED_PASSWORD },
  });
  const body = response.json() as { data?: { access_token?: string } };
  if (!body.data?.access_token) {
    throw new Error(`login failed for ${identity.userEmail}: ${response.statusCode}`);
  }
  return body.data.access_token;
}

function headers(token: string) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': institutionId };
}

async function createUploadedDocument(token: string): Promise<string> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title: 'Lifecycle Document', mime_type: 'application/pdf' },
  });
  const documentId = create.json().data.document.id as string;
  const uploadUrl = create.json().data.upload.upload_url as string;
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf' },
    body: new Uint8Array(Buffer.from('lifecycle content')),
  });
  await app.inject({
    method: 'POST',
    url: `/api/v1/documents/${documentId}/upload-complete`,
    headers: headers(token),
  });
  return documentId;
}

async function createDraftOnly(token: string): Promise<string> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title: 'Contentless Draft', mime_type: 'application/pdf' },
  });
  return create.json().data.document.id as string;
}

async function postAction(token: string, documentId: string, action: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/documents/${documentId}/${action}`,
    headers: headers(token),
  });
}

async function statusOf(documentId: string): Promise<string> {
  const result = await pool.query('SELECT status FROM documents WHERE id = $1', [documentId]);
  return result.rows[0].status as string;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  admin = tenant.users[1]!;
  student = tenant.users[0]!;
  void admin;

  const approverUser = await seedIdentity(pool);
  await pool.query(
    "INSERT INTO institution_memberships (institution_id, user_id, role) VALUES ($1, $2, 'APPROVER')",
    [institutionId, approverUser.userId],
  );
  approver = approverUser;

  const deptAdminUser = await seedIdentity(pool);
  await pool.query(
    "INSERT INTO institution_memberships (institution_id, user_id, role) VALUES ($1, $2, 'DEPARTMENT_ADMIN')",
    [institutionId, deptAdminUser.userId],
  );
  deptAdmin = deptAdminUser;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  studentToken = await login(student);
  approverToken = await login(approver);
  deptAdminToken = await login(deptAdmin);
});

afterAll(async () => {
  await app.close();
});

describe('document lifecycle', () => {
  it('walks the full path DRAFT → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED', async () => {
    const documentId = await createUploadedDocument(deptAdminToken);

    const submitted = await postAction(deptAdminToken, documentId, 'submit-review');
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().data.status).toBe('IN_REVIEW');

    const approved = await postAction(approverToken, documentId, 'approve');
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.status).toBe('APPROVED');

    const published = await postAction(approverToken, documentId, 'publish');
    expect(published.statusCode).toBe(200);
    expect(published.json().data.status).toBe('PUBLISHED');
    expect(published.json().data.published_at).toBeTruthy();

    const archived = await postAction(approverToken, documentId, 'archive');
    expect(archived.statusCode).toBe(200);
    expect(archived.json().data.status).toBe('ARCHIVED');
  });

  it('rejects publishing a draft that was never reviewed (409)', async () => {
    const documentId = await createUploadedDocument(deptAdminToken);
    const response = await postAction(approverToken, documentId, 'publish');
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONFLICT');
  });

  it('rejects submitting a contentless draft for review (409)', async () => {
    const documentId = await createDraftOnly(deptAdminToken);
    const response = await postAction(deptAdminToken, documentId, 'submit-review');
    expect(response.statusCode).toBe(409);
  });

  it('rejects a second submit after review started (409)', async () => {
    const documentId = await createUploadedDocument(deptAdminToken);
    await postAction(deptAdminToken, documentId, 'submit-review');
    const response = await postAction(deptAdminToken, documentId, 'submit-review');
    expect(response.statusCode).toBe(409);
  });

  it('denies a student any lifecycle action (403)', async () => {
    const documentId = await createUploadedDocument(deptAdminToken);
    const response = await postAction(studentToken, documentId, 'approve');
    expect(response.statusCode).toBe(403);
  });

  it('denies the creator submitting on behalf of another creator (403)', async () => {
    const otherDeptAdmin = await seedIdentity(pool);
    await pool.query(
      "INSERT INTO institution_memberships (institution_id, user_id, role) VALUES ($1, $2, 'DEPARTMENT_ADMIN')",
      [institutionId, otherDeptAdmin.userId],
    );
    const otherToken = await login(otherDeptAdmin);

    const documentId = await createUploadedDocument(deptAdminToken);
    const response = await postAction(otherToken, documentId, 'submit-review');
    expect(response.statusCode).toBe(403);
  });

  it('denies a department admin approving (403 via guard)', async () => {
    const documentId = await createUploadedDocument(deptAdminToken);
    await postAction(deptAdminToken, documentId, 'submit-review');
    const response = await postAction(deptAdminToken, documentId, 'approve');
    expect(response.statusCode).toBe(403);
  });

  it('does not expose lifecycle actions across tenants (404)', async () => {
    const documentId = await createUploadedDocument(deptAdminToken);
    const foreign = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
    const foreignToken = await login(foreign.users[0]!);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/approve`,
      headers: {
        authorization: `Bearer ${foreignToken}`,
        'x-institution-id': foreign.institutionId,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('a published document becomes visible to students', async () => {
    const documentId = await createUploadedDocument(deptAdminToken);
    await postAction(deptAdminToken, documentId, 'submit-review');
    await postAction(approverToken, documentId, 'approve');
    await postAction(approverToken, documentId, 'publish');
    expect(await statusOf(documentId)).toBe('PUBLISHED');

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
      headers: headers(studentToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('PUBLISHED');
  });
});
