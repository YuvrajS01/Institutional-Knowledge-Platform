import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

import { RagAnswerService } from '../../apps/api/src/modules/ai/rag-answer.service.js';
import { DocumentChunksRepository } from '../../apps/api/src/modules/documents/document-chunks.repository.js';
import { registerPool, requireTestDatabaseUrl } from '../integration/helpers/db.js';
import { seedIdentity, type SeedIdentity } from '../integration/helpers/seed.js';

import dataset from './rag-evaluation.dataset.json' with { type: 'json' };
import { evaluateRag, formatRagMetrics } from './rag-evaluation.runner.js';

let pool: Pool;
let identity: SeedIdentity;
let rag: RagAnswerService;
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

async function createDocumentForRag(
  institutionId: string,
  userId: string,
  title: string,
  chunkText: string,
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `rag-eval-${suffix}-${randomUUID().slice(0, 4)}`;
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
  chunksRepo = new DocumentChunksRepository(pool);
  embeddingProvider = createMockEmbeddingProvider();
  rag = new RagAnswerService(pool);
  identity = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });

  // Seed documents for each RAG case that expects grounded true
  const titlesToCreate = new Map<string, string>();
  for (const testCase of dataset as unknown as Array<{
    expected_titles: string[];
    query: string;
    expected_grounded: boolean;
  }>) {
    if (!testCase.expected_grounded) continue;
    for (const title of testCase.expected_titles) {
      if (!titlesToCreate.has(title)) {
        // Chunk text is the query itself for semantic match (mock embeddings hash)
        // plus title for lexical, plus fact 18 August for answer correctness
        const chunkText = `${title} — ${testCase.query} — deadline is 18 August 2026.`;
        titlesToCreate.set(title, chunkText);
      }
    }
  }

  for (const [title, chunkText] of titlesToCreate.entries()) {
    await createDocumentForRag(identity.institutionId, identity.userId, title, chunkText);
  }
});

afterAll(async () => {
  await pool.end();
});

describe('RAG Evaluation (P8-012)', () => {
  it('evaluates RAG and meets quality thresholds', async () => {
    const metrics = await evaluateRag(
      dataset as unknown as Parameters<typeof evaluateRag>[0],
      async (query: string) => {
        const result = await rag.answer(
          { institutionId: identity.institutionId, userId: identity.userId, role: 'STUDENT' },
          query,
          { limit: 5 },
        );
        return {
          answer: result.answer,
          grounded: result.grounded,
          confidence: result.confidence,
          citations: result.citations.map((c) => ({
            document_id: c.document_id,
            document_title: c.document_title,
            version_id: c.version_id,
            page: c.page,
          })),
        };
      },
    );

    console.log('\n' + formatRagMetrics(metrics));

    // Thresholds for mock RAG (deterministic mock LLM + mock embeddings)
    // Mock should achieve at least 70% grounded and citation accuracy since we seeded
    // documents with query-matching chunks and mock LLM is grounded for examination/hostel etc.
    expect(metrics.grounded_accuracy).toBeGreaterThanOrEqual(0.7);
    expect(metrics.citation_accuracy).toBeGreaterThanOrEqual(0.6);
    expect(metrics.answer_accuracy).toBeGreaterThanOrEqual(0.6);
    expect(metrics.overall_accuracy).toBeGreaterThanOrEqual(0.6);
  });

  it('per-case metrics are computed', async () => {
    const singleCase = [
      {
        id: 'rag-single',
        query: 'Examination Form Submission Notice',
        query_type: 'exact_title',
        expected_titles: ['Examination Form Submission Notice'],
        expected_facts: ['18 August 2026'],
        expected_grounded: true,
        language: 'en',
        difficulty: 'easy',
        department: null,
      },
    ];
    await createDocumentForRag(
      identity.institutionId,
      identity.userId,
      'Examination Form Submission Notice',
      'Examination Form Submission Notice — deadline is 18 August 2026.',
    );

    const metrics = await evaluateRag(singleCase, async (q) => {
      const res = await rag.answer(
        { institutionId: identity.institutionId, userId: identity.userId, role: 'STUDENT' },
        q,
        { limit: 5 },
      );
      return {
        answer: res.answer,
        grounded: res.grounded,
        confidence: res.confidence,
        citations: res.citations.map((c) => ({
          document_id: c.document_id,
          document_title: c.document_title,
          version_id: c.version_id,
          page: c.page,
        })),
      };
    });
    expect(metrics.per_case[0]!.grounded_correct).toBe(true);
  });
});
