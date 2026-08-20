import { describe, expect, it, vi } from 'vitest';

import { createMockEmbeddingProvider } from '@ikp/processing';

import { HybridSearchService } from './hybrid-search.service.js';

describe('HybridSearchService (P5-007) — unit', () => {
  it('merges lexical and vector candidates and ranks hybrid', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof HybridSearchService>[0];
    const embeddingProvider = createMockEmbeddingProvider();

    const lexicalDocs = [
      {
        id: 'doc-lex',
        title: 'Lexical Match',
        slug: 'lexical-match',
        document_type: 'NOTICE' as const,
        status: 'PUBLISHED' as const,
        department_id: null,
        published_at: new Date('2026-08-10T00:00:00Z'),
        lexical_score: 0.8,
      },
      {
        id: 'doc-both',
        title: 'Both Lex and Vec',
        slug: 'both',
        document_type: 'NOTICE' as const,
        status: 'PUBLISHED' as const,
        department_id: null,
        published_at: new Date('2026-08-12T00:00:00Z'),
        lexical_score: 0.5,
      },
    ];

    const vectorChunks = [
      {
        document_id: 'doc-vec',
        document_title: 'Vector Match',
        document_slug: 'vector-match',
        document_type: 'NOTICE' as const,
        document_status: 'PUBLISHED' as const,
        department_id: null,
        published_at: new Date('2026-08-11T00:00:00Z'),
        chunk_id: 'c1',
        chunk_index: 0,
        page_number: 1,
        content: 'vec',
        token_count: 10,
        distance: 0.2,
        similarity: 0.8,
      },
      {
        document_id: 'doc-both',
        document_title: 'Both Lex and Vec',
        document_slug: 'both',
        document_type: 'NOTICE' as const,
        document_status: 'PUBLISHED' as const,
        department_id: null,
        published_at: new Date('2026-08-12T00:00:00Z'),
        chunk_id: 'c2',
        chunk_index: 0,
        page_number: 1,
        content: 'both',
        token_count: 10,
        distance: 0.1,
        similarity: 0.9,
      },
    ];

    const documentsRepository = {
      lexicalSearch: vi.fn(async () => lexicalDocs),
    } as unknown as ConstructorParameters<typeof HybridSearchService>[0] extends never ? never : never;
    const vectorRepository = {
      searchByEmbedding: vi.fn(async () => vectorChunks),
    } as unknown as ConstructorParameters<typeof HybridSearchService>[0] extends never ? never : never;

    const service = new HybridSearchService(pool as never, {
      embeddingProvider,
      documentsRepository: documentsRepository as never,
      vectorRepository: vectorRepository as never,
    });

    const results = await service.search('00000000-0000-4000-a000-000000000001', 'test query', {
      limit: 10,
    });

    // doc-both appears in both sets, should have highest hybrid (lex 0.5/0.8=0.625 *0.4 + sem 0.9/0.9=1 *0.6 = 0.85)
    // doc-lex: lex 0.8/0.8=1*0.4=0.4, sem 0 =>0.4
    // doc-vec: lex 0, sem 0.8/0.9=0.888*0.6=0.533
    // So order: doc-both (0.85), doc-vec (0.533), doc-lex (0.4)
    expect(results).toHaveLength(3);
    expect(results[0]!.document_id).toBe('doc-both');
    expect(results[0]!.lexical_score).toBe(0.5);
    expect(results[0]!.semantic_score).toBe(0.9);
    expect(results[0]!.hybrid_score).toBeGreaterThan(results[1]!.hybrid_score);
    expect(results[1]!.document_id).toBe('doc-vec');
    expect(results[2]!.document_id).toBe('doc-lex');
    expect(results[0]!.match_reasons).toEqual(expect.arrayContaining(['lexical', 'semantic']));
    expect(results[1]!.match_reasons).toEqual(['semantic']);
    expect(results[2]!.match_reasons).toEqual(['lexical']);
  });

  it('throws for empty query', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof HybridSearchService>[0];
    const service = new HybridSearchService(pool);
    await expect(service.search('00000000-0000-4000-a000-000000000001', '   ')).rejects.toThrow(/non-empty/);
  });

  it('returns vector-only results when lexical is empty', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof HybridSearchService>[0];
    const embeddingProvider = createMockEmbeddingProvider();
    const documentsRepository = { lexicalSearch: vi.fn(async () => []) } as never;
    const vectorRepository = {
      searchByEmbedding: vi.fn(async () => [
        {
          document_id: 'doc-1',
          document_title: 'Only Vector',
          document_slug: 'only-vector',
          document_type: 'NOTICE' as const,
          document_status: 'PUBLISHED' as const,
          department_id: null,
          published_at: null,
          chunk_id: 'c1',
          chunk_index: 0,
          page_number: 1,
          content: 'hi',
          token_count: 1,
          distance: 0.1,
          similarity: 0.9,
        },
      ]),
    } as never;
    const service = new HybridSearchService(pool as never, {
      embeddingProvider,
      documentsRepository: documentsRepository as never,
      vectorRepository: vectorRepository as never,
    });
    const results = await service.search('00000000-0000-4000-a000-000000000001', 'query');
    expect(results).toHaveLength(1);
    expect(results[0]!.document_id).toBe('doc-1');
    expect(results[0]!.lexical_score).toBe(0);
    expect(results[0]!.semantic_score).toBe(0.9);
  });

  it('exposes modelName and dimensions', () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof HybridSearchService>[0];
    const provider = createMockEmbeddingProvider({ modelName: 'custom', dimensions: 384 });
    const service = new HybridSearchService(pool as never, { embeddingProvider: provider });
    expect(service.modelName()).toBe('custom');
    expect(service.dimensions()).toBe(384);
  });
});
