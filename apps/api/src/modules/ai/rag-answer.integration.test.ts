import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument, createMockEmbeddingProvider } from '@ikp/processing';

import { registerPool, requireTestDatabaseUrl } from '../../../../../tests/integration/helpers/db.js';
import { seedInstitutionWithUsers, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

import { DocumentChunksRepository } from '../documents/document-chunks.repository.js';
import { RagAnswerService } from './rag-answer.service.js';

let pool: Pool;
let student: SeedIdentity;
let institutionId: string;
let rag: RagAnswerService;
let chunksRepo: DocumentChunksRepository;
let embeddingProvider: ReturnType<typeof createMockEmbeddingProvider>;

async function createPublishedDocWithContent(
  title: string,
  content: string,
  instId: string = institutionId,
  userId: string = student.userId,
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `rag-${suffix}-${randomUUID().slice(0, 4)}`;
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by, status, published_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id',
    [instId, title, slug, userId, 'PUBLISHED'],
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

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  chunksRepo = new DocumentChunksRepository(pool);
  embeddingProvider = createMockEmbeddingProvider();
  rag = new RagAnswerService(pool);

  const tenant = await seedInstitutionWithUsers(pool, ['STUDENT']);
  institutionId = tenant.institutionId;
  student = tenant.users[0]!;
});

afterAll(async () => {
  await pool.end();
});

describe('RagAnswerService (P8-006) — integration', () => {
  it('returns grounded answer with citation for known question', async () => {
    const title = 'Examination Form Submission Notice';
    const query = 'When is the examination form deadline?';
    const content = query;
    const docId = await createPublishedDocWithContent(title, content);

    const result = await rag.answer(
      { institutionId, userId: student.userId, role: 'STUDENT' },
      query,
      { limit: 5 },
    );

    // Debug
    console.log('RAG result:', JSON.stringify(result, null, 2));
    console.log('DocId:', docId, 'Title:', title, 'Query:', query);

    expect(result.grounded).toBe(true);
    expect(result.confidence).toBe('high');
    expect(result.answer).toContain('18 August 2026');
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]!.document_id).toBe(docId);
  });

  it('returns unsupported answer when no documents match', async () => {
    const result = await rag.answer(
      { institutionId, userId: student.userId, role: 'STUDENT' },
      'What is the unknown no-answer thing that does not exist in any document?',
      { limit: 5 },
    );

    expect(result.grounded).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.answer).toBe("I couldn't find an official institutional document confirming this.");
    expect(result.citations).toHaveLength(0);
  });

  it('enforces tenant isolation', async () => {
    const otherTenant = await seedInstitutionWithUsers(pool, ['STUDENT']);
    const otherInstitutionId = otherTenant.institutionId;
    const otherStudent = otherTenant.users[0]!;
    const title = `Other Tenant RAG ${randomUUID().slice(0, 4)}`;
    const content = 'Other tenant secret content for RAG isolation. '.repeat(10);
    await createPublishedDocWithContent(title, content, otherInstitutionId, otherStudent.userId);

    // Create a doc in original tenant with known content
    const knownTitle = 'Known Doc for Tenant Test';
    const knownContent = 'Known content for tenant test. '.repeat(10);
    await createPublishedDocWithContent(knownTitle, knownContent);

    // Student from original tenant asks about other tenant's title — should not get it
    const result = await rag.answer(
      { institutionId, userId: student.userId, role: 'STUDENT' },
      title,
      { limit: 5 },
    );
    // Should not be grounded with other tenant's doc, or if grounded, citations should not include other tenant's doc
    for (const c of result.citations) {
      expect(c.document_id).not.toBeUndefined();
      // Ensure no citation is from other tenant — we can't directly check institution, but we can ensure the other title not in citations
      expect(c.title).not.toBe(title);
    }
  });
});
