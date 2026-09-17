import 'server-only';
import { recordAudit, recordAuditSafe } from '@/lib/audit/record';
import type { AuditAction } from '@/lib/audit';

/**
 * Audit actions this module writes that `AUDIT_ACTIONS` does not yet name.
 *
 * The audit table stores `action` as text and `verifyAuditChain` hashes it as
 * text, so writing one of these produces a valid, verifiable chain entry. The
 * cast exists only because `src/lib/audit/index.ts` belongs to another part of
 * the codebase and the union there has not caught up.
 *
 * The alternative — recording a supplier change as `tenant.updated` — would
 * put a wrong answer in front of an auditor, which is worse than a type cast
 * with a note on it. Delete this file's cast once the union gains these names.
 */
export const SUPPLY_AUDIT_ACTIONS = [
  'partner.created',
  'partner.updated',
  'partner.archived',
  'data_request.sent',
  'data_request.reminded',
  'data_request.opened',
  'data_request.cancelled',
] as const;

export type SupplyAuditAction = (typeof SUPPLY_AUDIT_ACTIONS)[number] | AuditAction;

type Input = Omit<Parameters<typeof recordAudit>[0], 'action'> & { action: SupplyAuditAction };

/** Throws on failure — use for anything a regulator would expect to see. */
export async function recordSupplyAudit(input: Input) {
  return recordAudit({ ...input, action: input.action as AuditAction });
}

/** Best-effort — use only where losing the record beats failing the request. */
export async function recordSupplyAuditSafe(input: Input) {
  return recordAuditSafe({ ...input, action: input.action as AuditAction });
}
