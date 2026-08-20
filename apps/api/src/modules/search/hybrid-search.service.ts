import { createEmbeddingProvider, type EmbeddingProvider } from '@ikp/processing';
import type { DocumentStatus, DocumentType } from '@ikp/shared';

import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { DocumentsRepository } from '../documents/documents.repository.js';
import { VectorSearchRepository } from './vector-search.repository.js';

export interface HybridSearchOptions {
  limit?: number;
  offset?: number;
  statuses?: DocumentStatus[];
  departmentId?: string;
  documentType?: DocumentType;
  lexicalWeight?: number;
  semanticWeight?: number;
}

export interface HybridSearchResult {
  document_id: string;
  title: string;
  /** Alias for API spec `document_title`; kept as `title` for backward compat. */
  document_title: string;
  slug: string;
  document_type: DocumentType;
  status: DocumentStatus;
  department_id: string | null;
  published_at: Date | null;
  /** Version that produced the chunk (vector) or current_version_id (lexical). */
  version_id: string;
  chunk_id: string | null;
  page_number: number | null;
  lexical_score: number;
  semantic_score: number;
  hybrid_score: number;
  match_reasons: string[];
}

/**
 * Hybrid retrieval (P5-007) — lexical (PostgreSQL FTS `ts_rank`) + semantic
 * (pgvector cosine `1 - <=>`) candidate merge and weighted ranking.
 *
 * Architecture (TECHNICAL_SPEC §10, AI_LLM_ARCHITECTURE §9):
 *
 *   query
 *     ├─ lexicalSearch (DocumentsRepository.lexicalSearch, ts_rank)
 *     └─ vectorSearch (VectorSearchRepository.searchByEmbedding, cosine)
 *            ↓
 *        candidate merge (dedupe by document_id)
 *            ↓
 *        normalize (max) + weighted sum
 *            ↓
 *        reranked documents
 *
 * No LLM is invoked for standard search (AI_LLM_ARCHITECTURE §23). The
 * service is tenant- and status-aware (defaults to PUBLISHED) and remains
 * replaceable via the `EmbeddingProvider` abstraction (ADR-003).
 */
export class HybridSearchService {
  private readonly documentsRepository: DocumentsRepository;
  private readonly vectorRepository: VectorSearchRepository;
  private readonly embeddingProvider: EmbeddingProvider;

  constructor(
    pool: DbPool,
    options?: {
      embeddingProvider?: EmbeddingProvider;
      documentsRepository?: DocumentsRepository;
      vectorRepository?: VectorSearchRepository;
    },
  ) {
    this.documentsRepository = options?.documentsRepository ?? new DocumentsRepository(pool);
    this.vectorRepository = options?.vectorRepository ?? new VectorSearchRepository(pool);
    this.embeddingProvider = options?.embeddingProvider ?? createEmbeddingProvider();
  }

  async search(
    institutionId: string,
    query: string,
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResult[]> {
    const text = query?.trim();
    if (!text) {
      throw new Error('query must be a non-empty string');
    }

    const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const statuses = options.statuses ?? (['PUBLISHED'] as DocumentStatus[]);
    const lexicalWeight = options.lexicalWeight ?? 0.4;
    const semanticWeight = options.semanticWeight ?? 0.6;

    // Query embedding (single)
    const embeddings = await this.embeddingProvider.embed([text]);
    const queryEmbedding = embeddings[0];
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('Embedding provider returned empty vector');
    }

    // Run lexical and vector in parallel (separate candidate sets)
    const [lexicalResults, vectorChunks] = await Promise.all([
      this.documentsRepository.lexicalSearch(institutionId, text, {
        limit: 20,
        offset: 0,
        statuses,
        department_id: options.departmentId,
        document_type: options.documentType,
      }),
      this.vectorRepository.searchByEmbedding(institutionId, queryEmbedding, {
        limit: 20,
        offset: 0,
        statuses,
        departmentId: options.departmentId,
        documentType: options.documentType,
      }),
    ]);

    // Aggregate vector chunks to document-level max similarity
    const semanticByDoc = new Map<
      string,
      { similarity: number; chunk: (typeof vectorChunks)[number] }
    >();
    for (const chunk of vectorChunks) {
      const existing = semanticByDoc.get(chunk.document_id);
      if (!existing || chunk.similarity > existing.similarity) {
        semanticByDoc.set(chunk.document_id, { similarity: chunk.similarity, chunk });
      }
    }

    // Build candidate map
    const candidates = new Map<string, HybridSearchResult>();

    const maxLexical = Math.max(...lexicalResults.map((r) => r.lexical_score), 0) || 1;
    const maxSemantic =
      Math.max(...Array.from(semanticByDoc.values()).map((v) => v.similarity), 0) || 1;

    // Add lexical candidates
    for (const doc of lexicalResults) {
      const normLexical = doc.lexical_score / maxLexical;
      const semanticEntry = semanticByDoc.get(doc.id);
      const normSemantic = semanticEntry ? semanticEntry.similarity / maxSemantic : 0;
      const hybrid = lexicalWeight * normLexical + semanticWeight * normSemantic;
      const versionId =
        semanticEntry?.chunk.version_id ??
        (doc as { version_id?: string | null }).version_id ??
        doc.id;
      const chunkId = semanticEntry?.chunk.chunk_id ?? null;
      const pageNumber = semanticEntry?.chunk.page_number ?? null;
      candidates.set(doc.id, {
        document_id: doc.id,
        title: doc.title,
        document_title: doc.title,
        slug: doc.slug,
        document_type: doc.document_type,
        status: doc.status,
        department_id: doc.department_id,
        published_at: doc.published_at,
        version_id: versionId,
        chunk_id: chunkId,
        page_number: pageNumber,
        lexical_score: doc.lexical_score,
        semantic_score: semanticEntry?.similarity ?? 0,
        hybrid_score: hybrid,
        match_reasons: [
          ...(normLexical > 0 ? ['lexical'] : []),
          ...(normSemantic > 0 ? ['semantic'] : []),
        ],
      });
    }

    // Add vector-only candidates
    for (const [docId, entry] of semanticByDoc.entries()) {
      if (candidates.has(docId)) continue;
      const normSemantic = entry.similarity / maxSemantic;
      const hybrid = semanticWeight * normSemantic;
      candidates.set(docId, {
        document_id: docId,
        title: entry.chunk.document_title,
        document_title: entry.chunk.document_title,
        slug: entry.chunk.document_slug,
        document_type: entry.chunk.document_type,
        status: entry.chunk.document_status,
        department_id: entry.chunk.department_id,
        published_at: entry.chunk.published_at,
        version_id: entry.chunk.version_id,
        chunk_id: entry.chunk.chunk_id,
        page_number: entry.chunk.page_number,
        lexical_score: 0,
        semantic_score: entry.similarity,
        hybrid_score: hybrid,
        match_reasons: ['semantic'],
      });
    }

    // For vector-only candidates, we may want to fetch full document metadata for title/slug correctness
    // The vector result already contains title/slug, so above is sufficient for MVP.

    const finalRanked = Array.from(candidates.values()).sort((a, b) => {
      const diff = b.hybrid_score - a.hybrid_score;
      if (Math.abs(diff) > 1e-9) return diff;
      const aTime = a.published_at ? a.published_at.getTime() : 0;
      const bTime = b.published_at ? b.published_at.getTime() : 0;
      return bTime - aTime;
    });

    return finalRanked.slice(offset, offset + limit);
  }

  modelName(): string {
    return this.embeddingProvider.modelName();
  }

  dimensions(): number {
    return this.embeddingProvider.dimensions();
  }
}
