import type { Role } from '@/lib/auth/roles';
import { TRANSFER_STATUS_META, type TransferStatus } from './types';

/**
 * The transfer state machine.
 *
 * Pure, and the only place the rules are written down. The API, the server
 * actions and the console all ask this module rather than re-deriving "may I
 * cancel this?" from a status string — because the moment two places answer
 * that question independently, one of them is wrong and it is the one without
 * a test.
 *
 *   initiated ──accept──▶ accepted
 *             ──reject──▶ rejected
 *             ──cancel──▶ cancelled
 *             ──expire──▶ expired
 *
 * Every other status is terminal. There is no path back to `initiated`:
 * re-offering a rejected transfer mints a new row with a new token, so the
 * record shows two offers rather than one offer that changed its mind.
 */

export type TransferAction = 'accept' | 'reject' | 'cancel' | 'expire';

const GRAPH: Record<TransferStatus, Partial<Record<TransferAction, TransferStatus>>> = {
  initiated: {
    accept: 'accepted',
    reject: 'rejected',
    cancel: 'cancelled',
    expire: 'expired',
  },
  accepted: {},
  rejected: {},
  cancelled: {},
  expired: {},
};

export function nextTransferStatus(
  from: TransferStatus,
  action: TransferAction,
): TransferStatus | null {
  return GRAPH[from][action] ?? null;
}

export function isTerminalTransfer(status: TransferStatus): boolean {
  return Object.keys(GRAPH[status]).length === 0;
}

/** Roles that may hand a passport to somebody else. */
export const TRANSFER_ROLES: readonly Role[] = ['BRAND_ADMIN', 'PRODUCT_MANAGER'];

/**
 * Statuses a passport may be transferred in.
 *
 * A draft has never been in anyone's hands, so there is nothing to hand over.
 * A recalled passport is blocked deliberately: passing a recalled garment to
 * someone else is exactly the movement a recall is meant to stop, and the
 * record should not make it look routine.
 */
export const TRANSFERABLE_PASSPORT_STATUSES: readonly string[] = [
  'published',
  'suspended',
  'withdrawn',
];

export interface TransferablePassport {
  status: string;
  tenantId: string;
  /** Null on rows written before ownership was modelled; falls back to `tenantId`. */
  ownerTenantId: string | null;
  /** True when an offer is already out. Optional — omit when it is not known yet. */
  transferInFlight?: boolean;
}

export interface TransferActor {
  tenantId: string | null;
  role: Role;
}

export interface TransferVerdict {
  ok: boolean;
  /** Plain-language reason, safe to show the user. Present only when `ok` is false. */
  reason?: string;
}

/** The tenant that currently holds the passport. */
export function currentOwner(passport: TransferablePassport): string {
  return passport.ownerTenantId ?? passport.tenantId;
}

/**
 * May this actor transfer this passport?
 *
 * Shared verbatim by the console (to decide whether to show the button) and by
 * `initiateTransfer` (to decide whether to allow it), so the UI can never offer
 * an action the service will refuse.
 */
export function canTransfer(
  passport: TransferablePassport,
  actor: TransferActor,
): TransferVerdict {
  if (!actor.tenantId) {
    return { ok: false, reason: 'Your account is not attached to a workspace.' };
  }
  if (!TRANSFER_ROLES.includes(actor.role)) {
    return {
      ok: false,
      reason: 'Only a brand admin or a product manager can transfer a passport.',
    };
  }
  if (currentOwner(passport) !== actor.tenantId) {
    return {
      ok: false,
      reason: 'This workspace is not the current owner, so it has nothing to hand over.',
    };
  }
  if (passport.status === 'recalled') {
    return {
      ok: false,
      reason: 'This item is recalled. It should be coming back, not moving on.',
    };
  }
  if (!TRANSFERABLE_PASSPORT_STATUSES.includes(passport.status)) {
    return {
      ok: false,
      reason: 'Publish the passport before transferring it. A draft has never been in anyone’s hands.',
    };
  }
  if (passport.transferInFlight) {
    return {
      ok: false,
      reason: 'There is already an offer out on this item. Cancel it before sending another.',
    };
  }
  return { ok: true };
}

export interface TransferParties {
  status: TransferStatus;
  fromTenantId: string;
  toTenantId: string | null;
  toEmail: string | null;
  expiresAt: Date | string | null;
}

/** Only the sender may withdraw an offer, and only while it is still open. */
export function canCancel(transfer: TransferParties, actor: TransferActor): TransferVerdict {
  if (transfer.status !== 'initiated') {
    return {
      ok: false,
      reason: `This transfer is ${TRANSFER_STATUS_META[transfer.status].label.toLowerCase()}. There is nothing to withdraw.`,
    };
  }
  if (!actor.tenantId || actor.tenantId !== transfer.fromTenantId) {
    return { ok: false, reason: 'Only the workspace that sent this transfer can withdraw it.' };
  }
  if (!TRANSFER_ROLES.includes(actor.role)) {
    return { ok: false, reason: 'Only a brand admin or a product manager can withdraw a transfer.' };
  }
  return { ok: true };
}

/**
 * May this actor accept or reject?
 *
 * The recipient may be identified by tenant or only by email — a private buyer
 * has no workspace at the moment the offer is sent — so both are accepted, and
 * the sender is excluded explicitly. Somebody accepting their own transfer
 * would produce a dual-signed credential with one signature.
 */
export function canDecide(
  transfer: TransferParties,
  /**
   * `email` is null for somebody acting on the token alone with no account.
   * Holding the link is the proof in that case — the address check exists to
   * stop a *different* signed-in workspace claiming an offer, not to stop the
   * person it was sent to from declining it without signing up first.
   */
  actor: { tenantId: string | null; email: string | null },
): TransferVerdict {
  if (transfer.status !== 'initiated') {
    return {
      ok: false,
      reason: `This transfer is ${TRANSFER_STATUS_META[transfer.status].label.toLowerCase()}.`,
    };
  }
  if (hasExpired(transfer)) {
    return { ok: false, reason: 'This acceptance link has expired.' };
  }
  if (actor.tenantId && actor.tenantId === transfer.fromTenantId) {
    return { ok: false, reason: 'You sent this transfer. Somebody else has to accept it.' };
  }
  if (transfer.toTenantId && actor.tenantId && transfer.toTenantId !== actor.tenantId) {
    return {
      ok: false,
      reason: 'This transfer was addressed to a different workspace.',
    };
  }
  if (!transfer.toTenantId && transfer.toEmail && actor.email) {
    const addressed = transfer.toEmail.trim().toLowerCase();
    if (addressed !== actor.email.trim().toLowerCase()) {
      return { ok: false, reason: 'This transfer was addressed to a different email address.' };
    }
  }
  return { ok: true };
}

export function hasExpired(transfer: Pick<TransferParties, 'expiresAt'>): boolean {
  if (!transfer.expiresAt) return false;
  const at = transfer.expiresAt instanceof Date ? transfer.expiresAt : new Date(transfer.expiresAt);
  return at.getTime() <= Date.now();
}

/** Default life of an acceptance link, and the range the form will take. */
export const DEFAULT_EXPIRY_DAYS = 14;
export const MIN_EXPIRY_DAYS = 1;
export const MAX_EXPIRY_DAYS = 90;
