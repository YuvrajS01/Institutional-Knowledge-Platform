import { describe, expect, it, vi } from 'vitest';

import { createMockEmbeddingProvider } from '@ikp/processing';

import type { VectorSearchRepository } from './vector-search.repository.js';
import { VectorSearchService } from './vector-search.service.js';

describe('VectorSearchService (P5-006)', () => {
  it('embeds query and delegates to repository', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof VectorSearchService>[0];
    const embeddingProvider = createMockEmbeddingProvider();
    const embedSpy = vi.spyOn(embeddingProvider, 'embed');
    const repository = {
      searchByEmbedding: vi.fn(async () => [
        {
          document_id: 'doc-1',
          document_title: 'Test',
          document_slug: 'test',
          document_type: 'NOTICE',
          document_status: 'PUBLISHED',
          chunk_id: 'chunk-1',
          chunk_index: 0,
          page_number: 1,
          content: 'hello',
          token_count: 2,
          distance: 0.1,
          similarity: 0.9,
        },
      ]),
    } as unknown as VectorSearchRepository;

    const service = new VectorSearchService(pool, { embeddingProvider, repository });

    const results = await service.search('00000000-0000-4000-a000-000000000001', {
      text: 'examination form',
      limit: 5,
    });

    expect(embedSpy).toHaveBeenCalledWith(['examination form']);
    expect(repository.searchByEmbedding).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      expect.any(Array),
      expect.objectContaining({ limit: 5 }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.document_id).toBe('doc-1');
  });

  it('throws for empty query text', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof VectorSearchService>[0];
    const service = new VectorSearchService(pool);
    await expect(
      service.search('00000000-0000-4000-a000-000000000001', { text: '   ' }),
    ).rejects.toThrow(/non-empty string/);
  });

  it('exposes modelName and dimensions from provider', () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof VectorSearchService>[0];
    const provider = createMockEmbeddingProvider({ modelName: 'custom', dimensions: 384 });
    const service = new VectorSearchService(pool, { embeddingProvider: provider });
    expect(service.modelName()).toBe('custom');
    expect(service.dimensions()).toBe(384);
  });

  it('searchByEmbedding delegates directly', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof VectorSearchService>[0];
    const repository = {
      searchByEmbedding: vi.fn(async () => []),
    } as unknown as VectorSearchRepository;
    const service = new VectorSearchService(pool, { repository });
    const embedding = Array(1024).fill(0.1);
    await service.searchByEmbedding('00000000-0000-4000-a000-000000000001', embedding, { limit: 2 });
    expect(repository.searchByEmbedding).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      embedding,
      { limit: 2 },
    );
  });
});
