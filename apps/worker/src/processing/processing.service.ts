import type { JobData } from '@ikp/queue';
import {
  createChunker,
  createDateExtractor,
  createEmbeddingProvider,
  type Chunker,
  type DateExtractor,
  type EmbeddingProvider,
  isTextAdequate,
  OCR_IMAGE_MIME_TYPES,
  type OCRProvider,
  type TextExtractor,
} from '@ikp/processing';
import { extractedTextKey, type ObjectStorage } from '@ikp/storage';

import type { WorkerDbPool } from '../db-pool.js';
import { DocumentChunksRepository } from './document-chunks.repository.js';
import { ProcessingRepository } from './processing.repository.js';

/**
 * Document processing orchestration (TECH_SPEC §6/§7, P5-004):
 *
 *   load version → verify tenant → download original → extract text
 *   → if inadequate and raster, OCR → chunk → embed → persist extraction
 *   + chunks/embeddings → write extracted.txt
 *
 * The pipeline is idempotent (already-completed versions are skipped) and
 * tenant-aware (every step is scoped by institution id). Embeddings are
 * generated via the provider-agnostic `EmbeddingProvider` (mock by default,
 * local Ollama/OpenAI when `EMBEDDING_PROVIDER` is set) and stored in
 * `document_chunks.embedding vector(1024)` for hybrid search (P5-006/007).
 */
export class ProcessingService {
  private readonly repository: ProcessingRepository;
  private readonly chunksRepository: DocumentChunksRepository;
  private readonly chunker: Chunker;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly dateExtractor: DateExtractor;

  constructor(
    private readonly pool: WorkerDbPool,
    private readonly storage: ObjectStorage,
    private readonly textExtractor: TextExtractor,
    private readonly ocrProvider: OCRProvider,
    options?: {
      embeddingProvider?: EmbeddingProvider;
      chunker?: Chunker;
      chunksRepository?: DocumentChunksRepository;
      dateExtractor?: DateExtractor;
    },
  ) {
    this.repository = new ProcessingRepository(pool);
    this.chunksRepository = options?.chunksRepository ?? new DocumentChunksRepository(pool);
    this.chunker = options?.chunker ?? createChunker();
    this.embeddingProvider = options?.embeddingProvider ?? createEmbeddingProvider();
    this.dateExtractor = options?.dateExtractor ?? createDateExtractor();
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

    // Prepare chunks + embeddings before marking COMPLETED (so failure keeps PROCESSING for retry).
    let preparedChunks: Array<{
      page_number: number | null;
      chunk_index: number;
      content: string;
      token_count: number;
      embedding: number[] | null;
      metadata: Record<string, unknown>;
    }> | null = null;

    const trimmed = text.trim();
    if (trimmed.length > 0) {
      const rawChunks = this.chunker.chunk({
        text,
        pages: extraction.pages.length > 0 ? extraction.pages : undefined,
        pageCount,
      });
      if (rawChunks.length > 0) {
        const chunkTexts = rawChunks.map((c) => c.content);
        const embeddings = await this.embeddingProvider.embed(chunkTexts);
        if (embeddings.length !== rawChunks.length) {
          throw new Error(
            `Embedding provider returned ${embeddings.length} vectors for ${rawChunks.length} chunks`,
          );
        }
        preparedChunks = rawChunks.map((c, i) => ({
          page_number: c.pageNumber,
          chunk_index: c.chunkIndex,
          content: c.content,
          token_count: c.tokenCount,
          embedding: embeddings[i] ?? null,
          metadata: {},
        }));
      }
    }

    // Side effects before final status: storage + chunks (so retry can recover if they fail before COMPLETED).
    if (trimmed.length > 0) {
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

    // Replace chunks idempotently; delete first to handle reprocessing.
    if (preparedChunks !== null) {
      await this.chunksRepository.deleteByVersion(versionId);
      await this.chunksRepository.createMany(versionId, preparedChunks);
    } else {
      // No text or no chunks -> ensure no stale chunks remain.
      await this.chunksRepository.deleteByVersion(versionId);
    }

    // Extract important dates (heuristic or LLM) and persist to document_metadata.extracted_dates
    // Best-effort: never fail the pipeline for date extraction
    let extractedDates: unknown[] = [];
    if (trimmed.length > 0) {
      try {
        const filename = target.storage_key.split('/').pop() ?? null;
        const dateResult = await this.dateExtractor.extract({
          text,
          filename,
          mimeType: target.mime_type,
        });
        extractedDates = dateResult.dates.map((d) => ({
          raw: d.raw,
          isoDate: d.isoDate,
          iso_date: d.isoDate,
          label: d.label,
          type: d.type,
          context: d.context,
          confidence: d.confidence,
        }));
      } catch {
        // ignore date extraction failures
        extractedDates = [];
      }
    }
    try {
      await this.pool.query(
        `UPDATE document_metadata SET extracted_dates = $2::jsonb, updated_at = now() WHERE document_id = $1`,
        [documentId, JSON.stringify(extractedDates)],
      );
    } catch {
      // ignore metadata update failures (row may not exist yet for some test seeds)
    }

    await this.repository.updateProcessingResult(institutionId, versionId, {
      text,
      ocrStatus,
      pageCount,
    });
  }
}
