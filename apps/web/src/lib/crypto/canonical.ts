import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

/**
 * Deterministic JSON serialisation (RFC 8785 / JCS).
 *
 * Every integrity hash in Polytrail is taken over the JCS form of the payload
 * so that two systems which disagree about key order still agree about the
 * hash. This is what makes a passport hash portable across the issuer, the
 * public resolver, and any third-party verifier.
 */
export function canonicalJson(value: unknown): string {
  const out = canonicalize(value as object);
  if (out === undefined) throw new Error('Value is not JSON-canonicalisable');
  return out;
}

/** SHA-256 over the canonical form, returned as `0x`-prefixed lowercase hex. */
export function canonicalHash(value: unknown): string {
  return '0x' + createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/** SHA-256 over raw bytes (documents, images), `0x`-prefixed hex. */
export function bytesHash(bytes: Uint8Array | Buffer): string {
  return '0x' + createHash('sha256').update(bytes).digest('hex');
}

/** Constant-time string comparison for tokens and hashes. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
