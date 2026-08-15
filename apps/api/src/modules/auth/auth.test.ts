import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import {
  closeTestPools,
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

let pool: Pool;
let app: FastifyInstance;
let identity: SeedIdentity;

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  identity = await seedIdentity(pool);
  app = await buildApp({ logger: false, pool, auth: { pool, tokenConfig: TEST_AUTH } });
});

afterEach(async () => {
  await pool.query('DELETE FROM refresh_tokens');
});

afterAll(async () => {
  await app.close();
  await pool.query('DELETE FROM institution_memberships');
  await pool.query('DELETE FROM departments');
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM institutions');
  await closeTestPools();
});

async function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
}

describe('POST /api/v1/auth/login', () => {
  it('logs in an active user and returns a token pair', async () => {
    const response = await login(identity.userEmail, SEED_PASSWORD);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.user).toMatchObject({ id: identity.userId, email: identity.userEmail });
    expect(body.data.access_token).toEqual(expect.any(String));
    expect(body.data.expires_in).toBe(TEST_AUTH.accessTtlMinutes * 60);
  });

  it('rejects a wrong password without leaking account existence', async () => {
    const response = await login(identity.userEmail, 'wrong-password');

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Invalid email or password.');
    expect(body.error.request_id).toMatch(/^req_/);
  });

  it('rejects an unknown email with the same message', async () => {
    const response = await login('nobody@example.edu', 'whatever-password');

    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toBe('Invalid email or password.');
  });

  it('rejects an inactive user', async () => {
    const inactive = await seedIdentity(pool, { userStatus: 'INACTIVE' });
    const response = await login(inactive.userEmail, SEED_PASSWORD);

    expect(response.statusCode).toBe(401);
  });

  it('rejects malformed payloads with a validation error', async () => {
    const response = await login('not-an-email', 'x');

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.email).toBeDefined();
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the user and memberships with a valid token', async () => {
    const loginResponse = await login(identity.userEmail, SEED_PASSWORD);
    const { access_token } = loginResponse.json().data;

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${access_token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toMatchObject({ id: identity.userId, email: identity.userEmail });
    expect(body.data.memberships).toEqual([
      expect.objectContaining({
        institution_id: identity.institutionId,
        role: 'STUDENT',
        department: 'Computer Science',
        course: 'B.Tech',
        semester: 6,
      }),
    ]);
  });

  it('rejects requests without a token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer not-a-real-token' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const loginResponse = await login(identity.userEmail, SEED_PASSWORD);
    const { refresh_token } = loginResponse.json().data;

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refresh_token },
    });

    expect(first.statusCode).toBe(200);
    const { access_token, refresh_token: next_refresh_token } = first.json().data;
    expect(access_token).toEqual(expect.any(String));
    expect(next_refresh_token).not.toBe(refresh_token);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refresh_token },
    });

    expect(second.statusCode).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refresh_token: 'definitely-not-a-real-token' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh token so it can no longer refresh', async () => {
    const loginResponse = await login(identity.userEmail, SEED_PASSWORD);
    const { refresh_token } = loginResponse.json().data;

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refresh_token },
    });
    expect(logout.statusCode).toBe(204);

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refresh_token },
    });
    expect(refresh.statusCode).toBe(401);
  });
});

describe('rate limiting on auth endpoints', () => {
  it('returns 429 after too many login attempts', async () => {
    const rateLimitedApp = await buildApp({
      logger: false,
      pool,
      auth: { pool, tokenConfig: TEST_AUTH },
    });
    try {
      let lastStatus = 0;
      for (let attempt = 0; attempt <= 10; attempt += 1) {
        const response = await rateLimitedApp.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'ratelimit@example.edu', password: 'x' },
        });
        lastStatus = response.statusCode;
      }
      expect(lastStatus).toBe(429);
    } finally {
      await rateLimitedApp.close();
    }
  });
});
