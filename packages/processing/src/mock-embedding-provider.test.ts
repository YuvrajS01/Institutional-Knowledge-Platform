import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS_BGE_M3 } from './embedding.js';
import {
  createEmbeddingProvider,
  createMockEmbeddingProvider,
  MockEmbeddingProvider,
} from './mock-embedding-provider.js';

function l2Norm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i]!, 0);
  const normA = l2Norm(a);
  const normB = l2Norm(b);
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

describe('MockEmbeddingProvider', () => {
  it('exposes modelName and dimensions', () => {
    const provider = createMockEmbeddingProvider();
    expect(provider.modelName()).toBe('mock-bge-m3');
    expect(provider.dimensions()).toBe(EMBEDDING_DIMENSIONS_BGE_M3);

    const custom = createMockEmbeddingProvider({ modelName: 'custom', dimensions: 384 });
    expect(custom.modelName()).toBe('custom');
    expect(custom.dimensions()).toBe(384);
  });

  it('rejects invalid dimensions', () => {
    expect(() => new MockEmbeddingProvider({ dimensions: 0 })).toThrow();
    expect(() => new MockEmbeddingProvider({ dimensions: -5 })).toThrow();
    expect(() => new MockEmbeddingProvider({ dimensions: 1.5 })).toThrow();
  });

  it('embeds single text into vector of correct dimension', async () => {
    const provider = createMockEmbeddingProvider();
    const vectors = await provider.embed(['Hello world']);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]!).toHaveLength(provider.dimensions());
    for (const v of vectors[0]!) {
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('embeds batch preserving order and length', async () => {
    const provider = createMockEmbeddingProvider();
    const texts = ['First document', 'Second document', 'Third'];
    const vectors = await provider.embed(texts);
    expect(vectors).toHaveLength(texts.length);
    for (const vec of vectors) {
      expect(vec).toHaveLength(provider.dimensions());
    }
  });

  it('is deterministic: same text yields same vector', async () => {
    const provider = createMockEmbeddingProvider();
    const a = await provider.embed(['Examination form deadline is 18 August.']);
    const b = await provider.embed(['Examination form deadline is 18 August.']);
    expect(a[0]).toEqual(b[0]);
  });

  it('different texts yield different vectors', async () => {
    const provider = createMockEmbeddingProvider();
    const [v1] = await provider.embed(['Examination form']);
    const [v2] = await provider.embed(['Hostel allotment circular']);
    expect(v1).not.toEqual(v2);
    // Cosine should be < 0.99 for unrelated texts (not identical)
    expect(cosineSimilarity(v1!, v2!)).toBeLessThan(0.99);
  });

  it('handles empty input and whitespace', async () => {
    const provider = createMockEmbeddingProvider();
    const vectors = await provider.embed(['', '   ', 'Valid']);
    expect(vectors).toHaveLength(3);
    expect(vectors[0]!).toHaveLength(provider.dimensions());
    expect(vectors[1]!).toHaveLength(provider.dimensions());
    // Empty should be zero vector
    expect(vectors[0]!.every((v) => v === 0)).toBe(true);
    expect(vectors[1]!.every((v) => v === 0)).toBe(true);
    // Non-empty should be normalized non-zero
    expect(l2Norm(vectors[2]!)).toBeCloseTo(1, 5);
  });

  it('returns empty array for empty batch', async () => {
    const provider = createMockEmbeddingProvider();
    expect(await provider.embed([])).toEqual([]);
  });

  it('produces L2-normalized vectors for non-empty texts', async () => {
    const provider = createMockEmbeddingProvider();
    const texts = ['Normal text for embedding test', 'Another sentence for vector'];
    const vectors = await provider.embed(texts);
    for (const vec of vectors) {
      expect(l2Norm(vec)).toBeCloseTo(1, 5);
    }
  });

  it('createEmbeddingProvider factory returns mock by default', async () => {
    const provider = createEmbeddingProvider();
    expect(provider.modelName()).toBe('mock-bge-m3');
    const vectors = await provider.embed(['factory test']);
    expect(vectors[0]!).toHaveLength(EMBEDDING_DIMENSIONS_BGE_M3);
  });

  it('implements EmbeddingProvider interface correctly', async () => {
    const provider: InstanceType<typeof MockEmbeddingProvider> = new MockEmbeddingProvider();
    expect(typeof provider.modelName).toBe('function');
    expect(typeof provider.dimensions).toBe('function');
    expect(typeof provider.embed).toBe('function');
  });

  it('rejects non-array input', async () => {
    const provider = createMockEmbeddingProvider();
    await expect(provider.embed('not an array' as unknown as string[])).rejects.toThrow();
  });

  it('supports custom small dimension for lightweight tests', async () => {
    const provider = createMockEmbeddingProvider({ dimensions: 8 });
    const vectors = await provider.embed(['tiny']);
    expect(vectors[0]!).toHaveLength(8);
    expect(l2Norm(vectors[0]!)).toBeCloseTo(1, 5);
  });
});
