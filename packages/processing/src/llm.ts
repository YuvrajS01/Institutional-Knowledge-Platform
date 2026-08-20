/**
 * LLM provider abstraction (TECHNICAL_SPEC §15, AI_LLM_ARCHITECTURE §18,
 * IMPLEMENTATION_GUIDE §5).
 *
 * Provider-agnostic contract for generating text from a prompt. Used for
 * institutional RAG answers, summarization, and metadata extraction.
 * Implementations must be swappable between local (Ollama, vLLM) and cloud
 * providers without changing callers (ADR-003, ADR-007).
 */

export interface GenerateRequest {
  /** Main user prompt / question */
  prompt: string;
  /** Optional system prompt for instruction following */
  systemPrompt?: string;
  /** Sampling temperature (0..1, default 0.2 for factual) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Optional stop sequences */
  stopSequences?: string[];
}

export interface GenerateResponse {
  /** Generated text (trimmed) */
  text: string;
  /** Model that generated the text */
  model: string;
  /** Token usage if available */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Raw provider response for debugging (optional) */
  raw?: unknown;
}

export interface LLMProvider {
  /** Human-readable model identifier, e.g. "qwen2:7b" or "mock-llm" */
  modelName(): string;

  /**
   * Generate text from a prompt.
   *
   * - `request.prompt` must be non-empty after trimming.
   * - Returns `GenerateResponse` with `text` (may be empty for unsupported queries).
   * - Should be deterministic for `temperature=0` where possible.
   */
  generate(request: GenerateRequest): Promise<GenerateResponse>;
}

export interface LLMProviderOptions {
  /** Override model name reported by the provider */
  modelName?: string;
}
