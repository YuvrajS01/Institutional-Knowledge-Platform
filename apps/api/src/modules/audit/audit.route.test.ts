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
  secret: 'audit-route-test-secret-0123456789-0123456789',
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

async function createAndPublishDocument(): Promise<string> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: headers(deptAdminToken),
    payload: { title: 'Audited Document', mime_type: 'application/pdf' },
  });
  const documentId = create.json().data.document.id as string;
  const uploadUrl = create.json().data.upload.upload_url as string;
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf' },
    body: new Uint8Array(Buffer.from('audit content')),
  });
  await app.inject({
    method: 'POST',
    url: `/api/v1/documents/${documentId}/upload-complete`,
    headers: headers(deptAdminToken),
  });
  await app.inject({
    method: 'POST',
    url: `/api/v1/documents/${documentId}/submit-review`,
    headers: headers(deptAdminToken),
  });
  await app.inject({
    method: 'POST',
    url: `/api/v1/documents/${documentId}/approve`,
    headers: headers(approverToken),
  });
  await app.inject({
    method: 'POST',
    url: `/api/v1/documents/${documentId}/publish`,
    headers: headers(approverToken),
  });
  return documentId;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  student = tenant.users[0]!;

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

describe('GET /api/v1/admin/audit-logs', () => {
  it('records and returns the full document lifecycle trail', async () => {
    const documentId = await createAndPublishDocument();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?page=1&limit=50',
      headers: headers(approverToken),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.meta.total).toBeGreaterThanOrEqual(5);

    const actions = body.data.map((row: { action: string; entity_id: string }) => row.action);
    expect(actions).toContain('document.created');
    expect(actions).toContain('document.uploaded');
    expect(actions).toContain('document.submitted_for_review');
    expect(actions).toContain('document.approved');
    expect(actions).toContain('document.published');

    const forDocument = body.data.filter(
      (row: { entity_id: string }) => row.entity_id === documentId,
    );
    expect(forDocument.length).toBeGreaterThanOrEqual(5);
    for (const row of forDocument) {
      expect(row.entity_type).toBe('document');
      expect(row.actor_user_id).toBeTruthy();
    }
  });

  it('filters by action', async () => {
    await createAndPublishDocument();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?action=document.published&page=1&limit=50',
      headers: headers(approverToken),
    });

    const body = response.json();
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    for (const row of body.data) {
      expect(row.action).toBe('document.published');
      expect(row.metadata.to).toBe('PUBLISHED');
    }
  });

  it('filters by actor', async () => {
    await createAndPublishDocument();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/audit-logs?actor_id=${approver.userId}&page=1&limit=50`,
      headers: headers(approverToken),
    });

    const body = response.json();
    expect(body.meta.total).toBeGreaterThanOrEqual(2); // approve + publish
    for (const row of body.data) {
      expect(row.actor_user_id).toBe(approver.userId);
    }
  });

  it('denies students with 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs',
      headers: headers(studentToken),
    });
    expect(response.statusCode).toBe(403);
  });

  it('is tenant-scoped: another tenant cannot see our audit trail', async () => {
    const foreign = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
    const foreignToken = await login(foreign.users[0]!);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?page=1&limit=50',
      headers: {
        authorization: `Bearer ${foreignToken}`,
        'x-institution-id': foreign.institutionId,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    for (const row of body.data) {
      expect(row.institution_id ?? row.actor_user_id).toBeTruthy();
    }
    // The foreign tenant cannot have our institution's audit rows.
    const ourRows = await pool.query('SELECT count(*) FROM audit_logs WHERE institution_id = $1', [
      institutionId,
    ]);
    expect(Number(ourRows.rows[0].count)).toBeGreaterThan(0);
    expect(body.meta.total).toBeLessThan(Number(ourRows.rows[0].count) || body.meta.total + 1);
  });
});
