import { randomUUID } from 'node:crypto';

import { apiRequire } from './require.js';
import type { PoolLike } from './db.js';

const require = apiRequire();
const bcrypt = require('bcryptjs') as {
  hash: (value: string, rounds: number) => Promise<string>;
};

export const SEED_PASSWORD = 'TestPassword123!';

export interface SeedIdentity {
  institutionId: string;
  departmentId: string;
  userId: string;
  userEmail: string;
}

export interface SeedIdentityOptions {
  userStatus?: string;
  role?: string;
}

interface NewInstitution {
  institutionId: string;
  departmentId: string;
}

async function createInstitutionWithDepartment(pool: PoolLike): Promise<NewInstitution> {
  const suffix = randomUUID().replaceAll('-', '');
  const institutionResult = await pool.query(
    'INSERT INTO institutions (name, slug) VALUES ($1, $2) RETURNING id',
    [`Test College ${suffix}`, `test-college-${suffix}`],
  );
  const institutionId = (institutionResult.rows[0] as { id: string }).id;

  const departmentResult = await pool.query(
    'INSERT INTO departments (institution_id, name, code) VALUES ($1, $2, $3) RETURNING id',
    [institutionId, 'Computer Science', `CSE-${suffix}`],
  );
  const departmentId = (departmentResult.rows[0] as { id: string }).id;

  return { institutionId, departmentId };
}

async function insertUserWithMembership(
  pool: PoolLike,
  scope: NewInstitution,
  options: SeedIdentityOptions,
): Promise<SeedIdentity> {
  const suffix = randomUUID().replaceAll('-', '');
  const userEmail = `user-${suffix}@example.edu`;

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const userResult = await pool.query(
    `INSERT INTO users (email, name, password_hash, status)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userEmail, 'Test Student', passwordHash, options.userStatus ?? 'ACTIVE'],
  );
  const userId = (userResult.rows[0] as { id: string }).id;

  await pool.query(
    `INSERT INTO institution_memberships (institution_id, user_id, role, department_id, course, semester)
     VALUES ($1, $2, $3, $4, 'B.Tech', 6)`,
    [scope.institutionId, userId, options.role ?? 'STUDENT', scope.departmentId],
  );

  return {
    institutionId: scope.institutionId,
    departmentId: scope.departmentId,
    userId,
    userEmail,
  };
}

/**
 * Seeds one institution, one department, and one ACTIVE user with a known
 * password and a membership in that institution. Every call uses unique
 * slugs/emails so parallel test files do not collide.
 */
export async function seedIdentity(
  pool: PoolLike,
  options: SeedIdentityOptions = {},
): Promise<SeedIdentity> {
  const scope = await createInstitutionWithDepartment(pool);
  return insertUserWithMembership(pool, scope, options);
}

/**
 * Seeds one institution with one user per given role (all with memberships in
 * the same institution/department). Useful for security suites that need
 * several actors inside a single tenant.
 */
export async function seedInstitutionWithUsers(
  pool: PoolLike,
  roles: string[],
): Promise<{ institutionId: string; departmentId: string; users: SeedIdentity[] }> {
  const scope = await createInstitutionWithDepartment(pool);
  const users: SeedIdentity[] = [];
  for (const role of roles) {
    users.push(await insertUserWithMembership(pool, scope, { role }));
  }
  return { institutionId: scope.institutionId, departmentId: scope.departmentId, users };
}
