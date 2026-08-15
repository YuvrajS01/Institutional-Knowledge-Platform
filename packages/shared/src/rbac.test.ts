import { describe, expect, it } from 'vitest';

import { CAPABILITIES, ROLE_CAPABILITIES, hasCapability } from './rbac.js';

describe('RBAC capability mapping', () => {
  it('grants read/search/ai/bookmark to every role', () => {
    const everyone: readonly string[] = [
      'document.read',
      'document.search',
      'ai.ask',
      'bookmark.manage',
    ];
    for (const capabilities of Object.values(ROLE_CAPABILITIES)) {
      for (const capability of everyone) {
        expect(capabilities).toContain(capability);
      }
    }
  });

  it('grants exactly the student baseline to STUDENT and FACULTY', () => {
    const baseline = ['document.read', 'document.search', 'ai.ask', 'bookmark.manage'];
    expect([...ROLE_CAPABILITIES.STUDENT].sort()).toEqual(baseline.sort());
    expect([...ROLE_CAPABILITIES.FACULTY].sort()).toEqual(baseline.sort());
  });

  it('grants create/edit to DEPARTMENT_ADMIN but not approve/publish', () => {
    expect(ROLE_CAPABILITIES.DEPARTMENT_ADMIN).toContain('document.create');
    expect(ROLE_CAPABILITIES.DEPARTMENT_ADMIN).toContain('document.edit_draft');
    expect(ROLE_CAPABILITIES.DEPARTMENT_ADMIN).not.toContain('document.approve');
    expect(ROLE_CAPABILITIES.DEPARTMENT_ADMIN).not.toContain('document.publish');
  });

  it('grants approve/publish/audit to APPROVER', () => {
    expect(ROLE_CAPABILITIES.APPROVER).toContain('document.approve');
    expect(ROLE_CAPABILITIES.APPROVER).toContain('document.publish');
    expect(ROLE_CAPABILITIES.APPROVER).toContain('audit.read');
  });

  it('denies user management to everyone below INSTITUTION_ADMIN', () => {
    for (const role of ['STUDENT', 'FACULTY', 'DEPARTMENT_ADMIN', 'APPROVER'] as const) {
      expect(ROLE_CAPABILITIES[role]).not.toContain('users.manage');
    }
    expect(ROLE_CAPABILITIES.INSTITUTION_ADMIN).toContain('users.manage');
  });

  it('grants every capability to PLATFORM_ADMIN', () => {
    expect([...ROLE_CAPABILITIES.PLATFORM_ADMIN].sort()).toEqual([...CAPABILITIES].sort());
  });

  it('INSTITUTION_ADMIN has everything except platform.admin', () => {
    const expected = CAPABILITIES.filter((capability) => capability !== 'platform.admin');
    expect([...ROLE_CAPABILITIES.INSTITUTION_ADMIN].sort()).toEqual([...expected].sort());
  });

  it('hasCapability mirrors the mapping', () => {
    expect(hasCapability('STUDENT', 'document.read')).toBe(true);
    expect(hasCapability('STUDENT', 'document.approve')).toBe(false);
    expect(hasCapability('PLATFORM_ADMIN', 'platform.admin')).toBe(true);
  });
});
