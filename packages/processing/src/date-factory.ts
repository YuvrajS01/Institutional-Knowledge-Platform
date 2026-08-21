import type { DateExtractor } from './dates.js';
import { HeuristicDateExtractor } from './heuristic-date-extractor.js';
import { LlmDateExtractor, type LlmDateExtractorOptions } from './llm-date-extractor.js';
import { createLLMProvider } from './mock-llm-provider.js';

/**
 * Unified date-extractor factory (P3-007).
 *
 * Mirrors metadata-factory pattern (ADR-003 local-first).
 *
 * Resolution:
 * - DATE_PROVIDER env (or explicit provider option) wins
 * - falls back to METADATA_PROVIDER then LLM_PROVIDER for convenience
 * - defaults to heuristic
 *
 * Providers:
 * - heuristic (default) → HeuristicDateExtractor
 * - llm | local | ollama | openai | vllm | http | mock → LlmDateExtractor
 */
export function createDateExtractor(
  options?: LlmDateExtractorOptions & { provider?: string },
): DateExtractor {
  const raw =
    options?.provider ??
    process.env.DATE_PROVIDER ??
    process.env.METADATA_PROVIDER ??
    process.env.LLM_PROVIDER ??
    'heuristic';
  const provider = String(raw).toLowerCase();
  const isLlm =
    provider === 'llm' ||
    provider === 'local' ||
    provider === 'ollama' ||
    provider === 'openai' ||
    provider === 'vllm' ||
    provider === 'http' ||
    provider === 'mock';

  if (!isLlm) {
    return new HeuristicDateExtractor();
  }

  const llmProviderAlias = provider === 'llm' ? (process.env.LLM_PROVIDER ?? 'mock') : provider;
  const llmProvider =
    options?.llmProvider ??
    createLLMProvider({
      provider: llmProviderAlias === 'llm' ? 'mock' : llmProviderAlias,
    });

  return new LlmDateExtractor({ ...options, llmProvider });
}
