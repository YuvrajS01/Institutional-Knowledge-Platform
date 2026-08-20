import type { LLMProvider } from '@ikp/processing';
import { createLLMProvider } from '@ikp/processing';

import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { ContextBuilderService } from './context-builder.service.js';
import { PermissionAwareRetrievalService, type RetrievalActor } from '../search/permission-aware-retrieval.service.js';

export interface RagAnswer {
  answer: string;
  grounded: boolean;
  confidence: 'high' | 'medium' | 'low';
  citations: Array<{
    document_id: string;
    title: string;
    chunk_id?: string;
    page_number: number | null;
  }>;
}

export interface RagAnswerOptions {
  limit?: number;
  maxTokens?: number;
  maxChunks?: number;
}

/**
 * RAG answer service (P8-006) — permission-aware retrieval → context builder → LLM → citation validation.
 *
 * Pipeline (IMPLEMENTATION_GUIDE §9, AI_LLM_ARCHITECTURE §14):
 * question → authorization → hybrid search (via PermissionAwareRetrieval) → context builder → prompt → LLM → structured answer → citation validation
 *
 * No post-generation filtering of restricted content — filtering is done in retrieval (P8-004).
 */
export class RagAnswerService {
  private readonly retrieval: PermissionAwareRetrievalService;
  private readonly contextBuilder: ContextBuilderService;
  private readonly llm: LLMProvider;

  constructor(
    pool: DbPool,
    options?: {
      retrievalService?: PermissionAwareRetrievalService;
      contextBuilder?: ContextBuilderService;
      llmProvider?: LLMProvider;
    },
  ) {
    this.retrieval = options?.retrievalService ?? new PermissionAwareRetrievalService(pool);
    this.contextBuilder = options?.contextBuilder ?? new ContextBuilderService();
    this.llm = options?.llmProvider ?? createLLMProvider();
  }

  async answer(
    actor: RetrievalActor,
    question: string,
    options: RagAnswerOptions = {},
  ): Promise<RagAnswer> {
    const q = question?.trim();
    if (!q) {
      throw new Error('question must be a non-empty string');
    }

    // 1. Permission-aware retrieval (tenant + RBAC, PUBLISHED for STUDENT)
    const retrieved = await this.retrieval.retrieve(actor, q, {
      limit: options.limit ?? 5,
    });

    // 2. Context builder (handles no-answer case when retrieved is empty)
    const built = this.contextBuilder.build(q, retrieved as unknown as Parameters<ContextBuilderService['build']>[1], {
      maxTokens: options.maxTokens,
      maxChunks: options.maxChunks,
    });

    // 3. LLM generation
    const llmResponse = await this.llm.generate({
      prompt: built.userPrompt,
      systemPrompt: built.systemPrompt,
      temperature: 0.2,
      maxTokens: 500,
    });

    const text = llmResponse.text.trim();

    // 4. Citation validation — ensure citations correspond to retrieved docs
    // For mock, the LLM may return hash-based citations; we validate that any [n] in the answer corresponds to a retrieved doc
    const citationPattern = /\[(\d+)\]/g;
    const citedIndices = new Set<number>();
    let match: RegExpExecArray | null;
    while ((match = citationPattern.exec(text)) !== null) {
      const idx = Number(match[1]);
      if (Number.isFinite(idx) && idx >= 1 && idx <= built.citations.length) {
        citedIndices.add(idx);
      }
    }

    // If LLM returned grounded text but no valid citations and we have retrieved docs, it's still considered grounded if it contains the no-answer sentence
    const isNoAnswer = text.includes("I couldn't find an official institutional document confirming this.");
    const hasCitations = built.citations.length > 0;

    // Grounded if we have retrieved docs and LLM didn't return no-answer, and (if it cited, citations are valid)
    const grounded = hasCitations && !isNoAnswer;
    const confidence: RagAnswer['confidence'] = grounded ? 'high' : isNoAnswer ? 'low' : 'medium';

    // Filter citations to only those actually cited, or all if none cited but grounded
    let finalCitations: RagAnswer['citations'];
    if (isNoAnswer) {
      finalCitations = [];
    } else if (citedIndices.size > 0) {
      finalCitations = Array.from(citedIndices)
        .sort((a, b) => a - b)
        .map((idx) => built.citations[idx - 1]!)
        .filter(Boolean);
    } else {
      // If grounded but no explicit [n], return all citations (conservative)
      finalCitations = grounded ? built.citations : [];
    }

    return {
      answer: text,
      grounded,
      confidence,
      citations: finalCitations,
    };
  }
}
