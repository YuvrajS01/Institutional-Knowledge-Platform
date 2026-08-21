import { z } from 'zod';

/**
 * Reranker candidate — minimal fields needed for cross-encoder scoring.
 * Compatible with HybridSearch results and chunk content.
 */
export interface RerankCandidate {
  /** Unique candidate id (e.g., document_id or chunk id) */
  id: string;
  /** Text to score against query (title + chunk content) */
  content: string;
  /** Optional title for better scoring */
  title?: string | null;
  /** Optional pre-rerank hybrid score for fallback */
  score?: number | null;
}

export interface RerankedCandidate extends RerankCandidate {
  /** Reranker relevance score 0..1 (higher = more relevant) */
  rerankScore: number;
  /** Rank after reranking (0 = top) */
  rerankRank: number;
}

export const rerankCandidateSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  title: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
});

export const rerankedCandidateSchema = rerankCandidateSchema.extend({
  rerankScore: z.number().min(0).max(1),
  rerankRank: z.number().int().min(0),
});

/**
 * Provider-agnostic reranker contract (AI_LLM_ARCHITECTURE §10, §31,
 * IMPLEMENTATION_GUIDE §5, TECHNICAL_SPEC §10).
 *
 * Implementations must be swappable between local (BGE reranker via Ollama/vLLM)
 * and mock without changing callers (ADR-003/007). The reranker refines the
 * 20-100 candidates from hybrid retrieval to top 5-10 before context construction.
 */
export interface RerankerProvider {
  /** Human-readable model identifier, e.g. "bge-reranker-base" or "mock-bge-reranker" */
  modelName(): string;

  /**
   * Rerank candidates for a query.
   *
   * - `query` must be non-empty after trimming
   * - `candidates` may be empty → return []
   * - Returns same candidates ordered by relevance, each with `rerankScore` 0..1 and `rerankRank`
   * - Deterministic for same query+candidates where possible
   */
  rerank(query: string, candidates: RerankCandidate[]): Promise<RerankedCandidate[]>;
}

export interface RerankerProviderOptions {
  modelName?: string;
}
