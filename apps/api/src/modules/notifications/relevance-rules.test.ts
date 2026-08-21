import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import { seedInstitutionWithUsers } from '../../../../../tests/integration/helpers/seed.js';

import { RelevanceRules } from './relevance-rules.js';

let pool: Pool;
let institutionId: string;
let rules: RelevanceRules;

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  rules = new RelevanceRules(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('RelevanceRules (P7-005)', () => {
  it('returns all members when audience is null', async () => {
    const recipients = await rules.resolveRecipients({
      institutionId,
      documentId: '00000000-0000-4000-a000-000000000001',
      audience: null,
    });
    expect(recipients.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by role', async () => {
    const recipients = await rules.resolveRecipients({
      institutionId,
      documentId: '00000000-0000-4000-a000-000000000001',
      audience: { roles: ['STUDENT'] },
    });
    expect(recipients.every((r) => r.role === 'STUDENT')).toBe(true);
    expect(recipients.length).toBeGreaterThanOrEqual(1);
  });

  it('isRelevant correctly evaluates membership', () => {
    const member = {
      userId: 'u1',
      email: 'a@b.com',
      role: 'STUDENT',
      departmentId: 'dept1',
      course: 'BTECH',
      semester: 3,
    };
    expect(rules.isRelevant(member, { institutionId, documentId: 'd1', audience: null })).toBe(
      true,
    );
    expect(
      rules.isRelevant(member, {
        institutionId,
        documentId: 'd1',
        audience: { roles: ['STUDENT'] },
      }),
    ).toBe(true);
    expect(
      rules.isRelevant(member, {
        institutionId,
        documentId: 'd1',
        audience: { roles: ['INSTITUTION_ADMIN'] },
      }),
    ).toBe(false);
    expect(
      rules.isRelevant(member, {
        institutionId,
        documentId: 'd1',
        audience: { courses: ['BTECH'] },
      }),
    ).toBe(true);
    expect(
      rules.isRelevant(member, { institutionId, documentId: 'd1', audience: { semesters: [3] } }),
    ).toBe(true);
    expect(
      rules.isRelevant(member, { institutionId, documentId: 'd1', departmentId: 'dept1' }),
    ).toBe(true);
    expect(
      rules.isRelevant(member, { institutionId, documentId: 'd1', departmentId: 'other' }),
    ).toBe(false);
  });
});
