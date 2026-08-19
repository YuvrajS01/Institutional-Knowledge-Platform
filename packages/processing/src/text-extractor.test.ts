import { describe, expect, it } from 'vitest';

import { isTextAdequate, MIN_CHARS_PER_PAGE } from './adequacy.js';
import { createTextExtractor } from './pdf-text-extractor.js';

describe('text adequacy heuristic', () => {
  it('rejects empty text', () => {
    expect(isTextAdequate('', 1)).toBe(false);
  });

  it('accepts text above the per-page threshold', () => {
    const text = 'x'.repeat(MIN_CHARS_PER_PAGE);
    expect(isTextAdequate(text, 1)).toBe(true);
  });

  it('rejects very thin text relative to the page count', () => {
    expect(isTextAdequate('short', 4)).toBe(false);
  });

  it('falls back to an absolute threshold when page count is unknown', () => {
    expect(isTextAdequate('x'.repeat(MIN_CHARS_PER_PAGE), null)).toBe(true);
    expect(isTextAdequate('tiny', null)).toBe(false);
  });
});

describe('text extraction', () => {
  const extractor = createTextExtractor();

  it('extracts plain text documents', async () => {
    const result = await extractor.extract({
      buffer: Buffer.from('Examination form deadline is 18 August.'),
      mimeType: 'text/plain',
    });

    expect(result.method).toBe('plaintext');
    expect(result.text).toContain('18 August');
    expect(result.pageCount).toBe(1);
  });

  it('reports method none for unsupported mime types', async () => {
    const result = await extractor.extract({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/png',
    });

    expect(result.method).toBe('none');
    expect(result.text).toBe('');
  });
});
