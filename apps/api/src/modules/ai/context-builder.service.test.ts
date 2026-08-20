import { describe, expect, it } from 'vitest';

import { ContextBuilderService } from './context-builder.service.js';

function makeDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    document_id: 'doc-1',
    title: 'Examination Form Notice',
    slug: 'examination-form-notice',
    document_type: 'NOTICE' as const,
    status: 'PUBLISHED' as const,
    department_id: null,
    published_at: new Date('2026-08-08T00:00:00Z'),
    lexical_score: 0.5,
    semantic_score: 0.9,
    hybrid_score: 0.8,
    match_reasons: ['lexical', 'semantic'] as string[],
    ...overrides,
  } as unknown as Parameters<ContextBuilderService['build']>[1][number];
}

describe('ContextBuilderService (P8-005)', () => {
  const builder = new ContextBuilderService();

  it('throws for empty query', () => {
    expect(() => builder.build('   ', [])).toThrow(/non-empty string/);
    expect(() => builder.build('', [])).toThrow();
  });

  it('builds no-answer prompt when retrieved is empty', () => {
    const result = builder.build('When is the deadline?', []);
    expect(result.citations).toHaveLength(0);
    expect(result.userPrompt).toContain('No official documents were retrieved');
    expect(result.systemPrompt).toContain('Answer ONLY from the provided official documents');
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it('builds context with single chunk and citations', () => {
    const doc = makeDoc({ document_id: 'doc-1', title: 'Test Doc' });
    const result = builder.build('What is the deadline?', [doc]);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.document_id).toBe('doc-1');
    expect(result.userPrompt).toContain('Question: What is the deadline?');
    expect(result.userPrompt).toContain('[1] Test Doc');
    expect(result.userPrompt).toContain('Instructions: Answer the question using ONLY');
    expect(result.systemPrompt).toContain("I couldn't find");
  });

  it('respects maxChunks and maxTokens', () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      makeDoc({ document_id: `doc-${i}`, title: `Doc ${i}`, hybrid_score: 1 - i * 0.1 }),
    );
    const result = builder.build('query', docs, { maxChunks: 2, maxTokens: 200 });
    expect(result.citations.length).toBeLessThanOrEqual(2);
    expect(result.tokenEstimate).toBeLessThanOrEqual(200);
  });

  it('includes match reasons and scores', () => {
    const doc = makeDoc({ match_reasons: ['lexical'], hybrid_score: 0.5, lexical_score: 0.8, semantic_score: 0.2 });
    const result = builder.build('test', [doc]);
    expect(result.userPrompt).toContain('lexical');
    expect(result.userPrompt).toContain('0.500');
  });

  it('always includes at least one chunk even if token budget is tiny', () => {
    const doc = makeDoc();
    const result = builder.build('q', [doc], { maxTokens: 10 });
    expect(result.citations.length).toBe(1);
  });
});
