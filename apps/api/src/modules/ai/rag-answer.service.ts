import type { LLMProvider } from '@ikp/processing';
import { createLLMProvider } from '@ikp/processing';

import type { DbPool } from '../../infrastructure/db/db-pool.js';
import {
  extractCitedIndices,
  isUnsupportedAnswer,
  UNSUPPORTED_ANSWER,
  type Citation,
} from './citation.js';
import { ContextBuilderService } from './context-builder.service.js';
import {
  PermissionAwareRetrievalService,
  type RetrievalActor,
} from '../search/permission-aware-retrieval.service.js';

export interface RagAnswer {
  answer: string;
  grounded: boolean;
  confidence: 'high' | 'medium' | 'low';
  citations: Citation[];
}

export interface RagAnswerOptions {
  limit?: number;
  maxTokens?: number;
  maxChunks?: number;
}

/**
 * RAG answer service (P8-006) + Citation contract (P8-007) + Unsupported behavior (P8-008).
 * Pipeline: question → permission-aware retrieval → context builder → prompt → LLM → citation validation.
 * No post-generation filtering of restricted content — filtering is done in retrieval (P8-004).
 * Citations are contract-validated (P8-007) and unsupported answers use canonical sentence (P8-008).
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

    const retrieved = await this.retrieval.retrieve(actor, q, { limit: options.limit ?? 5 });

    const built = this.contextBuilder.build(
      q,
      retrieved as unknown as Parameters<ContextBuilderService['build']>[1],
      {
        maxTokens: options.maxTokens,
        maxChunks: options.maxChunks,
      },
    );

    const llmResponse = await this.llm.generate({
      prompt: built.userPrompt,
      systemPrompt: built.systemPrompt,
      temperature: 0.2,
      maxTokens: 500,
    });

    const text = llmResponse.text.trim();

    // P8-008: unsupported behavior — canonical sentence, grounded false, low confidence, empty citations
    if (isUnsupportedAnswer(text) || built.citations.length === 0) {
      // If LLM returned unsupported but we had no citations, ensure we return canonical empty
      // If LLM returned unsupported with citations, still treat as unsupported (no leakage)
      const isNoAnswer = isUnsupportedAnswer(text);
      if (isNoAnswer || built.citations.length === 0) {
        // When no citations, we must not claim grounded even if LLM hallucinated markers
        if (built.citations.length === 0) {
          return {
            answer: UNSUPPORTED_ANSWER,
            grounded: false,
            confidence: 'low',
            citations: [],
          };
        }
        // Has citations but LLM says unsupported → respect LLM's unsupported
        if (isNoAnswer) {
          return {
            answer: UNSUPPORTED_ANSWER,
            grounded: false,
            confidence: 'low',
            citations: [],
          };
        }
      }
    }

    const hasCitations = built.citations.length > 0;
    const isNoAnswer = isUnsupportedAnswer(text);
    const grounded = hasCitations && !isNoAnswer;
    const confidence: RagAnswer['confidence'] = grounded ? 'high' : isNoAnswer ? 'low' : 'medium';

    if (isNoAnswer) {
      return {
        answer: UNSUPPORTED_ANSWER,
        grounded: false,
        confidence: 'low',
        citations: [],
      };
    }

    const citedIndices = extractCitedIndices(text, built.citations.length);

    let finalCitations: Citation[];
    if (citedIndices.length > 0) {
      finalCitations = citedIndices.map((idx) => built.citations[idx - 1]!).filter(Boolean);
    } else {
      finalCitations = grounded ? [...built.citations] : [];
    }

    // P8-007: ensure citation contract — enrich with legacy aliases for backward compat
    // and validate (throws if version_id missing, etc.)
    const enriched: Citation[] = finalCitations.map((c) => ({
      document_id: c.document_id,
      document_title: c.document_title,
      version_id: c.version_id,
      page: c.page,
      chunk_id: c.chunk_id,
      // legacy aliases — keep tests that check `title`/`page_number` passing
      title: (c as unknown as { title?: string }).title ?? c.document_title,
      page_number: (c as unknown as { page_number?: number | null }).page_number ?? c.page,
    }));

    // Contract validation — fail closed if any citation is malformed (prevents hallucinated IDs)
    for (const c of enriched) {
      if (!c.version_id || !c.document_id || !c.document_title) {
        // Treat malformed as unsupported to avoid leaking bad provenance
        return {
          answer: UNSUPPORTED_ANSWER,
          grounded: false,
          confidence: 'low',
          citations: [],
        };
      }
    }

    return {
      answer: text,
      grounded,
      confidence,
      citations: enriched,
    };
  }
}
