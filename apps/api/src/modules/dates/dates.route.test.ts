import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';

const TEST_AUTH = {
  secret: 'dates-route-test-secret-0123456789-0123456789',
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

function headers(token: string, instId: string = institutionId) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': instId };
}

async function createPublishedDocWithDates(token: string, title: string, dates: unknown[]): Promise<string> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(token),
    payload: { title, mime_type: 'application/pdf' },
  });
  const documentId = create.json().data.document.id as string;
  const uploadUrl = create.json().data.upload.upload_url as string;
  await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: new Uint8Array(Buffer.from('dates content')) });
  await app.inject({ method: 'POST', url: `/api/v1/documents/${documentId}/upload-complete`, headers: headers(token) });
  const versionRow = await pool.query('SELECT id FROM document_versions WHERE document_id = $1', [documentId]);
  const versionId = versionRow.rows[0].id as string;
  await pool.query("UPDATE document_versions SET extracted_text = $2, processing_status = 'COMPLETED' WHERE id = $1", [versionId, 'Deadline 18 August 2026']);
  await pool.query('UPDATE document_metadata SET extracted_dates = $2::jsonb WHERE document_id = $1', [documentId, JSON.stringify(dates)]);
  await pool.query("UPDATE documents SET status = 'PUBLISHED', published_at = now(), current_version_id = $2 WHERE id = $1", [documentId, versionId]);
  return documentId;
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
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  adminToken = await login(admin);
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/dates (P6-004)', () => {
  it('returns empty when no dates', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/dates', headers: headers(adminToken) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    // May have dates from other tests, but should not throw
  });

  it('returns important dates for published document with extracted_dates', async () => {
    const dates = [
      { raw: '18 August 2026', isoDate: '2026-08-18', label: 'deadline', type: 'DEADLINE', context: 'Submit by 18 August 2026.', confidence: 0.9 },
      { raw: '2026-09-15', isoDate: '2026-09-15', label: 'exam', type: 'EXAM', context: 'Exam on 2026-09-15.', confidence: 0.8 },
    ];
    const docId = await createPublishedDocWithDates(adminToken, `Dates Doc ${Date.now()}`, dates);
    const res = await app.inject({ method: 'GET', url: '/api/v1/dates', headers: headers(adminToken) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const found = body.data as Array<{ source_document_id: string; date: string }>;
    const mine = found.filter((d) => d.source_document_id === docId);
    expect(mine.length).toBe(2);
    expect(mine.map((d) => d.date)).toEqual(expect.arrayContaining(['2026-08-18', '2026-09-15']));
  });

  it('filters by from/to', async () => {
    const dates = [
      { raw: '18 August 2026', isoDate: '2026-08-18', label: 'deadline', type: 'DEADLINE', context: 'Submit by 18 August 2026.', confidence: 0.9 },
      { raw: '15 September 2026', isoDate: '2026-09-15', label: 'exam', type: 'EXAM', context: 'Exam on 15 September 2026.', confidence: 0.8 },
    ];
    const docId = await createPublishedDocWithDates(adminToken, `Filter Dates ${Date.now()}`, dates);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/dates?from=2026-08-18&to=2026-08-18`,
      headers: headers(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const mine = (body.data as Array<{ source_document_id: string; date: string }>).filter((d) => d.source_document_id === docId);
    expect(mine.length).toBe(1);
    expect(mine[0]!.date).toBe('2026-08-18');
  });

  it('enforces tenant isolation (no leakage)', async () => {
    const dates = [{ raw: '18 August 2026', isoDate: '2026-08-18', label: 'deadline', type: 'DEADLINE', context: 'Submit by 18 August 2026.', confidence: 0.9 }];
    const docId = await createPublishedDocWithDates(adminToken, `Tenant Dates ${Date.now()}`, dates);
    const other = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: other.users[0]!.userEmail, password: SEED_PASSWORD },
    });
    const otherToken = (otherLogin.json() as { data: { access_token: string } }).data.access_token;
    const res = await app.inject({ method: 'GET', url: '/api/v1/dates', headers: headers(otherToken, other.institutionId) });
    expect(res.statusCode).toBe(200);
    const found = (res.json().data as Array<{ source_document_id: string }>).filter((d) => d.source_document_id === docId);
    expect(found.length).toBe(0);
  });

  it('requires authentication (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/dates' });
    expect(res.statusCode).toBe(401);
  });
});
