/**
 * Real-provider search evaluation — gated behind EVAL_REAL=1.
 *
 * Uses a real EmbeddingProvider (LocalEmbeddingProvider via
 * EMBEDDING_PROVIDER=local / EMBEDDING_BASE_URL / EMBEDDING_MODEL)
 * instead of MockEmbeddingProvider. Skipped by default so CI remains
 * deterministic (mock evals in search-evaluation.test.ts).
 *
 * Run: EVAL_REAL=1 DATABASE_URL=postgresql://...:5434/... pnpm test -- tests/evals/search-evaluation.real.test.ts
 * Requires: Ollama `bge-m3` (ollama pull bge-m3) or equivalent on EMBEDDING_BASE_URL.
 */

import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createEmbeddingProvider } from '@ikp/processing';

import { HybridSearchService } from '../../apps/api/src/modules/search/hybrid-search.service.js';
import { DocumentChunksRepository } from '../../apps/api/src/modules/documents/document-chunks.repository.js';
import { registerPool, requireTestDatabaseUrl } from '../integration/helpers/db.js';
import { seedIdentity, type SeedIdentity } from '../integration/helpers/seed.js';

import dataset from './search-evaluation.dataset.json' with { type: 'json' };
import { evaluateSearch, formatMetrics } from './search-evaluation.runner.js';

const shouldRunReal = process.env.EVAL_REAL === '1';
const describeReal = shouldRunReal ? describe : describe.skip;

let pool: Pool;
let identity: SeedIdentity;
let hybrid: HybridSearchService;
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: Awaited<ReturnType<typeof createEmbeddingProvider>>;
let realProviderAvailable = false;
let realProviderError: string | null = null;

async function createDocumentForEvaluation(
  institutionId: string,
  userId: string,
  title: string,
  chunkText: string,
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `eval-real-${suffix}-${randomUUID().slice(0, 4)}`;
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
  const inputs = chunks.map(
    (c: { pageNumber: number | null; chunkIndex: number; content: string; tokenCount: number }, i: number) => ({
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
  if (!shouldRunReal) return;
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  chunksRepo = new DocumentChunksRepository(pool);
  try {
    // Force real provider (not mock) — respect EMBEDDING_PROVIDER env.
    // If still mock, we are not in real mode; skip with a warning.
    const originalEmbeddingProvider = process.env.EMBEDDING_PROVIDER;
    if (!originalEmbeddingProvider || originalEmbeddingProvider === 'mock') {
      // Try to create a local provider explicitly for real eval.
      process.env.EMBEDDING_PROVIDER = 'local';
      embeddingProvider = await createEmbeddingProvider();
      process.env.EMBEDDING_PROVIDER = originalEmbeddingProvider ?? 'mock';
      // Probe the provider (light embed) to verify reachability.
      await embeddingProvider.embed(['health check']);
      realProviderAvailable = true;
    } else {
      embeddingProvider = await createEmbeddingProvider();
      await embeddingProvider.embed(['health check']);
      realProviderAvailable = true;
    }
  } catch (error) {
    realProviderError = error instanceof Error ? error.message : String(error);
    realProviderAvailable = false;
  }

  if (!realProviderAvailable) return;

  hybrid = new HybridSearchService(pool, { embeddingProvider } as unknown as ConstructorParameters<
    typeof HybridSearchService
  >[1]);
  identity = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });

  const titlesToCreate = new Map<string, string>();
  for (const testCase of dataset as unknown as Array<{
    expected_titles: string[];
    query: string;
    query_type: string;
  }>) {
    for (const title of testCase.expected_titles) {
      if (!titlesToCreate.has(title)) {
        const chunkText = testCase.query_type === 'exact_title' ? title : testCase.query;
        titlesToCreate.set(title, chunkText);
      }
    }
  }
  for (const [title, chunkText] of titlesToCreate.entries()) {
    await createDocumentForEvaluation(identity.institutionId, identity.userId, title, chunkText);
  }
  await createDocumentForEvaluation(
    identity.institutionId,
    identity.userId,
    'CSE Department Notice',
    'CSE notice about lab schedule. '.repeat(20),
  );
});

afterAll(async () => {
  if (pool) await pool.end();
});

describeReal('Search Evaluation (Real Provider) — gated EVAL_REAL=1', () => {
  it('evaluates hybrid search with real embeddings and meets production thresholds', async () => {
    if (!realProviderAvailable) {
      throw new Error(
        `Real embedding provider not available. Start Ollama (ollama pull bge-m3 && ollama serve) or set EMBEDDING_BASE_URL. Original error: ${realProviderError ?? 'unknown'}. Unset EVAL_REAL=1 to skip this suite.`,
      );
    }

    const metrics = await evaluateSearch(
      dataset as unknown as Parameters<typeof evaluateSearch>[0],
      async (query: string) => {
        const results = await hybrid.search(identity.institutionId, query, { limit: 10 });
        return results.map((r) => ({ document_id: r.document_id, title: r.title }));
      },
    );

    console.log('\n[REAL] ' + formatMetrics(metrics));
    console.log(`\nProvider: ${embeddingProvider.modelName()} dims=${embeddingProvider.dimensions()}`);

    // Production thresholds — stricter than mock (mock was 0.4 / 0.3).
    // Real BGE-M3 should achieve higher recall; if not, tuning is required.
    expect(metrics.recall_at_5).toBeGreaterThanOrEqual(0.6);
    expect(metrics.mrr).toBeGreaterThanOrEqual(0.5);
    expect(metrics.zero_result_rate).toBeLessThanOrEqual(0.35);
  });
});
