import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalLLMProvider, createLocalLLMProvider } from './local-llm-provider.js';
import { createLLMProvider } from './mock-llm-provider.js';

function mockOllamaGenerate(text: string): Response {
  return new Response(JSON.stringify({ model: 'qwen2:7b', response: text }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockOllamaChat(text: string): Response {
  return new Response(JSON.stringify({ model: 'qwen2:7b', message: { role: 'assistant', content: text } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockOpenAIChat(text: string): Response {
  return new Response(
    JSON.stringify({ id: 'chatcmpl-123', object: 'chat.completion', model: 'qwen2:7b', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('LocalLLMProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_ENDPOINT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exposes modelName with defaults', () => {
    const provider = new LocalLLMProvider();
    expect(provider.modelName()).toBe('qwen2:7b');
  });

  it('respects custom modelName', () => {
    const provider = new LocalLLMProvider({ modelName: 'custom-llm' });
    expect(provider.modelName()).toBe('custom-llm');
  });

  it('throws for empty prompt', async () => {
    const provider = new LocalLLMProvider({ fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(provider.generate({ prompt: '   ' })).rejects.toThrow(/non-empty prompt/);
    await expect(provider.generate({ prompt: '' })).rejects.toThrow();
  });

  it('fetches Ollama generate and parses response', async () => {
    const fetchMock = vi.fn(async () => mockOllamaGenerate('Hello from Ollama'));
    const provider = new LocalLLMProvider({
      modelName: 'qwen2:7b',
      baseUrl: 'http://localhost:11434',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await provider.generate({ prompt: 'Hi' });
    expect(res.text).toBe('Hello from Ollama');
    expect(res.model).toBe('qwen2:7b');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body.model).toBe('qwen2:7b');
    expect(body.prompt).toBe('Hi');
  });

  it('handles Ollama chat response shape', async () => {
    const fetchMock = vi.fn(async () => mockOllamaChat('Chat hello'));
    const provider = new LocalLLMProvider({
      endpoint: 'http://localhost:11434/api/chat',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const res = await provider.generate({ prompt: 'Hi', systemPrompt: 'You are helpful' });
    expect(res.text).toBe('Chat hello');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.anything());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
    ]);
  });

  it('handles OpenAI chat completions shape', async () => {
    const fetchMock = vi.fn(async () => mockOpenAIChat('OpenAI hello'));
    const provider = new LocalLLMProvider({
      baseUrl: 'http://localhost:8000/v1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const res = await provider.generate({ prompt: 'Hi' });
    expect(res.text).toBe('OpenAI hello');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/v1/chat/completions', expect.anything());
  });

  it('throws on HTTP error', async () => {
    const fetchMock = vi.fn(async () => new Response('Internal Error', { status: 500, statusText: 'Internal Server Error' }));
    const provider = new LocalLLMProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.generate({ prompt: 'test' })).rejects.toThrow(/LLM request failed.*500/);
  });

  it('throws on unexpected shape', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new LocalLLMProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.generate({ prompt: 'test' })).rejects.toThrow(/Unexpected LLM response/);
  });

  it('handles custom endpoint override', async () => {
    const fetchMock = vi.fn(async () => mockOllamaGenerate('hi'));
    const provider = new LocalLLMProvider({
      endpoint: 'http://custom:9000/custom/generate',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.generate({ prompt: 'test' });
    expect(fetchMock).toHaveBeenCalledWith('http://custom:9000/custom/generate', expect.anything());
  });

  it('resolves baseUrl with trailing slash', async () => {
    const fetchMock = vi.fn(async () => mockOllamaGenerate('hi'));
    const provider = new LocalLLMProvider({
      baseUrl: 'http://localhost:11434/',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.generate({ prompt: 'test' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.anything());
  });

  it('createLocalLLMProvider factory works', async () => {
    const fetchMock = vi.fn(async () => mockOllamaGenerate('factory'));
    const provider = createLocalLLMProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    expect(provider.modelName()).toBe('qwen2:7b');
    const res = await provider.generate({ prompt: 'test' });
    expect(res.text).toBe('factory');
  });

  it('passes temperature and maxTokens', async () => {
    const fetchMock = vi.fn(async () => mockOllamaGenerate('hi'));
    const provider = new LocalLLMProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    await provider.generate({ prompt: 'test', temperature: 0.7, maxTokens: 100 });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    // For ollama-generate, options contains temperature and num_predict
    const options = (body.options as Record<string, unknown>) ?? body;
    expect(options.temperature ?? body.temperature).toBeDefined();
  });
});

describe('createLLMProvider factory switch', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns mock by default', async () => {
    delete process.env.LLM_PROVIDER;
    const provider = createLLMProvider();
    expect(provider.modelName()).toBe('mock-qwen2-7b');
  });

  it('returns local for ollama/openai aliases', () => {
    for (const alias of ['local', 'ollama', 'vllm', 'openai', 'http']) {
      process.env.LLM_PROVIDER = alias;
      const provider = createLLMProvider();
      expect(provider).toBeInstanceOf(LocalLLMProvider);
    }
  });

  it('respects explicit provider option over env', () => {
    process.env.LLM_PROVIDER = 'mock';
    const provider = createLLMProvider({ provider: 'local' });
    expect(provider).toBeInstanceOf(LocalLLMProvider);
  });

  it('respects modelName from env for local', () => {
    process.env.LLM_PROVIDER = 'local';
    process.env.LLM_MODEL = 'my-model';
    const provider = createLLMProvider();
    expect(provider.modelName()).toBe('my-model');
  });

  it('options override env', () => {
    process.env.LLM_PROVIDER = 'local';
    process.env.LLM_MODEL = 'env-model';
    const provider = createLLMProvider({ modelName: 'opt-model' });
    expect(provider.modelName()).toBe('opt-model');
  });
});
