import 'server-only';
import { randomToken } from '@/lib/auth/password';
import { bytesHash } from '@/lib/crypto/canonical';

/**
 * Magic-link tokens for the supplier portal.
 *
 * The supplier has no account, so the link *is* the credential. Three rules
 * follow from that:
 *
 *   1. Only `sha256(token)` is stored. A database dump, a leaked backup or a
 *      curious operator gets a hash, not a working link into a brand's data.
 *   2. The token is 32 bytes from `randomBytes`. It is guessable only in the
 *      sense that any 256-bit secret is.
 *   3. It expires. A link that works forever ends up in a forwarded email
 *      thread at a facility that stopped being a supplier two years ago.
 */

/** Days after the deadline that a link keeps working. */
const GRACE_DAYS = 14;

/** Lifetime of a link on a request with no deadline set. */
const DEFAULT_LIFETIME_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssuedToken {
  /** Goes in the link. Never stored, never logged. */
  token: string;
  /** `0x`-prefixed sha256, 66 characters — the width of `access_token_hash`. */
  hash: string;
}

export function issueAccessToken(): IssuedToken {
  const token = randomToken(32);
  return { token, hash: hashAccessToken(token) };
}

export function hashAccessToken(token: string): string {
  return bytesHash(Buffer.from(token, 'utf8'));
}

/**
 * When a link stops working.
 *
 * Derived from the request's own dates rather than stored separately, because
 * `data_requests` has no expiry column and inventing one in the JSONB
 * submission would hide a security-relevant value inside supplier content.
 * A re-send updates `sentAt`, which extends the link — which is exactly what
 * a reminder should do.
 */
export function tokenExpiresAt(request: {
  dueAt: Date | null;
  sentAt: Date | null;
}): Date | null {
  if (request.dueAt) return new Date(request.dueAt.getTime() + GRACE_DAYS * DAY_MS);
  if (request.sentAt) return new Date(request.sentAt.getTime() + DEFAULT_LIFETIME_DAYS * DAY_MS);
  return null;
}

export function isTokenExpired(
  request: { dueAt: Date | null; sentAt: Date | null },
  now = new Date(),
): boolean {
  const expiry = tokenExpiresAt(request);
  return expiry !== null && expiry.getTime() < now.getTime();
}

/** The absolute URL a supplier is sent. */
export function supplierLink(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/s/${token}`;
}
