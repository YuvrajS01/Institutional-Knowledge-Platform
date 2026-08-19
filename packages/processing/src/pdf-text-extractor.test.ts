import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { isTextAdequate } from './adequacy.js';
import { createTextExtractor } from './pdf-text-extractor.js';

async function buildPdf(pages: string[][]): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (const pageTexts of pages) {
    const page = document.addPage([400, 600]);
    const font = await document.embedFont(StandardFonts.Helvetica);
    let y = 560;
    for (const line of pageTexts) {
      page.drawText(line, { x: 50, y, size: 14, font, color: rgb(0, 0, 0) });
      y -= 24;
    }
  }
  return Buffer.from(await document.save());
}

describe('PDF text extraction (integration)', () => {
  it('extracts embedded text and page count from a real PDF', async () => {
    const pdf = await buildPdf([
      ['Examination Form Submission Notice', 'Students must submit forms by 18 August 2026.'],
      ['Hostel Fee Payment', 'The hostel fee deadline is 22 August 2026.'],
    ]);

    const extractor = createTextExtractor();
    const result = await extractor.extract({ buffer: pdf, mimeType: 'application/pdf' });

    expect(result.method).toBe('native');
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain('18 August 2026');
    expect(result.text).toContain('Hostel Fee Payment');
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    expect(isTextAdequate(result.text, result.pageCount)).toBe(true);
  });

  it('produces thin text for a scanned-style (no text layer) PDF', async () => {
    // A PDF with no text drawn on it behaves like a scanned page for
    // extraction purposes.
    const document = await PDFDocument.create();
    document.addPage([400, 600]);
    const pdf = Buffer.from(await document.save());

    const extractor = createTextExtractor();
    const result = await extractor.extract({ buffer: pdf, mimeType: 'application/pdf' });

    expect(result.method).toBe('native');
    expect(isTextAdequate(result.text, result.pageCount)).toBe(false);
  });
});
