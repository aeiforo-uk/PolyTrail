import 'server-only';
import { recordAudit, recordAuditSafe } from '@/lib/audit/record';
import type { AuditInput } from '@/lib/audit';
import { AUDIT_ACTIONS, type AuditAction } from '@/lib/audit';

/**
 * Audit helpers for verification, MFA, Registry filing and authority reads.
 *
 * These actions now live in `AUDIT_ACTIONS` with every other one, so this
 * module no longer widens anything — it is a narrowed view that documents
 * which actions this group of features writes, and the `satisfies` below makes
 * the compiler check that claim. Renaming an action in the central list breaks
 * here rather than silently writing an unrecognised string into the chain.
 */
export const EXTENDED_AUDIT_ACTIONS = [
  'registry.submitted',
  'registry.status_checked',
  'registry.withdrawn',
  'registry.submission_refused',
  'verification.challenge_issued',
  'verification.level_reached',
  'verification.revoked',
  'verification.review_recorded',
  'mfa.enrolment_started',
  'mfa.enabled',
  'mfa.disabled',
  'mfa.recovery_codes_issued',
  'mfa.recovery_code_used',
  'mfa.step_up_confirmed',
  'authority.passport_read',
  'authority.record_exported',
  'authority.search_performed',
] as const satisfies readonly AuditAction[];

export type ExtendedAuditAction = (typeof EXTENDED_AUDIT_ACTIONS)[number];

export interface ExtendedAuditInput extends Omit<AuditInput, 'action'> {
  action: ExtendedAuditAction;
}

/** Append and fail the caller if it cannot be appended. */
export async function recordExtendedAudit(input: ExtendedAuditInput) {
  return recordAudit(input);
}

/** Best-effort variant, for reads where losing the record beats failing the request. */
export async function recordExtendedAuditSafe(input: ExtendedAuditInput): Promise<void> {
  await recordAuditSafe(input);
}

/** Guards against the central list and this view drifting apart. */
export function isExtendedAuditAction(value: string): value is ExtendedAuditAction {
  return (EXTENDED_AUDIT_ACTIONS as readonly string[]).includes(value) &&
    (AUDIT_ACTIONS as readonly string[]).includes(value);
}
