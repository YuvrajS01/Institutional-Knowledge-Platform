import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import { seedIdentity, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

import { DocumentChunksRepository } from '../documents/document-chunks.repository.js';
import { HybridSearchService } from './hybrid-search.service.js';

let pool: Pool;
let identity: SeedIdentity;
let otherIdentity: SeedIdentity;
let chunksRepo: DocumentChunksRepository;
let hybrid: HybridSearchService;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

async function createDocWithChunks(
  institutionId: string,
  userId: string,
  title: string,
  chunkText: string,
  status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `hybrid-${suffix}-${randomUUID().slice(0, 4)}`;
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id',
    [institutionId, title, slug, userId, status],
  );
  const documentId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [documentId]);
  const storageKey = `test/${suffix}/original.pdf`;
  const version = await pool.query(
    `INSERT INTO document_versions
       (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by)
     VALUES ($1, 1, $2, 'application/pdf', 100, $3, $4, $5) RETURNING id`,
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
  hybrid = new HybridSearchService(pool, { embeddingProvider });
  identity = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });
  otherIdentity = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });
});

afterAll(async () => {
  await pool.end();
});

describe('HybridSearchService (P5-007) — integration', () => {
  it('ranks document matching both lexical and semantic highest', async () => {
    const query = 'Examination form deadline 18 August 2026';
    // Doc A: lexical match (title) but semantic dissimilar (chunk unrelated)
    const docALexicalOnly = await createDocWithChunks(
      identity.institutionId,
      identity.userId,
      'Examination Form Deadline Notice',
      'Hostel allotment circular for first year students. '.repeat(20),
    );
    // Doc B: semantic match (chunk similar to query) but lexical not (title random)
    const docBSemanticOnly = await createDocWithChunks(
      identity.institutionId,
      identity.userId,
      'Random Unrelated Title XYZ',
      `${query} `.repeat(20),
    );
    // Doc C: both lexical and semantic
    const docCBoth = await createDocWithChunks(
      identity.institutionId,
      identity.userId,
      'Examination Form Deadline Notice',
      `${query} `.repeat(20),
    );

    const results = await hybrid.search(identity.institutionId, query, { limit: 10 });

    const ids = results.map((r) => r.document_id);
    expect(ids).toContain(docALexicalOnly);
    expect(ids).toContain(docBSemanticOnly);
    expect(ids).toContain(docCBoth);

    const rank = (id: string) => ids.indexOf(id);
    // Both-match should be ahead of single-match
    expect(rank(docCBoth)).toBeLessThan(rank(docALexicalOnly));
    expect(rank(docCBoth)).toBeLessThan(rank(docBSemanticOnly));

    // Check scores
    const both = results.find((r) => r.document_id === docCBoth)!;
    expect(both.lexical_score).toBeGreaterThan(0);
    expect(both.semantic_score).toBeGreaterThan(0);
    expect(both.hybrid_score).toBeGreaterThan(0);
    expect(both.match_reasons).toEqual(expect.arrayContaining(['lexical', 'semantic']));
  });

  it('enforces tenant isolation', async () => {
    const query = 'Tenant hybrid isolation query unique 12345';
    await createDocWithChunks(otherIdentity.institutionId, otherIdentity.userId, 'Other Tenant Hybrid Doc', query.repeat(10));
    const results = await hybrid.search(identity.institutionId, query, { limit: 10 });
    for (const r of results) {
      expect(r.title).not.toBe('Other Tenant Hybrid Doc');
    }
  });

  it('filters PUBLISHED by default and respects DRAFT filter', async () => {
    const draftTitle = `Draft Hybrid ${randomUUID().slice(0, 4)}`;
    const draftText = 'Draft hybrid content should be hidden by default. '.repeat(20);
    const draftId = await createDocWithChunks(
      identity.institutionId,
      identity.userId,
      draftTitle,
      draftText,
      'DRAFT',
    );
    const query = draftText.slice(0, 30);
    const publishedResults = await hybrid.search(identity.institutionId, query, { limit: 10 });
    expect(publishedResults.find((r) => r.document_id === draftId)).toBeUndefined();

    const draftResults = await hybrid.search(identity.institutionId, query, {
      limit: 10,
      statuses: ['DRAFT'],
    });
    expect(draftResults.find((r) => r.document_id === draftId)).toBeDefined();
  });

  it('throws for empty query and invalid tenant', async () => {
    await expect(hybrid.search(identity.institutionId, '   ')).rejects.toThrow(/non-empty/);
    await expect(hybrid.search('not-a-uuid', 'test')).rejects.toThrow();
  });

  it('returns semantic-only when lexical has no match but vector does', async () => {
    const uniqueSemantic = `SemanticOnlyHybrid_${randomUUID().slice(0, 6)} unique content for hybrid`;
    const docId = await createDocWithChunks(
      identity.institutionId,
      identity.userId,
      'NoLexMatchTitle',
      uniqueSemantic.repeat(10),
    );
    // Query that is semantically similar but lexically not (title doesn't contain terms)
    const query = uniqueSemantic;
    const results = await hybrid.search(identity.institutionId, query, { limit: 5 });
    const found = results.find((r) => r.document_id === docId);
    expect(found).toBeDefined();
    expect(found!.semantic_score).toBeGreaterThan(0);
    expect(found!.match_reasons).toContain('semantic');
  });
});
