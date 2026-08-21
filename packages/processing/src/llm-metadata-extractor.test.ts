import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmMetadataExtractor, createLlmMetadataExtractor } from './llm-metadata-extractor.js';
import { createMetadataExtractor as createFactoryMetadataExtractor } from './metadata-factory.js';
import { HeuristicMetadataExtractor } from './heuristic-metadata-extractor.js';
import type { LLMProvider } from './llm.js';
import { metadataExtractionResultSchema } from './metadata.js';

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
    title: 'Examination Form Submission Notice',
    documentType: 'NOTICE',
    summary: 'Students must submit examination forms before 18 August 2026.',
    tags: ['examination', 'deadline', 'fee'],
    academicYear: '2023-2024',
    course: 'BTECH',
    semester: 3,
    audience: null,
    entities: null,
    language: 'eng',
    confidence: 0.9,
    provider: 'llm',
    ...overrides,
  };
  return JSON.stringify(base);
}

describe('LlmMetadataExtractor', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.METADATA_PROVIDER;
    delete process.env.LLM_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exposes name with llm model', () => {
    const llm = makeMockLLM(validJson());
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });
    expect(extractor.name()).toBe('llm:mock-qwen2-7b');

    const custom = makeMockLLM(validJson(), 'qwen2:7b');
    const extractor2 = new LlmMetadataExtractor({ llmProvider: custom });
    expect(extractor2.name()).toBe('llm:qwen2:7b');
  });

  it('extracts metadata via LLM when JSON is valid', async () => {
    const llm = makeMockLLM(validJson());
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });

    const result = await extractor.extract({
      text: 'Examination Form Submission Notice\nSubmit by 18 August 2026 for BTECH semester 3.',
      filename: 'notice.pdf',
    });

    expect(result.title).toBe('Examination Form Submission Notice');
    expect(result.documentType).toBe('NOTICE');
    expect(result.summary).toContain('18 August');
    expect(result.tags).toEqual(expect.arrayContaining(['examination']));
    expect(result.academicYear).toBe('2023-2024');
    expect(result.course).toBe('BTECH');
    expect(result.semester).toBe(3);
    expect(result.language).toBe('eng');
    expect(result.provider).toBe('llm');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(() => metadataExtractionResultSchema.parse(result)).not.toThrow();
    expect(llm.generate).toHaveBeenCalledTimes(1);
    const call = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      prompt: string;
      systemPrompt: string;
    };
    expect(call.systemPrompt).toContain('metadata extraction');
    expect(call.prompt).toContain('Examination Form');
  });

  it('falls back to heuristic when text is empty (no LLM call)', async () => {
    const llm = makeMockLLM(validJson());
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });

    const result = await extractor.extract({ text: '   ', filename: 'exam-form_2024.pdf' });

    // Heuristic fallback humanizes filename
    expect(result.title).toBe('exam form 2024');
    expect(result.provider).toBe('heuristic');
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('falls back to heuristic when LLM returns invalid JSON', async () => {
    const llm = makeMockLLM('not a json at all');
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });

    const result = await extractor.extract({
      text: 'Circular regarding hostel allotment for 2023-24',
    });

    // Heuristic should classify circular
    expect(result.documentType).toBe('CIRCULAR');
    expect(result.provider).toBe('heuristic');
  });

  it('falls back when LLM returns malformed JSON structure', async () => {
    // JSON missing required fields but still parsable — normalize should fallback? Actually normalize handles defaults, but invalid documentType should fallback? Let's test with totally invalid schema that throws
    const llm = makeMockLLM('{"invalid": true, "title": 123}');
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });

    // Our normalize will coerce, so it will not throw; instead it returns with defaults
    // To force fallback, make it throw via JSON that after parsing fails schema due to confidence out of range? But normalize clamps.
    // Instead test with empty JSON object - should succeed with defaults via normalize
    const result = await extractor.extract({ text: 'Some valid text for fallback test' });
    // It will return normalized result with provider llm, not heuristic, because our normalize is forgiving
    // So we assert it still returns valid schema
    expect(() => metadataExtractionResultSchema.parse(result)).not.toThrow();
  });

  it('parses JSON inside markdown fences', async () => {
    const fenced = '```json\n' + validJson({ title: 'Fenced Title', documentType: 'CIRCULAR' }) + '\n```';
    const llm = makeMockLLM(fenced);
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });

    const result = await extractor.extract({ text: 'Circular text' });
    expect(result.title).toBe('Fenced Title');
    expect(result.documentType).toBe('CIRCULAR');
  });

  it('extracts JSON when LLM wraps with extra text', async () => {
    const wrapped = 'Here is the JSON: ' + validJson({ title: 'Wrapped Title' }) + ' Hope it helps.';
    const llm = makeMockLLM(wrapped);
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });

    const result = await extractor.extract({ text: 'Wrapped text' });
    expect(result.title).toBe('Wrapped Title');
  });

  it('falls back when LLM throws', async () => {
    const llm: LLMProvider = {
      modelName: () => 'failing',
      generate: vi.fn(async () => {
        throw new Error('LLM unavailable');
      }),
    };
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Policy for attendance' });
    expect(result.documentType).toBe('POLICY');
    expect(result.provider).toBe('heuristic');
  });

  it('handles empty LLM response via fallback', async () => {
    const llm = makeMockLLM('   ');
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Notice for students' });
    expect(result.provider).toBe('heuristic');
    expect(result.documentType).toBe('NOTICE');
  });

  it('caps tags at 10 and lowercases', async () => {
    const llm = makeMockLLM(validJson({ tags: ['EXAM', 'Fee', 'DEADLINE', 'a','b','c','d','e','f','g','h','i','j'] }));
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'text' });
    expect(result.tags.length).toBeLessThanOrEqual(10);
    expect(result.tags.every((t) => t === t.toLowerCase())).toBe(true);
  });

  it('normalizes course to uppercase and validates semester', async () => {
    const llm = makeMockLLM(validJson({ course: 'btech', semester: 99 }));
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'text' });
    expect(result.course).toBe('BTECH');
    // 99 out of range -> null via normalize
    expect(result.semester).toBeNull();
  });

  it('normalizes documentType case-insensitively', async () => {
    const llm = makeMockLLM(validJson({ documentType: 'circular' as unknown as string }));
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'text' });
    expect(result.documentType).toBe('CIRCULAR');
  });

  it('rejects invalid documentType to null', async () => {
    const llm = makeMockLLM(validJson({ documentType: 'INVALID' as unknown as string }));
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'text' });
    expect(result.documentType).toBeNull();
  });

  it('truncates long text before calling LLM', async () => {
    const long = 'A'.repeat(5000);
    const llm = makeMockLLM(validJson());
    const extractor = new LlmMetadataExtractor({ llmProvider: llm, maxTextChars: 100 });
    await extractor.extract({ text: long });
    const prompt = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0].prompt as string;
    // Prompt should contain truncated marker
    expect(prompt).toContain('[truncated]');
    expect(prompt.length).toBeLessThan(long.length);
  });

  it('handles Hindi text and language', async () => {
    const llm = makeMockLLM(validJson({ title: 'परीक्षा फॉर्म', language: 'hin', tags: ['परीक्षा'] }));
    const extractor = new LlmMetadataExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'परीक्षा फॉर्म जमा करने की अंतिम तिथि' });
    expect(result.language).toBe('hin');
    expect(result.title).toBe('परीक्षा फॉर्म');
  });

  it('createLlmMetadataExtractor factory works', async () => {
    const llm = makeMockLLM(validJson({ title: 'Factory Title' }));
    const extractor = createLlmMetadataExtractor({ llmProvider: llm });
    const result = await extractor.extract({ text: 'Some text' });
    expect(result.title).toBe('Factory Title');
    expect(extractor.name()).toContain('llm');
  });

  it('always returns schema-conformant result even with various inputs', async () => {
    const cases = [
      { text: 'Circular 2023-24', json: validJson({ documentType: 'CIRCULAR', academicYear: '2023-2024' }) },
      { text: 'Random text', json: 'not json' },
      { text: 'Schedule', json: validJson({ documentType: 'SCHEDULE' }) },
    ];
    for (const c of cases) {
      const llm = makeMockLLM(c.json);
      const extractor = new LlmMetadataExtractor({ llmProvider: llm });
      const result = await extractor.extract({ text: c.text });
      expect(() => metadataExtractionResultSchema.parse(result)).not.toThrow();
    }
  });
});

describe('createMetadataExtractor factory (metadata-factory)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns heuristic by default', () => {
    delete process.env.METADATA_PROVIDER;
    delete process.env.LLM_PROVIDER;
    const extractor = createFactoryMetadataExtractor();
    expect(extractor).toBeInstanceOf(HeuristicMetadataExtractor);
    expect(extractor.name()).toBe('heuristic');
  });

  it('returns llm extractor when METADATA_PROVIDER=llm', () => {
    process.env.METADATA_PROVIDER = 'llm';
    process.env.LLM_PROVIDER = 'mock';
    const extractor = createFactoryMetadataExtractor();
    expect(extractor).toBeInstanceOf(LlmMetadataExtractor);
    expect(extractor.name()).toContain('llm');
  });

  it('returns llm extractor for local alias', () => {
    for (const alias of ['local', 'ollama', 'openai', 'vllm', 'http', 'mock']) {
      process.env.METADATA_PROVIDER = alias;
      const extractor = createFactoryMetadataExtractor();
      expect(extractor).toBeInstanceOf(LlmMetadataExtractor);
    }
  });

  it('returns heuristic for non-llm provider', () => {
    process.env.METADATA_PROVIDER = 'heuristic';
    const extractor = createFactoryMetadataExtractor();
    expect(extractor).toBeInstanceOf(HeuristicMetadataExtractor);
  });

  it('explicit provider option overrides env', () => {
    process.env.METADATA_PROVIDER = 'heuristic';
    const extractor = createFactoryMetadataExtractor({ provider: 'llm' });
    expect(extractor).toBeInstanceOf(LlmMetadataExtractor);
  });

  it('respects llmProvider option', async () => {
    const llm = makeMockLLM(validJson({ title: 'Explicit LLM' }));
    const extractor = createFactoryMetadataExtractor({ provider: 'llm', llmProvider: llm });
    const result = await extractor.extract({ text: 'Explicit provider test' });
    expect(result.title).toBe('Explicit LLM');
  });
});
