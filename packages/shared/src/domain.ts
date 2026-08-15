export const DOCUMENT_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'SUPERSEDED',
  'ARCHIVED',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'NOTICE',
  'CIRCULAR',
  'POLICY',
  'FORM',
  'SCHEDULE',
  'REPORT',
  'OTHER',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const ROLES = [
  'STUDENT',
  'FACULTY',
  'DEPARTMENT_ADMIN',
  'APPROVER',
  'INSTITUTION_ADMIN',
  'PLATFORM_ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

export const DEPARTMENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];
