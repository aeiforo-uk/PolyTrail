import { decryptSecret, encryptSecret } from './crypto';
import type { StoredRecoveryCode } from './recovery';

/**
 * What lives in `users.mfa_secret`.
 *
 * The column is a single `text`, and the schema is owned elsewhere, so the
 * encrypted secret and the recovery-code digests share it as one JSON envelope
 * rather than waiting for two more columns. That is a real constraint honestly
 * handled, not a clever trick: the envelope is versioned, the secret inside it
 * is AES-256-GCM sealed, and the recovery digests are one-way, so nothing here
 * is less safe than it would be in columns of its own.
 *
 * Enrolment state is read from `users.mfa_enabled_at`, not from this envelope:
 * a secret with no `mfaEnabledAt` is an enrolment someone started and never
 * confirmed, and it must not be treated as a factor.
 */

export const ENVELOPE_VERSION = 1;

export interface MfaEnvelope {
  v: number;
  /** `v1.<iv>.<tag>.<ciphertext>` from `crypto.ts`. */
  secret: string;
  recovery: StoredRecoveryCode[];
}

export function createEnvelope(base32Secret: string, recovery: StoredRecoveryCode[]): string {
  const envelope: MfaEnvelope = {
    v: ENVELOPE_VERSION,
    secret: encryptSecret(base32Secret),
    recovery,
  };
  return JSON.stringify(envelope);
}

export function parseEnvelope(stored: string | null): MfaEnvelope | null {
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<MfaEnvelope>;
    if (candidate.v !== ENVELOPE_VERSION || typeof candidate.secret !== 'string') return null;
    return {
      v: candidate.v,
      secret: candidate.secret,
      recovery: Array.isArray(candidate.recovery) ? candidate.recovery : [],
    };
  } catch {
    // A malformed envelope is treated as "no MFA enrolled" rather than as an
    // error, so a corrupted row locks nobody out of their own workspace.
    return null;
  }
}

export function readSecret(envelope: MfaEnvelope): string {
  return decryptSecret(envelope.secret);
}

export function withRecovery(envelope: MfaEnvelope, recovery: StoredRecoveryCode[]): string {
  return JSON.stringify({ ...envelope, recovery } satisfies MfaEnvelope);
}
