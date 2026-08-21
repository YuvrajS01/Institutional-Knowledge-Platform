import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface NotificationRow {
  id: string;
  institution_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

export class NotificationsRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async create(params: {
    institutionId: string;
    userId: string;
    type?: string;
    title: string;
    body: string;
    entityType?: string | null;
    entityId?: string | null;
  }): Promise<NotificationRow> {
    const tenantId = this.tenantId(params.institutionId);
    const result = await this.pool.query(
      `INSERT INTO notifications (institution_id, user_id, type, title, body, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, institution_id, user_id, type, title, body, entity_type, entity_id, read_at, created_at`,
      [
        tenantId,
        params.userId,
        params.type ?? 'INFO',
        params.title,
        params.body,
        params.entityType ?? null,
        params.entityId ?? null,
      ],
    );
    return result.rows[0] as NotificationRow;
  }

  async list(
    institutionId: string,
    userId: string,
    options: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
  ): Promise<NotificationRow[]> {
    const tenantId = this.tenantId(institutionId);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const where = ['institution_id = $1', 'user_id = $2'];
    const params: unknown[] = [tenantId, userId];
    const idx = 3;
    if (options.unreadOnly) {
      where.push('read_at IS NULL');
    }
    const result = await this.pool.query(
      `SELECT id, institution_id, user_id, type, title, body, entity_type, entity_id, read_at, created_at
       FROM notifications
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );
    return result.rows as NotificationRow[];
  }

  async markAsRead(
    institutionId: string,
    userId: string,
    notificationId: string,
  ): Promise<boolean> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND user_id = $2 AND institution_id = $3 AND read_at IS NULL`,
      [notificationId, userId, tenantId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllAsRead(institutionId: string, userId: string): Promise<number> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND institution_id = $2 AND read_at IS NULL`,
      [userId, tenantId],
    );
    return result.rowCount ?? 0;
  }

  async countUnread(institutionId: string, userId: string): Promise<number> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND institution_id = $2 AND read_at IS NULL`,
      [userId, tenantId],
    );
    return (result.rows[0] as { count: number }).count;
  }
}
