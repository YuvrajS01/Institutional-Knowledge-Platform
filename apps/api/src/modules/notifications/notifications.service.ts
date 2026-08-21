import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { NotificationsRepository } from './notifications.repository.js';

export interface CreateNotificationInput {
  institutionId: string;
  userId: string;
  type?: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
}

export class NotificationsService {
  private readonly repo: NotificationsRepository;

  constructor(pool: DbPool) {
    this.repo = new NotificationsRepository(pool);
  }

  async notify(input: CreateNotificationInput) {
    if (!input.institutionId || !input.userId || !input.title || !input.body) {
      throw new Error('institutionId, userId, title and body are required');
    }
    return this.repo.create({
      institutionId: input.institutionId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  async list(
    institutionId: string,
    userId: string,
    options?: { limit?: number; offset?: number; unreadOnly?: boolean },
  ) {
    return this.repo.list(institutionId, userId, options);
  }

  async markAsRead(institutionId: string, userId: string, notificationId: string) {
    const updated = await this.repo.markAsRead(institutionId, userId, notificationId);
    if (!updated) {
      throw new Error('Notification not found or already read');
    }
  }

  async markAllAsRead(institutionId: string, userId: string) {
    return this.repo.markAllAsRead(institutionId, userId);
  }

  async countUnread(institutionId: string, userId: string) {
    return this.repo.countUnread(institutionId, userId);
  }
}
