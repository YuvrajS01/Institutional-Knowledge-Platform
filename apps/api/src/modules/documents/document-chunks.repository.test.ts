import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chunkDocument } from '@ikp/processing';
import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import { seedIdentity, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';

import { DocumentChunksRepository } from './document-chunks.repository.js';

let pool: Pool;
let identity: SeedIdentity;
let repository: DocumentChunksRepository;

async function createDocumentVersion(
  pool: Pool,
  institutionId: string,
  userId: string,
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const doc = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [institutionId, `Doc ${suffix}`, `doc-${suffix}-${randomUUID().slice(0, 4)}`, userId],
  );
  const documentId = (doc.rows[0] as { id: string }).id;

  await pool.query('INSERT INTO document_metadata (document_id) VALUES ($1)', [documentId]);

  const storageKey = `test/${suffix}/original.pdf`;
  const version = await pool.query(
    `INSERT INTO document_versions
       (document_id, version_number, storage_key, mime_type, size_bytes, sha256, extracted_text, created_by)
     VALUES ($1, 1, $2, 'application/pdf', 100, $3, 'hello', $4) RETURNING id`,
    [documentId, storageKey, createHash('sha256').update(suffix).digest('hex'), userId],
  );
  return (version.rows[0] as { id: string }).id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  repository = new DocumentChunksRepository(pool);
  identity = await seedIdentity(pool, { role: 'INSTITUTION_ADMIN' });
});

afterAll(async () => {
  await pool.end();
});

describe('DocumentChunksRepository', () => {
  it('creates and lists chunks ordered by chunk_index with page preservation', async () => {
    const versionId = await createDocumentVersion(pool, identity.institutionId, identity.userId);

    const text = Array.from(
      { length: 120 },
      () => 'Students must submit examination forms before deadline.',
    ).join(' ');
    const chunks = chunkDocument({ text });

    expect(chunks.length).toBeGreaterThan(1);

    const inputs = chunks.map((c) => ({
      page_number: c.pageNumber,
      chunk_index: c.chunkIndex,
      content: c.content,
      token_count: c.tokenCount,
    }));

    const created = await repository.createMany(versionId, inputs);
    expect(created).toHaveLength(inputs.length);
    expect(created[0]!.chunk_index).toBe(0);
    expect(created[0]!.content).toContain('Students must submit');

    const listed = await repository.listByVersion(versionId);
    expect(listed).toHaveLength(inputs.length);
    // Ordered by chunk_index
    for (let i = 0; i < listed.length; i++) {
      expect(listed[i]!.chunk_index).toBe(i);
      expect(listed[i]!.content).toBe(inputs[i]!.content);
      expect(listed[i]!.token_count).toBe(inputs[i]!.token_count);
      expect(listed[i]!.page_number).toBe(inputs[i]!.page_number);
    }

    const count = await repository.countByVersion(versionId);
    expect(count).toBe(inputs.length);
  });

  it('stores per-page chunks with correct page numbers', async () => {
    const versionId = await createDocumentVersion(pool, identity.institutionId, identity.userId);
    const pages = [
      Array.from({ length: 60 }, () => 'Page one content for examination notice.').join(' '),
      Array.from({ length: 60 }, () => 'Page two content for hostel circular.').join(' '),
    ];
    const chunks = chunkDocument({ text: pages.join('\n\n'), pages, pageCount: 2 });
    const inputs = chunks.map((c) => ({
      page_number: c.pageNumber,
      chunk_index: c.chunkIndex,
      content: c.content,
      token_count: c.tokenCount,
    }));
    await repository.createMany(versionId, inputs);
    const listed = await repository.listByVersion(versionId);
    const pagesSeen = new Set(listed.map((r) => r.page_number));
    expect(pagesSeen.has(1)).toBe(true);
    expect(pagesSeen.has(2)).toBe(true);
  });

  it('enforces unique (document_version_id, chunk_index)', async () => {
    const versionId = await createDocumentVersion(pool, identity.institutionId, identity.userId);
    await repository.createMany(versionId, [
      { page_number: 1, chunk_index: 0, content: 'A', token_count: 1 },
      { page_number: 1, chunk_index: 1, content: 'B', token_count: 1 },
    ]);
    await expect(
      repository.createMany(versionId, [
        { page_number: 1, chunk_index: 1, content: 'duplicate', token_count: 1 },
      ]),
    ).rejects.toThrow();
  });

  it('deletes chunks by version', async () => {
    const versionId = await createDocumentVersion(pool, identity.institutionId, identity.userId);
    await repository.createMany(versionId, [
      { page_number: 1, chunk_index: 0, content: 'To delete', token_count: 1 },
    ]);
    expect(await repository.countByVersion(versionId)).toBe(1);
    await repository.deleteByVersion(versionId);
    expect(await repository.countByVersion(versionId)).toBe(0);
    expect(await repository.listByVersion(versionId)).toHaveLength(0);
  });

  it('returns empty for a version with no chunks', async () => {
    const versionId = await createDocumentVersion(pool, identity.institutionId, identity.userId);
    expect(await repository.listByVersion(versionId)).toHaveLength(0);
    expect(await repository.countByVersion(versionId)).toBe(0);
  });

  it('does not return chunks from another version', async () => {
    const versionA = await createDocumentVersion(pool, identity.institutionId, identity.userId);
    const versionB = await createDocumentVersion(pool, identity.institutionId, identity.userId);
    await repository.createMany(versionA, [
      { page_number: 1, chunk_index: 0, content: 'Only A', token_count: 1 },
    ]);
    expect(await repository.listByVersion(versionB)).toHaveLength(0);
    expect(await repository.listByVersion(versionA)).toHaveLength(1);
  });

  it('creates 0 chunks when given empty input', async () => {
    const versionId = await createDocumentVersion(pool, identity.institutionId, identity.userId);
    const created = await repository.createMany(versionId, []);
    expect(created).toHaveLength(0);
  });
});
