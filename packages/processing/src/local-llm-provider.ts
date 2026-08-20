import type { GenerateRequest, GenerateResponse, LLMProvider, LLMProviderOptions } from './llm.js';

export interface LocalLLMProviderOptions extends LLMProviderOptions {
  /** Base URL for the LLM service (e.g., http://localhost:11434) */
  baseUrl?: string;
  /** Full endpoint override (e.g., http://localhost:11434/api/generate) */
  endpoint?: string;
  /** Request timeout in ms (default 60_000) */
  timeoutMs?: number;
  /** Custom fetch implementation for testing */
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 60_000;

function resolveEndpoint(baseUrl: string, endpoint?: string): { url: string; style: 'ollama-generate' | 'ollama-chat' | 'openai' } {
  if (endpoint) {
    const lower = endpoint.toLowerCase();
    if (lower.includes('/v1/') || lower.includes('openai') || lower.includes('/chat/completions')) {
      return { url: endpoint, style: 'openai' };
    }
    if (lower.includes('/api/chat')) return { url: endpoint, style: 'ollama-chat' };
    return { url: endpoint, style: 'ollama-generate' };
  }
  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/v1/chat/completions')) return { url: trimmed, style: 'openai' };
  if (trimmed.endsWith('/v1')) return { url: `${trimmed}/chat/completions`, style: 'openai' };
  if (trimmed.includes('/v1/')) return { url: trimmed, style: 'openai' };
  if (trimmed.endsWith('/api/chat')) return { url: trimmed, style: 'ollama-chat' };
  // Default Ollama generate
  return { url: `${trimmed}/api/generate`, style: 'ollama-generate' };
}

/**
 * Local / Ollama / OpenAI-compatible LLM provider (P8-002).
 *
 * Thin HTTP adapter, provider-agnostic (ADR-003/007). Supports:
 * - Ollama `POST /api/generate` and `POST /api/chat`
 * - OpenAI `POST /v1/chat/completions`
 *
 * No model is bundled; the service must be running (Ollama, vLLM, etc.).
 */
export class LocalLLMProvider implements LLMProvider {
  private readonly _modelName: string;
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly endpointStyle: 'ollama-generate' | 'ollama-chat' | 'openai';
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LocalLLMProviderOptions = {}) {
    this._modelName = options.modelName ?? 'qwen2:7b';
    this.baseUrl = options.baseUrl ?? process.env.LLM_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    const resolved = resolveEndpoint(this.baseUrl, options.endpoint);
    this.endpoint = resolved.url;
    this.endpointStyle = resolved.style;
  }

  modelName(): string {
    return this._modelName;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    if (!request || typeof request.prompt !== 'string' || !request.prompt.trim()) {
      throw new Error('generate() expects a non-empty prompt');
    }
    const prompt = request.prompt.trim();
    const systemPrompt = request.systemPrompt?.trim() || undefined;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const { body, headers } = this.buildRequest(prompt, systemPrompt, request);

      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`LLM request failed (${response.status} ${response.statusText}) at ${this.endpoint}: ${text.slice(0, 500)}`);
      }

      const json = (await response.json()) as Record<string, unknown>;

      // Parse flexibly
      // Ollama generate: { response: "...", model: "..." }
      if (typeof (json as { response?: unknown }).response === 'string') {
        return {
          text: ((json as { response: string }).response).trim(),
          model: (json.model as string) ?? this._modelName,
          raw: json,
        };
      }
      // Ollama chat: { message: { content: "..." }, model: "..." }
      if (
        typeof (json as { message?: unknown }).message === 'object' &&
        (json as { message: { content?: unknown } }).message?.content !== undefined
      ) {
        const content = (json as { message: { content: string } }).message.content;
        return {
          text: String(content).trim(),
          model: (json.model as string) ?? this._modelName,
          raw: json,
        };
      }
      // OpenAI chat completions: { choices: [{ message: { content: "..." } }] }
      if (Array.isArray((json as { choices?: unknown }).choices)) {
        const choices = (json as { choices: Array<{ message?: { content?: string }; text?: string }> }).choices;
        const first = choices[0];
        if (first) {
          const content = first.message?.content ?? first.text ?? '';
          return {
            text: String(content).trim(),
            model: (json.model as string) ?? this._modelName,
            raw: json,
          };
        }
      }
      // OpenAI completions fallback: { choices: [{ text: "..." }] } already handled above
      // Generic fallback: { text: "..." } or { content: "..." }
      if (typeof (json as { text?: unknown }).text === 'string') {
        return { text: ((json as { text: string }).text).trim(), model: this._modelName, raw: json };
      }
      if (typeof (json as { content?: unknown }).content === 'string') {
        return { text: ((json as { content: string }).content).trim(), model: this._modelName, raw: json };
      }

      throw new Error(`Unexpected LLM response shape from ${this.endpoint}: ${JSON.stringify(json).slice(0, 500)}`);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`LLM request timed out after ${this.timeoutMs}ms at ${this.endpoint}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequest(
    prompt: string,
    systemPrompt: string | undefined,
    request: GenerateRequest,
  ): { body: Record<string, unknown>; headers: Record<string, string> } {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.endpointStyle === 'openai') {
      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      return {
        headers,
        body: {
          model: this._modelName,
          messages,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens,
          stop: request.stopSequences,
          stream: false,
        },
      };
    }

    if (this.endpointStyle === 'ollama-chat') {
      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      return {
        headers,
        body: {
          model: this._modelName,
          messages,
          stream: false,
          options: {
            temperature: request.temperature ?? 0.2,
            num_predict: request.maxTokens,
          },
        },
      };
    }

    // ollama-generate
    return {
      headers,
      body: {
        model: this._modelName,
        prompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.2,
          num_predict: request.maxTokens,
        },
      },
    };
  }
}

export function createLocalLLMProvider(options?: LocalLLMProviderOptions): LLMProvider {
  return new LocalLLMProvider(options);
}
