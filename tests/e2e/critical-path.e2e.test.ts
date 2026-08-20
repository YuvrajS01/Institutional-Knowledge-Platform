import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

import { buildApp } from '../../apps/api/src/app.js';
import { DocumentChunksRepository } from '../../apps/api/src/modules/documents/document-chunks.repository.js';
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
  secret: 'e2e-critical-path-secret-0123456789-0123456789-e2e',
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

let institutionId: string;
let otherInstitutionId: string;
let admin: SeedIdentity;
let student: SeedIdentity;
let otherStudent: SeedIdentity;
let adminToken: string;
let studentToken: string;
let documentId: string;
let documentTitle: string;
let supersededById: string;

async function login(identity: SeedIdentity): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: identity.userEmail, password: SEED_PASSWORD },
  });
  const body = res.json() as { data?: { access_token?: string } };
  if (!body.data?.access_token)
    throw new Error(`login failed for ${identity.userEmail}: ${res.body}`);
  return body.data.access_token;
}

function authHeaders(token: string, instId: string) {
  return { authorization: `Bearer ${token}`, 'x-institution-id': instId };
}

describe('E2E Critical Path (P9-001) — Admin publish → Student discover → RAG → Tenant isolation', () => {
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

    const otherTenant = await seedInstitutionWithUsers(pool, ['STUDENT']);
    otherInstitutionId = otherTenant.institutionId;
    otherStudent = otherTenant.users[0]!;

    app = await buildApp({
      logger: false,
      pool,
      auth: { pool, tokenConfig: TEST_AUTH },
      authRateLimit: { max: 1000, timeWindow: '1 minute' },
      storage: createS3ObjectStorage(STORAGE_CONFIG),
    });

    adminToken = await login(admin);
    studentToken = await login(student);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('1-2: Admin creates document and initiates upload (signed URL)', async () => {
    documentTitle = `E2E Critical Examination Notice ${randomUUID().slice(0, 4)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: authHeaders(adminToken, institutionId),
      payload: {
        title: documentTitle,
        document_type: 'NOTICE',
        mime_type: 'application/pdf',
        audience: { roles: ['STUDENT'] },
      },
    });
    expect(res.statusCode, `create failed: ${res.body}`).toBe(201);
    const body = res.json() as {
      data: { document: { id: string; slug: string }; upload: { upload_url: string } };
    };
    documentId = body.data.document.id;
    expect(documentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.data.upload.upload_url).toContain('http');
  });

  it('3-4: Admin completes upload and processing becomes searchable (mock extraction)', async () => {
    // Simulate upload-complete: create version and chunks directly (worker would do this)
    // In real flow, client PUTs to upload_url then POST /upload-complete triggers queue.
    // For E2E, we directly create version and embeddings as worker would.
    const storageKey = `test/e2e/${randomUUID().slice(0, 8)}/original.pdf`;
    const content =
      `${documentTitle} — When is the examination form deadline? Answer is 18 August 2026. `.repeat(
        5,
      );
    const version = await pool.query(
      `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
      [
        documentId,
        storageKey,
        createHash('sha256').update(storageKey).digest('hex'),
        content,
        admin.userId,
      ],
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

    // Verify chunks stored
    const check = await pool.query(
      'SELECT count(*) as c FROM document_chunks WHERE document_version_id = $1',
      [versionId],
    );
    expect(Number((check.rows[0] as { c: string }).c)).toBeGreaterThan(0);
  });

  it('5: Admin submits → approves → publishes', async () => {
    // Submit for review
    let res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/submit-review`,
      headers: authHeaders(adminToken, institutionId),
    });
    expect([200, 204].includes(res.statusCode)).toBe(true);

    // Approve (admin is approver)
    res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/approve`,
      headers: authHeaders(adminToken, institutionId),
    });
    expect([200, 204].includes(res.statusCode)).toBe(true);

    // Publish
    res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/publish`,
      headers: authHeaders(adminToken, institutionId),
    });
    expect([200, 204].includes(res.statusCode)).toBe(true);

    // Verify status is PUBLISHED via detail
    res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
      headers: authHeaders(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { status: string; is_current: boolean } };
    expect(body.data.status).toBe('PUBLISHED');
  });

  it('6: Student searches exact phrase and finds published doc', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(documentTitle)}`,
      headers: authHeaders(studentToken, institutionId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { results: Array<{ document_id: string; title: string }> } };
    const ids = body.data.results.map((r) => r.document_id);
    expect(ids).toContain(documentId);
  });

  it('7: Student searches vague natural-language and finds via hybrid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent('notice about exam form late fee')}`,
      headers: authHeaders(studentToken, institutionId),
    });
    expect(res.statusCode, `search vague failed: ${res.body}`).toBe(200);
    const body = res.json() as {
      data: { results: Array<{ document_id: string; match_reasons: string[] }> };
    };
    expect(
      body.data.results.length,
      `vague results: ${JSON.stringify(body.data.results).slice(0, 500)}`,
    ).toBeGreaterThan(0);
    // At least one should be our doc
    const found = body.data.results.some((r) => r.document_id === documentId);
    expect(found).toBe(true);
  });

  it('8: Student opens source document and sees current version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
      headers: authHeaders(studentToken, institutionId),
    });
    expect(res.statusCode, `GET doc failed: ${res.body}`).toBe(200);
    const body = res.json() as {
      data: { id: string; title: string; is_current: boolean; status: string };
    };
    expect(body.data.id).toBe(documentId);
    expect(body.data.is_current).toBe(true);
    expect(body.data.status).toBe('PUBLISHED');

    // Versions
    const vRes = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}/versions`,
      headers: authHeaders(studentToken, institutionId),
    });
    expect(vRes.statusCode).toBe(200);
    const vBody = vRes.json() as { data: Array<{ version_number: number; is_current: boolean }> };
    expect(vBody.data.length).toBeGreaterThanOrEqual(1);
    expect(vBody.data[0]!.is_current).toBe(true);
  });

  it('11-13: Admin updates document/version and student sees current version (supersession)', async () => {
    // Create new document that supersedes old
    const newTitle = `${documentTitle} v2`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: authHeaders(adminToken, institutionId),
      payload: { title: newTitle, document_type: 'NOTICE', mime_type: 'application/pdf' },
    });
    expect(createRes.statusCode, `create v2 failed: ${createRes.body}`).toBe(201);
    const newDocId = (createRes.json() as { data: { document: { id: string } } }).data.document.id;
    supersededById = newDocId;

    // Create version for new doc
    const storageKey = `test/e2e/${randomUUID().slice(0, 8)}/v2.pdf`;
    const contentV2 = `${newTitle} — Updated deadline is 18 August 2026. `.repeat(5);
    const version = await pool.query(
      `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by) VALUES ($1,1,$2,'application/pdf',100,$3,$4,$5) RETURNING id`,
      [
        newDocId,
        storageKey,
        createHash('sha256').update(storageKey).digest('hex'),
        contentV2,
        admin.userId,
      ],
    );
    const versionId = (version.rows[0] as { id: string }).id;
    await pool.query('UPDATE documents SET current_version_id = $2 WHERE id = $1', [
      newDocId,
      versionId,
    ]);
    const chunks = chunkDocument({ text: contentV2 });
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

    // Publish new doc via lifecycle
    await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${newDocId}/submit-review`,
      headers: authHeaders(adminToken, institutionId),
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${newDocId}/approve`,
      headers: authHeaders(adminToken, institutionId),
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${newDocId}/publish`,
      headers: authHeaders(adminToken, institutionId),
    });

    // Supersede old doc
    const supRes = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/supersede`,
      headers: authHeaders(adminToken, institutionId),
      payload: { superseded_by_document_id: newDocId, reason: 'Updated schedule' },
    });
    expect([200, 204].includes(supRes.statusCode), `supersede failed: ${supRes.body}`).toBe(true);

    // Student sees old doc as superseded
    const oldDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
      headers: authHeaders(studentToken, institutionId),
    });
    expect(oldDetail.statusCode).toBe(200);
    const oldBody = oldDetail.json() as {
      data: { is_current: boolean; status: string; superseded_by: string | null };
    };
    expect(oldBody.data.is_current).toBe(false);
    expect(oldBody.data.status).toBe('SUPERSEDED');

    // Student sees new doc as current
    const newDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${newDocId}`,
      headers: authHeaders(studentToken, institutionId),
    });
    expect(newDetail.statusCode).toBe(200);
    const newBody = newDetail.json() as { data: { is_current: boolean; status: string } };
    expect(newBody.data.is_current).toBe(true);
    expect(newBody.data.status).toBe('PUBLISHED');
  });

  it('14-15: Student asks grounded question and AI cites source', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: authHeaders(studentToken, institutionId),
      payload: { question: 'When is the examination form deadline?' },
    });
    expect(res.statusCode, `ask failed: ${res.body}`).toBe(200);
    const body = res.json() as {
      data: {
        grounded: boolean;
        answer: string;
        citations: Array<{
          document_id: string;
          document_title: string;
          version_id: string;
          page: number | null;
        }>;
      };
    };
    expect(body.data.grounded, `ask not grounded: ${JSON.stringify(body.data).slice(0, 500)}`).toBe(
      true,
    );
    expect(body.data.answer).toContain('18 August 2026');
    expect(body.data.citations.length).toBeGreaterThan(0);
    // After supersession, citation should be the current version (supersededById) or original if not yet superseded
    const citedIds = body.data.citations.map((c) => c.document_id);
    const expectedIds = [documentId, supersededById].filter(Boolean);
    expect(citedIds.some((id) => expectedIds.includes(id))).toBe(true);
    // Spec shape
    for (const c of body.data.citations) {
      expect(c.document_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(c.version_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(typeof c.document_title).toBe('string');
    }
  });

  it('15b: Unsupported question returns safe answer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: authHeaders(studentToken, institutionId),
      payload: {
        question: 'What is the unknown no-answer thing that does not exist in any document?',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { grounded: boolean; answer: string; citations: unknown[] };
    };
    expect(body.data.grounded).toBe(false);
    expect(body.data.answer).toBe(
      "I couldn't find an official institutional document confirming this.",
    );
    expect(body.data.citations).toHaveLength(0);
  });

  it('16-17: Student cannot retrieve restricted content and cross-institution is denied', async () => {
    // Create a draft in main institution – student should not see it
    const draftTitle = `Draft E2E ${randomUUID().slice(0, 4)}`;
    const draftDoc = await pool.query(
      'INSERT INTO documents (institution_id, title, slug, created_by, status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [institutionId, draftTitle, `draft-${randomUUID().slice(0, 4)}`, admin.userId, 'DRAFT'],
    );
    const draftId = (draftDoc.rows[0] as { id: string }).id;

    const draftGet = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${draftId}`,
      headers: authHeaders(studentToken, institutionId),
    });
    // Student should get 404 or 403 or not PUBLISHED – our API returns 404 for tenant isolation or hidden
    expect(
      [404, 403].includes(draftGet.statusCode) ||
        (draftGet.json() as { data?: { status?: string } }).data?.status !== 'PUBLISHED',
    ).toBe(true);

    // Search should not return draft
    const searchDraft = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(draftTitle)}`,
      headers: authHeaders(studentToken, institutionId),
    });
    expect(searchDraft.statusCode).toBe(200);
    const searchBody = searchDraft.json() as { data: { results: Array<{ document_id: string }> } };
    expect(searchBody.data.results.map((r) => r.document_id)).not.toContain(draftId);

    // Cross-institution: otherStudent cannot get main's published doc via direct id
    const otherToken = await login(otherStudent);
    const crossGet = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
      headers: authHeaders(otherToken, otherInstitutionId),
    });
    expect(
      [404, 403].includes(crossGet.statusCode),
      `crossGet should be 404/403 but got ${crossGet.statusCode}: ${crossGet.body}`,
    ).toBe(true);

    // Cross-institution search should not return main's doc
    const crossSearch = await app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(documentTitle)}`,
      headers: authHeaders(otherToken, otherInstitutionId),
    });
    expect(crossSearch.statusCode).toBe(200);
    const crossBody = crossSearch.json() as { data: { results: Array<{ document_id: string }> } };
    expect(crossBody.data.results.map((r) => r.document_id)).not.toContain(documentId);

    // Cross-institution RAG should not cite main's doc
    const crossRag = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: authHeaders(otherToken, otherInstitutionId),
      payload: { question: 'When is the examination form deadline?' },
    });
    expect(crossRag.statusCode).toBe(200);
    const crossRagBody = crossRag.json() as { data: { citations: Array<{ document_id: string }> } };
    expect(crossRagBody.data.citations.map((c) => c.document_id)).not.toContain(documentId);

    // X-Institution header mismatch should be 403
    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/ask',
      headers: { authorization: `Bearer ${studentToken}`, 'x-institution-id': otherInstitutionId },
      payload: { question: 'When is examination deadline?' },
    });
    expect(mismatch.statusCode).toBe(403);
  });
});
