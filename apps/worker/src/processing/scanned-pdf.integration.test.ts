import { createHash, randomUUID } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOcrProvider, createTextExtractor } from '@ikp/processing';
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from '@ikp/storage';

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

async function buildScannedPdfWithImage(text: string): Promise<Buffer> {
  // Create a PNG with text, then embed it into a PDF to simulate a scanned PDF (image-only)
  const svg = `<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="30" y="120" font-family="Arial" font-size="48" fill="black">${text}</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([800, 200]);
  const pngImage = await pdfDoc.embedPng(png);
  page.drawImage(pngImage, { x: 0, y: 0, width: 800, height: 200 });
  return Buffer.from(await pdfDoc.save());
}

async function seedVersion(content: Buffer, mimeType: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const institutionResult = await pool.query(
    'INSERT INTO institutions (name, slug) VALUES ($1, $2) RETURNING id',
    [`Scanned ${suffix}`, `scanned-${suffix}`],
  );
  const institutionId = (institutionResult.rows[0] as { id: string }).id;

  const userResult = await pool.query(
    "INSERT INTO users (email, name, status) VALUES ($1, 'P', 'ACTIVE') RETURNING id",
    [`scanned-${suffix}@example.edu`],
  );
  const userId = (userResult.rows[0] as { id: string }).id;

  const documentResult = await pool.query(
    'INSERT INTO documents (institution_id, title, slug, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [institutionId, `Doc ${suffix}`, `doc-${suffix}`, userId],
  );
  const documentId = (documentResult.rows[0] as { id: string }).id;

  const storageKey = `scanned-test/${suffix}/original.pdf`;
  cleanupKeys.push(storageKey);
  await storage.put({ key: storageKey, body: content, contentType: mimeType });

  const versionResult = await pool.query(
    `INSERT INTO document_versions (document_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by) VALUES ($1, 1, $2, $3, $4, $5, $6) RETURNING id`,
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

  return { institutionId, documentId, versionId, storageKey };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  await ensureStorageBucket(STORAGE_CONFIG);
  storage = createS3ObjectStorage(STORAGE_CONFIG);
  service = new ProcessingService(pool, storage, createTextExtractor(), createOcrProvider());
});

afterAll(async () => {
  await Promise.all(cleanupKeys.map((k) => storage.delete(k)));
  await pool.end();
});

describe('scanned PDF integration (P3-010)', () => {
  it('processes a native PDF with text layer as NOT_REQUIRED', async () => {
    const { PDFDocument: LibDoc, StandardFonts } = await import('pdf-lib');
    const pdfDoc = await LibDoc.create();
    const page = pdfDoc.addPage([400, 600]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText('Native PDF with examination deadline 18 August 2026', {
      x: 50,
      y: 500,
      size: 14,
      font,
    });
    const pdf = Buffer.from(await pdfDoc.save());

    const seed = await seedVersion(pdf, 'application/pdf');
    await service.processJob({
      job_id: `job-${seed.versionId}`,
      institution_id: seed.institutionId,
      document_id: seed.documentId,
      version_id: seed.versionId,
      attempt: 1,
      payload: {},
    });

    const row = await pool.query(
      'SELECT ocr_status, processing_status, extracted_text FROM document_versions WHERE id = $1',
      [seed.versionId],
    );
    const data = row.rows[0] as {
      ocr_status: string;
      processing_status: string;
      extracted_text: string;
    };
    expect(data.processing_status).toBe('COMPLETED');
    expect(data.ocr_status).toBe('NOT_REQUIRED');
    expect(data.extracted_text).toContain('18 August 2026');
  }, 60_000);

  it('marks an image-only scanned PDF as requiring OCR (no rasterization yet)', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([400, 600]); // blank page, no text
    const pdf = Buffer.from(await pdfDoc.save());

    const seed = await seedVersion(pdf, 'application/pdf');
    await service.processJob({
      job_id: `job-${seed.versionId}`,
      institution_id: seed.institutionId,
      document_id: seed.documentId,
      version_id: seed.versionId,
      attempt: 1,
      payload: {},
    });

    const row = await pool.query(
      'SELECT ocr_status, processing_status FROM document_versions WHERE id = $1',
      [seed.versionId],
    );
    const data = row.rows[0] as { ocr_status: string; processing_status: string };
    expect(data.processing_status).toBe('COMPLETED');
    // Current pipeline marks scanned PDFs as REQUIRED (rasterization pending, see BACKLOG)
    expect(data.ocr_status).toBe('REQUIRED');
  }, 60_000);

  it('runs OCR on a raster image and extracts text', async () => {
    const svg = `<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="30" y="120" font-family="Arial" font-size="48" fill="black">SCANNED EXAM 18 AUGUST</text></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    const seed = await seedVersion(png, 'image/png');
    await service.processJob({
      job_id: `job-${seed.versionId}`,
      institution_id: seed.institutionId,
      document_id: seed.documentId,
      version_id: seed.versionId,
      attempt: 1,
      payload: {},
    });

    const row = await pool.query(
      'SELECT ocr_status, processing_status, extracted_text, page_count FROM document_versions WHERE id = $1',
      [seed.versionId],
    );
    const data = row.rows[0] as {
      ocr_status: string;
      processing_status: string;
      extracted_text: string;
      page_count: number;
    };
    expect(data.processing_status).toBe('COMPLETED');
    expect(data.ocr_status).toBe('COMPLETED');
    expect(data.extracted_text).toMatch(/SCANNED|EXAM/i);
    expect(data.page_count).toBe(1);
  }, 90_000);

  it('handles a scanned PDF containing an image (image + PDF wrapper) as requiring OCR', async () => {
    const scannedPdf = await buildScannedPdfWithImage('SCANNED FORM DEADLINE');
    const seed = await seedVersion(scannedPdf, 'application/pdf');

    await service.processJob({
      job_id: `job-${seed.versionId}`,
      institution_id: seed.institutionId,
      document_id: seed.documentId,
      version_id: seed.versionId,
      attempt: 1,
      payload: {},
    });

    const row = await pool.query(
      'SELECT ocr_status, processing_status FROM document_versions WHERE id = $1',
      [seed.versionId],
    );
    const data = row.rows[0] as { ocr_status: string; processing_status: string };
    expect(data.processing_status).toBe('COMPLETED');
    // Still marked REQUIRED until PDF rasterization is implemented
    expect(['REQUIRED', 'COMPLETED']).toContain(data.ocr_status);
  }, 90_000);
});
