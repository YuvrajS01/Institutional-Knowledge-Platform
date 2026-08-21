import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'summary-route-test-secret-0123456789-0123456789',
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

function headers(token: string) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': institutionId };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  admin = tenant.users[0]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  adminToken = await login(admin);
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/documents/:id summary (P6-003)', () => {
  it('returns summary derived from extracted_text when present', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: headers(adminToken),
      payload: { title: 'Summary Doc', mime_type: 'application/pdf' },
    });
    const documentId = create.json().data.document.id as string;
    const uploadUrl = create.json().data.upload.upload_url as string;
    await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: new Uint8Array(Buffer.from('summary content')) });
    await app.inject({ method: 'POST', url: `/api/v1/documents/${documentId}/upload-complete`, headers: headers(adminToken) });

    // Simulate processing completed with extracted_text
    const versionRow = await pool.query('SELECT id FROM document_versions WHERE document_id = $1', [documentId]);
    const versionId = versionRow.rows[0].id as string;
    await pool.query("UPDATE document_versions SET extracted_text = $2, processing_status = 'COMPLETED', page_count = 1 WHERE id = $1", [
      versionId,
      'Examination Form Submission Notice. Submit by 18 August 2026. Late fee applies after deadline. Details follow for all students.',
    ]);
    await pool.query("UPDATE documents SET status = 'PUBLISHED', published_at = now(), current_version_id = $2 WHERE id = $1", [documentId, versionId]);

    const res = await app.inject({ method: 'GET', url: `/api/v1/documents/${documentId}`, headers: headers(adminToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { summary: string | null };
    expect(data.summary).toBeTruthy();
    expect(data.summary).toContain('Examination Form Submission Notice');
    expect(data.summary).toContain('Submit by 18 August 2026');
  });

  it('prefers summary from metadata extra when present', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: headers(adminToken),
      payload: { title: 'Metadata Summary Doc', mime_type: 'application/pdf' },
    });
    const documentId = create.json().data.document.id as string;
    const uploadUrl = create.json().data.upload.upload_url as string;
    await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: new Uint8Array(Buffer.from('meta summary')) });
    await app.inject({ method: 'POST', url: `/api/v1/documents/${documentId}/upload-complete`, headers: headers(adminToken) });

    const versionRow = await pool.query('SELECT id FROM document_versions WHERE document_id = $1', [documentId]);
    const versionId = versionRow.rows[0].id as string;
    await pool.query("UPDATE document_versions SET extracted_text = $2, processing_status = 'COMPLETED' WHERE id = $1", [
      versionId,
      'Fallback text should not be used when metadata has summary.',
    ]);
    // Store summary in metadata extra
    await pool.query("UPDATE document_metadata SET extra = $2 WHERE document_id = $1", [
      documentId,
      JSON.stringify({ summary: 'Custom LLM summary for this document.' }),
    ]);
    await pool.query("UPDATE documents SET status = 'PUBLISHED', published_at = now(), current_version_id = $2 WHERE id = $1", [documentId, versionId]);

    const res = await app.inject({ method: 'GET', url: `/api/v1/documents/${documentId}`, headers: headers(adminToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { summary: string | null };
    expect(data.summary).toBe('Custom LLM summary for this document.');
  });

  it('returns null summary when no extracted_text and no metadata', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: headers(adminToken),
      payload: { title: 'No Summary Doc', mime_type: 'application/pdf' },
    });
    const documentId = create.json().data.document.id as string;
    const uploadUrl = create.json().data.upload.upload_url as string;
    await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: new Uint8Array(Buffer.from('no summary')) });
    await app.inject({ method: 'POST', url: `/api/v1/documents/${documentId}/upload-complete`, headers: headers(adminToken) });

    const res = await app.inject({ method: 'GET', url: `/api/v1/documents/${documentId}`, headers: headers(adminToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { summary: string | null };
    // No extracted_text set, so summary should be null (processing not yet completed)
    expect(data.summary).toBeNull();
  });
});
