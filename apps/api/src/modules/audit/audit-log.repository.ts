import type { AuditAction } from '@ikp/shared';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface AuditRecordInput {
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogListFilter {
  actorUserId?: string;
  action?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
  offset: number;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

function mapAuditRow(row: Record<string, unknown>): AuditLogRow {
  return {
    id: row.id as string,
    actor_user_id: row.actor_user_id as string,
    action: row.action as string,
    entity_type: row.entity_type as string,
    entity_id: row.entity_id as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as Date,
  };
}

export class AuditLogRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async record(institutionId: string, input: AuditRecordInput): Promise<void> {
    const tenantId = this.tenantId(institutionId);
    await this.pool.query(
      `INSERT INTO audit_logs (institution_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        input.actorUserId,
        input.action,
        input.entityType,
        input.entityId,
        input.metadata ?? {},
      ],
    );
  }

  async list(
    institutionId: string,
    filter: AuditLogListFilter,
  ): Promise<{ rows: AuditLogRow[]; total: number }> {
    const tenantId = this.tenantId(institutionId);

    const where = [this.tenantCondition('a', 1)];
    const params: unknown[] = [tenantId];
    let next = 2;
    const push = (value: unknown): number => {
      params.push(value);
      return next++;
    };

    if (filter.actorUserId) {
      where.push(`a.actor_user_id = $${push(filter.actorUserId)}`);
    }
    if (filter.action) {
      where.push(`a.action = $${push(filter.action)}`);
    }
    if (filter.entityType) {
      where.push(`a.entity_type = $${push(filter.entityType)}`);
    }
    if (filter.from) {
      where.push(`a.created_at >= $${push(filter.from)}`);
    }
    if (filter.to) {
      where.push(`a.created_at <= $${push(filter.to)}`);
    }

    params.push(filter.limit, filter.offset);
    const result = await this.pool.query(
      `SELECT id, actor_user_id, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs a
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countParams = [...params.slice(0, -2)];
    const count = await this.pool.query(
      `SELECT count(*) AS total FROM audit_logs a WHERE ${where.join(' AND ')}`,
      countParams,
    );

    return {
      rows: result.rows.map((row) => mapAuditRow(row as Record<string, unknown>)),
      total: Number((count.rows[0] as { total: string }).total),
    };
  }
}
