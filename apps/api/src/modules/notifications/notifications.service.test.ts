import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import {
  seedInstitutionWithUsers,
  type SeedIdentity,
} from '../../../../../tests/integration/helpers/seed.js';

import { NotificationsService } from './notifications.service.js';

let pool: Pool;
let service: NotificationsService;
let institutionId: string;
let user: SeedIdentity;

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  service = new NotificationsService(pool);
  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT']);
  institutionId = tenant.institutionId;
  user = tenant.users[0]!;
});

afterAll(async () => {
  await pool.end();
});

describe('NotificationsService (P7-002)', () => {
  it('creates and lists notifications', async () => {
    const created = await service.notify({
      institutionId,
      userId: user.userId,
      title: 'New notice',
      body: 'Examination form deadline is 18 Aug',
      entityType: 'document',
      entityId: '00000000-0000-4000-a000-000000000001',
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.title).toBe('New notice');

    const list = await service.list(institutionId, user.userId);
    expect(list.some((n) => n.id === created.id)).toBe(true);
  });

  it('counts unread and marks as read', async () => {
    const n1 = await service.notify({
      institutionId,
      userId: user.userId,
      title: 'Unread 1',
      body: 'Body 1',
    });
    const n2 = await service.notify({
      institutionId,
      userId: user.userId,
      title: 'Unread 2',
      body: 'Body 2',
    });

    const unreadBefore = await service.countUnread(institutionId, user.userId);
    expect(unreadBefore).toBeGreaterThanOrEqual(2);

    await service.markAsRead(institutionId, user.userId, n1.id);
    const unreadAfterOne = await service.countUnread(institutionId, user.userId);
    expect(unreadAfterOne).toBe(unreadBefore - 1);

    await service.markAllAsRead(institutionId, user.userId);
    const unreadAfterAll = await service.countUnread(institutionId, user.userId);
    expect(unreadAfterAll).toBe(0);

    // Ensure n2 is now read
    const list = await service.list(institutionId, user.userId);
    const found = list.find((n) => n.id === n2.id);
    expect(found?.read_at).not.toBeNull();
  });

  it('enforces tenant isolation', async () => {
    const otherTenant = await seedInstitutionWithUsers(pool, ['STUDENT']);
    const otherUser = otherTenant.users[0]!;
    const otherInstitutionId = otherTenant.institutionId;

    const n = await service.notify({
      institutionId: otherInstitutionId,
      userId: otherUser.userId,
      title: 'Other tenant',
      body: 'Should not be visible',
    });

    const listA = await service.list(institutionId, user.userId);
    expect(listA.some((x) => x.id === n.id)).toBe(false);

    const listB = await service.list(otherInstitutionId, otherUser.userId);
    expect(listB.some((x) => x.id === n.id)).toBe(true);
  });
});
