export const OCR_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'] as const;

export type OCRImageMimeType = (typeof OCR_IMAGE_MIME_TYPES)[number];

export interface OCRInput {
  buffer: Buffer;
  mimeType: string;
  language?: string;
}

export interface OCRPageResult {
  text: string;
  confidence: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
  provider: string;
  pages: OCRPageResult[];
}

export interface OCRProvider {
  name(): string;
  extract(input: OCRInput): Promise<OCRResult>;
}
