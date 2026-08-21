import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../app.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'processing-status-test-secret-0123456789-0123456789',
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
let adminToken: string;
let studentToken: string;
let queueEnqueue: ReturnType<typeof vi.fn>;

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

async function createUploadedDocument(token: string, title = 'Processing Status Doc'): Promise<string> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title, mime_type: 'application/pdf' },
  });
  const documentId = create.json().data.document.id as string;
  const uploadUrl = create.json().data.upload.upload_url as string;
  await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: new Uint8Array(Buffer.from('processing content')) });
  await app.inject({ method: 'POST', url: `/api/v1/documents/${documentId}/upload-complete`, headers: headers(token) });
  return documentId;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  student = tenant.users[0]!;
  admin = tenant.users[1]!;

  queueEnqueue = vi.fn(async () => undefined);
  const mockQueue = { enqueue: queueEnqueue } as unknown as import('@ikp/queue').JobQueue;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
    storage: createS3ObjectStorage(STORAGE_CONFIG),
    queue: mockQueue,
  });

  adminToken = await login(admin);
  studentToken = await login(student);
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/documents/:id/processing-status (P3-009)', () => {
  it('returns processing status for creator', async () => {
    const docId = await createUploadedDocument(adminToken, 'Processing Status Creator');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}/processing-status`,
      headers: headers(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0]).toMatchObject({
      version_number: 1,
      processing_status: expect.any(String),
      is_current: true,
    });
    expect(data[0]).toHaveProperty('ocr_status');
    expect(data[0]).toHaveProperty('page_count');
    expect(data[0]).toHaveProperty('has_extracted_text');
  });

  it('hides processing status of draft from student (404)', async () => {
    const docId = await createUploadedDocument(adminToken, 'Draft Hidden Status');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}/processing-status`,
      headers: headers(studentToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it('enforces tenant isolation', async () => {
    const docId = await createUploadedDocument(adminToken, 'Tenant Isolated Status');
    const other = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: other.users[0]!.userEmail, password: SEED_PASSWORD },
    });
    const otherToken = (otherLogin.json() as { data: { access_token: string } }).data.access_token;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}/processing-status`,
      headers: { authorization: `Bearer ${otherToken}`, 'x-institution-id': other.institutionId },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for unknown document', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${fakeId}/processing-status`,
      headers: headers(adminToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it('requires authentication (401)', async () => {
    const docId = await createUploadedDocument(adminToken, 'Auth Required Status');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}/processing-status`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/documents/:id/retry-processing (P3-009)', () => {
  it('retries processing for creator and enqueues job (202)', async () => {
    const docId = await createUploadedDocument(adminToken, 'Retry Creator');
    // Simulate FAILED status
    await pool.query("UPDATE document_versions SET processing_status = 'FAILED' WHERE document_id = $1", [docId]);
    queueEnqueue.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/retry-processing`,
      headers: headers(adminToken),
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toMatchObject({ document_id: docId, processing_status: 'QUEUED' });
    expect(queueEnqueue).toHaveBeenCalledTimes(1);
    expect(queueEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: docId, name: 'document.process' }),
    );
    const row = await pool.query('SELECT processing_status FROM document_versions WHERE document_id = $1', [docId]);
    expect(row.rows[0].processing_status).toBe('QUEUED');
  });

  it('forbids student from retrying (403)', async () => {
    const docId = await createUploadedDocument(adminToken, 'Retry Forbidden');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/retry-processing`,
      headers: headers(studentToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for tenant isolation on retry', async () => {
    const docId = await createUploadedDocument(adminToken, 'Retry Tenant');
    const other = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: other.users[0]!.userEmail, password: SEED_PASSWORD },
    });
    const otherToken = (otherLogin.json() as { data: { access_token: string } }).data.access_token;
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/retry-processing`,
      headers: { authorization: `Bearer ${otherToken}`, 'x-institution-id': other.institutionId },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when no version exists', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: headers(adminToken),
      payload: { title: 'No Version Doc', mime_type: 'application/pdf' },
    });
    const docId = create.json().data.document.id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/retry-processing`,
      headers: headers(adminToken),
    });
    expect(res.statusCode).toBe(409);
  });
});
