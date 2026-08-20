import {
  EMBEDDING_DIMENSIONS_BGE_M3,
  type EmbeddingProvider,
  type EmbeddingProviderOptions,
} from './embedding.js';

export interface LocalEmbeddingProviderOptions extends EmbeddingProviderOptions {
  /** Base URL for the embedding service (e.g., http://localhost:11434). */
  baseUrl?: string;
  /** Full endpoint override (e.g., http://localhost:11434/api/embed). */
  endpoint?: string;
  /** Request timeout in milliseconds (default 30000). */
  timeoutMs?: number;
  /** Custom fetch implementation for testing. */
  fetchImpl?: typeof fetch;
  /** Max texts per batch request (default 32). */
  maxBatchSize?: number;
  /** Whether to L2-normalize returned vectors for cosine similarity. Defaults to false (return raw). */
  normalize?: boolean;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BATCH_SIZE = 32;

function resolveEndpoint(baseUrl: string, endpoint?: string): { url: string; style: 'ollama' | 'openai' } {
  if (endpoint) {
    const lower = endpoint.toLowerCase();
    const style: 'ollama' | 'openai' = lower.includes('/v1/') || lower.includes('openai') ? 'openai' : 'ollama';
    return { url: endpoint, style };
  }
  const trimmed = baseUrl.replace(/\/$/, '');
  // OpenAI-compatible: baseUrl already points to /v1 or /v1/embeddings
  if (trimmed.endsWith('/v1/embeddings')) {
    return { url: trimmed, style: 'openai' };
  }
  if (trimmed.endsWith('/v1')) {
    return { url: `${trimmed}/embeddings`, style: 'openai' };
  }
  // Heuristic: if baseUrl contains /v1 somewhere, treat as OpenAI
  if (trimmed.includes('/v1/')) {
    return { url: trimmed, style: 'openai' };
  }
  // Default: Ollama /api/embed
  return { url: `${trimmed}/api/embed`, style: 'ollama' };
}

function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

/**
 * Local / Ollama / OpenAI-compatible embedding provider (P5-003).
 *
 * Provider-agnostic `EmbeddingProvider` implementation that talks to a local
 * embedding service over HTTP. Designed for:
 * - Ollama `POST /api/embed` (BGE-M3, multilingual-e5, etc.)
 * - OpenAI-compatible `POST /v1/embeddings` (vLLM, etc.)
 *
 * Remains swappable with `MockEmbeddingProvider` via `createEmbeddingProvider()`.
 * Follows provider abstraction requirements in AI_LLM_ARCHITECTURE §7/§18 and
 * ADR-003/007.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  private readonly _modelName: string;
  private readonly _dimensions: number;
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly endpointStyle: 'ollama' | 'openai';
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxBatchSize: number;
  private readonly normalize: boolean;

  constructor(options: LocalEmbeddingProviderOptions = {}) {
    this._modelName = options.modelName ?? 'bge-m3';
    this._dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS_BGE_M3;
    if (!Number.isInteger(this._dimensions) || this._dimensions < 1) {
      throw new Error(`Invalid embedding dimensions: ${this._dimensions}`);
    }
    this.baseUrl = options.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    if (!Number.isInteger(this.maxBatchSize) || this.maxBatchSize < 1) {
      throw new Error(`Invalid maxBatchSize: ${this.maxBatchSize}`);
    }
    this.normalize = options.normalize ?? false;

    const resolved = resolveEndpoint(this.baseUrl, options.endpoint);
    this.endpoint = resolved.url;
    this.endpointStyle = resolved.style;
  }

  modelName(): string {
    return this._modelName;
  }

  dimensions(): number {
    return this._dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      throw new Error('embed() expects an array of strings');
    }
    if (texts.length === 0) {
      return [];
    }

    const result: (number[] | null)[] = new Array(texts.length).fill(null);
    const nonEmptyIndices: number[] = [];
    const nonEmptyTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const raw = texts[i] ?? '';
      const normalized = typeof raw === 'string' ? raw.trim() : String(raw).trim();
      if (!normalized) {
        result[i] = Array.from({ length: this._dimensions }, () => 0);
      } else {
        nonEmptyIndices.push(i);
        nonEmptyTexts.push(normalized);
      }
    }

    if (nonEmptyTexts.length === 0) {
      return result as number[][];
    }

    // Batch the remote calls.
    const batches: { batch: string[]; indices: number[] }[] = [];
    for (let i = 0; i < nonEmptyTexts.length; i += this.maxBatchSize) {
      const batch = nonEmptyTexts.slice(i, i + this.maxBatchSize);
      const indices = nonEmptyIndices.slice(i, i + this.maxBatchSize);
      batches.push({ batch, indices });
    }

    for (const { batch, indices } of batches) {
      const embeddings = await this.fetchEmbeddings(batch);
      if (embeddings.length !== batch.length) {
        throw new Error(
          `Embedding provider returned ${embeddings.length} vectors for ${batch.length} inputs`,
        );
      }
      for (let j = 0; j < embeddings.length; j++) {
        const vector = embeddings[j]!;
        if (!Array.isArray(vector) || vector.length !== this._dimensions) {
          throw new Error(
            `Embedding dimension mismatch: expected ${this._dimensions} but got ${Array.isArray(vector) ? vector.length : typeof vector} for model ${this._modelName}`,
          );
        }
        const finalVector = this.normalize ? l2Normalize(vector) : vector;
        // Validate finiteness
        for (const v of finalVector) {
          if (!Number.isFinite(v)) {
            throw new Error(`Embedding provider returned non-finite value for model ${this._modelName}`);
          }
        }
        result[indices[j]!] = finalVector;
      }
    }

    return result as number[][];
  }

  private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const { body, headers } = this.buildRequest(texts);

      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `Embedding request failed (${response.status} ${response.statusText}) at ${this.endpoint}: ${text.slice(0, 500)}`,
        );
      }

      const json = (await response.json()) as Record<string, unknown>;

      // Parse response flexibly.
      // Ollama: { embeddings: number[][] }
      // Ollama legacy single: { embedding: number[] }
      // OpenAI: { data: [{ embedding: number[], index: number }] }
      if (Array.isArray((json as { embeddings?: unknown }).embeddings)) {
        return (json as { embeddings: number[][] }).embeddings;
      }
      if (Array.isArray((json as { embedding?: unknown }).embedding)) {
        const single = (json as { embedding: number[] }).embedding;
        // Single embedding for single input – wrap if we sent a batch of 1
        if (texts.length === 1) {
          return [single];
        }
        // Unexpected shape
        throw new Error(`Embedding provider returned single embedding for batch of ${texts.length}`);
      }
      if (Array.isArray((json as { data?: unknown }).data)) {
        const data = (json as { data: Array<{ embedding: number[]; index: number }> }).data;
        // Sort by index to preserve order
        const sorted = [...data].sort((a, b) => a.index - b.index);
        return sorted.map((item) => item.embedding);
      }

      throw new Error(`Unexpected embedding response shape from ${this.endpoint}: ${JSON.stringify(json).slice(0, 500)}`);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Embedding request timed out after ${this.timeoutMs}ms at ${this.endpoint}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequest(texts: string[]): { body: Record<string, unknown>; headers: Record<string, string> } {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.endpointStyle === 'openai') {
      // OpenAI compatible
      return {
        headers,
        body: {
          model: this._modelName,
          input: texts.length === 1 ? texts[0] : texts,
        },
      };
    }

    // Ollama style
    return {
      headers,
      body: {
        model: this._modelName,
        input: texts.length === 1 ? texts[0] : texts,
      },
    };
  }
}

export function createLocalEmbeddingProvider(
  options?: LocalEmbeddingProviderOptions,
): LocalEmbeddingProvider {
  return new LocalEmbeddingProvider(options);
}
