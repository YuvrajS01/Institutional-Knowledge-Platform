import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMBEDDING_DIMENSIONS_BGE_M3 } from './embedding.js';
import { LocalEmbeddingProvider, createLocalEmbeddingProvider } from './local-embedding-provider.js';
import { createEmbeddingProvider } from './mock-embedding-provider.js';

function makeEmbedding(dim: number, fill: number): number[] {
  return Array.from({ length: dim }, (_, i) => (fill + i * 0.01) % 1);
}

function mockOllamaResponse(embeddings: number[][]): Response {
  return new Response(JSON.stringify({ embeddings }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockOpenAIResponse(embeddings: number[][]): Response {
  const data = embeddings.map((embedding, index) => ({ object: 'embedding', embedding, index }));
  return new Response(JSON.stringify({ object: 'list', data, model: 'bge-m3', usage: {} }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LocalEmbeddingProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Clean embedding env vars for isolated tests
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_MODEL;
    delete process.env.EMBEDDING_BASE_URL;
    delete process.env.EMBEDDING_DIMENSIONS;
    delete process.env.EMBEDDING_ENDPOINT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exposes modelName and dimensions with defaults', () => {
    const provider = new LocalEmbeddingProvider();
    expect(provider.modelName()).toBe('bge-m3');
    expect(provider.dimensions()).toBe(EMBEDDING_DIMENSIONS_BGE_M3);
  });

  it('respects custom modelName and dimensions', () => {
    const provider = new LocalEmbeddingProvider({ modelName: 'custom-model', dimensions: 384 });
    expect(provider.modelName()).toBe('custom-model');
    expect(provider.dimensions()).toBe(384);
  });

  it('rejects invalid dimensions', () => {
    expect(() => new LocalEmbeddingProvider({ dimensions: 0 })).toThrow();
    expect(() => new LocalEmbeddingProvider({ dimensions: -1 })).toThrow();
    expect(() => new LocalEmbeddingProvider({ dimensions: 1.5 })).toThrow();
  });

  it('rejects invalid maxBatchSize', () => {
    expect(() => new LocalEmbeddingProvider({ maxBatchSize: 0 })).toThrow();
    expect(() => new LocalEmbeddingProvider({ maxBatchSize: -5 })).toThrow();
  });

  it('returns empty array for empty batch without calling fetch', async () => {
    const fetchMock = vi.fn(async () => mockOllamaResponse([]));
    const provider = new LocalEmbeddingProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    const result = await provider.embed([]);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles empty and whitespace inputs as zero vectors without fetch for those entries', async () => {
    const dim = 8;
    const embedding = makeEmbedding(dim, 0.5);
    const fetchMock = vi.fn(async () => mockOllamaResponse([embedding]));
    const provider = new LocalEmbeddingProvider({ dimensions: dim, fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await provider.embed(['', '   ', 'Valid text']);

    expect(result).toHaveLength(3);
    expect(result[0]!.every((v) => v === 0)).toBe(true);
    expect(result[1]!.every((v) => v === 0)).toBe(true);
    expect(result[2]).toEqual(embedding);
    // Only non-empty should have been sent
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call0 = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call0[1].body as string) as Record<string, unknown>;
    expect(body.input).toBe('Valid text');
  });

  it('fetches ollama embeddings for single text', async () => {
    const dim = 4;
    const embedding = [0.1, 0.2, 0.3, 0.4];
    const fetchMock = vi.fn(async () => mockOllamaResponse([embedding]));
    const provider = new LocalEmbeddingProvider({
      dimensions: dim,
      modelName: 'bge-m3',
      baseUrl: 'http://localhost:11434',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const vectors = await provider.embed(['Hello world']);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toEqual(embedding);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/embed',
      expect.objectContaining({ method: 'POST' }),
    );
    const call0b = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call0b[1].body as string) as { model: string; input: string };
    expect(body.model).toBe('bge-m3');
    expect(body.input).toBe('Hello world');
  });

  it('fetches ollama embeddings for batch preserving order', async () => {
    const dim = 4;
    const e1 = [0.1, 0.2, 0.3, 0.4];
    const e2 = [0.5, 0.6, 0.7, 0.8];
    const e3 = [0.9, 1.0, 1.1, 1.2];
    const fetchMock = vi.fn(async () => mockOllamaResponse([e1, e2, e3]));
    const provider = new LocalEmbeddingProvider({
      dimensions: dim,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const vectors = await provider.embed(['First', 'Second', 'Third']);
    expect(vectors).toEqual([e1, e2, e3]);

    const call0c = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call0c[1].body as string) as { input: unknown };
    expect(body.input).toEqual(['First', 'Second', 'Third']);
  });

  it('handles OpenAI-compatible response shape', async () => {
    const dim = 4;
    const e1 = [0.1, 0.2, 0.3, 0.4];
    const e2 = [0.5, 0.6, 0.7, 0.8];
    const fetchMock = vi.fn(async () => mockOpenAIResponse([e1, e2]));
    const provider = new LocalEmbeddingProvider({
      dimensions: dim,
      baseUrl: 'http://localhost:8000/v1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const vectors = await provider.embed(['Hello', 'World']);
    expect(vectors).toEqual([e1, e2]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/v1/embeddings', expect.anything());
  });

  it('handles legacy single embedding shape for single input', async () => {
    const dim = 4;
    const embedding = [0.1, 0.2, 0.3, 0.4];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ embedding }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const provider = new LocalEmbeddingProvider({
      dimensions: dim,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const vectors = await provider.embed(['Single']);
    expect(vectors).toEqual([embedding]);
  });

  it('respects maxBatchSize and batches requests', async () => {
    const dim = 4;
    const makeVec = (i: number) => [i * 0.1, i * 0.1 + 0.01, i * 0.1 + 0.02, i * 0.1 + 0.03];
    const embeddingsBatch1 = [makeVec(0), makeVec(1)];
    const embeddingsBatch2 = [makeVec(2)];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOllamaResponse(embeddingsBatch1))
      .mockResolvedValueOnce(mockOllamaResponse(embeddingsBatch2));

    const provider = new LocalEmbeddingProvider({
      dimensions: dim,
      maxBatchSize: 2,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const vectors = await provider.embed(['a', 'b', 'c']);
    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toEqual(makeVec(0));
    expect(vectors[1]).toEqual(makeVec(1));
    expect(vectors[2]).toEqual(makeVec(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on HTTP error', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
    );
    const provider = new LocalEmbeddingProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.embed(['test'])).rejects.toThrow(/Embedding request failed.*500/);
  });

  it('throws on dimension mismatch', async () => {
    const fetchMock = vi.fn(async () => mockOllamaResponse([[0.1, 0.2]])); // 2 dims but expects 4
    const provider = new LocalEmbeddingProvider({ dimensions: 4, fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.embed(['test'])).rejects.toThrow(/dimension mismatch/i);
  });

  it('throws on non-finite values', async () => {
    const fetchMock = vi.fn(async () => mockOllamaResponse([[NaN, 0.2, 0.3, 0.4]]));
    const provider = new LocalEmbeddingProvider({ dimensions: 4, fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.embed(['test'])).rejects.toThrow(/non-finite/);
  });

  it('throws on unexpected response shape', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const provider = new LocalEmbeddingProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.embed(['test'])).rejects.toThrow(/Unexpected embedding response/);
  });

  it('rejects non-array input', async () => {
    const provider = new LocalEmbeddingProvider();
    await expect(provider.embed('not array' as unknown as string[])).rejects.toThrow();
  });

  it('handles custom endpoint override', async () => {
    const dim = 4;
    const embedding = [0.1, 0.2, 0.3, 0.4];
    const fetchMock = vi.fn(async () => mockOllamaResponse([embedding]));
    const provider = new LocalEmbeddingProvider({
      dimensions: dim,
      endpoint: 'http://custom:9000/custom/embed',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.embed(['test']);
    expect(fetchMock).toHaveBeenCalledWith('http://custom:9000/custom/embed', expect.anything());
  });

  it('resolves baseUrl with trailing slash', async () => {
    const dim = 4;
    const embedding = [0.1, 0.2, 0.3, 0.4];
    const fetchMock = vi.fn(async () => mockOllamaResponse([embedding]));
    const provider = new LocalEmbeddingProvider({
      dimensions: dim,
      baseUrl: 'http://localhost:11434/',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.embed(['test']);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/embed', expect.anything());
  });

  it('normalize option L2-normalizes vectors', async () => {
    const dim = 4;
    const raw = [3, 4, 0, 0]; // norm 5 -> normalized [0.6,0.8,0,0]
    const fetchMock = vi.fn(async () => mockOllamaResponse([raw]));
    const provider = new LocalEmbeddingProvider({
      dimensions: dim,
      normalize: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const [vec] = await provider.embed(['test']);
    const norm = Math.sqrt(vec!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(vec![0]).toBeCloseTo(0.6, 5);
    expect(vec![1]).toBeCloseTo(0.8, 5);
  });

  it('createLocalEmbeddingProvider factory works', async () => {
    const dim = 4;
    const embedding = [0.1, 0.2, 0.3, 0.4];
    const fetchMock = vi.fn(async () => mockOllamaResponse([embedding]));
    const provider = createLocalEmbeddingProvider({ dimensions: dim, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(provider.modelName()).toBe('bge-m3');
    const vectors = await provider.embed(['test']);
    expect(vectors[0]).toEqual(embedding);
  });

  it('preserves order with interleaved empty strings (corrected)', async () => {
    const dim = 4;
    const e1 = [0.1, 0.2, 0.3, 0.4];
    const e2 = [0.5, 0.6, 0.7, 0.8];
    const e3 = [0.9, 1.0, 1.1, 1.2];
    const fetchMock = vi.fn(async () => mockOllamaResponse([e1, e2, e3]));
    const provider = new LocalEmbeddingProvider({ dimensions: dim, fetchImpl: fetchMock as unknown as typeof fetch });

    const vectors = await provider.embed(['first', '', 'second', '   ', 'third']);
    expect(vectors).toHaveLength(5);
    expect(vectors[0]).toEqual(e1);
    expect(vectors[1]!.every((v) => v === 0)).toBe(true);
    expect(vectors[2]).toEqual(e2);
    expect(vectors[3]!.every((v) => v === 0)).toBe(true);
    expect(vectors[4]).toEqual(e3);
  });
});

describe('createEmbeddingProvider factory switch', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns mock by default', async () => {
    delete process.env.EMBEDDING_PROVIDER;
    const provider = createEmbeddingProvider();
    expect(provider.modelName()).toBe('mock-bge-m3');
  });

  it('returns local provider when EMBEDDING_PROVIDER=local', () => {
    process.env.EMBEDDING_PROVIDER = 'local';
    const provider = createEmbeddingProvider();
    expect(provider.modelName()).toBe('bge-m3');
    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  });

  it('returns local for ollama/openai aliases', () => {
    for (const alias of ['ollama', 'http', 'openai', 'vllm']) {
      process.env.EMBEDDING_PROVIDER = alias;
      const provider = createEmbeddingProvider();
      expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
    }
  });

  it('respects explicit provider option over env', () => {
    process.env.EMBEDDING_PROVIDER = 'mock';
    const provider = createEmbeddingProvider({ provider: 'local' });
    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  });

  it('respects dimensions and modelName from env for local', () => {
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.EMBEDDING_MODEL = 'my-model';
    process.env.EMBEDDING_DIMENSIONS = '384';
    const provider = createEmbeddingProvider();
    expect(provider.modelName()).toBe('my-model');
    expect(provider.dimensions()).toBe(384);
  });

  it('options override env', () => {
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.EMBEDDING_MODEL = 'env-model';
    const provider = createEmbeddingProvider({ modelName: 'opt-model' });
    expect(provider.modelName()).toBe('opt-model');
  });
});
