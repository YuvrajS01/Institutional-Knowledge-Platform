import { DocumentsRepository } from './documents.repository.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

export class ShareLinksService {
  private readonly documents: DocumentsRepository;

  constructor(pool: DbPool) {
    this.documents = new DocumentsRepository(pool);
  }

  async createShareLink(
    institutionId: string,
    documentId: string,
    actorRole: string,
  ): Promise<{ share_url: string; document_id: string; title: string } | null> {
    const doc = await this.documents.findById(institutionId, documentId);
    if (!doc) return null;
    if ((actorRole === 'STUDENT' || actorRole === 'FACULTY') && doc.status !== 'PUBLISHED') {
      return null;
    }
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    return {
      share_url: `${base.replace(/\/$/, '')}/documents/${doc.id}`,
      document_id: doc.id,
      title: doc.title,
    };
  }
}
