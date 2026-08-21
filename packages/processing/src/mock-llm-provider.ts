import { createHash } from 'node:crypto';

import type { GenerateRequest, GenerateResponse, LLMProvider, LLMProviderOptions } from './llm.js';
import { LocalLLMProvider, type LocalLLMProviderOptions } from './local-llm-provider.js';
import { CloudLLMProvider } from './cloud-llm-provider.js';

/**
 * Deterministic mock LLM provider for tests and local development (P8-001).
 *
 * Produces predictable, prompt-hash-based responses so that:
 * - same prompt → same response (deterministic)
 * - different prompts → different responses
 * - no external model or network call is required
 *
 * The mock does NOT attempt to be factually correct; it is a contract
 * placeholder for the real Ollama/vLLM/cloud adapters (P8-002/003).
 * For RAG, the mock will return a canned grounded answer with citations
 * when the prompt contains "institutional" or "examination" etc., and an
 * unsupported answer otherwise.
 */
export class MockLLMProvider implements LLMProvider {
  private readonly _modelName: string;

  constructor(options: LLMProviderOptions = {}) {
    this._modelName = options.modelName ?? 'mock-qwen2-7b';
  }

  modelName(): string {
    return this._modelName;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    if (!request || typeof request.prompt !== 'string' || !request.prompt.trim()) {
      throw new Error('generate() expects a non-empty prompt');
    }

    const prompt = request.prompt.trim();
    const lower = prompt.toLowerCase();

    // Extract the question part (first line after "Question:") for intent detection
    // so that the instructions' "no-answer" doesn't poison grounded queries
    const questionMatch = prompt.match(/Question:\s*([^\n]+)/i);
    const questionLower = questionMatch ? questionMatch[1]!.toLowerCase() : lower;

    // Unsupported / no-answer case — check question only, so that "unknown" in the question triggers it
    // but "no-answer" in the instructions does not
    if (
      questionLower.includes('no-answer') ||
      questionLower.includes('unknown') ||
      questionLower.includes('unsupported')
    ) {
      return {
        text: "I couldn't find an official institutional document confirming this.",
        model: this._modelName,
        usage: {
          promptTokens: Math.ceil(prompt.length / 4),
          completionTokens: 12,
          totalTokens: Math.ceil(prompt.length / 4) + 12,
        },
      };
    }

    // Simulate a grounded answer for institutional queries (includes RAG eval dataset keywords)
    if (
      lower.includes('examination') ||
      lower.includes('exam form') ||
      lower.includes('institutional') ||
      lower.includes('deadline') ||
      lower.includes('hostel') ||
      lower.includes('cse') ||
      lower.includes('holiday') ||
      lower.includes('schedule') ||
      lower.includes('परीक्षा') ||
      lower.includes('फॉर्म') ||
      lower.includes('हॉस्टल') ||
      lower.includes('exam form ka') ||
      lower.includes('last date')
    ) {
      // Deterministic hash-based fact to make responses distinct per prompt but grounded
      const hash = createHash('sha256').update(prompt).digest('hex').slice(0, 8);
      return {
        text: `According to the institutional document, the deadline is 18 August 2026. [hash:${hash}]`,
        model: this._modelName,
        usage: {
          promptTokens: Math.ceil(prompt.length / 4),
          completionTokens: 20,
          totalTokens: Math.ceil(prompt.length / 4) + 20,
        },
      };
    }

    // Generic deterministic response
    const hash = createHash('sha256').update(prompt).digest('hex').slice(0, 6);
    return {
      text: `Mock answer for: ${prompt.slice(0, 80)} [${hash}]`,
      model: this._modelName,
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: 15,
        totalTokens: Math.ceil(prompt.length / 4) + 15,
      },
    };
  }
}

export function createMockLLMProvider(options?: LLMProviderOptions): LLMProvider {
  return new MockLLMProvider(options);
}

export type LLMFactoryOptions = LLMProviderOptions &
  LocalLLMProviderOptions & { provider?: string };

export function createLLMProvider(options?: LLMFactoryOptions): LLMProvider {
  const provider = (options?.provider ?? process.env.LLM_PROVIDER ?? 'mock').toLowerCase();
  const isMock = provider === 'mock' || provider === 'test';

  if (isMock) {
    return createMockLLMProvider(options ?? {});
  }

  const isLocal =
    provider === 'local' ||
    provider === 'ollama' ||
    provider === 'vllm' ||
    provider === 'openai' ||
    provider === 'http';

  if (isLocal) {
    const modelName = options?.modelName ?? process.env.LLM_MODEL ?? process.env.LLM_MODEL_NAME;
    const baseUrl = options?.baseUrl ?? process.env.LLM_BASE_URL ?? process.env.OLLAMA_BASE_URL;
    const endpoint = options?.endpoint ?? process.env.LLM_ENDPOINT;
    return new LocalLLMProvider({
      ...options,
      modelName: modelName ?? 'qwen2:7b',
      baseUrl,
      endpoint,
    });
  }

  const isCloud =
    provider === 'cloud' ||
    provider === 'openai' ||
    provider === 'anthropic' ||
    provider === 'gemini' ||
    provider === 'cloud-openai' ||
    provider === 'cloud-anthropic';

  if (isCloud) {
    return new CloudLLMProvider(options as unknown as import('./cloud-llm-provider.js').CloudLLMProviderOptions);
  }

  throw new Error(`LLM provider "${provider}" not yet implemented. Use "mock", "local", or "cloud".`);
}
