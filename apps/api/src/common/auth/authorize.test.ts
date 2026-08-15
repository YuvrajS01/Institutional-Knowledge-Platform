import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { createAuthorization } from './authorize.js';
import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import {
  SEED_PASSWORD,
  seedIdentity,
  type SeedIdentity,
} from '../../../../../tests/integration/helpers/seed.js';

const TEST_AUTH = {
  secret: 'integration-test-secret-0123456789-0123456789',
  accessTtlMinutes: 15,
  refreshTtlDays: 30,
};

// High limit so the shared app's counter can never be tripped by the suite.
const TEST_RATE_LIMIT = { max: 1000, timeWindow: '1 minute' };

let pool: Pool;
let app: FastifyInstance;
let student: SeedIdentity;
let approver: SeedIdentity;
let admin: SeedIdentity;
let otherInstitutionId: string;

async function login(identity: SeedIdentity): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: identity.userEmail, password: SEED_PASSWORD },
  });
  const body = response.json() as { data?: { access_token?: string }; error?: { code?: string } };
  if (!body.data?.access_token) {
    throw new Error(
      `login failed for ${identity.userEmail}: status ${response.statusCode}, body ${JSON.stringify(body)}`,
    );
  }
  return body.data.access_token;
}

async function callGuardedRoute(token: string, institutionId: string): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/test/audit-logs',
    headers: { authorization: `Bearer ${token}`, 'x-institution-id': institutionId },
  });
  return response.statusCode;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);

  student = await seedIdentity(pool, { role: 'STUDENT' });
  approver = await seedIdentity(pool, { role: 'APPROVER' });
  admin = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });

  const other = await pool.query(
    'INSERT INTO institutions (name, slug) VALUES ($1, $2) RETURNING id',
    ['Other College', `other-college-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`],
  );
  otherInstitutionId = (other.rows[0] as { id: string }).id;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
  });

  const guard = createAuthorization({ jwtSecret: TEST_AUTH.secret, pool });
  app.get('/api/v1/test/audit-logs', { preHandler: guard('audit.read') }, async (request) => ({
    data: { institution_id: request.institution!.id, role: request.institution!.role },
  }));
  app.get('/api/v1/test/create-document', { preHandler: guard('document.create') }, async () => ({
    data: { ok: true },
  }));
});

afterAll(async () => {
  await app.close();
});

describe('RBAC guard', () => {
  it('grants access when the role has the capability', async () => {
    const token = await login(approver);
    const statusCode = await callGuardedRoute(token, approver.institutionId);
    expect(statusCode).toBe(200);
  });

  it('sets the institution context on the request', async () => {
    const token = await login(approver);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test/audit-logs',
      headers: { authorization: `Bearer ${token}`, 'x-institution-id': approver.institutionId },
    });
    const body = response.json();
    expect(body.data).toEqual({
      institution_id: approver.institutionId,
      role: 'APPROVER',
    });
  });

  it('denies a student requesting an approver capability', async () => {
    const token = await login(student);
    const statusCode = await callGuardedRoute(token, student.institutionId);
    expect(statusCode).toBe(403);
  });

  it('denies access when the membership exists but the capability is missing', async () => {
    const token = await login(student);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test/create-document',
      headers: { authorization: `Bearer ${token}`, 'x-institution-id': student.institutionId },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('denies cross-institution access even with a valid token', async () => {
    const token = await login(student);
    const statusCode = await callGuardedRoute(token, otherInstitutionId);
    expect(statusCode).toBe(403);
  });

  it('grants institution admin broad institution-level capabilities', async () => {
    const token = await login(admin);
    const statusCode = await callGuardedRoute(token, admin.institutionId);
    expect(statusCode).toBe(200);
  });

  it('requires the X-Institution-Id header', async () => {
    const token = await login(approver);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test/audit-logs',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a malformed X-Institution-Id header', async () => {
    const token = await login(approver);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test/audit-logs',
      headers: { authorization: `Bearer ${token}`, 'x-institution-id': 'not-a-uuid' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unauthenticated requests before authorization', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test/audit-logs',
      headers: { 'x-institution-id': approver.institutionId },
    });
    expect(response.statusCode).toBe(401);
  });
});
