import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { ApiError } from '@/lib/api/errors';

/**
 * Re-prompting for a second factor before something irreversible.
 *
 * Signing in once and then holding a session for days is the right trade for
 * reading a passport and the wrong one for withdrawing a registration. Step-up
 * closes that gap: a user with MFA enabled proves possession again, and the
 * proof is good for ten minutes so a sequence of related actions does not turn
 * into a sequence of prompts.
 *
 * The proof is a short-lived signed cookie rather than a database row, because
 * it is a statement about *this browser in this moment* and should disappear
 * with the tab rather than linger as state somebody has to clean up.
 */

const COOKIE = 'pt_step_up';
const ISSUER = 'polytrail';
const AUDIENCE = 'polytrail-step-up';

/** Long enough to finish a task, short enough that a walked-away-from laptop is not one. */
export const STEP_UP_TTL_SECONDS = 600;

function secret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) throw new Error('AUTH_SECRET must be set to at least 32 characters.');
  return new TextEncoder().encode(raw);
}

/** Issued only after a code has actually been checked. */
export async function grantStepUp(userId: string): Promise<void> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setExpirationTime(`${STEP_UP_TTL_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Strict, not lax: a step-up proof should never ride along on a
    // cross-site navigation, which is exactly the shape of a CSRF attempt
    // against a destructive action.
    sameSite: 'strict',
    path: '/',
    maxAge: STEP_UP_TTL_SECONDS,
  });
}

export async function hasStepUp(userId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE });
    // Bound to the subject, so a proof cannot survive a switch of account in
    // the same browser.
    return payload.sub === userId;
  } catch {
    return false;
  }
}

export async function clearStepUp(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export class StepUpRequiredError extends ApiError {
  constructor(action: string) {
    super(403, 'Confirm it is you', {
      detail: `${action} needs your authenticator code. Enter the current code to continue.`,
      type: 'https://polytrail.eu/problems/step-up-required',
    });
    this.name = 'StepUpRequiredError';
  }
}
