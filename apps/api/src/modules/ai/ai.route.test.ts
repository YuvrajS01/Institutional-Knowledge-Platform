import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

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

import { DocumentChunksRepository } from '../documents/document-chunks.repository.js';

const TEST_AUTH = {
  secret: 'ai-route-test-secret-0123456789-0123456789-ai',
  accessTtlMinutes: 15,
  refreshTtlDays: 30,
};

const TEST_RATE_LIMIT = { max: 1000, timeWindow: '1 minute' };

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
let student: SeedIdentity;
let admin: SeedIdentity;
let institutionId: string;
let studentToken: string;
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

async function createDocWithChunks(
  title: string,
  chunkText: string,
  status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `ai-${suffix}-${randomUUID().slice(0, 4)}`;
  const userId = admin.userId;
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id',
    [institutionId, title, slug, userId, status],
  );
  const documentId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [documentId]);
  const storageKey = `test/${suffix}/original.pdf`;
  const version = await pool.query(
    `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
    [documentId, storageKey, createHash('sha256').update(suffix).digest('hex'), chunkText, userId],
  );
  const versionId = (version.rows[0] as { id: string }).id;
  const chunks = chunkDocument({ text: chunkText });
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
  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'INSTITUTION_ADMIN']);
  institutionId = tenant.institutionId;
  student = tenant.users[0]!;
  admin = tenant.users[1]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: TEST_RATE_LIMIT,
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  studentToken = await login(student);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('POST /api/v1/ai/ask (P8-009)', () => {
  it('returns grounded answer with citations for known question', async () => {
    const title = 'Examination Form Submission Notice';
    const query = 'When is the examination form deadline?';
    const docId = await createDocWithChunks(title, query);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentToken),
      payload: { question: query },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        answer: string;
        grounded: boolean;
        confidence: string;
        citations: Array<Record<string, unknown>>;
      };
    };
    expect(body.data.grounded).toBe(true);
    expect(body.data.confidence).toBe('high');
    expect(body.data.answer).toContain('18 August 2026');
    expect(body.data.citations.length).toBeGreaterThan(0);
    const c = body.data.citations[0] as Record<string, unknown>;
    expect(c.document_id).toBe(docId);
    expect(c.document_title).toBe(title);
    expect(c.version_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(c.page === null || typeof c.page === 'number').toBe(true);
    // API spec: only document_id, document_title, version_id, page
    expect(Object.keys(c).sort()).toEqual(
      ['document_id', 'document_title', 'page', 'version_id'].sort(),
    );
  });

  it('returns unsupported answer when no documents match', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentToken),
      payload: { question: 'What is the unknown no-answer thing that does not exist?' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { answer: string; grounded: boolean; confidence: string; citations: unknown[] };
    };
    expect(body.data.grounded).toBe(false);
    expect(body.data.confidence).toBe('low');
    expect(body.data.answer).toBe(
      "I couldn't find an official institutional document confirming this.",
    );
    expect(body.data.citations).toHaveLength(0);
  });

  it('validates missing question', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentToken),
      payload: {},
    });
    expect(res.statusCode).toBe(422);
  });

  it('validates empty question', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentToken),
      payload: { question: '   ' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      payload: { question: 'test' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('enforces tenant isolation', async () => {
    const other = await seedInstitutionWithUsers(pool, ['STUDENT']);
    const otherIdentity = other.users[0]!;
    const otherTitle = `Other Tenant AI ${randomUUID().slice(0, 4)}`;
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
    const slug = `other-ai-${suffix}`;
    const otherDoc = await pool.query(
      'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
      [other.institutionId, otherTitle, slug, otherIdentity.userId, 'PUBLISHED'],
    );
    const otherDocId = (otherDoc.rows[0] as { id: string }).id;
    await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [otherDocId]);
    const storageKey = `test/${suffix}/original.pdf`;
    const text = 'Other tenant secret for AI isolation. '.repeat(10);
    const version = await pool.query(
      `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
      [
        otherDocId,
        storageKey,
        createHash('sha256').update(suffix).digest('hex'),
        text,
        otherIdentity.userId,
      ],
    );
    const versionId = (version.rows[0] as { id: string }).id;
    const chunks = chunkDocument({ text });
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

    // Student from original tenant asks about other tenant's content
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentToken),
      payload: { question: otherTitle },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { citations: Array<Record<string, unknown>> } };
    for (const c of body.data.citations) {
      expect(c.document_title).not.toBe(otherTitle);
    }
  });

  it('does not return drafts to students', async () => {
    const draftTitle = `Draft AI ${randomUUID().slice(0, 4)}`;
    await createDocWithChunks(
      draftTitle,
      'Draft content for AI should be hidden. '.repeat(10),
      'DRAFT',
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentToken),
      payload: { question: draftTitle },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { citations: Array<Record<string, unknown>>; grounded: boolean };
    };
    // Should be unsupported or not contain draft title
    for (const c of body.data.citations) {
      expect(c.document_title).not.toBe(draftTitle);
    }
    if (body.data.citations.length === 0) {
      expect(body.data.grounded).toBe(false);
    }
  });
});
