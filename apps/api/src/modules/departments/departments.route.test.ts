import { randomUUID } from 'node:crypto';

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

const TEST_AUTH = {
  secret: 'admin-api-test-secret-0123456789-0123456789',
  accessTtlMinutes: 15,
  refreshTtlDays: 30,
};

const TEST_RATE_LIMIT = { max: 1000, timeWindow: '1 minute' };

type App = Awaited<ReturnType<typeof buildApp>>;

let pool: Pool;
let app: App;
let admin: SeedIdentity;
let student: SeedIdentity;
let institutionId: string;
let foreignAdmin: SeedIdentity;
let foreignInstitutionId: string;
let adminToken: string;
let studentToken: string;
let foreignAdminToken: string;

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

function headers(token: string, institution?: string) {
  return {
    authorization: `Bearer ${token}`,
    'x-institution-id': institution ?? institutionId,
  };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  admin = tenant.users[1]!;
  student = tenant.users[0]!;

  const foreignTenant = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN']);
  foreignInstitutionId = foreignTenant.institutionId;
  foreignAdmin = foreignTenant.users[0]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
  });

  adminToken = await login(admin);
  studentToken = await login(student);
  foreignAdminToken = await login(foreignAdmin);
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/institutions/current', () => {
  it('returns the current institution for any member', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/institutions/current',
      headers: headers(studentToken),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.id).toBe(institutionId);
    expect(body.data.name).toBeTruthy();
    expect(body.data.timezone).toBe('UTC');
    expect(body.data.settings).toEqual({});
  });

  it('denies a member of another institution', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/institutions/current',
      headers: headers(foreignAdminToken),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });
});

describe('PATCH /api/v1/institutions/current', () => {
  it('updates institution settings as INSTITUTION_ADMIN', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/institutions/current',
      headers: headers(adminToken),
      payload: {
        name: 'Updated College Name',
        timezone: 'Asia/Kolkata',
        settings: { max_upload_mb: 25 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.name).toBe('Updated College Name');
    expect(body.data.timezone).toBe('Asia/Kolkata');
    expect(body.data.settings).toEqual({ max_upload_mb: 25 });
  });

  it('rejects updates from a student', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/institutions/current',
      headers: headers(studentToken),
      payload: { name: 'Hacked' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('validates the payload', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/institutions/current',
      headers: headers(adminToken),
      payload: { timezone: '' },
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('GET /api/v1/departments', () => {
  it('lists departments with pagination metadata', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/departments?page=1&limit=10',
      headers: headers(studentToken),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toMatchObject({ page: 1, limit: 10 });
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('never returns another tenant departments', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/departments',
      headers: headers(studentToken, foreignInstitutionId),
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('POST /api/v1/departments', () => {
  it('creates a department as INSTITUTION_ADMIN', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: headers(adminToken),
      payload: { name: 'Mathematics', code: 'math' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data).toMatchObject({ name: 'Mathematics', code: 'MATH', status: 'ACTIVE' });
    expect(body.data.institution_id).toBe(institutionId);
  });

  it('rejects a duplicate code within the tenant', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: headers(adminToken),
      payload: { name: 'Mathematics Again', code: 'MATH' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONFLICT');
  });

  it('rejects creation from a student', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: headers(studentToken),
      payload: { name: 'Not Allowed', code: 'NA' },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('PATCH /api/v1/departments/:department_id', () => {
  it('updates a department within the tenant', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: headers(adminToken),
      payload: { name: 'Original', code: 'ORIG' },
    });
    const departmentId = created.json().data.id as string;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/${departmentId}`,
      headers: headers(adminToken),
      payload: { name: 'Renamed' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.name).toBe('Renamed');
  });

  it('returns 404 for a foreign tenant department', async () => {
    const foreignCreated = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: headers(foreignAdminToken, foreignInstitutionId),
      payload: { name: 'Foreign Dept', code: 'FD' },
    });
    const foreignId = foreignCreated.json().data.id as string;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/${foreignId}`,
      headers: headers(adminToken),
      payload: { name: 'Nope' },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/departments/:department_id (soft deactivation)', () => {
  it('deactivates a department as INSTITUTION_ADMIN', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: headers(adminToken),
      payload: { name: 'To Deactivate', code: 'TOD' },
    });
    const departmentId = created.json().data.id as string;

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${departmentId}`,
      headers: headers(adminToken),
    });

    expect(response.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${departmentId}`,
      headers: headers(adminToken),
    });
    expect(list.json().data.status).toBe('INACTIVE');
  });

  it('rejects deletion by a student', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${randomUUID()}`,
      headers: headers(studentToken),
    });

    expect(response.statusCode).toBe(403);
  });
});
