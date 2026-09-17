import type { Role } from '@/lib/auth/roles';

/**
 * Passport lifecycle.
 *
 * Modelled explicitly rather than as free-form status updates because the
 * transitions carry regulatory weight: who may publish, who may approve what
 * they wrote, and what happens to a passport that is already in circulation.
 * Article 10 of the ESPR expects a passport to stay reachable for the product's
 * lifetime, so nothing here deletes — `withdrawn` and `archived` still resolve.
 */
export type PassportStatus =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'published'
  | 'suspended'
  | 'recalled'
  | 'withdrawn'
  | 'archived';

export interface Transition {
  to: PassportStatus;
  label: string;
  /** Roles permitted to make this transition. */
  roles: readonly Role[];
  /** Requires a written reason, stored on the passport and in the audit chain. */
  requiresReason?: boolean;
  /** Runs the publication validation gate before the transition is allowed. */
  validates?: boolean;
  /** Destructive or outward-facing enough to warrant a confirmation step. */
  confirm?: boolean;
  description: string;
}

const EDITORS: readonly Role[] = ['BRAND_ADMIN', 'PRODUCT_MANAGER'];
const APPROVERS: readonly Role[] = ['BRAND_ADMIN', 'COMPLIANCE_OFFICER'];

export const TRANSITIONS: Record<PassportStatus, readonly Transition[]> = {
  draft: [
    {
      to: 'in_review',
      label: 'Submit for review',
      roles: EDITORS,
      validates: true,
      description: 'Sends the passport to a compliance officer for approval.',
    },
  ],
  in_review: [
    {
      to: 'approved',
      label: 'Approve',
      roles: APPROVERS,
      validates: true,
      description: 'Confirms the passport is fit to publish.',
    },
    {
      to: 'changes_requested',
      label: 'Request changes',
      roles: APPROVERS,
      requiresReason: true,
      description: 'Returns the passport to the author with a written reason.',
    },
    {
      to: 'draft',
      label: 'Reject',
      roles: APPROVERS,
      requiresReason: true,
      confirm: true,
      // Distinct from "request changes": that one names specific fields and
      // expects a resubmission, this one sends the whole passport back because
      // it should not have been submitted. Modelled as a return to draft rather
      // than a terminal `rejected` status, because rejection is a judgement
      // about this submission, not about the product.
      description: 'Sends the whole passport back to draft. Use when it is not close to ready.',
    },
  ],
  changes_requested: [
    {
      to: 'in_review',
      label: 'Resubmit',
      roles: EDITORS,
      validates: true,
      description: 'Sends the revised passport back for approval.',
    },
  ],
  approved: [
    {
      to: 'published',
      label: 'Publish',
      roles: APPROVERS,
      validates: true,
      confirm: true,
      description: 'Makes the passport resolvable at its public URL.',
    },
    {
      to: 'draft',
      label: 'Return to draft',
      roles: APPROVERS,
      requiresReason: true,
      description: 'Withdraws approval before publication.',
    },
  ],
  published: [
    {
      to: 'suspended',
      label: 'Suspend',
      roles: APPROVERS,
      requiresReason: true,
      confirm: true,
      description: 'Flags the passport as not current without removing it.',
    },
    {
      to: 'recalled',
      label: 'Recall product',
      roles: APPROVERS,
      requiresReason: true,
      confirm: true,
      description: 'Publishes a recall notice at the top of the passport.',
    },
    {
      to: 'withdrawn',
      label: 'Withdraw from market',
      roles: APPROVERS,
      requiresReason: true,
      confirm: true,
      description: 'Marks the product as no longer placed on the market. Stays resolvable.',
    },
  ],
  suspended: [
    {
      to: 'published',
      label: 'Reinstate',
      roles: APPROVERS,
      requiresReason: true,
      // Reinstating puts the passport back in front of the public, so it goes
      // through the same validation gate as a first publication. A passport
      // suspended because its data was wrong must not return unchecked.
      validates: true,
      description: 'Returns the passport to normal.',
    },
    {
      to: 'recalled',
      label: 'Recall product',
      roles: APPROVERS,
      requiresReason: true,
      confirm: true,
      description: 'Escalates a suspension to a recall.',
    },
  ],
  recalled: [
    {
      to: 'withdrawn',
      label: 'Close recall',
      roles: APPROVERS,
      requiresReason: true,
      description: 'Ends the recall and withdraws the product.',
    },
  ],
  withdrawn: [
    {
      to: 'archived',
      label: 'Archive',
      roles: ['BRAND_ADMIN'],
      confirm: true,
      description: 'Removes the passport from working lists. It stays resolvable.',
    },
  ],
  archived: [],
};

/** Statuses that resolve at the public URL. */
export const RESOLVABLE_STATUSES: readonly PassportStatus[] = [
  'published',
  'suspended',
  'recalled',
  'withdrawn',
];

export function availableTransitions(status: PassportStatus, role: Role): Transition[] {
  return [...(TRANSITIONS[status] ?? [])].filter((t) => t.roles.includes(role));
}

export function findTransition(
  status: PassportStatus,
  to: PassportStatus,
  role: Role,
): Transition | null {
  return availableTransitions(status, role).find((t) => t.to === to) ?? null;
}

export function isEditable(status: PassportStatus): boolean {
  return status === 'draft' || status === 'changes_requested';
}

export const STATUS_LABELS: Record<PassportStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  published: 'Published',
  suspended: 'Suspended',
  recalled: 'Recalled',
  withdrawn: 'Withdrawn',
  archived: 'Archived',
};
