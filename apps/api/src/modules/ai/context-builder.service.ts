import type { HybridSearchResult } from '../search/hybrid-search.service.js';

export interface ContextBuilderOptions {
  maxTokens?: number;
  maxChunks?: number;
}

export interface BuiltContext {
  systemPrompt: string;
  userPrompt: string;
  citations: Array<{
    document_id: string;
    title: string;
    chunk_id?: string;
    page_number: number | null;
  }>;
  tokenEstimate: number;
}

const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_MAX_CHUNKS = 5;
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / CHARS_PER_TOKEN);
}

/**
 * Context builder (P8-005) — transforms permission-aware retrieval results
 * into a grounded prompt for the LLM (TECHNICAL_SPEC §10, AI_LLM_ARCHITECTURE §14).
 *
 * Responsibilities:
 * - Select top N chunks (default 5) within token budget (default 3000)
 * - Format citations as `[1] Title (ID, Page)`
 * - Build systemPrompt that enforces source-grounded, non-hallucinating behavior
 * - Build userPrompt that contains the question + context
 */
export class ContextBuilderService {
  build(
    query: string,
    retrieved: HybridSearchResult[],
    options: ContextBuilderOptions = {},
  ): BuiltContext {
    const text = query?.trim();
    if (!text) {
      throw new Error('query must be a non-empty string');
    }
    if (!Array.isArray(retrieved)) {
      throw new Error('retrieved must be an array');
    }

    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;

    const systemPrompt = [
      'You are an institutional assistant. Answer ONLY from the provided official documents.',
      'If the documents do not contain an answer, reply: "I couldn\'t find an official institutional document confirming this."',
      'Always cite sources as [n] with document title and page where possible.',
      'Never invent dates, rules, or policies. Prefer the current version.',
    ].join(' ');

    if (retrieved.length === 0) {
      return {
        systemPrompt,
        userPrompt: `Question: ${text}\n\nNo official documents were retrieved for this query. Follow the no-answer rule.`,
        citations: [],
        tokenEstimate: estimateTokens(systemPrompt) + estimateTokens(text),
      };
    }

    const selected: HybridSearchResult[] = [];
    let tokenCount = estimateTokens(systemPrompt) + estimateTokens(text) + 50; // overhead

    for (const doc of retrieved.slice(0, maxChunks)) {
      // Use title as proxy for content length if content not available at this level
      const contentForTokens = (doc as unknown as { content?: string }).content ?? doc.title;
      const chunkTokens = estimateTokens(contentForTokens) + 20; // citation overhead
      if (tokenCount + chunkTokens > maxTokens) break;
      selected.push(doc);
      tokenCount += chunkTokens;
    }

    // If nothing fit within budget (very long query), at least include top 1
    if (selected.length === 0 && retrieved.length > 0) {
      selected.push(retrieved[0]!);
    }

    const citations = selected.map((doc) => ({
      document_id: doc.document_id,
      title: doc.title,
      chunk_id: (doc as unknown as { chunk_id?: string }).chunk_id,
      page_number: (doc as unknown as { page_number?: number | null }).page_number ?? null,
    }));

    const contextBlocks = selected.map((doc, idx) => {
      const n = idx + 1;
      const content = (doc as unknown as { content?: string }).content ?? '';
      const snippet = content ? `\nContent: ${content.slice(0, 800)}` : '';
      return `[${n}] ${doc.title} (ID: ${doc.document_id}${doc.department_id ? `, Dept: ${doc.department_id}` : ''})${snippet}\nScore: ${doc.hybrid_score.toFixed(3)} (${doc.match_reasons.join(', ')})`;
    });

    const userPrompt = [
      `Question: ${text}`,
      '',
      'Official documents:',
      ...contextBlocks,
      '',
      'Instructions: Answer the question using ONLY the documents above. Cite sources as [n]. If insufficient evidence, use the no-answer sentence.',
    ].join('\n');

    return {
      systemPrompt,
      userPrompt,
      citations,
      tokenEstimate: tokenCount,
    };
  }
}
