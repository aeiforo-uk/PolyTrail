import 'server-only';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../crypto/canonical';

/**
 * Tamper-evident audit log.
 *
 * Each event stores the hash of the previous event for the same tenant, so the
 * table forms a hash chain. Deleting or editing a historical row breaks every
 * subsequent link, which `verifyAuditChain` detects. This is what lets a brand
 * show an auditor that the passport history they are reading is the history
 * that was actually written.
 */

export const AUDIT_ACTIONS = [
  'passport.created',
  'passport.updated',
  'passport.published',
  'passport.unpublished',
  'passport.archived',
  'passport.recalled',
  'passport.version.created',
  'passport.event.appended',
  'passport.transfer.initiated',
  'passport.transfer.accepted',
  'passport.transfer.rejected',
  'passport.transfer.cancelled',
  'passport.transfer.expired',
  'credential.issued',
  'credential.revoked',
  'data_request.created',
  'data_request.sent',
  'data_request.reminded',
  'data_request.opened',
  'data_request.submitted',
  'data_request.approved',
  'data_request.rejected',
  'data_request.cancelled',
  'partner.created',
  'partner.updated',
  'partner.archived',
  'user.signed_in',
  'user.signed_out',
  'user.invited',
  'user.role_changed',
  'user.removed',
  'user.suspended',
  'user.reinstated',
  'invitation.revoked',
  'invitation.accepted',
  'tenant.created',
  'tenant.updated',
  'tenant.branding_updated',
  'api_key.created',
  'api_key.revoked',
  'import.started',
  'import.completed',
  'connector.created',
  'connector.updated',
  'connector.deleted',
  'connector.tested',
  'webhook.endpoint.created',
  'webhook.endpoint.updated',
  'webhook.endpoint.deleted',
  'public.passport_viewed',
  'export.generated',
  'audit.chain_verified',
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
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditInput {
  tenantId: string;
  actorId: string | null;
  actorLabel: string;
  action: AuditAction;
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditLink {
  previousHash: string;
  entryHash: string;
  recordedAt: string;
}

export const GENESIS_HASH = '0x' + '0'.repeat(64);

/**
 * Normalise a timestamp to a single canonical spelling before it is hashed.
 *
 * This exists because the write path and the read path disagreed about the
 * string. `recordAudit` hashed `2026-09-17T07:24:35.507Z` and Postgres handed
 * the same instant back as `2026-09-17 07:24:35.507+00`, so re-deriving the
 * hash produced a different digest and the chain reported itself broken at the
 * first entry — every time, on a chain nobody had touched.
 *
 * Hashing the instant rather than its spelling is the fix: any format the
 * driver returns normalises to the same value here.
 */
function canonicalTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Audit timestamp is not a date: ${value}`);
  }
  return parsed.toISOString();
}

/** Compute the chain hash for an entry given the previous entry's hash. */
export function computeEntryHash(input: AuditInput, previousHash: string, recordedAt: string) {
  const material = canonicalJson({
    previousHash,
    tenantId: input.tenantId,
    actorId: input.actorId,
    // The name an auditor actually reads. Hashing only `actorId` left the
    // displayed attribution unprotected: renaming the actor on a stored row
    // changed who the log appeared to blame while the chain still verified.
    actorLabel: input.actorLabel,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    metadata: input.metadata ?? {},
    recordedAt: canonicalTimestamp(recordedAt),
  });
  return '0x' + createHash('sha256').update(material, 'utf8').digest('hex');
}

export interface ChainRow {
  previousHash: string;
  entryHash: string;
  recordedAt: string;
  tenantId: string;
  actorId: string | null;
  actorLabel: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: Record<string, unknown> | null;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  /** Index of the first row whose hash does not match. `null` when valid. */
  brokenAt: number | null;
  reason?: string;
}

/**
 * Re-derive every hash in `rows` (oldest first) and confirm the chain holds.
 * Pure — takes rows, returns a verdict — so it is trivially unit-testable and
 * can run against an exported audit bundle as well as the live table.
 */
export function verifyAuditChain(rows: readonly ChainRow[]): ChainVerification {
  let expectedPrevious = GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.previousHash !== expectedPrevious) {
      return {
        valid: false,
        checked: i,
        brokenAt: i,
        reason: `Entry ${i} points at ${row.previousHash} but the preceding entry hashes to ${expectedPrevious}. A record was removed or reordered.`,
      };
    }
    const recomputed = computeEntryHash(
      {
        tenantId: row.tenantId,
        actorId: row.actorId,
        actorLabel: row.actorLabel,
        action: row.action as AuditAction,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        metadata: row.metadata ?? {},
      },
      row.previousHash,
      row.recordedAt,
    );
    if (recomputed !== row.entryHash) {
      return {
        valid: false,
        checked: i,
        brokenAt: i,
        reason: `Entry ${i} hashes to ${recomputed} but stores ${row.entryHash}. The record was modified after it was written.`,
      };
    }
    expectedPrevious = row.entryHash;
  }
  return { valid: true, checked: rows.length, brokenAt: null };
}
