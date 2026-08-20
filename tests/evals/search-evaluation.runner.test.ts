import { describe, expect, it } from 'vitest';

import { evaluateSearch } from './search-evaluation.runner.js';

describe('search-evaluation.runner (P5-014)', () => {
  it('computes Recall@5, MRR, NDCG for perfect match', async () => {
    const dataset = [
      {
        id: '1',
        query: 'hello',
        query_type: 'exact',
        expected_titles: ['Doc A'],
        language: 'en',
        difficulty: 'easy',
        department: null,
      },
    ];
    const metrics = await evaluateSearch(dataset, async () => [{ document_id: '1', title: 'Doc A' }]);
    expect(metrics.recall_at_5).toBe(1);
    expect(metrics.mrr).toBe(1);
    expect(metrics.ndcg_at_5).toBe(1);
    expect(metrics.zero_result_rate).toBe(0);
  });

  it('computes zero-result and no-answer handling', async () => {
    const dataset = [
      {
        id: 'no-answer',
        query: 'no match',
        query_type: 'no_answer',
        expected_titles: [],
        language: 'en',
        difficulty: 'hard',
        department: null,
      },
    ];
    const metrics = await evaluateSearch(dataset, async () => []);
    expect(metrics.recall_at_5).toBe(1);
    expect(metrics.mrr).toBe(1);
    expect(metrics.zero_result_rate).toBe(1);
  });

  it('computes Recall@5 with partial hits', async () => {
    const dataset = [
      {
        id: '1',
        query: 'test',
        query_type: 'natural',
        expected_titles: ['Doc A', 'Doc B'],
        language: 'en',
        difficulty: 'medium',
        department: null,
      },
    ];
    const metrics = await evaluateSearch(dataset, async () => [
      { document_id: '1', title: 'Doc A' },
      { document_id: '2', title: 'Other' },
    ]);
    expect(metrics.recall_at_5).toBe(0.5);
    expect(metrics.recall_at_10).toBe(0.5);
    expect(metrics.mrr).toBe(1);
  });

  it('computes NDCG correctly', async () => {
    const dataset = [
      {
        id: '1',
        query: 'test',
        query_type: 'exact',
        expected_titles: ['Doc A'],
        language: 'en',
        difficulty: 'easy',
        department: null,
      },
    ];
    // Returned at rank 2, so RR=0.5, NDCG should be about 0.63
    const metrics = await evaluateSearch(dataset, async () => [
      { document_id: '2', title: 'Other' },
      { document_id: '1', title: 'Doc A' },
    ]);
    expect(metrics.mrr).toBe(0.5);
    expect(metrics.ndcg_at_5).toBeCloseTo(0.63, 1);
  });
});
