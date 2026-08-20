import { createHash } from 'node:crypto';

import type { GenerateRequest, GenerateResponse, LLMProvider, LLMProviderOptions } from './llm.js';

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

    // Simulate a grounded answer for institutional queries
    if (
      lower.includes('examination') ||
      lower.includes('exam form') ||
      lower.includes('institutional') ||
      lower.includes('deadline') ||
      lower.includes('hostel')
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

    // Unsupported / no-answer case
    if (lower.includes('no-answer') || lower.includes('unknown') || lower.includes('unsupported')) {
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

export function createLLMProvider(options?: LLMProviderOptions & { provider?: string }): LLMProvider {
  const provider = (options?.provider ?? process.env.LLM_PROVIDER ?? 'mock').toLowerCase();
  const isMock = provider === 'mock' || provider === 'test';

  if (isMock) {
    return createMockLLMProvider(options);
  }

  // For now, only mock is implemented; P8-002 will add local Ollama/vLLM adapter
  // behind the same factory. Throw for unimplemented providers to fail fast.
  throw new Error(`LLM provider "${provider}" not yet implemented. Use "mock" or implement P8-002.`);
}
