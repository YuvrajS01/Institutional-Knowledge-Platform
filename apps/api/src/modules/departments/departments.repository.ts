import type { DepartmentStatus } from '@ikp/shared';
import { ERROR_CODES } from '@ikp/shared';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { AppError } from '../../common/errors.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface DepartmentRow {
  id: string;
  institution_id: string;
  name: string;
  code: string;
  status: DepartmentStatus;
  created_at: Date;
}

export interface DepartmentInput {
  name: string;
  code: string;
}

export interface DepartmentListOptions {
  search?: string;
  status?: DepartmentStatus;
  limit?: number;
  offset?: number;
}

function mapDepartmentRow(row: Record<string, unknown>): DepartmentRow {
  return {
    id: row.id as string,
    institution_id: row.institution_id as string,
    name: row.name as string,
    code: row.code as string,
    status: row.status as DepartmentStatus,
    created_at: row.created_at as Date,
  };
}

const SELECT_COLUMNS = 'id, institution_id, name, code, status, created_at';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

/**
 * Tenant-owned repository for `departments` (see `.agent/AGENTS.md` §8).
 * Every public method requires an explicit institution scope and binds it in
 * the SQL; cross-tenant access returns nothing, never foreign rows.
 */
export class DepartmentsRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async list(institutionId: string, options: DepartmentListOptions = {}): Promise<DepartmentRow[]> {
    const tenantId = this.tenantId(institutionId);

    const conditions = [this.tenantCondition('d', 1)];
    const params: unknown[] = [tenantId];

    if (options.search) {
      params.push(`%${options.search}%`);
      conditions.push(`d.name ILIKE $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      conditions.push(`d.status = $${params.length}`);
    }

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    params.push(limit, offset);

    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM departments d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapDepartmentRow(row as Record<string, unknown>));
  }

  async findById(institutionId: string, id: string): Promise<DepartmentRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM departments d
       WHERE d.id = $2 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, id],
    );
    const row = result.rows[0];
    return row ? mapDepartmentRow(row as Record<string, unknown>) : null;
  }

  async findByCode(institutionId: string, code: string): Promise<DepartmentRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM departments d
       WHERE d.code = $2 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, code],
    );
    const row = result.rows[0];
    return row ? mapDepartmentRow(row as Record<string, unknown>) : null;
  }

  async create(institutionId: string, input: DepartmentInput): Promise<DepartmentRow> {
    const tenantId = this.tenantId(institutionId);
    try {
      const result = await this.pool.query(
        `INSERT INTO departments (institution_id, name, code)
         VALUES ($1, $2, $3)
         RETURNING ${SELECT_COLUMNS}`,
        [tenantId, input.name, input.code],
      );
      return mapDepartmentRow(result.rows[0] as Record<string, unknown>);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          ERROR_CODES.CONFLICT,
          'A department with this code already exists in this institution.',
          409,
          { code: input.code },
        );
      }
      throw error;
    }
  }

  async setStatus(
    institutionId: string,
    id: string,
    status: DepartmentStatus,
  ): Promise<DepartmentRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `UPDATE departments d
       SET status = $3
       WHERE d.id = $2 AND ${this.tenantCondition('d', 1)}
       RETURNING ${SELECT_COLUMNS}`,
      [tenantId, id, status],
    );
    const row = result.rows[0];
    return row ? mapDepartmentRow(row as Record<string, unknown>) : null;
  }
}
