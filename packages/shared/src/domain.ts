export const DOCUMENT_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'SUPERSEDED',
  'ARCHIVED',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const ROLES = [
  'STUDENT',
  'FACULTY',
  'DEPARTMENT_ADMIN',
  'APPROVER',
  'INSTITUTION_ADMIN',
  'PLATFORM_ADMIN',
] as const;

export type Role = (typeof ROLES)[number];
