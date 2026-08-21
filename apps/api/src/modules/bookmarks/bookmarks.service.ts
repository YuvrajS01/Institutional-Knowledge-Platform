import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { BookmarksRepository } from './bookmarks.repository.js';
import { DocumentsRepository } from '../documents/documents.repository.js';

export interface BookmarkActor {
  institutionId: string;
  userId: string;
  role: string;
}

export class BookmarksService {
  private readonly bookmarks: BookmarksRepository;
  private readonly documents: DocumentsRepository;

  constructor(pool: DbPool) {
    this.bookmarks = new BookmarksRepository(pool);
    this.documents = new DocumentsRepository(pool);
  }

  async list(actor: BookmarkActor) {
    return this.bookmarks.list(actor.institutionId, actor.userId);
  }

  async add(actor: BookmarkActor, documentId: string) {
    // Verify document exists and is visible to actor (PUBLISHED for students)
    const doc = await this.documents.findById(actor.institutionId, documentId);
    if (!doc) {
      throw AppError.notFound('Document not found.');
    }
    if ((actor.role === 'STUDENT' || actor.role === 'FACULTY') && doc.status !== 'PUBLISHED') {
      throw AppError.notFound('Document not found.');
    }
    return this.bookmarks.create(actor.institutionId, actor.userId, documentId);
  }

  async remove(actor: BookmarkActor, documentId: string) {
    const removed = await this.bookmarks.delete(actor.institutionId, actor.userId, documentId);
    if (!removed) {
      throw AppError.notFound('Bookmark not found.');
    }
  }
}
