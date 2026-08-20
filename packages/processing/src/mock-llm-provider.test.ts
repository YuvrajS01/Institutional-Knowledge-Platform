import { describe, expect, it } from 'vitest';

import { createLLMProvider, createMockLLMProvider, MockLLMProvider } from './mock-llm-provider.js';

describe('MockLLMProvider', () => {
  it('exposes modelName', () => {
    const provider = createMockLLMProvider();
    expect(provider.modelName()).toBe('mock-qwen2-7b');
    const custom = createMockLLMProvider({ modelName: 'custom-llm' });
    expect(custom.modelName()).toBe('custom-llm');
  });

  it('generates grounded answer for institutional query', async () => {
    const provider = createMockLLMProvider();
    const res = await provider.generate({ prompt: 'When is the examination form deadline?' });
    expect(res.text).toContain('18 August 2026');
    expect(res.model).toBe('mock-qwen2-7b');
    expect(res.usage?.promptTokens).toBeGreaterThan(0);
  });

  it('is deterministic: same prompt yields same response', async () => {
    const provider = createMockLLMProvider();
    const a = await provider.generate({ prompt: 'What is the hostel deadline?' });
    const b = await provider.generate({ prompt: 'What is the hostel deadline?' });
    expect(a.text).toBe(b.text);
  });

  it('different prompts yield different responses', async () => {
    const provider = createMockLLMProvider();
    const a = await provider.generate({ prompt: 'Examination form deadline?' });
    const b = await provider.generate({ prompt: 'Hostel fee circular?' });
    expect(a.text).not.toBe(b.text);
  });

  it('returns unsupported answer for unknown query', async () => {
    const provider = createMockLLMProvider();
    const res = await provider.generate({ prompt: 'What is the unknown thing no-answer?' });
    expect(res.text).toBe("I couldn't find an official institutional document confirming this.");
  });

  it('throws for empty prompt', async () => {
    const provider = createMockLLMProvider();
    await expect(provider.generate({ prompt: '   ' })).rejects.toThrow();
    await expect(provider.generate({ prompt: '' })).rejects.toThrow();
  });

  it('handles generic prompt', async () => {
    const provider = createMockLLMProvider();
    const res = await provider.generate({ prompt: 'Hello world, how are you?' });
    expect(res.text).toContain('Mock answer for:');
    expect(res.text).toContain('Hello world');
  });

  it('createLLMProvider factory returns mock by default', async () => {
    const provider = createLLMProvider();
    expect(provider.modelName()).toBe('mock-qwen2-7b');
    const res = await provider.generate({ prompt: 'test' });
    expect(res.text).toBeTruthy();
  });

  it('throws for unimplemented provider', () => {
    expect(() => createLLMProvider({ provider: 'ollama' })).toThrow(/not yet implemented/);
  });

  it('implements LLMProvider interface correctly', () => {
    const provider: InstanceType<typeof MockLLMProvider> = new MockLLMProvider();
    expect(typeof provider.modelName).toBe('function');
    expect(typeof provider.generate).toBe('function');
  });
});
