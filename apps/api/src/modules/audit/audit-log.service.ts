import type { AuditAction } from '@ikp/shared';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import {
  AuditLogRepository,
  type AuditLogListFilter,
  type AuditRecordInput,
} from './audit-log.repository.js';

export interface AuditActor {
  institutionId: string;
  userId: string;
}

export class AuditLogService {
  private readonly repository: AuditLogRepository;

  constructor(pool: DbPool) {
    this.repository = new AuditLogRepository(pool);
  }

  record(actor: AuditActor, input: Omit<AuditRecordInput, 'actorUserId'>): Promise<void> {
    return this.repository.record(actor.institutionId, {
      actorUserId: actor.userId,
      ...input,
    });
  }

  async list(
    actor: AuditActor,
    filter: Omit<AuditLogListFilter, 'offset'>,
  ): Promise<{ rows: AuditLogRowView[]; total: number }> {
    const { rows, total } = await this.repository.list(actor.institutionId, {
      ...filter,
      offset: (filter.page - 1) * filter.limit,
    });
    return {
      rows: rows.map((row) => ({
        id: row.id,
        actor_user_id: row.actor_user_id,
        action: row.action as AuditAction,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        metadata: row.metadata,
        created_at: row.created_at.toISOString(),
      })),
      total,
    };
  }
}

export interface AuditLogRowView {
  id: string;
  actor_user_id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
