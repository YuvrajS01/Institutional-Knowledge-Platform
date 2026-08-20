import { describe, expect, it, vi } from 'vitest';

import { createMockLLMProvider } from '@ikp/processing';

import { UNSUPPORTED_ANSWER } from './citation.js';
import { RagAnswerService } from './rag-answer.service.js';

const DOC1_ID = '11111111-1111-4111-a111-111111111111';
const DOC2_ID = '22222222-2222-4222-a222-222222222222';
const VER1_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const VER2_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const CHUNK1_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

describe('RagAnswerService (P8-006) — unit', () => {
  it('returns grounded answer with citations when documents retrieved', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = {
      retrieve: vi.fn(async () => [
        {
          document_id: DOC1_ID,
          title: 'Examination Form Notice',
          document_title: 'Examination Form Notice',
          hybrid_score: 0.9,
          lexical_score: 0.5,
          semantic_score: 0.9,
          match_reasons: ['lexical', 'semantic'],
          department_id: null,
          published_at: new Date(),
          slug: 'examination-form-notice',
          document_type: 'NOTICE',
          status: 'PUBLISHED',
          version_id: VER1_ID,
          chunk_id: CHUNK1_ID,
          page_number: 1,
        },
      ]),
    } as unknown as ConstructorParameters<typeof RagAnswerService>[0] extends never ? never : never;

    const mockContextBuilder = {
      build: vi.fn((query: string) => ({
        systemPrompt: 'system',
        userPrompt: `Question: ${query} [1] Examination Form Notice`,
        citations: [
          {
            document_id: DOC1_ID,
            document_title: 'Examination Form Notice',
            version_id: VER1_ID,
            page: 1,
            chunk_id: CHUNK1_ID,
            title: 'Examination Form Notice',
            page_number: 1,
          },
        ],
        tokenEstimate: 100,
      })),
    } as unknown as ConstructorParameters<typeof RagAnswerService>[0] extends never ? never : never;

    const mockLLM = createMockLLMProvider();
    const service = new RagAnswerService(pool as never, {
      retrievalService: mockRetrieval as never,
      contextBuilder: mockContextBuilder as never,
      llmProvider: mockLLM,
    });

    const result = await service.answer(
      { institutionId: '00000000-0000-4000-a000-000000000001', userId: 'user-1', role: 'STUDENT' },
      'When is the examination form deadline?',
    );

    expect(result.grounded).toBe(true);
    expect(result.confidence).toBe('high');
    expect(result.answer).toContain('18 August 2026');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.document_id).toBe(DOC1_ID);
    expect(result.citations[0]!.document_title).toBe('Examination Form Notice');
    expect(result.citations[0]!.version_id).toBe(VER1_ID);
    expect(result.citations[0]!.page).toBe(1);
    // legacy aliases still present
    expect((result.citations[0] as unknown as Record<string, unknown>).title).toBe(
      'Examination Form Notice',
    );
  });

  it('returns unsupported answer when no documents retrieved (P8-008)', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = {
      retrieve: vi.fn(async () => []),
    } as unknown as never;
    const mockContextBuilder = {
      build: vi.fn(() => ({
        systemPrompt: 'system',
        userPrompt: 'No docs',
        citations: [],
        tokenEstimate: 50,
      })),
    } as unknown as never;
    const mockLLM = {
      modelName: () => 'mock',
      generate: vi.fn(async () => ({
        text: UNSUPPORTED_ANSWER,
        model: 'mock',
      })),
    } as unknown as never;

    const service = new RagAnswerService(pool as never, {
      retrievalService: mockRetrieval as never,
      contextBuilder: mockContextBuilder as never,
      llmProvider: mockLLM as never,
    });

    const result = await service.answer(
      { institutionId: '00000000-0000-4000-a000-000000000001', userId: 'user-1', role: 'STUDENT' },
      'What is the unknown no-answer thing?',
    );

    expect(result.grounded).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.answer).toBe(UNSUPPORTED_ANSWER);
    expect(result.citations).toHaveLength(0);
  });

  it('throws for empty question', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const service = new RagAnswerService(pool as never);
    await expect(
      service.answer({ institutionId: 'inst', userId: 'user', role: 'STUDENT' }, '   '),
    ).rejects.toThrow(/non-empty string/);
  });

  it('validates citations from LLM response (P8-007)', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = {
      retrieve: vi.fn(async () => [
        {
          document_id: DOC1_ID,
          title: 'Doc 1',
          hybrid_score: 0.9,
          lexical_score: 0.5,
          semantic_score: 0.9,
          match_reasons: ['lexical'],
          department_id: null,
          published_at: new Date(),
          slug: 'doc-1',
          document_type: 'NOTICE',
          status: 'PUBLISHED',
        },
        {
          document_id: DOC2_ID,
          title: 'Doc 2',
          hybrid_score: 0.8,
          lexical_score: 0.4,
          semantic_score: 0.8,
          match_reasons: ['semantic'],
          department_id: null,
          published_at: new Date(),
          slug: 'doc-2',
          document_type: 'NOTICE',
          status: 'PUBLISHED',
        },
      ]),
    } as unknown as never;
    const mockContextBuilder = {
      build: vi.fn(() => ({
        systemPrompt: 'system',
        userPrompt: 'user',
        citations: [
          {
            document_id: DOC1_ID,
            document_title: 'Doc 1',
            version_id: VER1_ID,
            page: 1,
            chunk_id: CHUNK1_ID,
            title: 'Doc 1',
            page_number: 1,
          },
          {
            document_id: DOC2_ID,
            document_title: 'Doc 2',
            version_id: VER2_ID,
            page: 2,
            title: 'Doc 2',
            page_number: 2,
          },
        ],
        tokenEstimate: 100,
      })),
    } as unknown as never;
    const mockLLM = {
      modelName: () => 'mock',
      generate: vi.fn(async () => ({
        text: 'Answer with citations [1] and [2].',
        model: 'mock',
      })),
    } as unknown as never;

    const service = new RagAnswerService(pool as never, {
      retrievalService: mockRetrieval as never,
      contextBuilder: mockContextBuilder as never,
      llmProvider: mockLLM as never,
    });

    const result = await service.answer(
      { institutionId: 'inst', userId: 'user', role: 'STUDENT' },
      'test question',
    );

    expect(result.citations).toHaveLength(2);
    expect(result.citations[0]!.document_id).toBe(DOC1_ID);
    expect(result.citations[0]!.document_title).toBe('Doc 1');
    expect(result.citations[0]!.version_id).toBe(VER1_ID);
    expect(result.citations[0]!.page).toBe(1);
    expect(result.citations[1]!.document_id).toBe(DOC2_ID);
    expect(result.citations[1]!.version_id).toBe(VER2_ID);
    expect(result.citations[1]!.page).toBe(2);
  });

  it('filters citations to only those cited by LLM [n] markers (P8-007)', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = {
      retrieve: vi.fn(async () => [
        {
          document_id: DOC1_ID,
          title: 'Doc 1',
          hybrid_score: 0.9,
          lexical_score: 0.5,
          semantic_score: 0.9,
          match_reasons: ['lexical'],
          department_id: null,
          published_at: new Date(),
          slug: 'doc-1',
          document_type: 'NOTICE',
          status: 'PUBLISHED',
        },
        {
          document_id: DOC2_ID,
          title: 'Doc 2',
          hybrid_score: 0.8,
          lexical_score: 0.4,
          semantic_score: 0.8,
          match_reasons: ['semantic'],
          department_id: null,
          published_at: new Date(),
          slug: 'doc-2',
          document_type: 'NOTICE',
          status: 'PUBLISHED',
        },
      ]),
    } as unknown as never;
    const mockContextBuilder = {
      build: vi.fn(() => ({
        systemPrompt: 'system',
        userPrompt: 'user',
        citations: [
          {
            document_id: DOC1_ID,
            document_title: 'Doc 1',
            version_id: VER1_ID,
            page: 1,
            title: 'Doc 1',
            page_number: 1,
          },
          {
            document_id: DOC2_ID,
            document_title: 'Doc 2',
            version_id: VER2_ID,
            page: null,
            title: 'Doc 2',
            page_number: null,
          },
        ],
        tokenEstimate: 100,
      })),
    } as unknown as never;
    const mockLLM = {
      modelName: () => 'mock',
      generate: vi.fn(async () => ({
        text: 'Only [2] is relevant.',
        model: 'mock',
      })),
    } as unknown as never;

    const service = new RagAnswerService(pool as never, {
      retrievalService: mockRetrieval as never,
      contextBuilder: mockContextBuilder as never,
      llmProvider: mockLLM as never,
    });

    const result = await service.answer(
      { institutionId: 'inst', userId: 'user', role: 'STUDENT' },
      'filter test',
    );
    expect(result.grounded).toBe(true);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.document_id).toBe(DOC2_ID);
    expect(result.citations[0]!.page).toBeNull();
  });

  it('ignores hallucinated [99] citation indices (P8-007)', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = {
      retrieve: vi.fn(async () => [
        {
          document_id: DOC1_ID,
          title: 'Doc 1',
          hybrid_score: 0.9,
          lexical_score: 0.5,
          semantic_score: 0.9,
          match_reasons: ['lexical'],
          department_id: null,
          published_at: new Date(),
          slug: 'doc-1',
          document_type: 'NOTICE',
          status: 'PUBLISHED',
        },
      ]),
    } as unknown as never;
    const mockContextBuilder = {
      build: vi.fn(() => ({
        systemPrompt: 'system',
        userPrompt: 'user',
        citations: [
          {
            document_id: DOC1_ID,
            document_title: 'Doc 1',
            version_id: VER1_ID,
            page: 1,
            title: 'Doc 1',
            page_number: 1,
          },
        ],
        tokenEstimate: 100,
      })),
    } as unknown as never;
    const mockLLM = {
      modelName: () => 'mock',
      generate: vi.fn(async () => ({
        text: 'Hallucinated [99] and real content.',
        model: 'mock',
      })),
    } as unknown as never;
    const service = new RagAnswerService(pool as never, {
      retrievalService: mockRetrieval as never,
      contextBuilder: mockContextBuilder as never,
      llmProvider: mockLLM as never,
    });
    const result = await service.answer(
      { institutionId: 'inst', userId: 'user', role: 'STUDENT' },
      'hallucination',
    );
    // Conservative: when no valid markers but grounded, return all citations
    expect(result.grounded).toBe(true);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.document_id).toBe(DOC1_ID);
  });

  it('returns unsupported when LLM hallucinates malformed citation contract (P8-007 fail-closed)', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = {
      retrieve: vi.fn(async () => [
        {
          document_id: DOC1_ID,
          title: 'Doc 1',
          hybrid_score: 0.9,
          lexical_score: 0.5,
          semantic_score: 0.9,
          match_reasons: ['lexical'],
          department_id: null,
          published_at: new Date(),
          slug: 'doc-1',
          document_type: 'NOTICE',
          status: 'PUBLISHED',
        },
      ]),
    } as unknown as never;
    const mockContextBuilder = {
      build: vi.fn(() => ({
        systemPrompt: 'system',
        userPrompt: 'user',
        citations: [
          {
            document_id: DOC1_ID,
            document_title: 'Doc 1',
            version_id: '' as string,
            page: 1,
            title: 'Doc 1',
            page_number: 1,
          },
        ],
        tokenEstimate: 100,
      })),
    } as unknown as never;
    const mockLLM = {
      modelName: () => 'mock',
      generate: vi.fn(async () => ({ text: 'Answer [1]', model: 'mock' })),
    } as unknown as never;
    const service = new RagAnswerService(pool as never, {
      retrievalService: mockRetrieval as never,
      contextBuilder: mockContextBuilder as never,
      llmProvider: mockLLM as never,
    });
    const result = await service.answer(
      { institutionId: 'inst', userId: 'user', role: 'STUDENT' },
      'bad version',
    );
    expect(result.grounded).toBe(false);
    expect(result.answer).toBe(UNSUPPORTED_ANSWER);
    expect(result.citations).toHaveLength(0);
  });

  it('unsupported answer is exact spec string when retrieval empty even if LLM tries to answer (P8-008)', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = { retrieve: vi.fn(async () => []) } as unknown as never;
    const mockContextBuilder = {
      build: vi.fn(() => ({
        systemPrompt: 'system',
        userPrompt: 'No docs',
        citations: [],
        tokenEstimate: 50,
      })),
    } as unknown as never;
    const mockLLM = {
      modelName: () => 'mock',
      generate: vi.fn(async () => ({ text: 'Fake answer [1] 18 August 2026', model: 'mock' })),
    } as unknown as never;
    const service = new RagAnswerService(pool as never, {
      retrievalService: mockRetrieval as never,
      contextBuilder: mockContextBuilder as never,
      llmProvider: mockLLM as never,
    });
    const result = await service.answer(
      { institutionId: 'inst', userId: 'user', role: 'STUDENT' },
      'any question',
    );
    expect(result.answer).toBe(UNSUPPORTED_ANSWER);
    expect(result.grounded).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.citations).toHaveLength(0);
  });
});
