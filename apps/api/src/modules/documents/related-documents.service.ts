import { HybridSearchService } from '../search/hybrid-search.service.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { DocumentsRepository } from './documents.repository.js';

export interface RelatedDocument {
  document_id: string;
  title: string;
  slug: string;
  document_type: string;
  published_at: Date | null;
  score: number;
}

export class RelatedDocumentsService {
  private readonly documents: DocumentsRepository;
  private readonly hybrid: HybridSearchService;

  constructor(pool: DbPool) {
    this.documents = new DocumentsRepository(pool);
    this.hybrid = new HybridSearchService(pool);
  }

  async list(
    institutionId: string,
    documentId: string,
    options: { limit?: number; userRole?: string } = {},
  ): Promise<RelatedDocument[]> {
    const doc = await this.documents.findById(institutionId, documentId);
    if (!doc) {
      return [];
    }
    // Use document title as query for related search
    const query = doc.title;
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
    const statuses = options.userRole === 'STUDENT' || options.userRole === 'FACULTY' ? (['PUBLISHED'] as const) : undefined;

    const results = await this.hybrid.search(institutionId, query, {
      limit: limit + 1, // +1 to exclude self
      offset: 0,
      statuses: statuses as unknown as import('@ikp/shared').DocumentStatus[] | undefined,
    });

    // Exclude the source document, take top limit
    const filtered = results.filter((r) => r.document_id !== documentId).slice(0, limit);
    return filtered.map((r) => ({
      document_id: r.document_id,
      title: r.title,
      slug: r.slug,
      document_type: r.document_type,
      published_at: r.published_at,
      score: Number(r.hybrid_score.toFixed(4)),
    }));
  }
}
