import type { DocumentStatus } from './domain.js';

/**
 * Document lifecycle state machine
 * (`.agent/AGENTS.md` §9 / `.agent/architecture/TECHNICAL_SPEC.md` §9):
 *
 *   DRAFT → IN_REVIEW → APPROVED → PUBLISHED → SUPERSEDED → ARCHIVED
 *
 * Pure domain logic; enforcement (who may perform each transition) lives in
 * the API service layer.
 */
export const DOCUMENT_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['APPROVED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['SUPERSEDED', 'ARCHIVED'],
  SUPERSEDED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionDocument(from: DocumentStatus, to: DocumentStatus): boolean {
  return DOCUMENT_TRANSITIONS[from].includes(to);
}

export const DOCUMENT_TRANSITION_LABELS: Record<string, string> = {
  'DRAFT->IN_REVIEW': 'Submit for review',
  'DRAFT->ARCHIVED': 'Archive draft',
  'IN_REVIEW->APPROVED': 'Approve',
  'IN_REVIEW->DRAFT': 'Return to draft',
  'APPROVED->PUBLISHED': 'Publish',
  'APPROVED->DRAFT': 'Reject',
  'PUBLISHED->SUPERSEDED': 'Supersede',
  'PUBLISHED->ARCHIVED': 'Archive',
  'SUPERSEDED->ARCHIVED': 'Archive superseded',
};
