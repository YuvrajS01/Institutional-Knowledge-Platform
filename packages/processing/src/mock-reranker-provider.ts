import { createHash } from 'node:crypto';

import type { RerankCandidate, RerankedCandidate, RerankerProvider, RerankerProviderOptions } from './reranker.js';
import { LocalRerankerProvider, type LocalRerankerProviderOptions } from './local-reranker-provider.js';

/**
 * Deterministic mock reranker for tests and local dev (P5-008).
 *
 * Scoring:
 * - Token overlap between query and candidate (title+content) → base 0..1
 * - Plus tiny hash-based jitter for determinism/stability (same query+candidates → same order)
 * - Empty query → throws; empty candidates → []
 *
 * No network call; suitable as heuristic baseline and fallback when LLM reranker is unavailable.
 */
export class MockRerankerProvider implements RerankerProvider {
  private readonly _modelName: string;

  constructor(options: RerankerProviderOptions = {}) {
    this._modelName = options.modelName ?? 'mock-bge-reranker-base';
  }

  modelName(): string {
    return this._modelName;
  }

  async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankedCandidate[]> {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('rerank() expects a non-empty query');
    }
    if (!Array.isArray(candidates)) {
      throw new Error('rerank() expects candidates array');
    }
    if (candidates.length === 0) return [];

    const queryTokens = tokenize(query);
    const scored = candidates.map((c, idx) => {
      const text = `${c.title ?? ''} ${c.content}`.toLowerCase();
      const contentTokens = new Set(tokenize(text));
      let overlap = 0;
      for (const qt of queryTokens) {
        if (contentTokens.has(qt)) overlap += 1;
      }
      const base = queryTokens.length > 0 ? overlap / queryTokens.length : 0;
      // Hash jitter: 0..0.01 to keep deterministic tie-breaking
      const hash = createHash('sha256')
        .update(`${query}::${c.id}::${c.content.slice(0, 100)}`)
        .digest('hex');
      const jitter = Number.parseInt(hash.slice(0, 4), 16) / 65535 * 0.01;
      const rerankScore = Math.max(0, Math.min(1, base + jitter));
      return { candidate: c, rerankScore, originalIndex: idx };
    });

    scored.sort((a, b) => {
      if (b.rerankScore !== a.rerankScore) return b.rerankScore - a.rerankScore;
      return a.originalIndex - b.originalIndex;
    });

    return scored.map((entry, rank) => ({
      ...entry.candidate,
      rerankScore: Math.round(entry.rerankScore * 1000) / 1000,
      rerankRank: rank,
    }));
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 2);
}

export function createMockRerankerProvider(options?: RerankerProviderOptions): RerankerProvider {
  return new MockRerankerProvider(options);
}

export type RerankerFactoryOptions = RerankerProviderOptions &
  LocalRerankerProviderOptions & { provider?: string };

export function createRerankerProvider(options?: RerankerFactoryOptions): RerankerProvider {
  const provider = (options?.provider ?? process.env.RERANKER_PROVIDER ?? 'mock').toLowerCase();
  const isMock = provider === 'mock' || provider === 'test' || provider === 'heuristic';

  if (isMock) {
    return createMockRerankerProvider(options);
  }

  const isLocal =
    provider === 'local' ||
    provider === 'ollama' ||
    provider === 'vllm' ||
    provider === 'openai' ||
    provider === 'http' ||
    provider === 'bge';

  if (isLocal) {
    const modelName = options?.modelName ?? process.env.RERANKER_MODEL ?? 'bge-reranker-base';
    const baseUrl = options?.baseUrl ?? process.env.RERANKER_BASE_URL ?? process.env.OLLAMA_BASE_URL;
    const endpoint = options?.endpoint ?? process.env.RERANKER_ENDPOINT;
    return new LocalRerankerProvider({
      ...options,
      modelName,
      baseUrl,
      endpoint,
    });
  }

  throw new Error(`Reranker provider "${provider}" not yet implemented. Use "mock" or "local".`);
}
