import { createHash, randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTextExtractor, createOcrProvider } from '@ikp/processing';
import { createS3ObjectStorage, ensureStorageBucket, type S3ObjectStorageConfig } from '@ikp/storage';

import { requireTestDatabaseUrl } from '../integration/helpers/db.js';
import { ProcessingService } from '../../apps/worker/src/processing/processing.service.js';

const STORAGE_CONFIG: S3ObjectStorageConfig = {
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'institutional-documents',
  accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
};

let pool: Pool;
let storage: ReturnType<typeof createS3ObjectStorage>;
let service: ProcessingService;

async function buildPdf(texts: string[]): Promise<Buffer> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 560;
  for (const line of texts) {
    page.drawText(line, { x: 50, y, size: 14, font });
    y -= 24;
  }
  return Buffer.from(await doc.save());
}

async function seedVersion(content: Buffer) {
  const suffix = randomUUID().replaceAll('-', '');
  const institutionResult = await pool.query(
    'INSERT INTO institutions (name, slug) VALUES ($1, $2) RETURNING id',
    [`LoadProc ${suffix}`, `load-proc-${suffix}`],
  );
  const institutionId = (institutionResult.rows[0] as { id: string }).id;
  const userResult = await pool.query(
    "INSERT INTO users (email, name, status) VALUES ($1, 'P', 'ACTIVE') RETURNING id",
    [`loadproc-${suffix}@example.edu`],
  );
  const userId = (userResult.rows[0] as { id: string }).id;
  const documentResult = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [institutionId, `Doc ${suffix}`, `doc-${suffix}`, userId],
  );
  const documentId = (documentResult.rows[0] as { id: string }).id;
  const storageKey = `load-test/${suffix}/original.pdf`;
  await storage.put({ key: storageKey, body: content, contentType: 'application/pdf' });
  const versionResult = await pool.query(
    `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by) VALUES ($1, 1, $2, 'application/pdf', $3, $4, $5) RETURNING id`,
    [documentId, storageKey, content.byteLength, createHash('sha256').update(content).digest('hex'), userId],
  );
  const versionId = (versionResult.rows[0] as { id: string }).id;
  return { institutionId, documentId, versionId, storageKey };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  await ensureStorageBucket(STORAGE_CONFIG);
  storage = createS3ObjectStorage(STORAGE_CONFIG);
  service = new ProcessingService(pool, storage, createTextExtractor(), createOcrProvider());
});

afterAll(async () => {
  await pool.end();
});

describe('Load test: async processing (P9-004)', () => {
  it('processes 10 PDFs concurrently within latency', async () => {
    const count = 10;
    const jobs = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const pdf = await buildPdf([`Load test document ${i}`, `Examination deadline is 18 August 2026 — document ${i}.`]);
        return seedVersion(pdf);
      }),
    );

    const start = Date.now();
    await Promise.all(
      jobs.map((seed) =>
        service.processJob({
          job_id: `job-${seed.versionId}`,
          institution_id: seed.institutionId,
          document_id: seed.documentId,
          version_id: seed.versionId,
          attempt: 1,
          payload: {},
        }),
      ),
    );
    const duration = Date.now() - start;

    for (const seed of jobs) {
      const row = await pool.query('SELECT processing_status, extracted_text FROM document_versions WHERE id = $1', [seed.versionId]);
      const data = row.rows[0] as { processing_status: string; extracted_text: string };
      expect(data.processing_status).toBe('COMPLETED');
      expect(data.extracted_text).toContain('18 August 2026');
    }

    const avg = duration / count;
    expect(avg).toBeLessThan(5000);
    expect(duration).toBeLessThan(15_000);
    console.log(`Processing load: ${count} concurrent PDFs in ${duration}ms (avg ${avg.toFixed(1)}ms)`);
  }, 60_000);

  it('processes chunking and embeddings under load', async () => {
    const count = 5;
    const jobs = await Promise.all(
      Array.from({ length: count }, async () => {
        const longText = Array.from({ length: 20 }, (_, j) => `Paragraph ${j} with examination notice content for load testing. `.repeat(5));
        const pdf = await buildPdf(longText);
        return seedVersion(pdf);
      }),
    );

    const start = Date.now();
    await Promise.all(
      jobs.map((seed) =>
        service.processJob({
          job_id: `job-${seed.versionId}-2`,
          institution_id: seed.institutionId,
          document_id: seed.documentId,
          version_id: seed.versionId,
          attempt: 1,
          payload: {},
        }),
      ),
    );
    const duration = Date.now() - start;

    for (const seed of jobs) {
      const chunks = await pool.query('SELECT count(*)::int AS c FROM document_chunks WHERE document_version_id = $1', [seed.versionId]);
      expect((chunks.rows[0] as { c: number }).c).toBeGreaterThan(0);
    }

    expect(duration).toBeLessThan(20_000);
    console.log(`Chunk+embed load: ${count} long PDFs in ${duration}ms`);
  }, 60_000);
});
