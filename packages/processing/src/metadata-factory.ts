import type { MetadataExtractor } from './metadata.js';
import { HeuristicMetadataExtractor } from './heuristic-metadata-extractor.js';
import { LlmMetadataExtractor, type LlmMetadataExtractorOptions } from './llm-metadata-extractor.js';
import { createLLMProvider } from './mock-llm-provider.js';

/**
 * Unified metadata-extractor factory (P3-006).
 *
 * Mirrors `createEmbeddingProvider` / `createLLMProvider` env-switching
 * (ADR-003 local-first, TECHNICAL_SPEC §8, AI_LLM_ARCHITECTURE §12).
 *
 * Resolution:
 * - `METADATA_PROVIDER` env (or explicit `provider` option) wins
 * - falls back to `LLM_PROVIDER` for convenience in local dev
 * - defaults to `heuristic`
 *
 * Providers:
 * - `heuristic` (default) → `HeuristicMetadataExtractor` — deterministic, no network
 * - `llm` | `local` | `ollama` | `openai` | `vllm` | `http` | `mock` → `LlmMetadataExtractor`
 *   with the appropriate `LLMProvider` (Mock by default, Local Ollama/OpenAI when configured)
 *
 * The heuristic path is synchronous and cheap; the LLM path is async at
 * extraction time but construction is sync. Callers that want to force a
 * specific path can pass `provider` explicitly.
 */
export function createMetadataExtractor(
  options?: LlmMetadataExtractorOptions & { provider?: string },
): MetadataExtractor {
  const raw =
    options?.provider ??
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
    return new HeuristicMetadataExtractor();
  }

  const llmProviderAlias = provider === 'llm' ? (process.env.LLM_PROVIDER ?? 'mock') : provider;
  const llmProvider =
    options?.llmProvider ??
    createLLMProvider({
      // `createLLMProvider` understands `mock|local|ollama|openai|vllm|http`
      provider: llmProviderAlias === 'llm' ? 'mock' : llmProviderAlias,
    });

  return new LlmMetadataExtractor({ ...options, llmProvider });
}
