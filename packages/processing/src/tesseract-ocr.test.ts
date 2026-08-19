import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { createOcrProvider, TesseractOcrProvider } from './tesseract-ocr.js';

const svgWithText = (text: string): string => `
<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  <text x="30" y="120" font-family="Arial, sans-serif" font-size="48" fill="black">${text}</text>
</svg>`;

async function renderTextImage(text: string): Promise<Buffer> {
  return sharp(Buffer.from(svgWithText(text)))
    .png()
    .toBuffer();
}

describe('OCR adapter (integration)', () => {
  it('recognizes text from a generated image', async () => {
    const image = await renderTextImage('EXAM FORM DEADLINE 18 AUGUST 2026');
    const provider = createOcrProvider();

    const result = await provider.extract({
      buffer: image,
      mimeType: 'image/png',
    });

    expect(result.provider).toBe('tesseract');
    expect(result.text).toMatch(/EXAM/i);
    expect(result.text).toMatch(/18/i);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('exposes the provider name', () => {
    expect(new TesseractOcrProvider().name()).toBe('tesseract');
  });

  it('rejects non-image inputs', async () => {
    const provider = createOcrProvider();
    await expect(
      provider.extract({ buffer: Buffer.from('not an image'), mimeType: 'application/pdf' }),
    ).rejects.toThrow(/raster image/);
  });
});
