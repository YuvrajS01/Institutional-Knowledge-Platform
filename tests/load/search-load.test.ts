import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import { registerPool, requireTestDatabaseUrl } from '../integration/helpers/db.js';
import {
  SEED_PASSWORD,
  seedInstitutionWithUsers,
  type SeedIdentity,
} from '../integration/helpers/seed.js';
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from '../../apps/api/src/infrastructure/storage/s3-object-storage.js';

const TEST_AUTH = {
  secret: 'load-test-secret-0123456789-0123456789-load',
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
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('Load test: search (P9-003)', () => {
  it('handles 30 concurrent searches within acceptable latency', async () => {
    const concurrency = 30;
    const query = 'examination';

    const start = Date.now();
    const promises = Array.from({ length: concurrency }, () =>
      app.inject({
        method: 'GET',
        url: `/api/v1/search?q=${encodeURIComponent(query)}`,
        headers: headers(studentToken, institutionId),
      }),
    );

    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    for (const res of results) {
      expect([200, 422, 429].includes(res.statusCode)).toBe(true);
    }

    const avgLatency = duration / concurrency;
    // For mock embeddings and pgvector, avg should be < 200ms even under concurrency
    expect(avgLatency).toBeLessThan(500);
    expect(duration).toBeLessThan(10_000);

    console.log(
      `Search load: ${concurrency} concurrent in ${duration}ms (avg ${avgLatency.toFixed(1)}ms)`,
    );
  }, 30_000);

  it('handles 20 concurrent searches with filters', async () => {
    const concurrency = 20;
    const start = Date.now();
    const promises = Array.from({ length: concurrency }, (_, i) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/search?q=test&document_type=${i % 2 === 0 ? 'NOTICE' : 'CIRCULAR'}`,
        headers: headers(studentToken, institutionId),
      }),
    );

    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    for (const res of results) {
      // 429 is acceptable under load (rate limited to 60/min), but should not be 500
      expect([200, 429].includes(res.statusCode)).toBe(true);
      if (res.statusCode === 200) {
        expect(res.json().data).toBeDefined();
      }
    }

    expect(duration).toBeLessThan(5000);
    console.log(`Filtered search load: ${concurrency} in ${duration}ms`);
  }, 30_000);
});
