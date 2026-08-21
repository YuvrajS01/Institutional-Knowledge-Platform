import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalRerankerProvider, createLocalRerankerProvider } from './local-reranker-provider.js';
import { createRerankerProvider } from './mock-reranker-provider.js';

function mockResultsResponse(scores: number[]): Response {
  const results = scores.map((score, index) => ({ index, relevance_score: score }));
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockScoresResponse(scores: number[]): Response {
  return new Response(JSON.stringify({ scores }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockOpenAIRerankResponse(scores: number[]): Response {
  return new Response(JSON.stringify({ data: scores.map((s, i) => ({ index: i, score: s })) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LocalRerankerProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.RERANKER_PROVIDER;
    delete process.env.RERANKER_MODEL;
    delete process.env.RERANKER_BASE_URL;
    delete process.env.RERANKER_ENDPOINT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exposes modelName with defaults', () => {
    const provider = new LocalRerankerProvider();
    expect(provider.modelName()).toBe('bge-reranker-base');
  });

  it('respects custom modelName', () => {
    const provider = new LocalRerankerProvider({ modelName: 'custom-reranker' });
    expect(provider.modelName()).toBe('custom-reranker');
  });

  it('throws for empty query', async () => {
    const provider = new LocalRerankerProvider({ fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(provider.rerank('   ', [{ id: '1', content: 'hello' }])).rejects.toThrow(/non-empty query/);
  });

  it('returns empty for empty candidates without fetch', async () => {
    const fetchMock = vi.fn(async () => mockResultsResponse([]));
    const provider = new LocalRerankerProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    const result = await provider.rerank('hello', []);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and parses results shape', async () => {
    const fetchMock = vi.fn(async () => mockResultsResponse([0.9, 0.1, 0.5]));
    const provider = new LocalRerankerProvider({
      modelName: 'bge-reranker-base',
      baseUrl: 'http://localhost:11434',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const candidates = [
      { id: '1', content: 'Holiday schedule' },
      { id: '2', content: 'Examination form' },
      { id: '3', content: 'Hostel fee' },
    ];
    const ranked = await provider.rerank('examination form', candidates);
    expect(ranked).toHaveLength(3);
    // 0.9 should be first (index 0), 0.5 second (index 2), 0.1 last (index 1)
    expect(ranked[0]!.id).toBe('1');
    expect(ranked[1]!.id).toBe('3');
    expect(ranked[2]!.id).toBe('2');
    expect(ranked[0]!.rerankScore).toBe(0.9);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/rerank',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body.model).toBe('bge-reranker-base');
    expect(body.query).toBe('examination form');
  });

  it('handles scores array shape', async () => {
    const fetchMock = vi.fn(async () => mockScoresResponse([0.2, 0.8]));
    const provider = new LocalRerankerProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    const candidates = [
      { id: '1', content: 'Holiday' },
      { id: '2', content: 'Examination' },
    ];
    const ranked = await provider.rerank('examination', candidates);
    expect(ranked[0]!.id).toBe('2');
    expect(ranked[1]!.id).toBe('1');
  });

  it('handles data array shape with objects', async () => {
    const fetchMock = vi.fn(async () => mockOpenAIRerankResponse([0.3, 0.9]));
    const provider = new LocalRerankerProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    const candidates = [
      { id: '1', content: 'Holiday' },
      { id: '2', content: 'Examination' },
    ];
    const ranked = await provider.rerank('examination', candidates);
    expect(ranked[0]!.id).toBe('2');
  });

  it('throws on HTTP error', async () => {
    const fetchMock = vi.fn(async () => new Response('Internal Error', { status: 500, statusText: 'Internal Server Error' }));
    const provider = new LocalRerankerProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.rerank('hello', [{ id: '1', content: 'hello' }])).rejects.toThrow(/Reranker request failed.*500/);
  });

  it('throws on unexpected shape', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new LocalRerankerProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.rerank('hello', [{ id: '1', content: 'hello' }])).rejects.toThrow(/Unexpected reranker response/);
  });

  it('handles custom endpoint override', async () => {
    const fetchMock = vi.fn(async () => mockResultsResponse([0.5]));
    const provider = new LocalRerankerProvider({
      endpoint: 'http://custom:9000/custom/rerank',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.rerank('hello', [{ id: '1', content: 'hello' }]);
    expect(fetchMock).toHaveBeenCalledWith('http://custom:9000/custom/rerank', expect.anything());
  });

  it('resolves baseUrl with trailing slash', async () => {
    const fetchMock = vi.fn(async () => mockResultsResponse([0.5]));
    const provider = new LocalRerankerProvider({
      baseUrl: 'http://localhost:11434/',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.rerank('hello', [{ id: '1', content: 'hello' }]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/rerank', expect.anything());
  });

  it('createLocalRerankerProvider factory works', async () => {
    const fetchMock = vi.fn(async () => mockResultsResponse([0.7]));
    const provider = createLocalRerankerProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    expect(provider.modelName()).toBe('bge-reranker-base');
    const ranked = await provider.rerank('hello', [{ id: '1', content: 'hello' }]);
    expect(ranked[0]!.rerankScore).toBe(0.7);
  });

  it('caps rerankScore 0..1', async () => {
    const fetchMock = vi.fn(async () => mockResultsResponse([1.5, -0.2]));
    const provider = new LocalRerankerProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    const candidates = [
      { id: '1', content: 'a' },
      { id: '2', content: 'b' },
    ];
    const ranked = await provider.rerank('hello', candidates);
    // Scores capped to 0..1 via Math.max/min
    expect(ranked[0]!.rerankScore).toBe(1);
    expect(ranked[1]!.rerankScore).toBe(0);
  });
});

describe('createRerankerProvider factory with Local', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns mock by default', () => {
    delete process.env.RERANKER_PROVIDER;
    const provider = createRerankerProvider();
    expect(provider.modelName()).toBe('mock-bge-reranker-base');
  });

  it('respects explicit provider option over env', () => {
    process.env.RERANKER_PROVIDER = 'mock';
    const provider = createRerankerProvider({ provider: 'local' });
    expect(provider.modelName()).toBe('bge-reranker-base');
  });
});
