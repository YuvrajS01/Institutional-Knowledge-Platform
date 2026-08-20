import { describe, expect, it } from 'vitest';

import { evaluateRag } from './rag-evaluation.runner.js';

describe('rag-evaluation.runner (P8-012)', () => {
  it('computes perfect grounded + citation', async () => {
    const dataset = [
      {
        id: '1',
        query: 'When is examination deadline?',
        query_type: 'exact',
        expected_titles: ['Examination Form Notice'],
        expected_facts: ['18 August 2026'],
        expected_grounded: true,
        language: 'en',
        difficulty: 'easy',
        department: null,
      },
    ];
    const metrics = await evaluateRag(dataset, async () => ({
      answer: 'The deadline is 18 August 2026.',
      grounded: true,
      confidence: 'high',
      citations: [
        {
          document_id: '11111111-1111-4111-a111-111111111111',
          document_title: 'Examination Form Notice',
          version_id: '22222222-2222-4222-a222-222222222222',
          page: 1,
        },
      ],
    }));
    expect(metrics.grounded_accuracy).toBe(1);
    expect(metrics.citation_accuracy).toBe(1);
    expect(metrics.answer_accuracy).toBe(1);
    expect(metrics.overall_accuracy).toBe(1);
  });

  it('handles unsupported no-answer correctly', async () => {
    const dataset = [
      {
        id: 'no-answer',
        query: 'unknown no-answer',
        query_type: 'no_answer',
        expected_titles: [],
        expected_facts: [],
        expected_grounded: false,
        language: 'en',
        difficulty: 'hard',
        department: null,
      },
    ];
    const metrics = await evaluateRag(dataset, async () => ({
      answer: "I couldn't find an official institutional document confirming this.",
      grounded: false,
      confidence: 'low',
      citations: [],
    }));
    expect(metrics.grounded_accuracy).toBe(1);
    expect(metrics.citation_accuracy).toBe(1);
    expect(metrics.answer_accuracy).toBe(1);
    expect(metrics.overall_accuracy).toBe(1);
  });

  it('fails when citation missing for grounded', async () => {
    const dataset = [
      {
        id: '1',
        query: 'examination deadline',
        query_type: 'exact',
        expected_titles: ['Examination Form Notice'],
        expected_facts: ['18 August 2026'],
        expected_grounded: true,
        language: 'en',
        difficulty: 'easy',
        department: null,
      },
    ];
    const metrics = await evaluateRag(dataset, async () => ({
      answer: 'The deadline is 18 August 2026.',
      grounded: true,
      confidence: 'high',
      citations: [],
    }));
    expect(metrics.citation_accuracy).toBe(0);
    expect(metrics.overall_accuracy).toBe(0);
  });

  it('fails when answer missing fact', async () => {
    const dataset = [
      {
        id: '1',
        query: 'examination deadline',
        query_type: 'exact',
        expected_titles: ['Examination Form Notice'],
        expected_facts: ['18 August 2026'],
        expected_grounded: true,
        language: 'en',
        difficulty: 'easy',
        department: null,
      },
    ];
    const metrics = await evaluateRag(dataset, async () => ({
      answer: 'Some generic answer without date.',
      grounded: true,
      confidence: 'high',
      citations: [
        {
          document_id: '11111111-1111-4111-a111-111111111111',
          document_title: 'Examination Form Notice',
          version_id: '22222222-2222-4222-a222-222222222222',
          page: 1,
        },
      ],
    }));
    expect(metrics.answer_accuracy).toBe(0);
    expect(metrics.overall_accuracy).toBe(0);
  });
});
