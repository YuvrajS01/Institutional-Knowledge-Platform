import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

import { buildApp } from '../../app.js';
import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '../../infrastructure/storage/s3-object-storage.js';

import { DocumentChunksRepository } from './document-chunks.repository.js';

const TEST_AUTH = {
  secret: 'related-test-secret-0123456789-0123456789-related',
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
let admin: SeedIdentity;
let studentToken: string;
let docAId: string;
let docBId: string;
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

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

function headers(token: string) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': institutionId };
}

async function createDocWithTitle(title: string): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `related-${suffix}-${randomUUID().slice(0, 4)}`;
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
    [institutionId, title, slug, admin.userId, 'PUBLISHED'],
  );
  const documentId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [documentId]);
  const storageKey = `test/${suffix}/original.pdf`;
  const content = `${title} — related content for ${title}. `.repeat(5);
  const version = await pool.query(
    `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
    [documentId, storageKey, createHash('sha256').update(suffix).digest('hex'), content, admin.userId],
  );
  const versionId = (version.rows[0] as { id: string }).id;
  await pool.query('UPDATE documents SET current_version_id = $2 WHERE id = $1', [documentId, versionId]);
  const chunks = chunkDocument({ text: content });
  const embeddings = await embeddingProvider.embed(chunks.map((c) => c.content));
  const inputs = chunks.map((c, i) => ({
    page_number: c.pageNumber,
    chunk_index: c.chunkIndex,
    content: c.content,
    token_count: c.tokenCount,
    embedding: embeddings[i]!,
    metadata: {},
  }));
  await chunksRepo.createMany(versionId, inputs);
  return documentId;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);
  chunksRepo = new DocumentChunksRepository(pool);
  embeddingProvider = createMockEmbeddingProvider();

  const tenant = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN', 'STUDENT']);
  institutionId = tenant.institutionId;
  admin = tenant.users[0]!;
  student = tenant.users[1]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: { max: 1000, timeWindow: '1 minute' },
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  studentToken = await login(student);

  docAId = await createDocWithTitle('Examination Form Notice');
  docBId = await createDocWithTitle('Examination Form Deadline Notice');
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /api/v1/documents/:id/related (P6-006)', () => {
  it('returns related documents for a valid id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docAId}/related?limit=5`,
      headers: headers(studentToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ document_id: string; title: string }> };
    expect(Array.isArray(body.data)).toBe(true);
    // Should not include the source doc itself
    expect(body.data.map((d) => d.document_id)).not.toContain(docAId);
    // Should include the other doc with similar title
    expect(body.data.some((d) => d.document_id === docBId)).toBe(true);
  });

  it('returns empty for non-existent document (still 200 with empty array)', async () => {
    const fakeId = randomUUID();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${fakeId}/related`,
      headers: headers(studentToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docAId}/related`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates document_id as uuid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/not-a-uuid/related`,
      headers: headers(studentToken),
    });
    expect(res.statusCode).toBe(422);
  });
});
