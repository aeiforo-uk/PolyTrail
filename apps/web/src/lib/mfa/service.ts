import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { badRequest, conflict, forbidden, notFound } from '@/lib/api/errors';
import { rateLimit } from '@/lib/security/rate-limit';
import type { Session } from '@/lib/auth/session';
import { recordExtendedAudit } from '@/lib/verification/audit';
import { createEnvelope, parseEnvelope, readSecret, withRecovery } from './envelope';
import { mfaEncryptionConfigured } from './crypto';
import { consumeRecoveryCode, generateRecoveryCodes } from './recovery';
import { buildOtpAuthUri, generateTotpSecret, base32Decode, verifyTotp } from './totp';
import { grantStepUp, hasStepUp, StepUpRequiredError } from './step-up';

/**
 * TOTP enrolment, verification and recovery.
 *
 * Enrolment is two steps on purpose. A secret is written first and only becomes
 * a factor when the user proves they can produce a code from it — otherwise a
 * mistyped scan locks somebody out of their own account with a secret they have
 * no copy of.
 */

const ISSUER = 'Polytrail';

export interface MfaStatus {
  enabled: boolean;
  /** A secret exists but was never confirmed with a code. */
  pending: boolean;
  enabledAt: string | null;
  recoveryRemaining: number;
  /** False when MFA_ENCRYPTION_KEY is unset, which makes enrolment impossible. */
  configured: boolean;
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const [row] = await db
    .select({ mfaSecret: users.mfaSecret, mfaEnabledAt: users.mfaEnabledAt })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!row) throw notFound('That account does not exist.');

  const envelope = parseEnvelope(row.mfaSecret);
  return {
    enabled: Boolean(envelope && row.mfaEnabledAt),
    pending: Boolean(envelope && !row.mfaEnabledAt),
    enabledAt: row.mfaEnabledAt?.toISOString() ?? null,
    recoveryRemaining: envelope?.recovery.filter((code) => code.u === null).length ?? 0,
    configured: mfaEncryptionConfigured(),
  };
}

export interface EnrolmentStart {
  /** The base32 secret, for the "cannot scan the code" path. Shown once. */
  secret: string;
  otpauthUri: string;
  account: string;
}

export async function beginEnrolment(session: Session): Promise<EnrolmentStart> {
  if (!mfaEncryptionConfigured()) {
    throw conflict(
      'Two-factor authentication is unavailable because MFA_ENCRYPTION_KEY is not set on this deployment. ' +
        'Tell whoever operates it — enrolling without it would store your secret in the clear.',
    );
  }

  const status = await getMfaStatus(session.userId);
  if (status.enabled) {
    throw conflict('Two-factor authentication is already on. Turn it off first to re-enrol.');
  }

  const secret = generateTotpSecret();

  // Recovery codes are minted here but not shown until enrolment is confirmed,
  // so an abandoned enrolment does not leave a user holding codes for a factor
  // that was never switched on.
  const recovery = generateRecoveryCodes();

  await db
    .update(users)
    .set({ mfaSecret: createEnvelope(secret, recovery.stored), mfaEnabledAt: null })
    .where(eq(users.id, session.userId));

  await recordExtendedAuditForUser(session, 'mfa.enrolment_started');

  return {
    secret,
    otpauthUri: buildOtpAuthUri({ secret, account: session.email, issuer: ISSUER }),
    account: session.email,
  };
}

export interface EnrolmentConfirmation {
  /** Shown exactly once. Never stored in plaintext, never re-derivable. */
  recoveryCodes: string[];
}

export async function confirmEnrolment(
  session: Session,
  code: string,
): Promise<EnrolmentConfirmation> {
  const limit = rateLimit(`mfa:confirm:${session.userId}`, 10, 15 * 60_000);
  if (!limit.ok) throw conflict('Too many attempts. Wait a few minutes and try again.');

  const [row] = await db
    .select({ mfaSecret: users.mfaSecret, mfaEnabledAt: users.mfaEnabledAt })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const envelope = parseEnvelope(row?.mfaSecret ?? null);
  if (!envelope) throw conflict('Start enrolment again — there is no pending secret to confirm.');
  if (row?.mfaEnabledAt) throw conflict('Two-factor authentication is already on.');

  const verification = verifyTotp(base32Decode(readSecret(envelope)), code);
  if (!verification.valid) {
    throw badRequest(
      'That code is not right. Check your phone’s clock is set automatically — a drifting clock is the usual cause.',
    );
  }

  await db
    .update(users)
    .set({ mfaEnabledAt: new Date() })
    .where(eq(users.id, session.userId));

  // Confirming enrolment is itself proof of possession, so the step-up window
  // opens here rather than prompting again a second later.
  await grantStepUp(session.userId);
  await recordExtendedAuditForUser(session, 'mfa.enabled');
  await recordExtendedAuditForUser(session, 'mfa.recovery_codes_issued');

  // Regenerated rather than replayed: the codes minted at `beginEnrolment` were
  // never shown, and minting fresh ones here means the set the user writes down
  // is the set that has existed for the shortest possible time.
  const recovery = generateRecoveryCodes();
  await db
    .update(users)
    .set({ mfaSecret: withRecovery(envelope, recovery.stored) })
    .where(eq(users.id, session.userId));

  return { recoveryCodes: recovery.plaintext };
}

/**
 * Verify a code for a user who already has MFA on.
 *
 * Accepts either a TOTP code or an unspent recovery code, because the person
 * using this has usually just lost the phone that produces the first kind.
 */
export async function verifyForUser(
  userId: string,
  code: string,
): Promise<{ ok: boolean; usedRecovery: boolean; recoveryRemaining: number }> {
  const limit = rateLimit(`mfa:verify:${userId}`, 10, 15 * 60_000);
  if (!limit.ok) throw conflict('Too many attempts. Wait a few minutes and try again.');

  const [row] = await db
    .select({ mfaSecret: users.mfaSecret, mfaEnabledAt: users.mfaEnabledAt })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  const envelope = parseEnvelope(row?.mfaSecret ?? null);
  if (!envelope || !row?.mfaEnabledAt) {
    return { ok: false, usedRecovery: false, recoveryRemaining: 0 };
  }

  const totp = verifyTotp(base32Decode(readSecret(envelope)), code);
  if (totp.valid) {
    return {
      ok: true,
      usedRecovery: false,
      recoveryRemaining: envelope.recovery.filter((entry) => entry.u === null).length,
    };
  }

  const attempt = consumeRecoveryCode(envelope.recovery, code);
  if (!attempt.matched) return { ok: false, usedRecovery: false, recoveryRemaining: 0 };

  // Spent immediately, in its own write, so a code cannot be used twice by
  // racing two requests against each other.
  await db
    .update(users)
    .set({ mfaSecret: withRecovery(envelope, attempt.next) })
    .where(eq(users.id, userId));

  return { ok: true, usedRecovery: true, recoveryRemaining: attempt.remaining };
}

export async function confirmStepUp(session: Session, code: string): Promise<void> {
  const status = await getMfaStatus(session.userId);
  if (!status.enabled) throw conflict('Two-factor authentication is not on for this account.');

  const result = await verifyForUser(session.userId, code);
  if (!result.ok) throw badRequest('That code is not right.');

  await grantStepUp(session.userId);
  await recordExtendedAuditForUser(
    session,
    result.usedRecovery ? 'mfa.recovery_code_used' : 'mfa.step_up_confirmed',
  );
}

/**
 * The gate a destructive action calls.
 *
 * Silent for a user without MFA — the point is to re-prove a factor that
 * exists, not to invent one — and throws a typed error the UI turns into a
 * prompt for everyone else.
 */
export async function requireStepUp(session: Session, action: string): Promise<void> {
  const status = await getMfaStatus(session.userId);
  if (!status.enabled) return;
  if (await hasStepUp(session.userId)) return;
  throw new StepUpRequiredError(action);
}

export async function regenerateRecoveryCodes(session: Session): Promise<string[]> {
  await requireStepUp(session, 'Replacing your recovery codes');

  const [row] = await db
    .select({ mfaSecret: users.mfaSecret, mfaEnabledAt: users.mfaEnabledAt })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const envelope = parseEnvelope(row?.mfaSecret ?? null);
  if (!envelope || !row?.mfaEnabledAt) throw conflict('Two-factor authentication is not on.');

  const recovery = generateRecoveryCodes();
  await db
    .update(users)
    .set({ mfaSecret: withRecovery(envelope, recovery.stored) })
    .where(eq(users.id, session.userId));

  await recordExtendedAuditForUser(session, 'mfa.recovery_codes_issued');
  return recovery.plaintext;
}

export async function disableMfa(session: Session): Promise<void> {
  await requireStepUp(session, 'Turning off two-factor authentication');

  const status = await getMfaStatus(session.userId);
  if (!status.enabled && !status.pending) throw conflict('Two-factor authentication is not on.');

  await db
    .update(users)
    .set({ mfaSecret: null, mfaEnabledAt: null })
    .where(eq(users.id, session.userId));

  await recordExtendedAuditForUser(session, 'mfa.disabled');
}

async function recordExtendedAuditForUser(
  session: Session,
  action:
    | 'mfa.enrolment_started'
    | 'mfa.enabled'
    | 'mfa.disabled'
    | 'mfa.recovery_codes_issued'
    | 'mfa.recovery_code_used'
    | 'mfa.step_up_confirmed',
): Promise<void> {
  if (!session.tenantId) {
    // The audit chain is per tenant. A platform admin has no tenant chain to
    // append to, and inventing one would corrupt somebody else's.
    throw forbidden('Your account is not attached to a workspace.');
  }
  await recordExtendedAudit({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action,
    subjectType: 'user',
    subjectId: session.userId,
  });
}
