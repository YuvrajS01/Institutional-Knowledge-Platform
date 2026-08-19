import { extractText } from 'unpdf';

import {
  MIME_PDF,
  MIME_PLAIN_TEXT,
  type ExtractionMethod,
  type TextExtractionInput,
  type TextExtractionResult,
  type TextExtractor,
} from './text-extractor.js';

/**
 * PDF text extraction via pdf.js (through `unpdf`, which manages the worker
 * and runs fully locally — no native dependencies, ADR-007 local-first).
 *
 * For plain text we return the content directly. For everything else (e.g.
 * scanned images) the adapter reports `method: 'none'` and the orchestration
 * layer decides whether OCR is required.
 */
export class PdfTextExtractor implements TextExtractor {
  async extract(input: TextExtractionInput): Promise<TextExtractionResult> {
    if (input.mimeType === MIME_PLAIN_TEXT) {
      const text = input.buffer.toString('utf8');
      return { text, pages: [text], pageCount: 1, method: 'plaintext' };
    }

    if (input.mimeType === MIME_PDF) {
      return this.extractPdf(input.buffer);
    }

    return { text: '', pages: [], pageCount: null, method: 'none' };
  }

  private async extractPdf(buffer: Buffer): Promise<TextExtractionResult> {
    const pdf = await extractText(new Uint8Array(buffer));

    const pages = pdf.text.map((page) => page.trim()).filter((page) => page.length > 0);

    return {
      text: pages.join('\n\n'),
      pages,
      pageCount: pdf.totalPages,
      method: 'native',
    };
  }
}

export function createTextExtractor(): TextExtractor {
  return new PdfTextExtractor();
}

export type { ExtractionMethod, TextExtractionResult };
