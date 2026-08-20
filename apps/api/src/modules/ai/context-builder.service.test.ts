import { describe, expect, it } from 'vitest';

import { ContextBuilderService } from './context-builder.service.js';

function makeDoc(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    document_id: '11111111-1111-4111-a111-111111111111',
    title: 'Examination Form Notice',
    document_title: 'Examination Form Notice',
    slug: 'examination-form-notice',
    document_type: 'NOTICE' as const,
    status: 'PUBLISHED' as const,
    department_id: null,
    published_at: new Date('2026-08-08T00:00:00Z'),
    version_id: '22222222-2222-4222-a222-222222222222',
    chunk_id: '33333333-3333-4333-a333-333333333333',
    page_number: 1 as number | null,
    lexical_score: 0.5,
    semantic_score: 0.9,
    hybrid_score: 0.8,
    match_reasons: ['lexical', 'semantic'] as string[],
  };
  // If overrides provide title but not document_title, sync them
  if (overrides.title && !overrides.document_title) {
    (overrides as Record<string, unknown>).document_title = overrides.title;
  }
  return {
    ...base,
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
    const doc = makeDoc({
      match_reasons: ['lexical'],
      hybrid_score: 0.5,
      lexical_score: 0.8,
      semantic_score: 0.2,
    });
    const result = builder.build('test', [doc]);
    expect(result.userPrompt).toContain('lexical');
    expect(result.userPrompt).toContain('0.500');
  });

  it('always includes at least one chunk even if token budget is tiny', () => {
    const doc = makeDoc();
    const result = builder.build('q', [doc], { maxTokens: 10 });
    expect(result.citations.length).toBe(1);
  });

  it('produces spec-compliant citations with version_id and page (P8-007)', () => {
    const doc = makeDoc({ document_id: '11111111-1111-4111-a111-111111111111', title: 'Spec Doc' });
    const result = builder.build('spec?', [doc]);
    const c = result.citations[0]!;
    expect(c.document_id).toBe('11111111-1111-4111-a111-111111111111');
    expect(c.document_title).toBe('Spec Doc');
    expect(c.version_id).toBe('22222222-2222-4222-a222-222222222222');
    expect(c.page).toBe(1);
    expect(c.chunk_id).toBe('33333333-3333-4333-a333-333333333333');
    // legacy aliases still present for backward compat
    expect((c as unknown as Record<string, unknown>).title).toBe('Spec Doc');
    expect((c as unknown as Record<string, unknown>).page_number).toBe(1);
  });

  it('includes version_id in context block for provenance', () => {
    const doc = makeDoc({ version_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' });
    const result = builder.build('provenance test', [doc]);
    expect(result.userPrompt).toContain('Version: aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(result.userPrompt).toContain('Page: 1');
  });
});
