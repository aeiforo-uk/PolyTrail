import { describe, expect, it } from 'vitest';
import {
  RESOLVABLE_STATUSES,
  TRANSITIONS,
  availableTransitions,
  findTransition,
  isEditable,
  type PassportStatus,
} from '@/lib/passport/state';
import { ROLES } from '@/lib/auth/roles';

describe('passport state machine', () => {
  it('lets a product manager submit a draft but not approve it', () => {
    expect(findTransition('draft', 'in_review', 'PRODUCT_MANAGER')).not.toBeNull();
    expect(findTransition('in_review', 'approved', 'PRODUCT_MANAGER')).toBeNull();
  });

  it('lets a compliance officer approve and publish', () => {
    expect(findTransition('in_review', 'approved', 'COMPLIANCE_OFFICER')).not.toBeNull();
    expect(findTransition('approved', 'published', 'COMPLIANCE_OFFICER')).not.toBeNull();
  });

  it('gives external roles no transitions at all', () => {
    for (const role of ['SUPPLIER', 'RECYCLER', 'REPAIRER', 'AUTHORITY', 'CERTIFIER'] as const) {
      for (const status of Object.keys(TRANSITIONS) as PassportStatus[]) {
        expect(availableTransitions(status, role)).toEqual([]);
      }
    }
  });

  it('treats archived as terminal', () => {
    for (const role of ROLES) {
      expect(availableTransitions('archived', role)).toEqual([]);
    }
  });

  it('only allows editing in draft and changes_requested', () => {
    const editable = (Object.keys(TRANSITIONS) as PassportStatus[]).filter(isEditable);
    expect(editable.sort()).toEqual(['changes_requested', 'draft']);
  });

  it('validates before every transition that reaches the public', () => {
    for (const [, transitions] of Object.entries(TRANSITIONS)) {
      for (const transition of transitions) {
        if (transition.to === 'published' || transition.to === 'approved') {
          expect(transition.validates).toBe(true);
        }
      }
    }
  });

  it('demands a written reason for anything that harms or withdraws', () => {
    for (const [, transitions] of Object.entries(TRANSITIONS)) {
      for (const transition of transitions) {
        if (['recalled', 'suspended', 'withdrawn', 'changes_requested'].includes(transition.to)) {
          expect(transition.requiresReason).toBe(true);
        }
      }
    }
  });

  it('keeps a withdrawn or recalled passport resolvable', () => {
    // The ESPR expects a passport to outlive the product's time on sale — a
    // recycler still needs to read a garment that was withdrawn years ago.
    expect(RESOLVABLE_STATUSES).toContain('withdrawn');
    expect(RESOLVABLE_STATUSES).toContain('recalled');
    expect(RESOLVABLE_STATUSES).not.toContain('draft');
  });

  it('never transitions to a status that does not exist', () => {
    const known = new Set(Object.keys(TRANSITIONS));
    for (const [, transitions] of Object.entries(TRANSITIONS)) {
      for (const transition of transitions) expect(known.has(transition.to)).toBe(true);
    }
  });
});
