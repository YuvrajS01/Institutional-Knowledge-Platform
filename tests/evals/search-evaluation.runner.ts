/**
 * Search evaluation runner (P5-014).
 *
 * Computes standard retrieval metrics from a dataset of queries with expected
 * document titles/IDs and a search function that returns ranked results.
 *
 * Metrics (TECHNICAL_SPEC §28, TEST_STRATEGY §6):
 * - Recall@5 / Recall@10
 * - MRR (Mean Reciprocal Rank)
 * - NDCG@5 / NDCG@10
 * - Zero-result rate
 * - Search-to-open rate is tracked via analytics, not here
 */

export interface SearchEvaluationCase {
  id: string;
  query: string;
  query_type: string;
  expected_titles: string[];
  expected_ids?: string[];
  language: string;
  difficulty: string;
  department: string | null;
}

export interface SearchResult {
  document_id: string;
  title: string;
}

export interface SearchFunction {
  (query: string): Promise<SearchResult[]>;
}

export interface EvaluationMetrics {
  total: number;
  recall_at_5: number;
  recall_at_10: number;
  mrr: number;
  ndcg_at_5: number;
  ndcg_at_10: number;
  zero_result_rate: number;
  per_case: Array<{
    id: string;
    query: string;
    query_type: string;
    expected_titles: string[];
    returned_titles: string[];
    recall_at_5: number;
    recall_at_10: number;
    reciprocal_rank: number;
    ndcg_at_5: number;
    ndcg_at_10: number;
    is_zero_result: boolean;
  }>;
}

function recallAtK(expected: Set<string>, returned: string[], k: number): number {
  if (expected.size === 0) {
    // No-answer queries: recall is 1 if returned is empty, else 0 (we treat as not applicable)
    return returned.length === 0 ? 1 : 0;
  }
  const topK = new Set(returned.slice(0, k));
  let hits = 0;
  for (const exp of expected) {
    if (topK.has(exp)) hits++;
  }
  return hits / expected.size;
}

function reciprocalRank(expected: Set<string>, returned: string[]): number {
  if (expected.size === 0) {
    return returned.length === 0 ? 1 : 0;
  }
  for (let i = 0; i < returned.length; i++) {
    if (expected.has(returned[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function dcgAtK(expected: Set<string>, returned: string[], k: number): number {
  let dcg = 0;
  const topK = returned.slice(0, k);
  for (let i = 0; i < topK.length; i++) {
    const rel = expected.has(topK[i]!) ? 1 : 0;
    if (rel > 0) {
      dcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
    }
  }
  return dcg;
}

function idcgAtK(expected: Set<string>, k: number): number {
  const idealHits = Math.min(expected.size, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) {
    idcg += (Math.pow(2, 1) - 1) / Math.log2(i + 2);
  }
  return idcg;
}

function ndcgAtK(expected: Set<string>, returned: string[], k: number): number {
  if (expected.size === 0) {
    return returned.length === 0 ? 1 : 0;
  }
  const dcg = dcgAtK(expected, returned, k);
  const idcg = idcgAtK(expected, k);
  return idcg === 0 ? 0 : dcg / idcg;
}

export async function evaluateSearch(
  dataset: SearchEvaluationCase[],
  searchFn: SearchFunction,
): Promise<EvaluationMetrics> {
  const perCase = [];
  let sumRecall5 = 0;
  let sumRecall10 = 0;
  let sumMrr = 0;
  let sumNdcg5 = 0;
  let sumNdcg10 = 0;
  let zeroCount = 0;

  for (const testCase of dataset) {
    const results = await searchFn(testCase.query);
    const returnedTitles = results.map((r) => r.title);
    const expectedSet = new Set(testCase.expected_titles);

    const recall5 = recallAtK(expectedSet, returnedTitles, 5);
    const recall10 = recallAtK(expectedSet, returnedTitles, 10);
    const rr = reciprocalRank(expectedSet, returnedTitles);
    const ndcg5 = ndcgAtK(expectedSet, returnedTitles, 5);
    const ndcg10 = ndcgAtK(expectedSet, returnedTitles, 10);
    const isZero = returnedTitles.length === 0;

    if (isZero) zeroCount++;

    sumRecall5 += recall5;
    sumRecall10 += recall10;
    sumMrr += rr;
    sumNdcg5 += ndcg5;
    sumNdcg10 += ndcg10;

    perCase.push({
      id: testCase.id,
      query: testCase.query,
      query_type: testCase.query_type,
      expected_titles: testCase.expected_titles,
      returned_titles: returnedTitles,
      recall_at_5: recall5,
      recall_at_10: recall10,
      reciprocal_rank: rr,
      ndcg_at_5: ndcg5,
      ndcg_at_10: ndcg10,
      is_zero_result: isZero,
    });
  }

  const total = dataset.length;
  return {
    total,
    recall_at_5: total > 0 ? sumRecall5 / total : 0,
    recall_at_10: total > 0 ? sumRecall10 / total : 0,
    mrr: total > 0 ? sumMrr / total : 0,
    ndcg_at_5: total > 0 ? sumNdcg5 / total : 0,
    ndcg_at_10: total > 0 ? sumNdcg10 / total : 0,
    zero_result_rate: total > 0 ? zeroCount / total : 0,
    per_case: perCase,
  };
}

export function formatMetrics(metrics: EvaluationMetrics): string {
  const lines = [
    `Search Evaluation — ${metrics.total} cases`,
    `Recall@5: ${(metrics.recall_at_5 * 100).toFixed(1)}%`,
    `Recall@10: ${(metrics.recall_at_10 * 100).toFixed(1)}%`,
    `MRR: ${metrics.mrr.toFixed(3)}`,
    `NDCG@5: ${metrics.ndcg_at_5.toFixed(3)}`,
    `NDCG@10: ${metrics.ndcg_at_10.toFixed(3)}`,
    `Zero-result rate: ${(metrics.zero_result_rate * 100).toFixed(1)}%`,
    '',
    'Per-case:',
  ];
  for (const c of metrics.per_case) {
    lines.push(
      `- ${c.id} [${c.query_type}] "${c.query}" → Recall@5 ${c.recall_at_5.toFixed(2)} MRR ${c.reciprocal_rank.toFixed(2)} NDCG@5 ${c.ndcg_at_5.toFixed(2)} ${c.is_zero_result ? '(zero)' : ''}`,
    );
    if (c.expected_titles.length > 0) {
      lines.push(`  expected: ${c.expected_titles.join(', ')} | returned: ${c.returned_titles.slice(0, 5).join(', ')}`);
    }
  }
  return lines.join('\n');
}
