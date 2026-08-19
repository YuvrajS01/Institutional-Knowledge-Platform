import { createHash } from 'node:crypto';

import {
  EMBEDDING_DIMENSIONS_BGE_M3,
  type EmbeddingProvider,
  type EmbeddingProviderOptions,
} from './embedding.js';

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

export function createEmbeddingProvider(options?: EmbeddingProviderOptions): EmbeddingProvider {
  // Default factory for P5-002: mock implementation. P5-003 will add a local
  // model adapter (e.g., BGE-M3 via transformers.js or ollama) behind the same
  // factory/interface.
  return createMockEmbeddingProvider(options);
}
