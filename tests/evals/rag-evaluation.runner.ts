/**
 * RAG evaluation runner (P8-012).
 *
 * Computes RAG quality metrics from a dataset of queries with expected
 * grounding, citations, and facts, and a RAG function that returns
 * {answer, grounded, confidence, citations}.
 *
 * Metrics (AI_EVALUATION §4, TEST_STRATEGY):
 * - Grounded accuracy (did we correctly identify grounded vs unsupported)
 * - Citation correctness (expected titles match citations when grounded)
 * - Answer correctness (expected facts present when grounded, unsupported sentence when not)
 * - Unsupported claim rate
 * - Overall pass rate (all checks pass)
 */

import { UNSUPPORTED_ANSWER } from '../../apps/api/src/modules/ai/citation.js';

export interface RagEvaluationCase {
  id: string;
  query: string;
  query_type: string;
  expected_titles: string[];
  expected_facts: string[];
  expected_grounded: boolean;
  language: string;
  difficulty: string;
  department: string | null;
}

export interface RagResult {
  answer: string;
  grounded: boolean;
  confidence: string;
  citations: Array<{
    document_title: string;
    document_id: string;
    version_id?: string;
    page?: number | null;
  }>;
}

export type RagFunction = (query: string) => Promise<RagResult>;

export interface RagEvaluationMetrics {
  total: number;
  grounded_accuracy: number;
  citation_accuracy: number;
  answer_accuracy: number;
  unsupported_accuracy: number;
  overall_accuracy: number;
  per_case: Array<{
    id: string;
    query: string;
    query_type: string;
    expected_grounded: boolean;
    actual_grounded: boolean;
    grounded_correct: boolean;
    citation_correct: boolean;
    answer_correct: boolean;
    overall_pass: boolean;
    expected_titles: string[];
    actual_titles: string[];
    answer_snippet: string;
  }>;
}

function normalize(text: string): string {
  return text.toLowerCase();
}

function answerContainsFacts(answer: string, facts: string[]): boolean {
  if (facts.length === 0) return true;
  const lower = normalize(answer);
  return facts.every((f) => lower.includes(normalize(f)));
}

function citationCorrect(
  expectedTitles: string[],
  actualCitations: RagResult['citations'],
  expectedGrounded: boolean,
): boolean {
  if (!expectedGrounded) {
    // For no-answer/restricted, citations should be empty
    return actualCitations.length === 0;
  }
  if (expectedTitles.length === 0) return true;
  const actualTitles = new Set(actualCitations.map((c) => c.document_title));
  // At least one expected title should be in actual citations
  return expectedTitles.some((t) => actualTitles.has(t));
}

function unsupportedCorrect(expectedGrounded: boolean, actual: RagResult): boolean {
  if (!expectedGrounded) {
    return (
      !actual.grounded && actual.answer === UNSUPPORTED_ANSWER && actual.citations.length === 0
    );
  }
  // When expected grounded, we should not be unsupported
  return actual.grounded && actual.answer !== UNSUPPORTED_ANSWER;
}

export async function evaluateRag(
  dataset: RagEvaluationCase[],
  ragFn: RagFunction,
): Promise<RagEvaluationMetrics> {
  const perCase = [];
  let groundedCorrect = 0;
  let citationCorrectCount = 0;
  let answerCorrectCount = 0;
  let unsupportedCorrectCount = 0;
  let overallPass = 0;

  for (const testCase of dataset) {
    const result = await ragFn(testCase.query);
    const actualTitles = result.citations.map((c) => c.document_title);

    const groundedOk = result.grounded === testCase.expected_grounded;
    const citationOk = citationCorrect(
      testCase.expected_titles,
      result.citations,
      testCase.expected_grounded,
    );
    const answerOk = testCase.expected_grounded
      ? answerContainsFacts(result.answer, testCase.expected_facts) && result.grounded
      : result.answer === UNSUPPORTED_ANSWER;

    const unsupportedOk = unsupportedCorrect(testCase.expected_grounded, result);
    const overall = groundedOk && citationOk && answerOk;

    if (groundedOk) groundedCorrect++;
    if (citationOk) citationCorrectCount++;
    if (answerOk) answerCorrectCount++;
    if (unsupportedOk) unsupportedCorrectCount++;
    if (overall) overallPass++;

    perCase.push({
      id: testCase.id,
      query: testCase.query,
      query_type: testCase.query_type,
      expected_grounded: testCase.expected_grounded,
      actual_grounded: result.grounded,
      grounded_correct: groundedOk,
      citation_correct: citationOk,
      answer_correct: answerOk,
      overall_pass: overall,
      expected_titles: testCase.expected_titles,
      actual_titles: actualTitles,
      answer_snippet: result.answer.slice(0, 120),
    });
  }

  const total = dataset.length;
  return {
    total,
    grounded_accuracy: total ? groundedCorrect / total : 0,
    citation_accuracy: total ? citationCorrectCount / total : 0,
    answer_accuracy: total ? answerCorrectCount / total : 0,
    unsupported_accuracy: total ? unsupportedCorrectCount / total : 0,
    overall_accuracy: total ? overallPass / total : 0,
    per_case: perCase,
  };
}

export function formatRagMetrics(metrics: RagEvaluationMetrics): string {
  const lines = [
    `RAG Evaluation — ${metrics.total} cases`,
    `Grounded accuracy: ${(metrics.grounded_accuracy * 100).toFixed(1)}%`,
    `Citation accuracy: ${(metrics.citation_accuracy * 100).toFixed(1)}%`,
    `Answer accuracy: ${(metrics.answer_accuracy * 100).toFixed(1)}%`,
    `Unsupported accuracy: ${(metrics.unsupported_accuracy * 100).toFixed(1)}%`,
    `Overall accuracy: ${(metrics.overall_accuracy * 100).toFixed(1)}%`,
    '',
    'Per-case:',
  ];
  for (const c of metrics.per_case) {
    const status = c.overall_pass ? 'PASS' : 'FAIL';
    lines.push(
      `- ${c.id} [${c.query_type}] "${c.query}" → ${status} grounded:${c.actual_grounded} expected:${c.expected_grounded} citation:${c.citation_correct} answer:${c.answer_correct}`,
    );
    lines.push(
      `  expected titles: ${c.expected_titles.join(', ') || '(none)'} | actual: ${c.actual_titles.join(', ') || '(none)'}`,
    );
    lines.push(`  answer: ${c.answer_snippet}`);
  }
  return lines.join('\n');
}
