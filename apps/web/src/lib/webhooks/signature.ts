import { createHmac } from 'node:crypto';
import { timingSafeEqual } from '@/lib/crypto/canonical';
import { DEFAULT_TOLERANCE_SECONDS, SIGNATURE_HEADER } from './constants';

/**
 * Signed webhook deliveries.
 *
 * The signature covers a timestamp as well as the body, so a delivery captured
 * off the wire cannot be replayed against the receiver a week later: the
 * timestamp is inside the MAC, so changing it breaks the signature, and
 * leaving it alone makes the delivery obviously stale. A bare
 * `HMAC(secret, body)` — which is what most webhook implementations ship —
 * authenticates the body and nothing else, and is replayable forever.
 *
 * Header format, one line, same shape Stripe popularised because receivers
 * already have code that parses it:
 *
 *     Polytrail-Signature: t=1750000000,v1=9f86d081884c7d65…
 *
 * ── Verification recipe ────────────────────────────────────────────────────
 *
 *  1. Read the raw request body as a string. Do not parse and re-serialise it
 *     first — JSON round-tripping reorders keys and the signature will fail.
 *  2. Split the header on `,` and read `t` and `v1`.
 *  3. Reject if `t` is more than five minutes from your own clock.
 *  4. Compute `HMAC-SHA256(secret, `${t}.${rawBody}`)` and hex-encode it.
 *  5. Compare with `v1` in constant time.
 *
 * Node:
 *
 *     const [t, v1] = header.split(',').map((p) => p.split('=')[1]);
 *     const expected = crypto
 *       .createHmac('sha256', secret)
 *       .update(`${t}.${rawBody}`)
 *       .digest('hex');
 *     const ok =
 *       Math.abs(Date.now() / 1000 - Number(t)) < 300 &&
 *       crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
 */

export {
  SIGNATURE_HEADER,
  EVENT_HEADER,
  DELIVERY_HEADER,
  DEFAULT_TOLERANCE_SECONDS,
} from './constants';

export function signWebhook(secret: string, body: string, atSeconds?: number): string {
  const t = atSeconds ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

export interface SignatureVerification {
  valid: boolean;
  reason?: string;
}

/**
 * Verify a signature header. Exported so the console's test-send can prove the
 * recipe works against real output rather than against a second implementation
 * of it.
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): SignatureVerification {
  if (!header) return { valid: false, reason: `No ${SIGNATURE_HEADER} header on the request.` };

  const parts = new Map<string, string>();
  for (const segment of header.split(',')) {
    const index = segment.indexOf('=');
    if (index > 0) parts.set(segment.slice(0, index).trim(), segment.slice(index + 1).trim());
  }

  const t = parts.get('t');
  const v1 = parts.get('v1');
  if (!t || !v1) {
    return { valid: false, reason: 'The signature header is missing its `t` or `v1` component.' };
  }

  const timestamp = Number(t);
  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: 'The signature timestamp is not a number.' };
  }

  const drift = Math.abs(Date.now() / 1000 - timestamp);
  if (drift > toleranceSeconds) {
    return {
      valid: false,
      reason: `The delivery is ${Math.round(drift)}s old, beyond the ${toleranceSeconds}s replay window.`,
    };
  }

  const expected = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
  if (!timingSafeEqual(expected, v1)) {
    return { valid: false, reason: 'The signature does not match the body.' };
  }

  return { valid: true };
}
