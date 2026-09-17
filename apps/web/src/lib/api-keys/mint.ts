import { createHash, randomBytes } from 'node:crypto';

/**
 * Minting and fingerprinting of API keys.
 *
 * Split out from the database layer so it can be reasoned about — and tested —
 * without a connection, and so that every place that touches key material goes
 * through the same two functions.
 */

/**
 * Environment marker in the key itself.
 *
 * Secret scanners (GitHub, GitLab, TruffleHog) match on a distinctive literal
 * prefix, so a leaked key is detectable in a public repository. A key that
 * looks like generic base64 is not.
 */
export const KEY_PREFIX = 'pt_live_';

/** 24 random bytes encode to exactly 32 base64url characters, no padding. */
const SECRET_BYTES = 24;

/** What is stored in `api_keys.prefix` and shown in the console. */
export const DISPLAY_PREFIX_LENGTH = 12;

export interface MintedKey {
  /** The full secret. Returned to the caller once and never persisted. */
  key: string;
  /** `pt_live_` plus four characters — enough to recognise, useless to replay. */
  prefix: string;
  /** `0x`-prefixed SHA-256 of the key. This is what goes in the database. */
  keyHash: string;
}

export function mintApiKey(): MintedKey {
  const key = KEY_PREFIX + randomBytes(SECRET_BYTES).toString('base64url');
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), keyHash: fingerprint(key) };
}

/**
 * SHA-256 rather than scrypt, deliberately.
 *
 * A password hash is slow because passwords are low-entropy and guessable. An
 * API key is 192 bits from a CSPRNG, so there is nothing to brute force and
 * the only thing a slow hash would buy is a slow hash on the hot path of every
 * API request.
 */
export function fingerprint(key: string): string {
  return '0x' + createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Shape check before touching the database, so junk never reaches a query. */
export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && /^[A-Za-z0-9_-]{32}$/.test(value.slice(KEY_PREFIX.length));
}
