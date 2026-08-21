import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockRerankerProvider, createMockRerankerProvider, createRerankerProvider } from './mock-reranker-provider.js';
import { LocalRerankerProvider } from './local-reranker-provider.js';

describe('MockRerankerProvider', () => {
  it('exposes modelName with defaults', () => {
    const provider = new MockRerankerProvider();
    expect(provider.modelName()).toBe('mock-bge-reranker-base');
  });

  it('respects custom modelName', () => {
    const provider = new MockRerankerProvider({ modelName: 'custom-reranker' });
    expect(provider.modelName()).toBe('custom-reranker');
  });

  it('throws for empty query', async () => {
    const provider = new MockRerankerProvider();
    await expect(provider.rerank('   ', [{ id: '1', content: 'hello' }])).rejects.toThrow(/non-empty query/);
    await expect(provider.rerank('', [])).rejects.toThrow();
  });

  it('returns empty for empty candidates', async () => {
    const provider = new MockRerankerProvider();
    const result = await provider.rerank('hello', []);
    expect(result).toEqual([]);
  });

  it('ranks by token overlap', async () => {
    const provider = new MockRerankerProvider();
    const candidates = [
      { id: '1', content: 'Holiday schedule for next month', title: 'Holiday Schedule' },
      { id: '2', content: 'Examination form submission deadline 18 August', title: 'Examination Form' },
      { id: '3', content: 'Hostel fee circular', title: 'Hostel Fee' },
    ];
    const ranked = await provider.rerank('examination form deadline', candidates);
    expect(ranked).toHaveLength(3);
    // Candidate 2 should be top due to query overlap
    expect(ranked[0]!.id).toBe('2');
    expect(ranked[0]!.rerankRank).toBe(0);
    expect(ranked[1]!.rerankRank).toBe(1);
    expect(ranked[2]!.rerankRank).toBe(2);
    for (const r of ranked) {
      expect(r.rerankScore).toBeGreaterThanOrEqual(0);
      expect(r.rerankScore).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for same input', async () => {
    const provider = new MockRerankerProvider();
    const candidates = [
      { id: '1', content: 'Examination form deadline' },
      { id: '2', content: 'Holiday schedule' },
    ];
    const a = await provider.rerank('exam form', candidates);
    const b = await provider.rerank('exam form', candidates);
    expect(a).toEqual(b);
  });

  it('produces different order for different queries', async () => {
    const provider = new MockRerankerProvider();
    const candidates = [
      { id: '1', content: 'Examination form deadline' },
      { id: '2', content: 'Holiday schedule for December' },
    ];
    const forExam = await provider.rerank('examination form', candidates);
    const forHoliday = await provider.rerank('holiday schedule', candidates);
    expect(forExam[0]!.id).toBe('1');
    expect(forHoliday[0]!.id).toBe('2');
  });

  it('preserves original fields and adds rerankScore/rerankRank', async () => {
    const provider = new MockRerankerProvider();
    const candidates = [{ id: 'doc1', content: 'Hello world', title: 'Hello', score: 0.5 }];
    const ranked = await provider.rerank('hello', candidates);
    expect(ranked[0]!.id).toBe('doc1');
    expect(ranked[0]!.title).toBe('Hello');
    expect(ranked[0]!.content).toBe('Hello world');
    expect(ranked[0]!.score).toBe(0.5);
    expect(typeof ranked[0]!.rerankScore).toBe('number');
  });

  it('handles title+content together', async () => {
    const provider = new MockRerankerProvider();
    const candidates = [
      { id: '1', content: 'generic content', title: 'Examination form deadline' },
      { id: '2', content: 'Examination form deadline', title: null },
    ];
    // Both contain same tokens, but title should also count
    const ranked = await provider.rerank('examination form deadline', candidates);
    expect(ranked.length).toBe(2);
    // Both should have high scores, but deterministic jitter may decide order - at least both >0.5
    expect(ranked[0]!.rerankScore).toBeGreaterThan(0.5);
  });

  it('throws for non-array candidates', async () => {
    const provider = new MockRerankerProvider();
    await expect(provider.rerank('hello', 'not array' as unknown as [])).rejects.toThrow();
  });

  it('createMockRerankerProvider factory works', async () => {
    const provider = createMockRerankerProvider({ modelName: 'my-mock' });
    expect(provider.modelName()).toBe('my-mock');
    const ranked = await provider.rerank('hello', [{ id: '1', content: 'hello world' }]);
    expect(ranked[0]!.id).toBe('1');
  });
});

describe('createRerankerProvider factory switch', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    delete process.env.RERANKER_PROVIDER;
    delete process.env.RERANKER_MODEL;
    delete process.env.RERANKER_BASE_URL;
    delete process.env.RERANKER_ENDPOINT;
  });

  it('returns mock by default', () => {
    delete process.env.RERANKER_PROVIDER;
    const provider = createRerankerProvider();
    expect(provider.modelName()).toBe('mock-bge-reranker-base');
    expect(provider).toBeInstanceOf(MockRerankerProvider);
  });

  it('returns local for ollama/openai aliases', () => {
    for (const alias of ['local', 'ollama', 'vllm', 'openai', 'http', 'bge']) {
      process.env.RERANKER_PROVIDER = alias;
      const provider = createRerankerProvider();
      expect(provider).toBeInstanceOf(LocalRerankerProvider);
    }
  });

  it('respects explicit provider option over env', () => {
    process.env.RERANKER_PROVIDER = 'mock';
    const provider = createRerankerProvider({ provider: 'local' });
    expect(provider).toBeInstanceOf(LocalRerankerProvider);
  });

  it('respects modelName from env for local', () => {
    process.env.RERANKER_PROVIDER = 'local';
    process.env.RERANKER_MODEL = 'my-reranker';
    const provider = createRerankerProvider();
    expect(provider.modelName()).toBe('my-reranker');
  });

  it('options override env', () => {
    process.env.RERANKER_PROVIDER = 'local';
    process.env.RERANKER_MODEL = 'env-model';
    const provider = createRerankerProvider({ modelName: 'opt-model' });
    expect(provider.modelName()).toBe('opt-model');
  });
});
