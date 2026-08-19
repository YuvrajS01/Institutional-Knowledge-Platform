import { createHash } from 'node:crypto';

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
  seedInstitutionWithUsers,
  type SeedIdentity,
} from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'documents-route-test-secret-0123456789-0123456789',
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
let admin: SeedIdentity;
let student: SeedIdentity;
let institutionId: string;
let adminToken: string;
let studentToken: string;

const createdDocumentIds: string[] = [];

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

async function createDocument(token: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title: 'Examination Form Notice', mime_type: 'application/pdf', ...body },
  });
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  admin = tenant.users[1]!;
  student = tenant.users[0]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  adminToken = await login(admin);
  studentToken = await login(student);
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/v1/documents', () => {
  it('creates a DRAFT document and returns a presigned upload URL', async () => {
    const response = await createDocument(adminToken, {
      document_type: 'NOTICE',
      audience: { roles: ['STUDENT'] },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json().data;
    expect(body.document.status).toBe('DRAFT');
    expect(body.document.title).toBe('Examination Form Notice');
    expect(body.upload.upload_url).toMatch(/^http/);
    expect(body.upload.expires_at).toBeTruthy();
    createdDocumentIds.push(body.document.id);

    const metadata = await pool.query(
      'SELECT audience FROM document_metadata WHERE document_id = $1',
      [body.document.id],
    );
    expect(metadata.rows[0].audience).toEqual({ roles: ['STUDENT'] });
  });

  it('rejects unsupported mime types with 415', async () => {
    const response = await createDocument(adminToken, { mime_type: 'application/x-msdownload' });

    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects creation by a student with 403', async () => {
    const response = await createDocument(studentToken);
    expect(response.statusCode).toBe(403);
  });

  it('assigns distinct slugs for repeated titles', async () => {
    const first = await createDocument(adminToken, { title: 'Duplicate Title Test' });
    const second = await createDocument(adminToken, { title: 'Duplicate Title Test' });
    createdDocumentIds.push(first.json().data.document.id, second.json().data.document.id);

    expect(first.json().data.document.id).not.toBe(second.json().data.document.id);
    const rows = await pool.query('SELECT slug FROM documents WHERE id = ANY($1)', [
      [first.json().data.document.id, second.json().data.document.id],
    ]);
    expect(rows.rows[0].slug).not.toBe(rows.rows[1].slug);
  });
});

describe('POST /api/v1/documents/:id/upload-complete', () => {
  it('confirms an upload, records the version with sha256, and sets it current', async () => {
    const create = await createDocument(adminToken);
    const documentId = create.json().data.document.id as string;
    const uploadUrl = create.json().data.upload.upload_url as string;
    const content = Buffer.from('hello signed upload');

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: new Uint8Array(content),
    });
    expect(put.status).toBe(200);

    const confirm = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/upload-complete`,
      headers: headers(adminToken),
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().data).toEqual({ document_id: documentId, processing_status: 'QUEUED' });

    const version = await pool.query(
      `SELECT v.size_bytes, v.sha256, v.mime_type, v.version_number, d.current_version_id = v.id AS is_current
       FROM document_versions v JOIN documents d ON d.id = v.document_id WHERE v.document_id = $1`,
      [documentId],
    );
    expect(version.rows).toHaveLength(1);
    expect(version.rows[0]).toMatchObject({
      size_bytes: String(content.byteLength),
      sha256: createHash('sha256').update(content).digest('hex'),
      mime_type: 'application/pdf',
      version_number: 1,
      is_current: true,
    });
  });

  it('is idempotent: replaying the confirmation succeeds without new side effects', async () => {
    const create = await createDocument(adminToken);
    const documentId = create.json().data.document.id as string;
    const uploadUrl = create.json().data.upload.upload_url as string;
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: new Uint8Array(Buffer.from('replay')),
    });

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/upload-complete`,
      headers: headers(adminToken),
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/upload-complete`,
      headers: headers(adminToken),
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const count = await pool.query(
      'SELECT count(*) FROM document_versions WHERE document_id = $1',
      [documentId],
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it('rejects confirmation when nothing was uploaded (409)', async () => {
    const create = await createDocument(adminToken);
    const documentId = create.json().data.document.id as string;

    const confirm = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/upload-complete`,
      headers: headers(adminToken),
    });

    expect(confirm.statusCode).toBe(409);
    expect(confirm.json().error.code).toBe('CONFLICT');
  });

  it('rejects confirmation by a non-creator (403)', async () => {
    const create = await createDocument(adminToken);
    const documentId = create.json().data.document.id as string;

    const confirm = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/upload-complete`,
      headers: headers(studentToken),
    });

    expect(confirm.statusCode).toBe(403);
  });

  it('is not visible across tenants (404)', async () => {
    const create = await createDocument(adminToken);
    const documentId = create.json().data.document.id as string;

    const foreign = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
    const foreignToken = await login(foreign.users[0]!);
    const confirm = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/upload-complete`,
      headers: {
        authorization: `Bearer ${foreignToken}`,
        'x-institution-id': foreign.institutionId,
      },
    });

    expect(confirm.statusCode).toBe(404);
  });
});
