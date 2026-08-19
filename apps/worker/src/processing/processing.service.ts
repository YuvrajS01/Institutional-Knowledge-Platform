import type { JobData } from '@ikp/queue';
import {
  isTextAdequate,
  OCR_IMAGE_MIME_TYPES,
  type OCRProvider,
  type TextExtractor,
} from '@ikp/processing';
import { extractedTextKey, type ObjectStorage } from '@ikp/storage';

import type { WorkerDbPool } from '../db-pool.js';
import { ProcessingRepository } from './processing.repository.js';

/**
 * Document processing orchestration (TECH_SPEC §6/§7):
 *
 *   load version → verify tenant → download original → extract text
 *   → if inadequate and raster, OCR → persist extraction → write extracted.txt
 *
 * The pipeline is idempotent (already-completed versions are skipped) and
 * tenant-aware (every step is scoped by institution id).
 */
export class ProcessingService {
  private readonly repository: ProcessingRepository;

  constructor(
    private readonly pool: WorkerDbPool,
    private readonly storage: ObjectStorage,
    private readonly textExtractor: TextExtractor,
    private readonly ocrProvider: OCRProvider,
  ) {
    this.repository = new ProcessingRepository(pool);
  }

  async processJob(data: JobData): Promise<void> {
    const { institution_id: institutionId, document_id: documentId, version_id: versionId } = data;

    const target = await this.repository.findVersion(institutionId, documentId, versionId);
    if (!target) {
      throw new Error(`Document version ${versionId} not found in institution ${institutionId}.`);
    }

    if (target.processing_status === 'COMPLETED') {
      // Idempotent replay: the version was already processed.
      return;
    }

    await this.repository.markProcessing(institutionId, versionId, 'PROCESSING');

    const object = await this.storage.get(target.storage_key);
    if (!object) {
      throw new Error(`Original file missing from storage for version ${versionId}.`);
    }

    const extraction = await this.textExtractor.extract({
      buffer: object.body,
      mimeType: target.mime_type,
    });

    let text = extraction.text;
    let ocrStatus = 'NOT_REQUIRED';
    let pageCount = extraction.pageCount;

    if (!isTextAdequate(text, pageCount)) {
      if (
        OCR_IMAGE_MIME_TYPES.includes(target.mime_type as (typeof OCR_IMAGE_MIME_TYPES)[number])
      ) {
        // Direct raster image: OCR now (a single image is one page).
        const ocr = await this.ocrProvider.extract({
          buffer: object.body,
          mimeType: target.mime_type,
        });
        text = ocr.text || text;
        ocrStatus = 'COMPLETED';
        pageCount = 1;
      } else {
        // Scanned/typed PDF with no adequate native text: OCR is required
        // (rasterization is pending — see docs/BACKLOG.md).
        ocrStatus = 'REQUIRED';
      }
    }

    await this.repository.updateProcessingResult(institutionId, versionId, {
      text,
      ocrStatus,
      pageCount,
    });

    if (text.trim().length > 0) {
      await this.storage.put({
        key: extractedTextKey({
          institutionId,
          documentId,
          version: target.version_number,
        }),
        body: Buffer.from(text, 'utf8'),
        contentType: 'text/plain',
      });
    }
  }
}
