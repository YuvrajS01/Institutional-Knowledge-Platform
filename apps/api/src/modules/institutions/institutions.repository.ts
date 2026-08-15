import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

export interface InstitutionRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: string;
  timezone: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface InstitutionUpdateInput {
  name?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

function mapInstitutionRow(row: Record<string, unknown>): InstitutionRow {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    logo_url: (row.logo_url as string | null) ?? null,
    status: row.status as string,
    timezone: row.timezone as string,
    settings: (row.settings as Record<string, unknown>) ?? {},
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/**
 * Tenant-owned repository for the institution that the scope points at.
 * Read/write access is still bounded by membership (authorization layer).
 */
export class InstitutionsRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async getById(institutionId: string): Promise<InstitutionRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      'SELECT id, name, slug, logo_url, status, timezone, settings, created_at, updated_at FROM institutions WHERE id = $1',
      [tenantId],
    );
    const row = result.rows[0];
    return row ? mapInstitutionRow(row as Record<string, unknown>) : null;
  }

  async update(
    institutionId: string,
    input: InstitutionUpdateInput,
  ): Promise<InstitutionRow | null> {
    const tenantId = this.tenantId(institutionId);

    const current = await this.getById(tenantId);
    if (!current) {
      return null;
    }

    const next = {
      name: input.name ?? current.name,
      timezone: input.timezone ?? current.timezone,
      settings: input.settings ?? current.settings,
    };

    const result = await this.pool.query(
      `UPDATE institutions
       SET name = $2, timezone = $3, settings = $4, updated_at = now()
       WHERE id = $1
       RETURNING id, name, slug, logo_url, status, timezone, settings, created_at, updated_at`,
      [tenantId, next.name, next.timezone, next.settings],
    );
    const row = result.rows[0];
    return row ? mapInstitutionRow(row as Record<string, unknown>) : null;
  }
}
