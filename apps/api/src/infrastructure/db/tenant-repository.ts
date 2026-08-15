import type { Pool } from 'pg';
import { z } from 'zod';

import { AppError } from '../../common/errors.js';

const uuidSchema = z.string().uuid();

/**
 * Base class for repositories that access tenant-owned data.
 *
 * Mandated by `.agent/AGENTS.md` §8: every method that touches tenant-owned
 * data must make the institution scope explicit. Concrete repositories must:
 *
 * 1. Accept `institutionId` as a parameter on every public method (the value
 *    must come from a validated membership — `request.institution` — never
 *    from client input).
 * 2. Call `this.tenantId(institutionId)` first (fail-fast scope validation).
 * 3. Bind the tenant id in every SQL statement, e.g. with
 *    `this.tenantCondition('alias', 1)`.
 *
 * Every tenant repository ships cross-tenant regression tests.
 */
export abstract class TenantRepository {
  protected constructor(protected readonly pool: Pool) {}

  /**
   * Validates the tenant scope and returns it for binding. Throws when the
   * scope is missing or malformed; repository code must never silently fall
   * back to an unscoped query.
   */
  protected tenantId(institutionId: string): string {
    const parsed = uuidSchema.safeParse(institutionId);
    if (!parsed.success) {
      throw new AppError('INTERNAL_ERROR', 'Tenant scope is missing or invalid.', 500);
    }
    return parsed.data;
  }

  /**
   * Builds `<alias>.institution_id = $<paramIndex>` for embedding the tenant
   * filter into a WHERE clause. The tenant id must be the first bound
   * parameter.
   */
  protected tenantCondition(alias: string, paramIndex: number): string {
    return `${alias}.institution_id = $${paramIndex}`;
  }
}
