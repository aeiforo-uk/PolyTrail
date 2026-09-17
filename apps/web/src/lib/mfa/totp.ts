import { createHmac, randomBytes } from 'node:crypto';
import { timingSafeEqual } from '@/lib/crypto/canonical';

/**
 * Time-based one-time passwords, RFC 6238.
 *
 * Written out rather than pulled in. The whole algorithm is a counter, an HMAC
 * and a truncation — about forty lines — and every authenticator app on the
 * market implements the same RFC, so there is nothing here a dependency would
 * do better. What a dependency would add is a supply-chain surface on the one
 * code path that exists to stop an attacker who already has the password.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6238
 * @see https://www.rfc-editor.org/rfc/rfc4226 — HOTP, which TOTP is a counter over
 */

/** RFC 4648 §6. No padding on the way out; padding tolerated on the way in. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  // Left-align the remainder, exactly as the RFC's encoding table requires.
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return out;
}

export function base32Decode(input: string): Buffer {
  // Authenticator apps show the secret in groups of four, and people paste it
  // back with the spaces and sometimes in lower case.
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');

  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`“${char}” is not a base32 character.`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface TotpOptions {
  /** Seconds per step. Every authenticator app in practice uses 30. */
  period?: number;
  digits?: number;
  algorithm?: TotpAlgorithm;
  /** Unix seconds. Injected by tests; defaults to now. */
  now?: number;
  /** RFC 6238 T0. Zero everywhere outside the spec's own examples. */
  epoch?: number;
}

const DEFAULTS = { period: 30, digits: 6, algorithm: 'SHA1' as TotpAlgorithm, epoch: 0 };

/** HOTP (RFC 4226): HMAC the counter, then dynamically truncate. */
export function hotp(
  secret: Buffer,
  counter: number,
  digits = DEFAULTS.digits,
  algorithm: TotpAlgorithm = DEFAULTS.algorithm,
): string {
  const buffer = Buffer.alloc(8);
  // The counter is a 64-bit big-endian integer. Writing it as a BigInt avoids
  // the silent truncation that a 32-bit write produces in the year 2242 — and,
  // more usefully, in any test that uses the RFC's large T values.
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(algorithm.toLowerCase(), secret).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function counterFor(options: TotpOptions = {}): number {
  const period = options.period ?? DEFAULTS.period;
  const epoch = options.epoch ?? DEFAULTS.epoch;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  return Math.floor((now - epoch) / period);
}

export function totp(secret: Buffer, options: TotpOptions = {}): string {
  return hotp(
    secret,
    counterFor(options),
    options.digits ?? DEFAULTS.digits,
    options.algorithm ?? DEFAULTS.algorithm,
  );
}

export interface VerifyOptions extends TotpOptions {
  /**
   * Steps either side of now that are accepted. One step — 30 seconds back and
   * forward — absorbs the clock drift a phone actually has without widening the
   * window an attacker gets to guess in.
   */
  window?: number;
}

export interface TotpVerification {
  valid: boolean;
  /** Which step matched: 0 for the current one, -1 for the previous. */
  offset: number | null;
}

export function verifyTotp(
  secret: Buffer,
  code: string,
  options: VerifyOptions = {},
): TotpVerification {
  const digits = options.digits ?? DEFAULTS.digits;
  const candidate = code.replace(/[\s-]/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(candidate)) return { valid: false, offset: null };

  const window = options.window ?? 1;
  const base = counterFor(options);
  const algorithm = options.algorithm ?? DEFAULTS.algorithm;

  for (let offset = -window; offset <= window; offset++) {
    const expected = hotp(secret, base + offset, digits, algorithm);
    // Constant-time so the loop cannot be used to learn how close a guess was.
    if (timingSafeEqual(expected, candidate)) return { valid: true, offset };
  }

  return { valid: false, offset: null };
}

/** 160 bits, which is the HMAC-SHA1 block size and what every app expects. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export interface OtpAuthParams {
  secret: string;
  /** Shown in the app's list — the person's email or username. */
  account: string;
  issuer: string;
  digits?: number;
  period?: number;
  algorithm?: TotpAlgorithm;
}

/**
 * The `otpauth://` URI an authenticator app reads from a QR code.
 *
 * The issuer appears twice — once as a label prefix, once as a parameter —
 * because older apps read only the prefix and newer ones only the parameter,
 * and an entry that says nothing about which account it belongs to is how
 * people end up deleting the wrong one.
 */
export function buildOtpAuthUri(params: OtpAuthParams): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: params.algorithm ?? DEFAULTS.algorithm,
    digits: String(params.digits ?? DEFAULTS.digits),
    period: String(params.period ?? DEFAULTS.period),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
