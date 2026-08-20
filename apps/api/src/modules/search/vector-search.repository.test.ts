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
import { VectorSearchRepository } from './vector-search.repository.js';

let pool: Pool;
let identity: SeedIdentity;
let otherIdentity: SeedIdentity;
let vectorRepo: VectorSearchRepository;
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

async function createPublishedDocumentWithChunks(
  pool: Pool,
  institutionId: string,
  userId: string,
  title: string,
  text: string,
): Promise<{ documentId: string; versionId: string }> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id',
    [institutionId, title, `vec-${suffix}-${randomUUID().slice(0, 4)}`, userId, 'PUBLISHED'],
  );
  const documentId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [documentId]);
  const storageKey = `test/${suffix}/original.pdf`;
  const version = await pool.query(
    `INSERT INTO document_versions
       (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by)
     VALUES ($1, 1, $2, 'application/pdf', 100, $3, $4, $5) RETURNING id`,
    [documentId, storageKey, createHash('sha256').update(suffix).digest('hex'), text, userId],
  );
  const versionId = (version.rows[0] as { id: string }).id;

  // Chunk and embed
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
  return { documentId, versionId };
}

async function createDraftDocumentWithChunks(
  pool: Pool,
  institutionId: string,
  userId: string,
  title: string,
  text: string,
): Promise<{ documentId: string; versionId: string }> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [institutionId, title, `vec-draft-${suffix}`, userId, 'DRAFT'],
  );
  const documentId = (doc.rows[0] as { id: string }).id;
  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [documentId]);
  const storageKey = `test/${suffix}/original.pdf`;
  const version = await pool.query(
    `INSERT INTO document_versions
       (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by)
     VALUES ($1, 1, $2, 'application/pdf', 100, $3, $4, $5) RETURNING id`,
    [documentId, storageKey, createHash('sha256').update(suffix).digest('hex'), text, userId],
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
  return { documentId, versionId };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  vectorRepo = new VectorSearchRepository(pool);
  chunksRepo = new DocumentChunksRepository(pool);
  embeddingProvider = createMockEmbeddingProvider();
  identity = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });
  otherIdentity = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });
});

afterAll(async () => {
  await pool.end();
});

describe('VectorSearchRepository (P5-006)', () => {
  it('finds semantically similar chunks via cosine distance', async () => {
    const queryText = 'Examination form submission deadline is 18 August 2026 for semester 6';
    const similarText =
      'Students must submit their examination forms before 18 August 2026 to avoid late fees. '.repeat(20);
    const dissimilarText = 'Hostel allotment circular for first year students. '.repeat(20);

    const { documentId: similarId } = await createPublishedDocumentWithChunks(
      pool,
      identity.institutionId,
      identity.userId,
      `Similar Doc ${randomUUID().slice(0, 4)}`,
      similarText,
    );
    const { documentId: dissimilarId } = await createPublishedDocumentWithChunks(
      pool,
      identity.institutionId,
      identity.userId,
      `Dissimilar Doc ${randomUUID().slice(0, 4)}`,
      dissimilarText,
    );

    const queryEmbedding = (await embeddingProvider.embed([queryText]))[0]!;
    const results = await vectorRepo.searchByEmbedding(identity.institutionId, queryEmbedding, {
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    // Similar doc should rank higher (lower distance) than dissimilar
    const similarRank = results.findIndex((r) => r.document_id === similarId);
    const dissimilarRank = results.findIndex((r) => r.document_id === dissimilarId);
    expect(similarRank).toBeGreaterThanOrEqual(0);
    // Both may appear, but similar should be before dissimilar if both in top 5
    if (dissimilarRank !== -1) {
      expect(similarRank).toBeLessThan(dissimilarRank);
    }
    // Verify distance/similarity fields
    for (const r of results) {
      expect(typeof r.distance).toBe('number');
      expect(typeof r.similarity).toBe('number');
      expect(r.similarity).toBeCloseTo(1 - r.distance, 5);
      expect(r.distance).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns empty when no chunks have embeddings', async () => {
    // Create a fresh institution with no chunks
    const fresh = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });
    const queryEmbedding = (await embeddingProvider.embed(['some query']))[0]!;
    const results = await vectorRepo.searchByEmbedding(fresh.institutionId, queryEmbedding, { limit: 5 });
    expect(results).toHaveLength(0);
  });

  it('enforces tenant isolation', async () => {
    const text = 'Tenant isolation test content for vector search. '.repeat(20);
    const query = 'Tenant isolation';
    const queryEmbedding = (await embeddingProvider.embed([query]))[0]!;

    // Create doc in other tenant
    await createPublishedDocumentWithChunks(pool, otherIdentity.institutionId, otherIdentity.userId, 'Other Tenant Doc', text);

    // Search in original tenant should not return other tenant's doc
    const results = await vectorRepo.searchByEmbedding(identity.institutionId, queryEmbedding, { limit: 10 });
    for (const r of results) {
      expect(r.document_id).not.toBeUndefined();
      // Ensure no result belongs to other tenant's document
      // We can't directly check institution, but we can verify that other tenant's doc not in results by searching for its title
      expect(r.document_title).not.toBe('Other Tenant Doc');
    }
  });

  it('filters by PUBLISHED status by default and respects explicit DRAFT filter', async () => {
    const draftText = 'Draft only content for vector search should be hidden. '.repeat(20);
    const queryEmbedding = (await embeddingProvider.embed([draftText]))[0]!;

    const { documentId: draftId } = await createDraftDocumentWithChunks(
      pool,
      identity.institutionId,
      identity.userId,
      `Draft ${randomUUID().slice(0, 4)}`,
      draftText,
    );

    // Default (PUBLISHED) should not return draft
    const publishedResults = await vectorRepo.searchByEmbedding(identity.institutionId, queryEmbedding, {
      limit: 10,
    });
    expect(publishedResults.find((r) => r.document_id === draftId)).toBeUndefined();

    // Explicit DRAFT filter should return it
    const draftResults = await vectorRepo.searchByEmbedding(identity.institutionId, queryEmbedding, {
      limit: 10,
      statuses: ['DRAFT'],
    });
    expect(draftResults.find((r) => r.document_id === draftId)).toBeDefined();
  });

  it('validates query embedding', async () => {
    await expect(vectorRepo.searchByEmbedding(identity.institutionId, [], { limit: 5 })).rejects.toThrow(
      /non-empty array/,
    );
    await expect(
      vectorRepo.searchByEmbedding(identity.institutionId, [NaN] as unknown as number[], { limit: 5 }),
    ).rejects.toThrow(/non-finite/);
  });

  it('throws for invalid tenant scope', async () => {
    const queryEmbedding = (await embeddingProvider.embed(['test']))[0]!;
    await expect(vectorRepo.searchByEmbedding('not-a-uuid', queryEmbedding)).rejects.toThrow();
  });

  it('respects limit and offset', async () => {
    const text = 'Limit offset test content. '.repeat(20);
    await createPublishedDocumentWithChunks(pool, identity.institutionId, identity.userId, 'Limit Doc', text);
    const queryEmbedding = (await embeddingProvider.embed([text]))[0]!;
    const all = await vectorRepo.searchByEmbedding(identity.institutionId, queryEmbedding, { limit: 10 });
    const limited = await vectorRepo.searchByEmbedding(identity.institutionId, queryEmbedding, { limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]!.chunk_id).toBe(all[0]!.chunk_id);

    const offset = await vectorRepo.searchByEmbedding(identity.institutionId, queryEmbedding, {
      limit: 1,
      offset: 1,
    });
    if (all.length > 1) {
      expect(offset[0]!.chunk_id).toBe(all[1]!.chunk_id);
    }
  });
});
