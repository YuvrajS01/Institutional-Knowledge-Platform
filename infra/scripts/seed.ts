/**
 * @file Development seed script (identity data only).
 *
 * Creates one institution, three departments, and one user per role so the
 * platform is usable locally before real onboarding exists. Idempotent.
 *
 * Run with: pnpm db:seed
 *
 * @note This seeds a KNOWN development password. Never use it in production.
 */

import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve(process.cwd(), 'package.json'));
const { Pool } = require('pg') as {
  Pool: new (options: { connectionString?: string }) => {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
    end: () => Promise<void>;
  };
};
const bcrypt = require('bcryptjs') as { hash: (value: string, rounds: number) => Promise<string> };

const DEV_PASSWORD = 'Password123!';

const DEPARTMENTS = [
  { name: 'Computer Science and Engineering', code: 'CSE' },
  { name: 'Electronics and Communication Engineering', code: 'ECE' },
  { name: 'Mechanical Engineering', code: 'ME' },
];

const USERS: {
  email: string;
  name: string;
  role: string;
  departmentCode?: string;
  course?: string;
  semester?: number;
}[] = [
  { email: 'admin@example.edu', name: 'Institution Admin', role: 'INSTITUTION_ADMIN' },
  { email: 'approver@example.edu', name: 'Approver', role: 'APPROVER' },
  {
    email: 'deptadmin@example.edu',
    name: 'Department Admin',
    role: 'DEPARTMENT_ADMIN',
    departmentCode: 'CSE',
  },
  { email: 'faculty@example.edu', name: 'Faculty Member', role: 'FACULTY', departmentCode: 'CSE' },
  {
    email: 'student@example.edu',
    name: 'Example Student',
    role: 'STUDENT',
    departmentCode: 'CSE',
    course: 'B.Tech',
    semester: 6,
  },
];

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    require('dotenv').config({ path: path.resolve(process.cwd(), '../../.env') });
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Create a .env file from .env.example first.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const institution = await pool.query(
      `INSERT INTO institutions (name, slug) VALUES ('Example College', 'example-college')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const institutionId = (institution.rows[0] as { id: string }).id;

    const departments: Record<string, string> = {};
    for (const department of DEPARTMENTS) {
      const result = await pool.query(
        `INSERT INTO departments (institution_id, name, code)
         VALUES ($1, $2, $3)
         ON CONFLICT (institution_id, code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [institutionId, department.name, department.code],
      );
      departments[department.code] = (result.rows[0] as { id: string }).id;
    }

    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

    for (const user of USERS) {
      const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [
        user.email,
      ]);
      let userId: string;
      if ((existing.rows[0] as { id?: string } | undefined)?.id) {
        userId = (existing.rows[0] as { id: string }).id;
        await pool.query(
          "UPDATE users SET name = $1, password_hash = $2, status = 'ACTIVE' WHERE id = $3",
          [user.name, passwordHash, userId],
        );
      } else {
        const created = await pool.query(
          `INSERT INTO users (email, name, password_hash, status)
           VALUES ($1, $2, $3, 'ACTIVE')
           RETURNING id`,
          [user.email, user.name, passwordHash],
        );
        userId = (created.rows[0] as { id: string }).id;
      }

      const membership = await pool.query(
        'SELECT id FROM institution_memberships WHERE institution_id = $1 AND user_id = $2',
        [institutionId, userId],
      );
      if (!(membership.rows[0] as { id?: string } | undefined)?.id) {
        await pool.query(
          `INSERT INTO institution_memberships
             (institution_id, user_id, role, department_id, course, semester)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            institutionId,
            userId,
            user.role,
            user.departmentCode ? departments[user.departmentCode] : null,
            user.course ?? null,
            user.semester ?? null,
          ],
        );
      }
    }

    console.log('Seed complete.');
    console.log('  Institution: example-college');
    console.log('  Users (password: %s):', DEV_PASSWORD);
    for (const user of USERS) {
      console.log(`    ${user.email} (${user.role})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
