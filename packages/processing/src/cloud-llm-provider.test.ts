import { describe, expect, it, vi } from 'vitest';

import { CloudLLMProvider, createCloudLLMProvider } from './cloud-llm-provider.js';
import { createLLMProvider } from './mock-llm-provider.js';

describe('CloudLLMProvider (P8-003)', () => {
  it('has a default model name', () => {
    const provider = new CloudLLMProvider();
    expect(provider.modelName()).toBeTruthy();
  });

  it('returns mock-like greeting for empty check', async () => {
    await expect(new CloudLLMProvider().generate({ prompt: '   ' } as never)).rejects.toThrow(
      /non-empty/,
    );
  });

  it('calls OpenAI chat completions and parses choices', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: 'gpt-4o-mini',
            choices: [{ message: { content: 'Hello from cloud' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const provider = new CloudLLMProvider({
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await provider.generate({ prompt: 'Hello', maxTokens: 10 });
    expect(res.text).toBe('Hello from cloud');
    expect(res.model).toBe('gpt-4o-mini');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, opts] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toContain('/v1/chat/completions');
    expect(opts.body as string).toContain('"model"');
  });

  it('calls Anthropic messages and parses content', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: 'claude-3-haiku-20240307',
            content: [{ type: 'text', text: 'Hi from Anthropic' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const provider = new CloudLLMProvider({
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await provider.generate({ prompt: 'Hello', systemPrompt: 'You are helpful' });
    expect(res.text).toBe('Hi from Anthropic');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, opts] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toContain('/v1/messages');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.system).toBe('You are helpful');
  });

  it('throws on HTTP error', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );
    const provider = new CloudLLMProvider({
      provider: 'openai',
      apiKey: 'bad',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(provider.generate({ prompt: 'Hello' })).rejects.toThrow(/401/);
  });

  it('factory creates cloud provider via env', () => {
    const original = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = 'cloud';
    const provider = createLLMProvider({ provider: 'cloud' } as never);
    expect(provider.modelName()).toBeTruthy();
    process.env.LLM_PROVIDER = original;
  });

  it('factory creates cloud openai via env', () => {
    const provider = createLLMProvider({ provider: 'cloud', apiKey: 'sk-test' } as never);
    expect(provider).toBeInstanceOf(CloudLLMProvider);
  });

  it('factory creates anthropic', () => {
    const provider = createCloudLLMProvider({ provider: 'anthropic', apiKey: 'sk-ant' });
    expect(provider.modelName()).toContain('claude');
  });
});
