import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  registerPool,
  requireTestDatabaseUrl,
} from '../../../../../tests/integration/helpers/db.js';
import { seedIdentity, type SeedIdentity } from '../../../../../tests/integration/helpers/seed.js';
import { DepartmentsRepository } from './departments.repository.js';

let pool: Pool;
let tenantA: SeedIdentity;
let tenantB: SeedIdentity;
let repository: DepartmentsRepository;

beforeAll(async () => {
  pool = new Pool({ connectionString: requireTestDatabaseUrl() });
  registerPool(pool);
  repository = new DepartmentsRepository(pool);

  tenantA = await seedIdentity(pool);
  tenantB = await seedIdentity(pool);

  // seedIdentity already created one department per tenant; add a second to each.
  await repository.create(tenantA.institutionId, { name: 'Electrical Engineering', code: 'EE' });
  await repository.create(tenantB.institutionId, { name: 'Civil Engineering', code: 'CE' });
});

afterAll(async () => {
  await pool.end();
});

describe('DepartmentsRepository (tenant-scoped)', () => {
  it('creates a department owned by the tenant', async () => {
    const created = await repository.create(tenantA.institutionId, {
      name: 'Physics',
      code: 'PHY',
    });

    expect(created.institution_id).toBe(tenantA.institutionId);
    expect(created.name).toBe('Physics');
    expect(created.status).toBe('ACTIVE');
    expect(created.created_at).toBeInstanceOf(Date);
  });

  it('lists only the requesting tenant departments', async () => {
    const rows = await repository.list(tenantA.institutionId);

    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.institution_id).toBe(tenantA.institutionId);
    }
  });

  it('never returns another tenant department by id', async () => {
    const otherTenantDepartment = (await repository.list(tenantB.institutionId))[0]!;

    const found = await repository.findById(tenantA.institutionId, otherTenantDepartment.id);
    expect(found).toBeNull();
  });

  it('never returns another tenant department by code', async () => {
    const otherTenantDepartment = (await repository.list(tenantB.institutionId))[0]!;

    const found = await repository.findByCode(tenantA.institutionId, otherTenantDepartment.code);
    expect(found).toBeNull();
  });

  it('allows the same code in different tenants but rejects it within one', async () => {
    await repository.create(tenantA.institutionId, { name: 'Shared Code', code: 'SHARED' });
    await repository.create(tenantB.institutionId, { name: 'Shared Code B', code: 'SHARED' });

    await expect(
      repository.create(tenantA.institutionId, { name: 'Duplicate', code: 'SHARED' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('filters by status and search within the tenant', async () => {
    await repository.setStatus(
      tenantA.institutionId,
      (await repository.list(tenantA.institutionId))[0]!.id,
      'INACTIVE',
    );

    const activeOnly = await repository.list(tenantA.institutionId, { status: 'ACTIVE' });
    for (const row of activeOnly) {
      expect(row.status).toBe('ACTIVE');
    }

    const searched = await repository.list(tenantA.institutionId, { search: 'physics' });
    expect(searched.length).toBe(1);
    expect(searched[0]!.code).toBe('PHY');
  });

  it('soft-deactivates a department within the tenant scope', async () => {
    const target = await repository.create(tenantB.institutionId, {
      name: 'Temporary',
      code: 'TMP',
    });
    const updated = await repository.setStatus(tenantB.institutionId, target.id, 'INACTIVE');

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('INACTIVE');

    const fromOtherTenant = await repository.setStatus(tenantA.institutionId, target.id, 'ACTIVE');
    expect(fromOtherTenant).toBeNull();
  });

  it('rejects an invalid tenant scope fail-fast', async () => {
    await expect(repository.list('not-a-uuid')).rejects.toThrow();
    await expect(repository.findById(randomUUID(), 'not-an-id')).rejects.toThrow();
  });

  it('returns null for a valid id that does not exist in the tenant', async () => {
    const missing = await repository.findById(tenantA.institutionId, randomUUID());
    expect(missing).toBeNull();
  });
});
