import { createHash, randomUUID } from 'node:crypto';

import { createTextExtractor, createOcrProvider } from '@ikp/processing';
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from '@ikp/storage';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { requireTestDatabaseUrl } from '../../../../tests/integration/helpers/db.js';
import { ProcessingService } from './processing.service.js';

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
const cleanupKeys: string[] = [];

async function buildPdf(lines: string[]): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage([400, 600]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  let y = 560;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 14, font });
    y -= 24;
  }
  return Buffer.from(await document.save());
}

async function buildPngWithText(text: string): Promise<Buffer> {
  const svg = `<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="30" y="120" font-family="Arial" font-size="48" fill="black">${text}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

interface SeededVersion {
  institutionId: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  storageKey: string;
}

async function seedVersion(content: Buffer, mimeType: string): Promise<SeededVersion> {
  const suffix = randomUUID().replaceAll('-', '');
  const institutionResult = await pool.query(
    'INSERT INTO institutions (name, slug) VALUES ($1, $2) RETURNING id',
    [`Processing ${suffix}`, `processing-${suffix}`],
  );
  const institutionId = (institutionResult.rows[0] as { id: string }).id;

  const userResult = await pool.query(
    "INSERT INTO users (email, name, status) VALUES ($1, 'P', 'ACTIVE') RETURNING id",
    [`p-${suffix}@example.edu`],
  );
  const userId = (userResult.rows[0] as { id: string }).id;

  const documentResult = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [institutionId, `Doc ${suffix}`, `doc-${suffix}`, userId],
  );
  const documentId = (documentResult.rows[0] as { id: string }).id;

  const storageKey = `processing-test/${suffix}/original.bin`;
  cleanupKeys.push(storageKey);
  await storage.put({ key: storageKey, body: content, contentType: mimeType });

  const versionResult = await pool.query(
    `INSERT INTO document_versions
       (document_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by)
     VALUES ($1, 1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      documentId,
      storageKey,
      mimeType,
      content.byteLength,
      createHash('sha256').update(content).digest('hex'),
      userId,
    ],
  );
  const versionId = (versionResult.rows[0] as { id: string }).id;

  return { institutionId, documentId, versionId, versionNumber: 1, storageKey };
}

function jobFor(seed: SeededVersion): {
  job_id: string;
  institution_id: string;
  document_id: string;
  version_id: string;
  attempt: number;
  payload: Record<string, unknown>;
} {
  return {
    job_id: `job-${seed.versionId}`,
    institution_id: seed.institutionId,
    document_id: seed.documentId,
    version_id: seed.versionId,
    attempt: 1,
    payload: {},
  };
}

async function versionRow(versionId: string): Promise<Record<string, unknown>> {
  const result = await pool.query(
    'SELECT extracted_text, ocr_status, processing_status, page_count FROM document_versions WHERE id = $1',
    [versionId],
  );
  return result.rows[0] as Record<string, unknown>;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  await ensureStorageBucket(STORAGE_CONFIG);
  storage = createS3ObjectStorage(STORAGE_CONFIG);
  service = new ProcessingService(pool, storage, createTextExtractor(), createOcrProvider());
});

afterAll(async () => {
  await Promise.all(cleanupKeys.map((key) => storage.delete(key)));
  await pool.end();
});

describe('document processing orchestration', () => {
  it('extracts text from a native PDF, persists it, and writes extracted.txt', async () => {
    const pdf = await buildPdf(['Examination Form Submission Notice', 'Submit by 18 August 2026.']);
    const seed = await seedVersion(pdf, 'application/pdf');

    await service.processJob(jobFor(seed));

    const row = await versionRow(seed.versionId);
    expect(row.processing_status).toBe('COMPLETED');
    expect(row.ocr_status).toBe('NOT_REQUIRED');
    expect(row.page_count).toBe(1);
    expect(String(row.extracted_text)).toContain('18 August 2026');

    const artifact = await storage.get(
      `${seed.institutionId}/documents/${seed.documentId}/v1/extracted.txt`,
    );
    expect(artifact).not.toBeNull();
    expect(artifact!.body.toString()).toContain('18 August 2026');
  }, 60_000);

  it('is idempotent: a completed version is not reprocessed', async () => {
    const pdf = await buildPdf(['Stable Text Content']);
    const seed = await seedVersion(pdf, 'application/pdf');
    const job = jobFor(seed);

    await service.processJob(job);
    const afterFirst = await versionRow(seed.versionId);
    await service.processJob(job);
    const afterSecond = await versionRow(seed.versionId);

    expect(afterSecond.extracted_text).toBe(afterFirst.extracted_text);
    expect(afterSecond.processing_status).toBe('COMPLETED');
  }, 60_000);

  it('runs OCR on raster images and records completed OCR status', async () => {
    const image = await buildPngWithText('EXAM FORM DEADLINE 18 AUGUST 2026');
    const seed = await seedVersion(image, 'image/png');

    await service.processJob(jobFor(seed));

    const row = await versionRow(seed.versionId);
    expect(row.processing_status).toBe('COMPLETED');
    expect(row.ocr_status).toBe('COMPLETED');
    expect(String(row.extracted_text)).toMatch(/EXAM/i);
    expect(Number(row.page_count)).toBe(1);
  }, 90_000);

  it('marks scanned/typed PDFs with inadequate text as requiring OCR', async () => {
    const document = await PDFDocument.create();
    document.addPage([400, 600]); // no text layer → like a scan
    const pdf = Buffer.from(await document.save());
    const seed = await seedVersion(pdf, 'application/pdf');

    await service.processJob(jobFor(seed));

    const row = await versionRow(seed.versionId);
    expect(row.processing_status).toBe('COMPLETED');
    expect(row.ocr_status).toBe('REQUIRED');
  });

  it('rejects jobs whose version is not in the tenant', async () => {
    const pdf = await buildPdf(['Tenant Scoped']);
    const seed = await seedVersion(pdf, 'application/pdf');
    const foreign = {
      ...jobFor(seed),
      institution_id: randomUUID(),
    };

    await expect(service.processJob(foreign)).rejects.toThrow(/not found/i);
  });

  it('fails when the original file is missing from storage', async () => {
    const suffix = randomUUID().replaceAll('-', '');
    const institutionResult = await pool.query(
      'INSERT INTO institutions (name, slug) VALUES ($1, $2) RETURNING id',
      [`Missing ${suffix}`, `missing-${suffix}`],
    );
    const institutionId = (institutionResult.rows[0] as { id: string }).id;
    const userResult = await pool.query(
      "INSERT INTO users (email, name, status) VALUES ($1, 'P', 'ACTIVE') RETURNING id",
      [`m-${suffix}@example.edu`],
    );
    const userId = (userResult.rows[0] as { id: string }).id;
    const documentResult = await pool.query(
      'INSERT INTO documents (institution_id, title, slug, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [institutionId, `Doc ${suffix}`, `doc-${suffix}`, userId],
    );
    const documentId = (documentResult.rows[0] as { id: string }).id;
    const versionResult = await pool.query(
      `INSERT INTO document_versions
         (document_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by)
       VALUES ($1, 1, $2, 'application/pdf', 1, $3, $4) RETURNING id`,
      [documentId, `missing-key-${suffix}`, '0'.repeat(64), userId],
    );
    const versionId = (versionResult.rows[0] as { id: string }).id;

    await expect(
      service.processJob({
        job_id: `job-${versionId}`,
        institution_id: institutionId,
        document_id: documentId,
        version_id: versionId,
        attempt: 1,
        payload: {},
      }),
    ).rejects.toThrow(/missing/i);
  });
});
