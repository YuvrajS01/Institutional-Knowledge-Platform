import { createRequire } from 'node:module';

import { createWorker, type Worker } from 'tesseract.js';

import {
  OCR_IMAGE_MIME_TYPES,
  type OCRInput,
  type OCRPageResult,
  type OCRProvider,
  type OCRResult,
} from './ocr.js';

const require = createRequire(import.meta.url);

export interface TesseractOcrOptions {
  /** Language codes, e.g. "eng" or "eng+hin". */
  language?: string;
  /** Override the CDN default for traineddata downloads. */
  langPath?: string;
  /** Override the worker script location (defaults to the npm package). */
  workerPath?: string;
}

/**
 * Tesseract OCR adapter (wasm-based, no native dependencies — ADR-007
 * local-first). Handles raster image inputs; PDF rasterization is handled by
 * the processing orchestration layer before OCR is invoked.
 */
export class TesseractOcrProvider implements OCRProvider {
  private readonly language: string;
  private readonly workerPath: string;

  constructor(private readonly options: TesseractOcrOptions = {}) {
    this.language = options.language ?? 'eng';
    this.workerPath =
      options.workerPath ?? require.resolve('tesseract.js/src/worker-script/node/index.js');
  }

  name(): string {
    return 'tesseract';
  }

  async extract(input: OCRInput): Promise<OCRResult> {
    if (!OCR_IMAGE_MIME_TYPES.includes(input.mimeType as (typeof OCR_IMAGE_MIME_TYPES)[number])) {
      throw new Error(`OCR requires a raster image; unsupported mime type: ${input.mimeType}`);
    }

    const worker = await this.createWorker(input.language ?? this.language);
    try {
      const { data } = await worker.recognize(new Uint8Array(input.buffer));
      const pages: OCRPageResult[] = [{ text: data.text.trim(), confidence: data.confidence ?? 0 }];
      return {
        text: data.text.trim(),
        confidence: data.confidence ?? 0,
        provider: this.name(),
        pages,
      };
    } finally {
      await worker.terminate();
    }
  }

  private async createWorker(language: string): Promise<Worker> {
    return createWorker(language, 1, {
      langPath: this.options.langPath,
      workerPath: this.workerPath,
    });
  }
}

export function createOcrProvider(): OCRProvider {
  return new TesseractOcrProvider();
}
