export const MIME_PDF = 'application/pdf';
export const MIME_PLAIN_TEXT = 'text/plain';

export type ExtractionMethod = 'native' | 'plaintext' | 'none';

export interface TextExtractionResult {
  text: string;
  /** Per-page extracted text (PDF only). */
  pages: string[];
  pageCount: number | null;
  method: ExtractionMethod;
}

export interface TextExtractionInput {
  buffer: Buffer;
  mimeType: string;
}

export interface TextExtractor {
  extract(input: TextExtractionInput): Promise<TextExtractionResult>;
}
