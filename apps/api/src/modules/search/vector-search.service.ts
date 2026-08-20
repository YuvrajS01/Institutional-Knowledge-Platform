import { createEmbeddingProvider, type EmbeddingProvider } from '@ikp/processing';

import type { DbPool } from '../../infrastructure/db/db-pool.js';
import {
  type VectorSearchOptions,
  type VectorSearchResult,
  VectorSearchRepository,
} from './vector-search.repository.js';

export interface VectorSearchQuery {
  text: string;
  limit?: number;
  offset?: number;
  statuses?: VectorSearchOptions['statuses'];
  departmentId?: string;
  documentType?: VectorSearchOptions['documentType'];
}

export class VectorSearchService {
  private readonly repository: VectorSearchRepository;
  private readonly embeddingProvider: EmbeddingProvider;

  constructor(
    pool: DbPool,
    options?: {
      embeddingProvider?: EmbeddingProvider;
      repository?: VectorSearchRepository;
    },
  ) {
    this.repository = options?.repository ?? new VectorSearchRepository(pool);
    this.embeddingProvider = options?.embeddingProvider ?? createEmbeddingProvider();
  }

  /**
   * Performs semantic vector search: embeds the query text and finds nearest
   * chunks via pgvector cosine distance (P5-006). Tenant-scoped and status-
   * filtered to `PUBLISHED` by default.
   */
  async search(
    institutionId: string,
    query: VectorSearchQuery,
  ): Promise<VectorSearchResult[]> {
    const text = query.text?.trim();
    if (!text) {
      throw new Error('query.text must be a non-empty string');
    }

    const embeddings = await this.embeddingProvider.embed([text]);
    const queryEmbedding = embeddings[0];
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('Embedding provider returned empty vector');
    }

    return this.repository.searchByEmbedding(institutionId, queryEmbedding, {
      limit: query.limit,
      offset: query.offset,
      statuses: query.statuses,
      departmentId: query.departmentId,
      documentType: query.documentType,
    });
  }

  /**
   * Direct vector search when the caller already has a query embedding
   * (e.g., hybrid search pre-embedded the query). Exposed for P5-007.
   */
  async searchByEmbedding(
    institutionId: string,
    queryEmbedding: number[],
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    return this.repository.searchByEmbedding(institutionId, queryEmbedding, options);
  }

  modelName(): string {
    return this.embeddingProvider.modelName();
  }

  dimensions(): number {
    return this.embeddingProvider.dimensions();
  }
}
