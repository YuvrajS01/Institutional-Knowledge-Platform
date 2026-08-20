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
import { RagAnswerService } from './rag-answer.service.js';

const TEST_AUTH = {
  secret: 'cross-tenant-rag-test-secret-0123456789-0123456789',
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
let rag: RagAnswerService;
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

let tenantA: { institutionId: string; users: SeedIdentity[] };
let tenantB: { institutionId: string; users: SeedIdentity[] };
let studentA: SeedIdentity;
let studentB: SeedIdentity;

let docAId: string;
let docAIdDuplicateTitle: string;

async function createDoc(
  institutionId: string,
  userId: string,
  title: string,
  content: string,
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `cross-rag-${suffix}-${randomUUID().slice(0, 4)}`;
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
    [institutionId, title, slug, userId, 'PUBLISHED'],
  );
  const documentId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [documentId]);
  const storageKey = `test/${suffix}/original.pdf`;
  const version = await pool.query(
    `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
    [documentId, storageKey, createHash('sha256').update(suffix).digest('hex'), content, userId],
  );
  const versionId = (version.rows[0] as { id: string }).id;
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

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);
  chunksRepo = new DocumentChunksRepository(pool);
  embeddingProvider = createMockEmbeddingProvider();
  rag = new RagAnswerService(pool);

  tenantA = await seedInstitutionWithUsers(pool, ['STUDENT']);
  tenantB = await seedInstitutionWithUsers(pool, ['STUDENT']);
  studentA = tenantA.users[0]!;
  studentB = tenantB.users[0]!;

  // Doc in tenant A with unique content
  const titleA = `Tenant A Secret ${randomUUID().slice(0, 4)}`;
  const contentA = 'Tenant A examination form deadline is 18 August 2026. '.repeat(10);
  docAId = await createDoc(tenantA.institutionId, studentA.userId, titleA, contentA);

  // Doc in tenant B with same title prefix but different content, to test isolation
  const contentB = 'Tenant B secret hostel fee deadline is 22 August 2026. '.repeat(10);
  docAIdDuplicateTitle = await createDoc(tenantB.institutionId, studentB.userId, titleA, contentB);

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: { max: 1000, timeWindow: '1 minute' },
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('Cross-tenant RAG (P8-013) — RagAnswerService', () => {
  it('student A cannot get citations from tenant B', async () => {
    const query = 'Tenant B secret hostel fee deadline';
    // Student A asks about B's content – should be unsupported or only A's citations
    const result = await rag.answer(
      { institutionId: tenantA.institutionId, userId: studentA.userId, role: 'STUDENT' },
      query,
      { limit: 5 },
    );

    for (const c of result.citations) {
      expect(c.document_id).not.toBe(docAIdDuplicateTitle);
      // If grounded, it should be A's doc, not B's
      if (result.grounded) {
        expect(c.document_id).toBe(docAId);
      }
    }
    // If no A's doc matches hostel query, should be unsupported
    if (result.citations.length === 0) {
      expect(result.grounded).toBe(false);
    }
  });

  it('student B cannot get citations from tenant A', async () => {
    const query = 'Tenant A examination form deadline';
    const result = await rag.answer(
      { institutionId: tenantB.institutionId, userId: studentB.userId, role: 'STUDENT' },
      query,
      { limit: 5 },
    );

    for (const c of result.citations) {
      expect(c.document_id).not.toBe(docAId);
    }
  });

  it('same query in different tenants returns tenant-scoped citations', async () => {
    const commonQuery = 'When is the examination form deadline?';
    // Ensure both tenants have a doc with that query as content (we already have for A, create for B)
    const contentCommon = 'When is the examination form deadline? Answer is 18 August 2026.';
    const titleCommon = 'Common Examination Notice';
    const docBCommon = await createDoc(
      tenantB.institutionId,
      studentB.userId,
      titleCommon,
      contentCommon,
    );
    // Also ensure A has same title
    const docACommon = await createDoc(
      tenantA.institutionId,
      studentA.userId,
      titleCommon,
      contentCommon,
    );

    const resultA = await rag.answer(
      { institutionId: tenantA.institutionId, userId: studentA.userId, role: 'STUDENT' },
      commonQuery,
      { limit: 5 },
    );
    const resultB = await rag.answer(
      { institutionId: tenantB.institutionId, userId: studentB.userId, role: 'STUDENT' },
      commonQuery,
      { limit: 5 },
    );

    expect(resultA.grounded).toBe(true);
    expect(resultB.grounded).toBe(true);
    // Each should cite its own tenant's doc, not the other's
    const aIds = resultA.citations.map((c) => c.document_id);
    const bIds = resultB.citations.map((c) => c.document_id);
    expect(aIds).toContain(docACommon);
    expect(aIds).not.toContain(docBCommon);
    expect(bIds).toContain(docBCommon);
    expect(bIds).not.toContain(docACommon);
  });
});

describe('Cross-tenant RAG (P8-013) — POST /ai/ask', () => {
  it('API enforces tenant isolation via X-Institution-Id', async () => {
    const tokenA = await login(studentA);
    const tokenB = await login(studentB);

    // Student A asks, but tries to use B's institution header – should be 403 (no membership)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: { authorization: `Bearer ${tokenA}`, 'x-institution-id': tenantB.institutionId },
      payload: { question: 'When is examination deadline?' },
    });
    expect(res.statusCode).toBe(403);

    // Correct header should succeed
    const resCorrect = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: { authorization: `Bearer ${tokenA}`, 'x-institution-id': tenantA.institutionId },
      payload: { question: 'When is examination deadline?' },
    });
    expect(resCorrect.statusCode).toBe(200);
    const body = resCorrect.json() as { data: { citations: Array<{ document_id: string }> } };
    for (const c of body.data.citations) {
      expect(c.document_id).not.toBe(docAIdDuplicateTitle);
    }

    // B's token with A's institution should also be 403
    const resBWrong = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: { authorization: `Bearer ${tokenB}`, 'x-institution-id': tenantA.institutionId },
      payload: { question: 'When is examination deadline?' },
    });
    expect(resBWrong.statusCode).toBe(403);
  });
});
