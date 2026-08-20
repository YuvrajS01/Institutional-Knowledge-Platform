import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

import { DocumentChunksRepository } from '../documents/document-chunks.repository.js';
import { PermissionAwareRetrievalService } from './permission-aware-retrieval.service.js';

let pool: Pool;
let student: SeedIdentity;
let approver: SeedIdentity;
let retrieval: PermissionAwareRetrievalService;
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

async function createDocWithChunks(
  institutionId: string,
  userId: string,
  title: string,
  chunkText: string,
  status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `perm-${suffix}-${randomUUID().slice(0, 4)}`;
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
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
  chunksRepo = new DocumentChunksRepository(pool);
  embeddingProvider = createMockEmbeddingProvider();
  retrieval = new PermissionAwareRetrievalService(pool);
  const realTenant = await seedInstitutionWithUsers(pool, ['STUDENT', 'APPROVER']);
  student = realTenant.users[0]!;
  approver = realTenant.users[1]!;
});

afterAll(async () => {
  await pool.end();
});

describe('PermissionAwareRetrievalService (P8-004)', () => {
  it('student retrieves PUBLISHED but not DRAFT', async () => {
    const institutionId = student.institutionId;
    const draftTitle = `Draft Perm ${randomUUID().slice(0, 4)}`;
    const publishedTitle = `Published Perm ${randomUUID().slice(0, 4)}`;
    const draftText = 'Draft content should not be retrieved. '.repeat(10);
    const publishedText = 'Published content for retrieval test. '.repeat(10);

    await createDocWithChunks(institutionId, student.userId, draftTitle, draftText, 'DRAFT');
    await createDocWithChunks(institutionId, approver.userId, publishedTitle, publishedText, 'PUBLISHED');

    const draftResults = await retrieval.retrieve(
      { institutionId, userId: student.userId, role: 'STUDENT' },
      'Published content for retrieval',
      { limit: 10 },
    );
    const draftTitles = draftResults.map((r) => r.title);
    expect(draftTitles).not.toContain(draftTitle);
    // Published may or may not be in top 10 depending on other docs, but at least it should not contain draft
    // For a more direct test, search for exact draft title via lexical
    const publishedResults = await retrieval.retrieve(
      { institutionId, userId: student.userId, role: 'STUDENT' },
      publishedTitle,
      { limit: 10 },
    );
    expect(publishedResults.map((r) => r.title)).toContain(publishedTitle);
  });

  it('enforces tenant isolation', async () => {
    const otherInst = await pool.query('INSERT INTO institutions (name, slug) VALUES ($1,$2) RETURNING id', [
      `Other ${randomUUID().slice(0, 4)}`,
      `other-${randomUUID().slice(0, 4)}`,
    ]);
    const otherInstitutionId = (otherInst.rows[0] as { id: string }).id;
    const otherUser = await pool.query("INSERT INTO users (email, name, status) VALUES ($1,'O','ACTIVE') RETURNING id", [
      `other-${randomUUID().slice(0, 6)}@example.edu`,
    ]);
    const otherUserId = (otherUser.rows[0] as { id: string }).id;
    await pool.query("INSERT INTO institution_memberships (institution_id, user_id, role) VALUES ($1,$2,'STUDENT')", [
      otherInstitutionId,
      otherUserId,
    ]);
    const otherTitle = `Other Tenant Retrieval ${randomUUID().slice(0, 4)}`;
    await createDocWithChunks(otherInstitutionId, otherUserId, otherTitle, 'Other tenant content. '.repeat(10), 'PUBLISHED');

    const results = await retrieval.retrieve(
      { institutionId: student.institutionId, userId: student.userId, role: 'STUDENT' },
      otherTitle,
      { limit: 10 },
    );
    expect(results.map((r) => r.title)).not.toContain(otherTitle);
  });

  it('throws for empty query and missing actor', async () => {
    await expect(
      retrieval.retrieve({ institutionId: student.institutionId, userId: student.userId, role: 'STUDENT' }, '   '),
    ).rejects.toThrow(/non-empty string/);
    await expect(
      retrieval.retrieve({ institutionId: '', userId: student.userId, role: 'STUDENT' } as unknown as { institutionId: string; userId: string; role: string }, 'test'),
    ).rejects.toThrow();
  });
});
