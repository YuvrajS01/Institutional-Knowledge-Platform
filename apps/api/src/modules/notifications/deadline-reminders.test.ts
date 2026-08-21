import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import { seedInstitutionWithUsers } from '../../../../../tests/integration/helpers/seed.js';

import { DeadlineReminders } from './deadline-reminders.js';
import { NotificationsService } from './notifications.service.js';

let pool: Pool;
let institutionId: string;
let adminId: string;
let studentId: string;

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  const tenant = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN', 'STUDENT']);
  institutionId = tenant.institutionId;
  adminId = tenant.users[0]!.userId;
  studentId = tenant.users[1]!.userId;
});

afterAll(async () => {
  await pool.end();
});

describe('DeadlineReminders (P7-006)', () => {
  it('creates reminders for upcoming dates', async () => {
    // Create a document with an upcoming extracted date (2 days from now)
    const future = new Date();
    future.setDate(future.getDate() + 2);
    const isoDate = future.toISOString().slice(0, 10);

    const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
    const doc = await pool.query(
      'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
      [institutionId, `Deadline Doc ${suffix}`, `deadline-${suffix}`, adminId, 'PUBLISHED'],
    );
    const docId = (doc.rows[0] as { id: string }).id;
    await pool.query(
      'INSERT INTO document_metadata (document_id, extracted_dates, audience) VALUES ($1,$2,$3)',
      [
        docId,
        JSON.stringify([
          {
            raw: `Deadline ${isoDate}`,
            isoDate,
            label: 'Examination Form Deadline',
            type: 'DEADLINE',
            context: 'Submit by deadline',
            confidence: 0.9,
          },
        ]),
        JSON.stringify({ roles: ['STUDENT'] }),
      ],
    );
    const version = await pool.query(
      `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
      [
        docId,
        `test/${suffix}/original.pdf`,
        createHash('sha256').update(suffix).digest('hex'),
        `Deadline ${isoDate}`,
        adminId,
      ],
    );
    const versionId = (version.rows[0] as { id: string }).id;
    await pool.query('UPDATE documents SET current_version_id = $2 WHERE id = $1', [
      docId,
      versionId,
    ]);

    const service = new DeadlineReminders(pool);
    const result = await service.runForInstitution(institutionId, { daysAhead: 3 });

    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.notified).toBeGreaterThanOrEqual(1);

    // Verify notifications were created
    const notifications = new NotificationsService(pool);
    const list = await notifications.list(institutionId, studentId);
    expect(
      list.some(
        (n) =>
          n.title.includes('Examination Form Deadline') ||
          n.body.includes('Examination Form Deadline'),
      ),
    ).toBe(true);
    expect(list.some((n) => n.entity_id === docId)).toBe(true);

    // Second run should be deduplicated (skip)
    const result2 = await service.runForInstitution(institutionId, { daysAhead: 3 });
    // At least one skipped due to today's duplicate
    expect(result2.skipped).toBeGreaterThanOrEqual(1);
  });

  it('does not notify for past dates', async () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const isoDate = past.toISOString().slice(0, 10);

    const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
    const doc = await pool.query(
      'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
      [institutionId, `Past Doc ${suffix}`, `past-${suffix}`, adminId, 'PUBLISHED'],
    );
    const docId = (doc.rows[0] as { id: string }).id;
    await pool.query(
      'INSERT INTO document_metadata (document_id, extracted_dates) VALUES ($1,$2)',
      [
        docId,
        JSON.stringify([
          {
            raw: `Past ${isoDate}`,
            isoDate,
            label: 'Old Deadline',
            type: 'DEADLINE',
            confidence: 0.9,
          },
        ]),
      ],
    );

    const service = new DeadlineReminders(pool);
    const result = await service.runForInstitution(institutionId, { daysAhead: 3 });

    // Past dates should not be counted as checked (filtered by from/to)
    // But there may be other upcoming dates from previous test, so we check that past doc did not create new notification
    const notifications = new NotificationsService(pool);
    const list = await notifications.list(institutionId, studentId);
    expect(list.some((n) => n.entity_id === docId)).toBe(false);
    void result;
  });
});
