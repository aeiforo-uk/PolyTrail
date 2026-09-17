import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { credentials } from '@/lib/db/schema';
import { canonicalHash } from '@/lib/crypto/canonical';
import {
  providerFor,
  type VerificationCheck,
  type VerificationVerdict,
} from './integrity';
import { resolvePlatformKey } from './keys';
import './providers/w3c-vc-jose';
import './providers/declared';

/**
 * Verify a credential envelope.
 *
 * Three checks, in the order that matters: does the signature hold, is the
 * credential inside its validity window, and has the issuer since revoked it.
 * A credential can pass the first two and still be worthless, which is why
 * revocation is checked here — at the platform that issued it — rather than
 * left to the provider, which has no way to know.
 *
 * Every failure carries a reason a person can act on. "Invalid signature" and
 * "expired last Tuesday" are different problems with different fixes, and a
 * verifier that returns `false` for both is telling the holder nothing.
 */
export async function verifyCredential(
  document: Record<string, unknown>,
): Promise<VerificationVerdict> {
  const provider = providerFor(document);

  if (!provider) {
    return {
      valid: false,
      mechanism: 'w3c-vc-2.0',
      reason:
        'This document does not match any integrity mechanism Polytrail recognises. EN 18246 permits W3C Verifiable Credentials 2.0, eIDAS electronic attestations, ISO 22376 visible digital seals and ISO/IEC 20248 digital signatures.',
      issuer: null,
      subject: null,
      checks: [{ name: 'mechanism-recognised', passed: false }],
    };
  }

  const verdict = await provider.verify(document, resolvePlatformKey);
  if (!verdict.valid) return verdict;

  const revocation = await revocationState(document);
  verdict.checks.push(revocation.check);
  if (!revocation.ok) {
    return { ...verdict, valid: false, reason: revocation.reason };
  }

  return verdict;
}

/**
 * Revocation, looked up by the hash of the envelope.
 *
 * The hash is the only identifier guaranteed to be present and unforgeable —
 * a credential's own `id` is chosen by the issuer and could collide, and the
 * hash is what the `credentials` table already indexes the document by.
 */
async function revocationState(
  document: Record<string, unknown>,
): Promise<{ ok: boolean; reason: string; check: VerificationCheck }> {
  const hash = canonicalHash(document);

  const [row] = await db
    .select({
      status: credentials.status,
      revokedAt: credentials.revokedAt,
      revocationReason: credentials.revocationReason,
    })
    .from(credentials)
    .where(eq(credentials.documentHash, hash))
    .limit(1);

  if (!row) {
    // Verified against a key this platform holds, but the envelope is not in
    // its records — which is what a credential re-serialised with different
    // key ordering looks like. Worth saying so rather than silently passing.
    return {
      ok: true,
      reason: '',
      check: {
        name: 'revocation',
        passed: true,
        detail: 'Not found in this platform’s register; revocation could not be checked.',
      },
    };
  }

  if (row.status === 'revoked' || row.revokedAt) {
    const when = row.revokedAt?.toISOString() ?? 'an unrecorded date';
    return {
      ok: false,
      reason: `The issuer revoked this credential on ${when}${row.revocationReason ? `: ${row.revocationReason}` : '.'}`,
      check: { name: 'revocation', passed: false, detail: row.revocationReason ?? undefined },
    };
  }

  if (row.status === 'superseded') {
    return {
      ok: false,
      reason:
        'A newer credential has been issued for this passport version. This one is superseded and should not be relied on.',
      check: { name: 'revocation', passed: false, detail: 'superseded' },
    };
  }

  return { ok: true, reason: '', check: { name: 'revocation', passed: true, detail: row.status } };
}

/** Revoke a credential the workspace issued. */
export async function revokeCredential(
  tenantId: string,
  credentialId: string,
  reason: string,
): Promise<boolean> {
  const rows = await db
    .update(credentials)
    .set({ status: 'revoked', revokedAt: new Date(), revocationReason: reason })
    .where(and(eq(credentials.id, credentialId), eq(credentials.tenantId, tenantId)))
    .returning({ id: credentials.id });

  return rows.length > 0;
}
