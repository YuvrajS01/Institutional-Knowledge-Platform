import { describe, expect, it } from 'vitest';

import {
  documentVersionPrefix,
  extractedTextKey,
  ocrResultKey,
  originalFileKey,
  pagePreviewKey,
} from './storage-keys.js';

const context = {
  institutionId: 'inst-123',
  documentId: 'doc-456',
  version: 2,
};

describe('storage keys', () => {
  it('builds the version prefix per the spec layout', () => {
    expect(documentVersionPrefix(context)).toBe('inst-123/documents/doc-456/v2');
  });

  it('builds the original file key with a normalized extension', () => {
    expect(originalFileKey(context, 'PDF')).toBe('inst-123/documents/doc-456/v2/original.pdf');
    expect(originalFileKey(context, '.png')).toBe('inst-123/documents/doc-456/v2/original.png');
  });

  it('builds processed artifact keys', () => {
    expect(extractedTextKey(context)).toBe('inst-123/documents/doc-456/v2/extracted.txt');
    expect(ocrResultKey(context)).toBe('inst-123/documents/doc-456/v2/ocr.json');
    expect(pagePreviewKey(context, 1)).toBe('inst-123/documents/doc-456/v2/preview/page-001.png');
    expect(pagePreviewKey(context, 12)).toBe('inst-123/documents/doc-456/v2/preview/page-012.png');
  });
});
