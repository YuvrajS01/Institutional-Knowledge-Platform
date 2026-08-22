/**
 * Mock search evaluation — deterministic, no network (P5-014 + P0-C04).
 *
 * Uses MockEmbeddingProvider (SHA-256 hash vectors) so CI is deterministic.
 * Thresholds here are mock-only (Recall@5 ≥0.4). Production thresholds
 * require tests/evals/search-evaluation.real.test.ts with EVAL_REAL=1 and
 * a real BGE-M3 provider (see tests/evals/README.md). Do not claim production
 * quality from this file's scores.
 */

import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

import { HybridSearchService } from '../../apps/api/src/modules/search/hybrid-search.service.js';
import { DocumentChunksRepository } from '../../apps/api/src/modules/documents/document-chunks.repository.js';
import { registerPool, requireTestDatabaseUrl } from '../integration/helpers/db.js';
import { seedIdentity, type SeedIdentity } from '../integration/helpers/seed.js';

import dataset from './search-evaluation.dataset.json' with { type: 'json' };
import { evaluateSearch, formatMetrics } from './search-evaluation.runner.js';

let pool: Pool;
let identity: SeedIdentity;
let hybrid: HybridSearchService;
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

async function createDocumentForEvaluation(
  institutionId: string,
  userId: string,
  title: string,
  chunkText: string,
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `eval-${suffix}-${randomUUID().slice(0, 4)}`;
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
    [institutionId, title, slug, userId, 'PUBLISHED'],
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
  const embeddings = await embeddingProvider.embed(chunks.map((c: { content: string }) => c.content));
  const inputs = chunks.map((c: { pageNumber: number | null; chunkIndex: number; content: string; tokenCount: number }, i: number) => ({
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

  // Seed documents for each dataset case that has expected_titles
  const titlesToCreate = new Map<string, string>();
  for (const testCase of dataset as unknown as Array<{
    expected_titles: string[];
    query: string;
    query_type: string;
  }>) {
    for (const title of testCase.expected_titles) {
      if (!titlesToCreate.has(title)) {
        // For version-conflict, create two versions? For now, just create one doc with that title
        // Chunk text is the query itself for semantic match, or title for exact
        const chunkText = testCase.query_type === 'exact_title' ? title : testCase.query;
        // For multilingual/hinglish, use the query as chunk
        titlesToCreate.set(title, chunkText);
      }
    }
  }

  // Create unique titles
  for (const [title, chunkText] of titlesToCreate.entries()) {
    await createDocumentForEvaluation(identity.institutionId, identity.userId, title, chunkText);
  }

  // Additional explicit docs for better coverage
  await createDocumentForEvaluation(
    identity.institutionId,
    identity.userId,
    'CSE Department Notice',
    'CSE notice about lab schedule. '.repeat(20),
  );
});

afterAll(async () => {
  await pool.end();
});

describe('Search Evaluation (P5-014)', () => {
  it('evaluates hybrid search and meets quality thresholds', async () => {
    const metrics = await evaluateSearch(
      dataset as unknown as Parameters<typeof evaluateSearch>[0],
      async (query: string) => {
        const results = await hybrid.search(identity.institutionId, query, { limit: 10 });
        return results.map((r) => ({ document_id: r.document_id, title: r.title }));
      },
    );

    // Log metrics for CI visibility
    console.log('\n' + formatMetrics(metrics));

    // Thresholds for mock embeddings (deterministic, not true semantic, but should still have some recall)
    // With exact-title and similar queries, mock should achieve at least 0.5 recall@5
    expect(metrics.recall_at_5).toBeGreaterThanOrEqual(0.4);
    expect(metrics.mrr).toBeGreaterThanOrEqual(0.3);
    // Zero-result rate should be reasonable (no-answer cases are 2/12 = 16% expected, plus some misses)
    expect(metrics.zero_result_rate).toBeLessThanOrEqual(0.5);
  });

  it('per-case metrics are computed', async () => {
    const singleCase = [
      {
        id: 'test-single',
        query: 'Holiday Schedule',
        query_type: 'exact_title',
        expected_titles: ['Holiday Schedule'],
        language: 'en',
        difficulty: 'easy',
        department: null,
      },
    ];
    // Seed the exact doc if not already
    await createDocumentForEvaluation(identity.institutionId, identity.userId, 'Holiday Schedule', 'Holiday Schedule');

    const metrics = await evaluateSearch(singleCase, async (q) => {
      const res = await hybrid.search(identity.institutionId, q, { limit: 5 });
      return res.map((r) => ({ document_id: r.document_id, title: r.title }));
    });
    expect(metrics.per_case[0]!.recall_at_5).toBe(1);
    expect(metrics.per_case[0]!.reciprocal_rank).toBe(1);
  });
});
