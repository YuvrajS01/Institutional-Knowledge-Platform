/**
 * Embedding provider abstraction (TECHNICAL_SPEC §10, AI_LLM_ARCHITECTURE §7/§18,
 * IMPLEMENTATION_GUIDE §5).
 *
 * Provider-agnostic contract for converting text into dense vectors for
 * semantic search over `document_chunks.embedding vector(1024)` (P5-001).
 * Implementations must be swappable between local (BGE-M3, multilingual-e5)
 * and cloud providers without changing callers (ADR-003, ADR-007).
 */

export const EMBEDDING_DIMENSIONS_BGE_M3 = 1024;
export const EMBEDDING_DIMENSIONS_MINILM = 384;

export interface EmbeddingProvider {
  /** Human-readable model identifier, e.g. "BAAI/bge-m3" or "mock". */
  modelName(): string;

  /** Fixed output dimension for this provider (e.g., 1024 for BGE-M3). */
  dimensions(): number;

  /**
   * Embed a batch of texts into dense vectors.
   *
   * - Each input text should be non-empty after trimming; empty inputs may be
   *   rejected or returned as zero vectors by the provider.
   * - Returns exactly `texts.length` vectors, each of length `dimensions()`.
   * - Vectors should be L2-normalizable for cosine similarity (pgvector
   *   supports cosine via `<=>`).
   */
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingProviderOptions {
  /** Override model name reported by the provider. */
  modelName?: string;
  /** Override embedding dimension. */
  dimensions?: number;
}
