import type { Role } from './domain.js';

/**
 * Broad capabilities granted by RBAC. Audience restrictions (ABAC-style)
 * are enforced separately at the document layer.
 *
 * Baseline from `.agent/api/API_SPEC_SHEET.md` §17 (authorization matrix).
 * Cells marked "Optional" in the matrix default to DENY (least privilege).
 */
export const CAPABILITIES = [
  'document.read',
  'document.search',
  'document.create',
  'document.edit_draft',
  'document.approve',
  'document.publish',
  'ai.ask',
  'bookmark.manage',
  'users.manage',
  'departments.manage',
  'institutions.manage',
  'analytics.read',
  'audit.read',
  'platform.admin',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ALL = [...CAPABILITIES];

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  STUDENT: ['document.read', 'document.search', 'ai.ask', 'bookmark.manage'],
  FACULTY: ['document.read', 'document.search', 'ai.ask', 'bookmark.manage'],
  DEPARTMENT_ADMIN: [
    'document.read',
    'document.search',
    'ai.ask',
    'bookmark.manage',
    'document.create',
    'document.edit_draft',
  ],
  APPROVER: [
    'document.read',
    'document.search',
    'ai.ask',
    'bookmark.manage',
    'document.create',
    'document.edit_draft',
    'document.approve',
    'document.publish',
    'audit.read',
  ],
  INSTITUTION_ADMIN: ALL.filter((capability) => capability !== 'platform.admin'),
  PLATFORM_ADMIN: ALL,
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
