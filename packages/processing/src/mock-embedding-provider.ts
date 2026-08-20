import { createHash } from 'node:crypto';

import {
  EMBEDDING_DIMENSIONS_BGE_M3,
  type EmbeddingProvider,
  type EmbeddingProviderOptions,
} from './embedding.js';
import { LocalEmbeddingProvider, type LocalEmbeddingProviderOptions } from './local-embedding-provider.js';

/**
 * Deterministic mock embedding provider for tests and local development
 * (P5-002). Produces hash-based pseudo-random vectors so that:
 * - same text → same vector (deterministic)
 * - different texts → different vectors
 * - batch embed preserves order and length
 *
 * The vectors are L2-normalized to simulate cosine-similarity behavior of
 * real models (e.g., BGE-M3). No external model or network call is required.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  private readonly _modelName: string;
  private readonly _dimensions: number;

  constructor(options: EmbeddingProviderOptions = {}) {
    this._modelName = options.modelName ?? 'mock-bge-m3';
    this._dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS_BGE_M3;
    if (!Number.isInteger(this._dimensions) || this._dimensions < 1) {
      throw new Error(`Invalid embedding dimensions: ${this._dimensions}`);
    }
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
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const normalized = text.trim();
    // For empty input, return zero vector (or could throw). Return zeros to keep batch length.
    if (!normalized) {
      return Array.from({ length: this._dimensions }, () => 0);
    }

    const hash = createHash('sha256').update(normalized).digest();
    const vector: number[] = [];
    // Expand hash bytes deterministically to reach dimensions.
    for (let i = 0; i < this._dimensions; i++) {
      const byte = hash[i % hash.length]!;
      // Include position-dependent variation so nearby dimensions are not identical
      const mixed = (byte + ((i * 31) % 256)) % 256;
      // Map 0..255 → -1..1
      const value = mixed / 127.5 - 1;
      vector.push(value);
    }

    // L2-normalize for cosine similarity stability.
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) {
      return vector;
    }
    return vector.map((v) => v / norm);
  }
}

export function createMockEmbeddingProvider(options?: EmbeddingProviderOptions): EmbeddingProvider {
  return new MockEmbeddingProvider(options);
}

export type EmbeddingFactoryOptions = EmbeddingProviderOptions &
  LocalEmbeddingProviderOptions & { provider?: string };

export function createEmbeddingProvider(options?: EmbeddingFactoryOptions): EmbeddingProvider {
  const envProvider = (
    options?.provider ??
    process.env.EMBEDDING_PROVIDER ??
    (process.env.EMBEDDING_PROVIDER_TYPE as string | undefined) ??
    'mock'
  ).toLowerCase();

  const isLocal =
    envProvider === 'local' ||
    envProvider === 'ollama' ||
    envProvider === 'http' ||
    envProvider === 'openai' ||
    envProvider === 'vllm';

  if (isLocal) {
    const dimensions =
      options?.dimensions ??
      (process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : undefined);
    const modelName = options?.modelName ?? process.env.EMBEDDING_MODEL ?? process.env.EMBEDDING_MODEL_NAME;
    const baseUrl = options?.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? process.env.EMBEDDING_API_URL;
    const endpoint = options?.endpoint ?? process.env.EMBEDDING_ENDPOINT;

    return new LocalEmbeddingProvider({
      ...options,
      modelName: modelName ?? 'bge-m3',
      dimensions,
      baseUrl,
      endpoint,
    });
  }

  return createMockEmbeddingProvider(options);
}
