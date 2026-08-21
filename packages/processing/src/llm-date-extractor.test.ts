import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmDateExtractor, createLlmDateExtractor } from './llm-date-extractor.js';
import { createDateExtractor as createFactoryDateExtractor } from './date-factory.js';
import { HeuristicDateExtractor } from './heuristic-date-extractor.js';
import type { LLMProvider } from './llm.js';
import { dateExtractionResultSchema } from './dates.js';

function makeMockLLM(jsonText: string, modelName = 'mock-qwen2-7b'): LLMProvider {
  return {
    modelName: () => modelName,
    generate: vi.fn(async () => ({
      text: jsonText,
      model: modelName,
    })),
  };
}

function validJson(overrides: Record<string, unknown> = {}): string {
  const base = {
    dates: [
      {
        raw: '18 August 2026',
        isoDate: '2026-08-18',
        label: 'deadline',
        type: 'DEADLINE',
        context: 'Submit by 18 August 2026.',
        confidence: 0.9,
      },
    ],
    provider: 'llm',
    confidence: 0.9,
    ...overrides,
  };
  return JSON.stringify(base);
}

describe('LlmDateExtractor', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DATE_PROVIDER;
    delete process.env.METADATA_PROVIDER;
    delete process.env.LLM_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exposes name with llm model', () => {
    const llm = makeMockLLM(validJson());
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    expect(extractor.name()).toBe('llm:mock-qwen2-7b');
  });

  it('extracts dates via LLM when JSON valid', async () => {
    const llm = makeMockLLM(validJson());
    const extractor = new LlmDateExtractor({ llmProvider: llm });

    const result = await extractor.extract({
      text: 'Examination deadline is 18 August 2026 for BTECH.',
      filename: 'notice.pdf',
    });

    expect(result.dates.length).toBe(1);
    expect(result.dates[0]!.raw).toBe('18 August 2026');
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
    expect(result.dates[0]!.label).toBe('deadline');
    expect(result.provider).toBe('llm');
    expect(() => dateExtractionResultSchema.parse(result)).not.toThrow();
    expect(llm.generate).toHaveBeenCalledTimes(1);
    const call = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      prompt: string;
      systemPrompt: string;
    };
    expect(call.systemPrompt).toContain('date extraction');
    expect(call.prompt).toContain('18 August');
  });

  it('falls back to heuristic when text is empty (no LLM call)', async () => {
    const llm = makeMockLLM(validJson());
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: '   ' });
    expect(result.provider).toBe('heuristic');
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('falls back when LLM returns invalid JSON', async () => {
    const llm = makeMockLLM('not json');
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Deadline 18 August 2026' });
    expect(result.provider).toBe('heuristic');
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
  });

  it('parses JSON inside markdown fences', async () => {
    const fenced = '```json\n' + validJson() + '\n```';
    const llm = makeMockLLM(fenced);
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Deadline text' });
    expect(result.dates[0]!.raw).toBe('18 August 2026');
  });

  it('extracts JSON when wrapped with extra text', async () => {
    const wrapped = 'Here is JSON: ' + validJson() + ' done.';
    const llm = makeMockLLM(wrapped);
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Wrapped' });
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
  });

  it('falls back when LLM throws', async () => {
    const llm: LLMProvider = {
      modelName: () => 'failing',
      generate: vi.fn(async () => {
        throw new Error('LLM unavailable');
      }),
    };
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Deadline 18 August 2026' });
    expect(result.provider).toBe('heuristic');
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
  });

  it('handles empty LLM response via fallback', async () => {
    const llm = makeMockLLM('   ');
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Deadline 18 August 2026' });
    expect(result.provider).toBe('heuristic');
  });

  it('handles no dates via LLM', async () => {
    const llm = makeMockLLM(JSON.stringify({ dates: [], provider: 'llm', confidence: 0.2 }));
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'No dates here' });
    expect(result.dates).toEqual([]);
    expect(result.provider).toBe('llm');
  });

  it('caps dates at 20', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      raw: `2026-08-${String(i + 1).padStart(2, '0')}`,
      isoDate: `2026-08-${String(i + 1).padStart(2, '0')}`,
      label: null,
      type: null,
      context: null,
      confidence: 0.8,
    }));
    const llm = makeMockLLM(JSON.stringify({ dates: many, provider: 'llm', confidence: 0.8 }));
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'many dates' });
    expect(result.dates.length).toBe(20);
  });

  it('normalizes type case-insensitively', async () => {
    const llm = makeMockLLM(
      JSON.stringify({
        dates: [{ raw: '18 August 2026', isoDate: '2026-08-18', label: 'deadline', type: 'deadline', context: null, confidence: 0.9 }],
        provider: 'llm',
        confidence: 0.9,
      }),
    );
    const extractor = new LlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'text' });
    expect(result.dates[0]!.type).toBe('DEADLINE');
  });

  it('truncates long text before LLM', async () => {
    const long = 'A'.repeat(5000);
    const llm = makeMockLLM(validJson());
    const extractor = new LlmDateExtractor({ llmProvider: llm, maxTextChars: 100 });
    await extractor.extract({ text: long });
    const prompt = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0].prompt as string;
    expect(prompt).toContain('[truncated]');
  });

  it('createLlmDateExtractor factory works', async () => {
    const llm = makeMockLLM(validJson({ dates: [{ raw: '2026-08-18', isoDate: '2026-08-18', label: null, type: null, context: null, confidence: 0.8 }], provider: 'llm', confidence: 0.8 } as unknown as Record<string, unknown>));
    const extractor = createLlmDateExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Factory test 2026-08-18' });
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
  });

  it('always returns schema-conformant result', async () => {
    const cases = [
      { text: 'Deadline 18 August 2026', json: validJson() },
      { text: 'Random', json: 'not json' },
      { text: 'ISO 2026-08-18', json: JSON.stringify({ dates: [], provider: 'llm', confidence: 0.2 }) },
    ];
    for (const c of cases) {
      const llm = makeMockLLM(c.json);
      const extractor = new LlmDateExtractor({ llmProvider: llm });
      const result = await extractor.extract({ text: c.text });
      expect(() => dateExtractionResultSchema.parse(result)).not.toThrow();
    }
  });
});

describe('createDateExtractor factory (date-factory)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns heuristic by default', () => {
    delete process.env.DATE_PROVIDER;
    delete process.env.METADATA_PROVIDER;
    delete process.env.LLM_PROVIDER;
    const extractor = createFactoryDateExtractor();
    expect(extractor).toBeInstanceOf(HeuristicDateExtractor);
    expect(extractor.name()).toBe('heuristic');
  });

  it('returns llm extractor when DATE_PROVIDER=llm', () => {
    process.env.DATE_PROVIDER = 'llm';
    process.env.LLM_PROVIDER = 'mock';
    const extractor = createFactoryDateExtractor();
    expect(extractor).toBeInstanceOf(LlmDateExtractor);
    expect(extractor.name()).toContain('llm');
  });

  it('returns llm for local aliases', () => {
    for (const alias of ['local', 'ollama', 'openai', 'vllm', 'http', 'mock']) {
      process.env.DATE_PROVIDER = alias;
      const extractor = createFactoryDateExtractor();
      expect(extractor).toBeInstanceOf(LlmDateExtractor);
    }
  });

  it('falls back to METADATA_PROVIDER then LLM_PROVIDER', () => {
    delete process.env.DATE_PROVIDER;
    process.env.METADATA_PROVIDER = 'llm';
    expect(createFactoryDateExtractor()).toBeInstanceOf(LlmDateExtractor);
    delete process.env.METADATA_PROVIDER;
    process.env.LLM_PROVIDER = 'llm';
    expect(createFactoryDateExtractor()).toBeInstanceOf(LlmDateExtractor);
  });

  it('returns heuristic for non-llm', () => {
    process.env.DATE_PROVIDER = 'heuristic';
    const extractor = createFactoryDateExtractor();
    expect(extractor).toBeInstanceOf(HeuristicDateExtractor);
  });

  it('explicit provider option overrides env', () => {
    process.env.DATE_PROVIDER = 'heuristic';
    const extractor = createFactoryDateExtractor({ provider: 'llm' });
    expect(extractor).toBeInstanceOf(LlmDateExtractor);
  });

  it('respects llmProvider option', async () => {
    const llm = makeMockLLM(validJson());
    const extractor = createFactoryDateExtractor({ provider: 'llm', llmProvider: llm });
    const result = await extractor.extract({ text: 'Explicit 18 August 2026' });
    expect(result.dates[0]!.raw).toBe('18 August 2026');
  });
});
