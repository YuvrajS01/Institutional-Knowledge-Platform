import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { TenantRepository } from './tenant-repository.js';

class ExposedTenantRepository extends TenantRepository {
  constructor() {
    super({} as Pool);
  }

  public condition(alias: string, paramIndex: number): string {
    return this.tenantCondition(alias, paramIndex);
  }

  public scope(institutionId: string): string {
    return this.tenantId(institutionId);
  }
}

describe('TenantRepository', () => {
  const repo = new ExposedTenantRepository();
  const validUuid = 'a3f1a37c-9b5e-4f0e-8c1d-2d5f6a7b8c9d';

  it('builds a tenant WHERE fragment for a bound parameter', () => {
    expect(repo.condition('d', 1)).toBe('d.institution_id = $1');
    expect(repo.condition('m', 3)).toBe('m.institution_id = $3');
  });

  it('accepts a valid UUID tenant scope', () => {
    expect(repo.scope(validUuid)).toBe(validUuid);
  });

  it('rejects an empty tenant scope', () => {
    expect(() => repo.scope('')).toThrow();
  });

  it('rejects a non-UUID tenant scope', () => {
    expect(() => repo.scope('not-a-uuid')).toThrow();
  });
});
