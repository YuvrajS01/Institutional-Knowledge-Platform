import type { Capability, Role } from '@ikp/shared';
import { CAPABILITIES, ROLE_CAPABILITIES } from '@ikp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthorization } from '../../../apps/api/src/common/auth/authorize.js';
import { buildApp } from '../../../apps/api/src/app.js';
import { createTestPgPool } from '../helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../helpers/seed.js';

const TEST_AUTH = {
  secret: 'security-suite-secret-0123456789-0123456789',
  accessTtlMinutes: 15,
  refreshTtlDays: 30,
};

const TEST_RATE_LIMIT = { max: 1000, timeWindow: '1 minute' };

// Representative capabilities covering every tier of the authorization matrix.
const MATRIX_CAPABILITIES: readonly Capability[] = CAPABILITIES;

type App = Awaited<ReturnType<typeof buildApp>>;

interface Actor {
  label: string;
  identity: SeedIdentity;
  role: Role;
  token: string;
}

let pool: ReturnType<typeof createTestPgPool>;
let app: App;
let institutionA: string;
let institutionB: string;
const actors: Actor[] = [];

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

beforeAll(async () => {
  pool = createTestPgPool();

  const tenantA = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  const tenantB = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionA = tenantA.institutionId;
  institutionB = tenantB.institutionId;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
  });

  const { guard } = createAuthorization({ jwtSecret: TEST_AUTH.secret, pool });
  for (const capability of MATRIX_CAPABILITIES) {
    app.get(
      `/api/v1/security-test/${capability}`,
      { preHandler: guard(capability) },
      async (request) => ({
        data: { institution_id: request.institution!.id, role: request.institution!.role },
      }),
    );
  }

  const seedUsers = [
    { label: 'A-student', identity: tenantA.users[0]!, role: 'STUDENT' as Role },
    { label: 'A-admin', identity: tenantA.users[1]!, role: 'INSTITUTION_ADMIN' as Role },
    { label: 'B-student', identity: tenantB.users[0]!, role: 'STUDENT' as Role },
    { label: 'B-admin', identity: tenantB.users[1]!, role: 'INSTITUTION_ADMIN' as Role },
  ];
  for (const actor of seedUsers) {
    actors.push({ ...actor, token: await login(actor.identity) });
  }
});

afterAll(async () => {
  await app.close();
});

describe('cross-tenant API access matrix', () => {
  it('denies every actor access to the other tenant for every capability', async () => {
    for (const actor of actors) {
      const foreignTenant =
        actor.identity.institutionId === institutionA ? institutionB : institutionA;
      for (const capability of MATRIX_CAPABILITIES) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/security-test/${capability}`,
          headers: { authorization: `Bearer ${actor.token}`, 'x-institution-id': foreignTenant },
        });
        expect(response.statusCode, `${actor.label} → foreign tenant for ${capability}`).toBe(403);
        expect(response.json().error.code, `${actor.label} → ${capability} error code`).toBe(
          'FORBIDDEN',
        );
      }
    }
  });

  it('grants exactly the capabilities of the role inside the own tenant', async () => {
    for (const actor of actors) {
      for (const capability of CAPABILITIES) {
        const expected = ROLE_CAPABILITIES[actor.role].includes(capability) ? 200 : 403;
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/security-test/${capability}`,
          headers: {
            authorization: `Bearer ${actor.token}`,
            'x-institution-id': actor.identity.institutionId,
          },
        });
        expect(
          response.statusCode,
          `${actor.label} → own tenant for ${capability} (expected ${expected})`,
        ).toBe(expected);
      }
    }
  });

  it('does not leak the foreign institution in a denied response', async () => {
    const actor = actors[0]!;
    const foreignTenant =
      actor.identity.institutionId === institutionA ? institutionB : institutionA;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/security-test/document.read',
      headers: { authorization: `Bearer ${actor.token}`, 'x-institution-id': foreignTenant },
    });
    const body = response.json();
    expect(response.statusCode).toBe(403);
    expect(JSON.stringify(body)).not.toContain(foreignTenant);
    expect(body.error.details).toEqual({});
  });
});
