export const AUDIT_ACTIONS = [
  'document.created',
  'document.uploaded',
  'document.updated',
  'document.submitted_for_review',
  'document.returned_to_draft',
  'document.approved',
  'document.published',
  'document.archived',
  'document.superseded',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
