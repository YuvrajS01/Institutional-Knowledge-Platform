import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { HybridSearchService, type HybridSearchResult } from './hybrid-search.service.js';

/**
 * Permission-aware retrieval service (P8-004).
 *
 * Wraps `HybridSearchService` with an authorization boundary that ensures:
 * 1. Tenant isolation — every query is scoped to `institutionId` via `documents.institution_id`
 * 2. RBAC — `STUDENT`/`FACULTY` only see `PUBLISHED` (via `HybridSearchService`'s `visibleStatusesForRole`)
 * 3. No post-generation filtering — filtering happens *before* the LLM sees any content (AI_LLM_ARCHITECTURE §28)
 *
 * This service is the only entry point for RAG retrieval (`P8-005`/`P8-006` context builder and answer service will call it).
 * Direct calls to `HybridSearchService` or `VectorSearchRepository` from RAG are prohibited.
 */
export interface RetrievalActor {
  institutionId: string;
  userId: string;
  role: string;
}

export interface RetrievalOptions {
  limit?: number;
  departmentId?: string;
  documentType?: string;
}

export class PermissionAwareRetrievalService {
  private readonly hybrid: HybridSearchService;

  constructor(
    pool: DbPool,
    options?: {
      hybridService?: HybridSearchService;
    },
  ) {
    this.hybrid = options?.hybridService ?? new HybridSearchService(pool);
  }

  /**
   * Retrieves permission-aware candidates for RAG.
   *
   * @param actor - authenticated actor with `institutionId`/`role` (from `request.institution`)
   * @param query - user question / search query (non-empty)
   * @param options - optional filters (department, type, limit)
   * @returns hybrid-ranked documents that the actor is allowed to see
   */
  async retrieve(
    actor: RetrievalActor,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<HybridSearchResult[]> {
    const text = query?.trim();
    if (!text) {
      throw new Error('query must be a non-empty string');
    }
    if (!actor.institutionId || !actor.role) {
      throw new Error('actor must have institutionId and role');
    }

    // HybridSearchService already enforces tenant and RBAC via `visibleStatusesForRole`
    // We pass the actor's role explicitly via statuses
    const statuses = this.visibleStatusesForRole(actor.role);

    return this.hybrid.search(actor.institutionId, text, {
      limit: options.limit ?? 5,
      offset: 0,
      statuses,
      departmentId: options.departmentId,
      documentType: options.documentType as unknown as import('@ikp/shared').DocumentType | undefined,
    });
  }

  private visibleStatusesForRole(role: string): ('PUBLISHED' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED' | 'ARCHIVED')[] | undefined {
    if (role === 'STUDENT' || role === 'FACULTY') {
      return ['PUBLISHED'];
    }
    return undefined;
  }
}
