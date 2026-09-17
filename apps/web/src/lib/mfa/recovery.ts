import { createHash, randomBytes } from 'node:crypto';
import { timingSafeEqual } from '@/lib/crypto/canonical';

/**
 * Single-use recovery codes.
 *
 * The failure mode two-factor authentication actually produces in a business is
 * not an attacker: it is a compliance officer who has changed phone on the
 * morning a passport has to be published. Recovery codes are what stop that
 * becoming a support ticket with a deadline attached.
 *
 * Stored as SHA-256 digests. They are 80-bit random strings, not passwords, so
 * there is no dictionary to attack and no reason to pay for a slow KDF — but
 * there is every reason not to keep the plaintext, because a database that
 * holds usable recovery codes holds a second factor that bypasses the second
 * factor.
 */

export const RECOVERY_CODE_COUNT = 10;

/** Crockford-style: no I, L, O or U, so a code read off paper is unambiguous. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 16;

export interface StoredRecoveryCode {
  /** SHA-256 hex digest. Never the code itself. */
  h: string;
  /** ISO timestamp when it was spent, or null while it is still good. */
  u: string | null;
}

export function formatRecoveryCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join('-');
}

export function normalizeRecoveryCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

export interface GeneratedRecoveryCodes {
  /** Shown once, then never again. */
  plaintext: string[];
  stored: StoredRecoveryCode[];
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): GeneratedRecoveryCodes {
  const plaintext: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let j = 0; j < CODE_LENGTH; j++) code += ALPHABET[bytes[j]! % ALPHABET.length];
    plaintext.push(code);
  }

  return {
    plaintext: plaintext.map(formatRecoveryCode),
    stored: plaintext.map((code) => ({ h: hashRecoveryCode(code), u: null })),
  };
}

export interface RecoveryAttempt {
  matched: boolean;
  /** The list with the used code marked spent. Unchanged when nothing matched. */
  next: StoredRecoveryCode[];
  remaining: number;
}

/**
 * Spend a code.
 *
 * Every unspent digest is compared in constant time and the loop is not exited
 * early, so neither the position of a valid code nor the number still unspent
 * leaks through timing.
 */
export function consumeRecoveryCode(
  codes: readonly StoredRecoveryCode[],
  candidate: string,
): RecoveryAttempt {
  const digest = hashRecoveryCode(candidate);
  let matchedIndex = -1;

  for (let i = 0; i < codes.length; i++) {
    const entry = codes[i]!;
    const hit = entry.u === null && timingSafeEqual(entry.h, digest);
    if (hit && matchedIndex === -1) matchedIndex = i;
  }

  if (matchedIndex === -1) {
    return { matched: false, next: [...codes], remaining: codes.filter((c) => c.u === null).length };
  }

  const next = codes.map((entry, index) =>
    index === matchedIndex ? { ...entry, u: new Date().toISOString() } : { ...entry },
  );

  return { matched: true, next, remaining: next.filter((entry) => entry.u === null).length };
}
