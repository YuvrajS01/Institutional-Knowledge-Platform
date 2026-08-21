import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import {
  SEED_PASSWORD,
  seedInstitutionWithUsers,
  type SeedIdentity,
} from '../../../../../tests/integration/helpers/seed.js';
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from '../../infrastructure/storage/s3-object-storage.js';

const TEST_AUTH = {
  secret: 'share-test-secret-0123456789-0123456789-share',
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
let studentOther: SeedIdentity;
let studentToken: string;
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
  studentOther = otherTenant.users[0]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: { max: 1000, timeWindow: '1 minute' },
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  studentToken = await login(student);

  const suffix = Math.random().toString(36).slice(2, 8);
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
    [institutionId, `Share Test ${suffix}`, `share-${suffix}`, admin.userId, 'PUBLISHED'],
  );
  publishedDocId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [publishedDocId]);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('POST /api/v1/documents/:id/share (P6-007)', () => {
  it('returns share_url for published document', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${publishedDocId}/share`,
      headers: headers(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { share_url: string; document_id: string; title: string } };
    expect(body.data.share_url).toContain(`/documents/${publishedDocId}`);
    expect(body.data.document_id).toBe(publishedDocId);
    expect(typeof body.data.title).toBe('string');
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${publishedDocId}/share`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates document_id as uuid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/not-a-uuid/share',
      headers: headers(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 404 for non-existent document', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000000';
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${fakeId}/share`,
      headers: headers(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(404);
  });

  it('enforces tenant isolation', async () => {
    const otherToken = await login(studentOther);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${publishedDocId}/share`,
      headers: headers(otherToken, otherInstitutionId),
    });
    expect([404, 403].includes(res.statusCode)).toBe(true);
  });

  it('student cannot share draft', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const draft = await pool.query(
      'INSERT INTO documents (institution_id, title, slug, created_by, status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [institutionId, `Draft Share ${suffix}`, `draft-share-${suffix}`, admin.userId, 'DRAFT'],
    );
    const draftId = (draft.rows[0] as { id: string }).id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${draftId}/share`,
      headers: headers(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(404);
  });
});
