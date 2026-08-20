import { describe, expect, it, vi } from 'vitest';

import { createChunker, createMockEmbeddingProvider } from '@ikp/processing';

import { DocumentChunksRepository } from './document-chunks.repository.js';
import { ProcessingService } from './processing.service.js';

function makeMockPool(overrides: Record<string, unknown> = {}) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      // Handle findVersion
      if (sql.includes('FROM document_versions v') && sql.includes('JOIN documents d')) {
        if (sql.includes('SELECT v.id')) {
          // findVersion
          return {
            rows: [
              {
                id: 'version-1',
                document_id: 'doc-1',
                version_number: 1,
                storage_key: 'test/original.pdf',
                mime_type: 'application/pdf',
                extracted_text: null,
                ocr_status: null,
                processing_status: 'QUEUED',
                ...overrides,
              },
            ],
            rowCount: 1,
          };
        }
        // markProcessing or updateProcessingResult — return empty
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
    end: vi.fn(async () => undefined),
    __queries: queries,
  };
  return pool as unknown as ConstructorParameters<typeof ProcessingService>[0] & { __queries: typeof queries };
}

function makeMockStorage(textBuffer: Buffer, mimeType = 'application/pdf') {
  return {
    get: vi.fn(async () => ({ body: textBuffer, contentType: mimeType, sizeBytes: textBuffer.byteLength })),
    put: vi.fn(async () => undefined),
    head: vi.fn(async () => ({ sizeBytes: textBuffer.byteLength, contentType: mimeType })),
    delete: vi.fn(async () => undefined),
  } as unknown as ConstructorParameters<typeof ProcessingService>[1];
}

describe('ProcessingService — chunk + embedding (P5-004)', () => {
  it('chunks text and stores embeddings via provider', async () => {
    const pool = makeMockPool();
    const text = 'Examination Form Submission Notice. '.repeat(100); // long enough to chunk into multiple
    const textBuffer = Buffer.from('%PDF fake'); // content doesn't matter because we mock extractor
    const storage = makeMockStorage(textBuffer);
    const textExtractor = {
      extract: vi.fn(async () => ({ text, pages: [text], pageCount: 1, method: 'native' as const })),
    };
    const ocrProvider = { extract: vi.fn(), name: () => 'mock' };

    const chunker = createChunker();
    const embeddingProvider = createMockEmbeddingProvider();
    const chunksRepository = {
      deleteByVersion: vi.fn(async () => undefined),
      createMany: vi.fn(async () => []),
      listByVersion: vi.fn(async () => []),
      countByVersion: vi.fn(async () => 0),
    } as unknown as DocumentChunksRepository;

    const service = new ProcessingService(pool, storage, textExtractor as never, ocrProvider as never, {
      chunker,
      embeddingProvider,
      chunksRepository,
    });

    await service.processJob({
      job_id: 'job-1',
      institution_id: 'inst-1',
      document_id: 'doc-1',
      version_id: 'version-1',
      attempt: 1,
      payload: {},
    });

    // Extractor called
    expect(textExtractor.extract).toHaveBeenCalled();
    // Storage put for extracted.txt
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringContaining('extracted.txt') }),
    );
    // Embedding provider called with chunk texts
    // Verify chunksRepository was called
    expect(chunksRepository.deleteByVersion).toHaveBeenCalledWith('version-1');
    expect(chunksRepository.createMany).toHaveBeenCalledTimes(1);
    const createArgs = (chunksRepository.createMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Array<{ content: string; embedding: number[] | null; token_count: number }>,
    ];
    expect(createArgs[0]).toBe('version-1');
    expect(createArgs[1].length).toBeGreaterThan(1);
    for (const chunk of createArgs[1]) {
      expect(chunk.embedding).not.toBeNull();
      expect(chunk.embedding).toHaveLength(1024);
      expect(typeof chunk.content).toBe('string');
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });

  it('produces zero chunks and deletes stale chunks when text is empty', async () => {
    const pool = makeMockPool();
    const storage = makeMockStorage(Buffer.from('%PDF'));
    const textExtractor = {
      extract: vi.fn(async () => ({ text: '   ', pages: [], pageCount: 1, method: 'native' as const })),
    };
    const ocrProvider = { extract: vi.fn(), name: () => 'mock' };
    const embeddingProvider = createMockEmbeddingProvider();
    const chunksRepository = {
      deleteByVersion: vi.fn(async () => undefined),
      createMany: vi.fn(async () => []),
    } as unknown as DocumentChunksRepository;

    const service = new ProcessingService(pool, storage, textExtractor as never, ocrProvider as never, {
      embeddingProvider,
      chunksRepository,
    });

    await service.processJob({
      job_id: 'job-1',
      institution_id: 'inst-1',
      document_id: 'doc-1',
      version_id: 'version-1',
      attempt: 1,
      payload: {},
    });

    expect(chunksRepository.deleteByVersion).toHaveBeenCalledWith('version-1');
    expect(chunksRepository.createMany).not.toHaveBeenCalled();
    // No extracted.txt for empty text
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('throws when embedding provider returns wrong count', async () => {
    const pool = makeMockPool();
    const text = 'Hello world. '.repeat(50);
    const storage = makeMockStorage(Buffer.from('pdf'));
    const textExtractor = {
      extract: vi.fn(async () => ({ text, pages: [text], pageCount: 1, method: 'native' as const })),
    };
    const ocrProvider = { extract: vi.fn(), name: () => 'mock' };
    const badEmbeddingProvider = {
      modelName: () => 'bad',
      dimensions: () => 1024,
      embed: vi.fn(async (texts: string[]) => texts.slice(0, -1).map(() => Array(1024).fill(0))), // one short
    };
    const chunksRepository = {
      deleteByVersion: vi.fn(async () => undefined),
      createMany: vi.fn(async () => []),
    } as unknown as DocumentChunksRepository;

    const service = new ProcessingService(pool, storage, textExtractor as never, ocrProvider as never, {
      embeddingProvider: badEmbeddingProvider as never,
      chunksRepository,
    });

    await expect(
      service.processJob({
        job_id: 'job-1',
        institution_id: 'inst-1',
        document_id: 'doc-1',
        version_id: 'version-1',
        attempt: 1,
        payload: {},
      }),
    ).rejects.toThrow(/Embedding provider returned/);
  });

  it('is idempotent: second call for COMPLETED version does not re-embed', async () => {
    const pool = makeMockPool({ processing_status: 'COMPLETED' });
    const storage = makeMockStorage(Buffer.from('pdf'));
    const textExtractor = { extract: vi.fn(async () => ({ text: 'hi', pages: ['hi'], pageCount: 1, method: 'native' as const })) };
    const ocrProvider = { extract: vi.fn(), name: () => 'mock' };
    const embeddingProvider = createMockEmbeddingProvider();
    const embedSpy = vi.spyOn(embeddingProvider, 'embed');
    const chunksRepository = {
      deleteByVersion: vi.fn(async () => undefined),
      createMany: vi.fn(async () => []),
    } as unknown as DocumentChunksRepository;

    const service = new ProcessingService(pool, storage, textExtractor as never, ocrProvider as never, {
      embeddingProvider,
      chunksRepository,
    });

    await service.processJob({
      job_id: 'job-1',
      institution_id: 'inst-1',
      document_id: 'doc-1',
      version_id: 'version-1',
      attempt: 1,
      payload: {},
    });

    expect(textExtractor.extract).not.toHaveBeenCalled();
    expect(embedSpy).not.toHaveBeenCalled();
    expect(chunksRepository.createMany).not.toHaveBeenCalled();
  });

  it('uses page-aware chunking when pages array is provided', async () => {
    const pool = makeMockPool();
    const pages = [
      'Page one examination notice '.repeat(30),
      'Page two hostel circular '.repeat(30),
    ];
    const text = pages.join('\n\n');
    const storage = makeMockStorage(Buffer.from('pdf'));
    const textExtractor = {
      extract: vi.fn(async () => ({ text, pages, pageCount: 2, method: 'native' as const })),
    };
    const ocrProvider = { extract: vi.fn(), name: () => 'mock' };
    const embeddingProvider = createMockEmbeddingProvider();
    const chunksRepository = {
      deleteByVersion: vi.fn(async () => undefined),
      createMany: vi.fn(async () => []),
    } as unknown as DocumentChunksRepository;
    const chunker = createChunker();

    const service = new ProcessingService(pool, storage, textExtractor as never, ocrProvider as never, {
      chunker,
      embeddingProvider,
      chunksRepository,
    });

    await service.processJob({
      job_id: 'job-1',
      institution_id: 'inst-1',
      document_id: 'doc-1',
      version_id: 'version-1',
      attempt: 1,
      payload: {},
    });

    const createArgs = (chunksRepository.createMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Array<{ page_number: number | null }>,
    ];
    const chunks = createArgs[1];
    expect(chunks.length).toBeGreaterThan(1);
    const pageNumbers = new Set(chunks.map((c) => c.page_number));
    expect(pageNumbers.has(1)).toBe(true);
    expect(pageNumbers.has(2)).toBe(true);
  });
});

describe('DocumentChunksRepository — vector formatting (unit)', () => {
  it('formats embedding as pgvector string and uses ::vector cast', async () => {
    const queryMock = vi.fn(async () => ({ rows: [] }));
    const pool = { query: queryMock, end: vi.fn() } as unknown as DocumentChunksRepository['pool'];
    const repo = new DocumentChunksRepository(pool as never);

    const embedding = Array.from({ length: 4 }, (_, i) => i * 0.1);
    await repo.createMany('ver-1', [
      { page_number: 1, chunk_index: 0, content: 'hello', token_count: 2, embedding, metadata: { foo: 'bar' } },
    ]);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('::vector');
    expect(sql).toContain('INSERT INTO document_chunks');
    // params: documentVersionId, page_number, chunk_index, content, token_count, embeddingString, metadata
    expect(params[0]).toBe('ver-1');
    expect(params[5]).toBe(`[${embedding.join(',')}]`);
    expect(params[6]).toEqual({ foo: 'bar' });
  });

  it('stores null for missing embedding', async () => {
    const queryMock = vi.fn(async () => ({ rows: [] }));
    const pool = { query: queryMock, end: vi.fn() } as unknown as DocumentChunksRepository['pool'];
    const repo = new DocumentChunksRepository(pool as never);

    await repo.createMany('ver-1', [
      { page_number: 1, chunk_index: 0, content: 'hello', token_count: 2, embedding: null, metadata: {} },
    ]);

    const [, params] = queryMock.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[5]).toBeNull();
  });
});
