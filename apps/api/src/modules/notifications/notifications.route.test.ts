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
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from '../../infrastructure/storage/s3-object-storage.js';

import { NotificationsService } from './notifications.service.js';

const TEST_AUTH = {
  secret: 'notifications-route-test-secret-0123456789-0123456789-notif',
  accessTtlMinutes: 15,
  refreshTtlDays: 30,
};

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
let studentToken: string;
let service: NotificationsService;

async function login(identity: SeedIdentity): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: identity.userEmail, password: SEED_PASSWORD },
  });
  const body = res.json() as { data?: { access_token?: string } };
  if (!body.data?.access_token) throw new Error(`login failed for ${identity.userEmail}`);
  return body.data.access_token;
}

function headers(token: string, instId: string) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': instId };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT']);
  institutionId = tenant.institutionId;
  student = tenant.users[0]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: { max: 1000, timeWindow: '1 minute' },
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  studentToken = await login(student);
  service = new NotificationsService(pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('Notifications API (P7-003)', () => {
  it('lists notifications and supports mark read', async () => {
    const created = await service.notify({
      institutionId,
      userId: student.userId,
      title: 'Test Notification',
      body: 'You have a new notice',
      entityType: 'document',
      entityId: '00000000-0000-4000-a000-000000000001',
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: headers(studentToken, institutionId),
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json() as {
      data: Array<{ id: string }>;
      meta: { unread_count: number };
    };
    expect(listBody.data.some((n) => n.id === created.id)).toBe(true);
    expect(listBody.meta.unread_count).toBeGreaterThanOrEqual(1);

    const readRes = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${created.id}/read`,
      headers: headers(studentToken, institutionId),
    });
    expect(readRes.statusCode).toBe(204);

    const listAfter = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?unreadOnly=true',
      headers: headers(studentToken, institutionId),
    });
    expect(listAfter.statusCode).toBe(200);
    const afterBody = listAfter.json() as { data: Array<{ id: string }> };
    expect(afterBody.data.some((n) => n.id === created.id)).toBe(false);
  });

  it('marks all as read', async () => {
    await service.notify({ institutionId, userId: student.userId, title: 'N1', body: 'B1' });
    await service.notify({ institutionId, userId: student.userId, title: 'N2', body: 'B2' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      headers: headers(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { updated: number } };
    expect(body.data.updated).toBeGreaterThanOrEqual(2);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?unreadOnly=true',
      headers: headers(studentToken, institutionId),
    });
    const listBody = list.json() as { data: unknown[] };
    expect(listBody.data).toHaveLength(0);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
    });
    expect(res.statusCode).toBe(401);
  });
});
