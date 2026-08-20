import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

import { buildApp } from '../../../apps/api/src/app.js';
import { DocumentChunksRepository } from '../../../apps/api/src/modules/documents/document-chunks.repository.js';
import { registerPool, requireTestDatabaseUrl } from '../helpers/db.js';
import { SEED_PASSWORD, seedInstitutionWithUsers, type SeedIdentity } from '../helpers/seed.js';
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from '../../../apps/api/src/infrastructure/storage/s3-object-storage.js';

const TEST_AUTH = {
  secret: 'security-regression-secret-0123456789-0123456789',
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
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

let institutionA: string;
let institutionB: string;
let adminA: SeedIdentity;
let studentA: SeedIdentity;
let studentB: SeedIdentity;
let adminAToken: string;
let studentAToken: string;
let studentBToken: string;

let publishedDocA: string;
let draftDocA: string;
let supersededDocA: string;
let supersedingDocA: string;

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

async function createDocWithChunks(
  institutionId: string,
  userId: string,
  title: string,
  content: string,
  status: 'PUBLISHED' | 'DRAFT' | 'SUPERSEDED' = 'PUBLISHED',
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `sec-reg-${suffix}-${randomUUID().slice(0, 4)}`;
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
    [institutionId, title, slug, userId, status],
  );
  const documentId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [documentId]);
  const storageKey = `test/${suffix}/original.pdf`;
  const version = await pool.query(
    `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
    [documentId, storageKey, createHash('sha256').update(suffix).digest('hex'), content, userId],
  );
  const versionId = (version.rows[0] as { id: string }).id;
  await pool.query('UPDATE documents SET current_version_id = $2 WHERE id = $1', [
    documentId,
    versionId,
  ]);
  const chunks = chunkDocument({ text: content });
  const embeddings = await embeddingProvider.embed(
    chunks.map((c: { content: string }) => c.content),
  );
  const inputs = chunks.map(
    (
      c: { pageNumber: number | null; chunkIndex: number; content: string; tokenCount: number },
      i: number,
    ) => ({
      page_number: c.pageNumber,
      chunk_index: c.chunkIndex,
      content: c.content,
      token_count: c.tokenCount,
      embedding: embeddings[i]!,
      metadata: {},
    }),
  );
  await chunksRepo.createMany(versionId, inputs);
  return documentId;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  await ensureStorageBucket(STORAGE_CONFIG);
  chunksRepo = new DocumentChunksRepository(pool);
  embeddingProvider = createMockEmbeddingProvider();

  const tenantA = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN', 'STUDENT']);
  const tenantB = await seedInstitutionWithUsers(pool, ['INSTITUTION_ADMIN', 'STUDENT']);
  institutionA = tenantA.institutionId;
  institutionB = tenantB.institutionId;
  adminA = tenantA.users[0]!;
  studentA = tenantA.users[1]!;
  studentB = tenantB.users[1]!;

  app = await buildApp({
    logger: false,
    pool,
    auth: { pool, tokenConfig: TEST_AUTH },
    authRateLimit: { max: 1000, timeWindow: '1 minute' },
    storage: createS3ObjectStorage(STORAGE_CONFIG),
  });

  adminAToken = await login(adminA);
  studentAToken = await login(studentA);
  studentBToken = await login(studentB);

  // Seed docs for regression
  publishedDocA = await createDocWithChunks(
    institutionA,
    adminA.userId,
    `Security Published ${randomUUID().slice(0, 4)}`,
    'Published content for security regression. '.repeat(10),
    'PUBLISHED',
  );
  draftDocA = await createDocWithChunks(
    institutionA,
    adminA.userId,
    `Security Draft ${randomUUID().slice(0, 4)}`,
    'Draft content should be hidden from student. '.repeat(10),
    'DRAFT',
  );
  supersededDocA = await createDocWithChunks(
    institutionA,
    adminA.userId,
    `Security Superseded ${randomUUID().slice(0, 4)}`,
    'Superseded content. '.repeat(10),
    'SUPERSEDED',
  );
  supersedingDocA = await createDocWithChunks(
    institutionA,
    adminA.userId,
    `Security Superseding ${randomUUID().slice(0, 4)}`,
    'Superseding current content. '.repeat(10),
    'PUBLISHED',
  );
  // Link supersession
  await pool.query(
    'UPDATE documents SET superseded_by_document_id = $2, superseded_at = now() WHERE id = $1',
    [supersededDocA, supersedingDocA],
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('Security Regression (P9-002) — Tenant, RBAC, Visibility, RAG', () => {
  it('cross-tenant: student and admin cannot read other tenant published doc via direct id', async () => {
    for (const { token, label } of [
      { token: studentAToken, label: 'A-student' },
      { token: adminAToken, label: 'A-admin' },
    ]) {
      void label;
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocA}`,
        headers: headers(token, institutionB), // foreign tenant header – should be 403 (no membership)
      });
      expect(res.statusCode).toBe(403);
    }

    // Other tenant's student trying to get A's doc with B's header (should 404 because doc not in B)
    // First, test with correct header but foreign doc – should be 404 (not found in tenant)
    const resForeignId = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${publishedDocA}`,
      headers: headers(studentBToken, institutionB),
    });
    expect([404, 403].includes(resForeignId.statusCode)).toBe(true);

    // Also test via search – B should not see A's doc
    const search = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent('Security Published')}`,
      headers: headers(studentBToken, institutionB),
    });
    expect(search.statusCode).toBe(200);
    const body = search.json() as { data: { results: Array<{ document_id: string }> } };
    expect(body.data.results.map((r) => r.document_id)).not.toContain(publishedDocA);
  });

  it('RBAC: student cannot approve or publish, admin can', async () => {
    // Create a draft via API for RBAC check
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: headers(adminAToken, institutionA),
      payload: {
        title: `RBAC Draft ${randomUUID().slice(0, 4)}`,
        document_type: 'NOTICE',
        mime_type: 'application/pdf',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const docId = (createRes.json() as { data: { document: { id: string } } }).data.document.id;
    // Create a version so submit-review can succeed (requires content)
    {
      const storageKey = `test/sec-reg/${randomUUID().slice(0, 8)}/original.pdf`;
      const content = 'RBAC test content for security regression. '.repeat(10);
      const version = await pool.query(
        `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
        [docId, storageKey, createHash('sha256').update(storageKey).digest('hex'), content, adminA.userId],
      );
      const versionId = (version.rows[0] as { id: string }).id;
      await pool.query('UPDATE documents SET current_version_id = $2 WHERE id = $1', [docId, versionId]);
    }
    const submitRes = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/submit-review`,
      headers: headers(adminAToken, institutionA),
    });
    expect([200, 204].includes(submitRes.statusCode), `submit-review failed: ${submitRes.body}`).toBe(true);

    const studentApprove = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/approve`,
      headers: headers(studentAToken, institutionA),
    });
    expect([403, 404].includes(studentApprove.statusCode)).toBe(true);

    const adminApprove = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/approve`,
      headers: headers(adminAToken, institutionA),
    });
    expect([200, 204].includes(adminApprove.statusCode), `adminApprove failed: ${adminApprove.body}`).toBe(true);

    const studentPublish = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/publish`,
      headers: headers(studentAToken, institutionA),
    });
    expect([403, 404].includes(studentPublish.statusCode)).toBe(true);

    const adminPublish = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/publish`,
      headers: headers(adminAToken, institutionA),
    });
    expect([200, 204].includes(adminPublish.statusCode)).toBe(true);
  });

  it('visibility: student cannot see drafts via direct, list, or search', async () => {
    const direct = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${draftDocA}`,
      headers: headers(studentAToken, institutionA),
    });
    expect(
      [404, 403].includes(direct.statusCode) ||
        (direct.json() as { data?: { status?: string } }).data?.status !== 'DRAFT',
    ).toBe(true);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/documents?status=DRAFT',
      headers: headers(studentAToken, institutionA),
    });
    // Student trying to list DRAFT should be 403
    expect([403, 422].includes(list.statusCode)).toBe(true);

    const search = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent('Security Draft')}`,
      headers: headers(studentAToken, institutionA),
    });
    expect(search.statusCode).toBe(200);
    const body = search.json() as { data: { results: Array<{ document_id: string }> } };
    expect(body.data.results.map((r) => r.document_id)).not.toContain(draftDocA);
  });

  it('visibility: superseded not returned as PUBLISHED to student via search and RAG', async () => {
    const search = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent('Security Superseded')}`,
      headers: headers(studentAToken, institutionA),
    });
    expect(search.statusCode).toBe(200);
    const body = search.json() as { data: { results: Array<{ document_id: string }> } };
    // Superseded doc should not be in PUBLISHED results for student
    expect(body.data.results.map((r) => r.document_id)).not.toContain(supersededDocA);

    // RAG should not cite superseded
    const rag = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentAToken, institutionA),
      payload: { question: 'Security Superseded content' },
    });
    expect(rag.statusCode).toBe(200);
    const ragBody = rag.json() as { data: { citations: Array<{ document_id: string }> } };
    expect(ragBody.data.citations.map((c) => c.document_id)).not.toContain(supersededDocA);
  });

  it('RAG: tenant isolation – B cannot get A citations via ask', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentBToken, institutionB),
      payload: { question: 'Published content for security regression' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { citations: Array<{ document_id: string }> } };
    expect(body.data.citations.map((c) => c.document_id)).not.toContain(publishedDocA);
  });

  it('RAG: student only sees PUBLISHED citations, not drafts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: headers(studentAToken, institutionA),
      payload: { question: 'Draft content should be hidden from student' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { citations: Array<{ document_id: string }> } };
    expect(body.data.citations.map((c) => c.document_id)).not.toContain(draftDocA);
  });

  it('auth: missing or foreign X-Institution-Id is rejected with 400/403 and no leakage', async () => {
    const noHeader = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=test',
      headers: { authorization: `Bearer ${studentAToken}` },
    });
    expect([400, 401].includes(noHeader.statusCode)).toBe(true);

    const foreign = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=test',
      headers: headers(studentAToken, institutionB),
    });
    expect(foreign.statusCode).toBe(403);
    expect(JSON.stringify(foreign.json())).not.toContain(institutionA);
  });
});
