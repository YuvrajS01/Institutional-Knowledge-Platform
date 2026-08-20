import { describe, expect, it, vi } from 'vitest';

import { createMockLLMProvider } from '@ikp/processing';

import { RagAnswerService } from './rag-answer.service.js';

describe('RagAnswerService (P8-006) — unit', () => {
  it('returns grounded answer with citations when documents retrieved', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = {
      retrieve: vi.fn(async () => [
        {
          document_id: 'doc-1',
          title: 'Examination Form Notice',
          hybrid_score: 0.9,
          lexical_score: 0.5,
          semantic_score: 0.9,
          match_reasons: ['lexical', 'semantic'],
          department_id: null,
          published_at: new Date(),
          slug: 'examination-form-notice',
          document_type: 'NOTICE',
          status: 'PUBLISHED',
        },
      ]),
    } as unknown as ConstructorParameters<typeof RagAnswerService>[0] extends never ? never : never;

    const mockContextBuilder = {
      build: vi.fn((query: string) => ({
        systemPrompt: 'system',
        userPrompt: `Question: ${query} [1] Examination Form Notice`,
        citations: [{ document_id: 'doc-1', title: 'Examination Form Notice', page_number: 1 }],
        tokenEstimate: 100,
      })),
    } as unknown as ConstructorParameters<typeof RagAnswerService>[0] extends never ? never : never;

    const mockLLM = createMockLLMProvider();
    // Mock LLM will return grounded answer for this prompt (contains "examination")
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
    expect(result.citations[0]!.document_id).toBe('doc-1');
  });

  it('returns unsupported answer when no documents retrieved', async () => {
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
        text: "I couldn't find an official institutional document confirming this.",
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
    expect(result.answer).toBe("I couldn't find an official institutional document confirming this.");
    expect(result.citations).toHaveLength(0);
  });

  it('throws for empty question', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const service = new RagAnswerService(pool as never);
    await expect(
      service.answer({ institutionId: 'inst', userId: 'user', role: 'STUDENT' }, '   '),
    ).rejects.toThrow(/non-empty string/);
  });

  it('validates citations from LLM response', async () => {
    const pool = { query: vi.fn() } as unknown as ConstructorParameters<typeof RagAnswerService>[0];
    const mockRetrieval = {
      retrieve: vi.fn(async () => [
        {
          document_id: 'doc-1',
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
          document_id: 'doc-2',
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
          { document_id: 'doc-1', title: 'Doc 1', page_number: 1 },
          { document_id: 'doc-2', title: 'Doc 2', page_number: 1 },
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
    expect(result.citations[0]!.document_id).toBe('doc-1');
    expect(result.citations[1]!.document_id).toBe('doc-2');
  });
});
