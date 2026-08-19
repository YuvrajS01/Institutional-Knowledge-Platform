import { describe, expect, it } from 'vitest';

import { DOCUMENT_STATUSES } from './domain.js';
import { canTransitionDocument, DOCUMENT_TRANSITIONS } from './lifecycle.js';

describe('document lifecycle state machine', () => {
  it('follows the canonical path', () => {
    expect(canTransitionDocument('DRAFT', 'IN_REVIEW')).toBe(true);
    expect(canTransitionDocument('IN_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionDocument('APPROVED', 'PUBLISHED')).toBe(true);
    expect(canTransitionDocument('PUBLISHED', 'SUPERSEDED')).toBe(true);
    expect(canTransitionDocument('SUPERSEDED', 'ARCHIVED')).toBe(true);
  });

  it('allows the documented return/reject edges', () => {
    expect(canTransitionDocument('IN_REVIEW', 'DRAFT')).toBe(true);
    expect(canTransitionDocument('APPROVED', 'DRAFT')).toBe(true);
    expect(canTransitionDocument('DRAFT', 'ARCHIVED')).toBe(true);
    expect(canTransitionDocument('PUBLISHED', 'ARCHIVED')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransitionDocument('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canTransitionDocument('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionDocument('PUBLISHED', 'IN_REVIEW')).toBe(false);
    expect(canTransitionDocument('ARCHIVED', 'DRAFT')).toBe(false);
  });

  it('ARCHIVED is terminal', () => {
    expect(DOCUMENT_TRANSITIONS.ARCHIVED).toHaveLength(0);
  });

  it('every transition target is a known status', () => {
    for (const from of DOCUMENT_STATUSES) {
      for (const to of DOCUMENT_TRANSITIONS[from]) {
        expect(DOCUMENT_STATUSES).toContain(to);
      }
    }
  });
});
