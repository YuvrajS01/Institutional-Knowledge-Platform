import type { RerankCandidate, RerankedCandidate, RerankerProvider, RerankerProviderOptions } from './reranker.js';

export interface LocalRerankerProviderOptions extends RerankerProviderOptions {
  baseUrl?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL = 'bge-reranker-base';

function resolveEndpoint(baseUrl: string, endpoint?: string): { url: string; style: 'generic' | 'openai' } {
  if (endpoint) {
    const lower = endpoint.toLowerCase();
    if (lower.includes('/v1/') || lower.includes('openai')) return { url: endpoint, style: 'openai' };
    return { url: endpoint, style: 'generic' };
  }
  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.includes('/v1/')) return { url: trimmed, style: 'openai' };
  // Generic rerank endpoint: POST /rerank or /api/rerank
  if (trimmed.endsWith('/rerank') || trimmed.endsWith('/api/rerank')) return { url: trimmed, style: 'generic' };
  return { url: `${trimmed}/rerank`, style: 'generic' };
}

/**
 * Local / OpenAI-compatible reranker provider (P5-008).
 *
 * Thin HTTP adapter for BGE reranker family (bge-reranker-base/large) served via
 * vLLM, Ollama (experimental), or any OpenAI-compatible rerank endpoint.
 *
 * Expected request/response shapes (flexible):
 * - Request: { model, query, documents: [{ text }] } or { model, query, passages }
 * - Response: { results: [{ index, relevance_score }]} | { scores: number[] } | { data: [...] }
 *
 * No model bundled; service must be running.
 */
export class LocalRerankerProvider implements RerankerProvider {
  private readonly _modelName: string;
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly endpointStyle: 'generic' | 'openai';
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LocalRerankerProviderOptions = {}) {
    this._modelName = options.modelName ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? process.env.RERANKER_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    const resolved = resolveEndpoint(this.baseUrl, options.endpoint);
    this.endpoint = resolved.url;
    this.endpointStyle = resolved.style;
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const { body, headers } = this.buildRequest(query.trim(), candidates);

      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Reranker request failed (${response.status} ${response.statusText}) at ${this.endpoint}: ${text.slice(0, 500)}`);
      }

      const json = (await response.json()) as Record<string, unknown>;
      const scores = this.parseScores(json, candidates.length);

      const scored = candidates.map((c, idx) => ({
        candidate: c,
        rerankScore: scores[idx] ?? 0,
        originalIndex: idx,
      }));

      scored.sort((a, b) => {
        if (b.rerankScore !== a.rerankScore) return b.rerankScore - a.rerankScore;
        return a.originalIndex - b.originalIndex;
      });

      return scored.map((entry, rank) => ({
        ...entry.candidate,
        rerankScore: Math.max(0, Math.min(1, entry.rerankScore)),
        rerankRank: rank,
      }));
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Reranker request timed out after ${this.timeoutMs}ms at ${this.endpoint}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequest(query: string, candidates: RerankCandidate[]): { body: Record<string, unknown>; headers: Record<string, string> } {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Generic BGE-style: { model, query, documents }
    const documents = candidates.map((c) => ({
      text: c.title ? `${c.title} ${c.content}` : c.content,
      id: c.id,
    }));

    if (this.endpointStyle === 'openai') {
      // Some hosted rerankers use OpenAI-like shape
      return {
        headers,
        body: {
          model: this._modelName,
          query,
          documents: candidates.map((c) => (c.title ? `${c.title} ${c.content}` : c.content)),
        },
      };
    }

    return {
      headers,
      body: {
        model: this._modelName,
        query,
        documents,
      },
    };
  }

  private parseScores(json: Record<string, unknown>, expectedCount: number): number[] {
    // Shape 1: { results: [{ index, relevance_score | score }]}
    if (Array.isArray((json as { results?: unknown }).results)) {
      const results = (json as { results: Array<{ index?: number; relevance_score?: number; score?: number }> }).results;
      const scores = new Array<number>(expectedCount).fill(0);
      for (const r of results) {
        const idx = typeof r.index === 'number' ? r.index : results.indexOf(r);
        const s = typeof r.relevance_score === 'number' ? r.relevance_score : r.score;
        if (idx >= 0 && idx < expectedCount && typeof s === 'number' && Number.isFinite(s)) {
          scores[idx] = s;
        }
      }
      return scores;
    }

    // Shape 2: { scores: [0.9, 0.1] }
    if (Array.isArray((json as { scores?: unknown }).scores)) {
      const scores = (json as { scores: number[] }).scores;
      if (scores.length === expectedCount) return scores;
      // Pad/truncate
      return Array.from({ length: expectedCount }, (_, i) => scores[i] ?? 0);
    }

    // Shape 3: { data: [{ index, score }]} or { data: [0.9, 0.1] }
    if (Array.isArray((json as { data?: unknown }).data)) {
      const data = (json as { data: unknown[] }).data;
      if (data.length > 0 && typeof data[0] === 'number') {
        return (data as number[]).slice(0, expectedCount);
      }
      if (data.length > 0 && typeof data[0] === 'object') {
        const scores = new Array<number>(expectedCount).fill(0);
        for (const entry of data as Array<{ index?: number; score?: number; relevance_score?: number }>) {
          const idx = entry.index ?? (data as unknown[]).indexOf(entry);
          const s = entry.score ?? entry.relevance_score;
          if (typeof idx === 'number' && idx >= 0 && idx < expectedCount && typeof s === 'number') {
            scores[idx] = s;
          }
        }
        return scores;
      }
    }

    // Shape 4: { rankings: [...] } or single score array at top level? Try to find any numeric array of expected length
    for (const value of Object.values(json)) {
      if (Array.isArray(value) && value.length === expectedCount && value.every((v) => typeof v === 'number')) {
        return value as number[];
      }
    }

    throw new Error(`Unexpected reranker response shape from ${this.endpoint}: ${JSON.stringify(json).slice(0, 500)}`);
  }
}

export function createLocalRerankerProvider(options?: LocalRerankerProviderOptions): RerankerProvider {
  return new LocalRerankerProvider(options);
}
