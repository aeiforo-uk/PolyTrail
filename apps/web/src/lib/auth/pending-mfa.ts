import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

/**
 * The half-authenticated state between a correct password and a correct code.
 *
 * Holding it in a signed, short-lived cookie rather than in a server-side
 * session table keeps sign-in stateless, and holding it in a cookie *separate*
 * from the real session means a bug that forgets to complete the second factor
 * cannot accidentally leave someone signed in — there is no session to leak
 * until the code is verified.
 *
 * Five minutes: long enough to open an authenticator app, short enough that a
 * machine left unattended at the code prompt is not an open door.
 */
const COOKIE = 'polytrail_mfa_pending';
const TTL_SECONDS = 5 * 60;
const ISSUER = 'polytrail';
const AUDIENCE = 'polytrail-mfa';

function secret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) throw new Error('AUTH_SECRET must be set to at least 32 characters.');
  return new TextEncoder().encode(raw);
}

export async function setPendingMfa(userId: string): Promise<void> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // `strict` because this cookie is only ever read by a form post from our
    // own sign-in page; it never needs to survive a cross-site navigation.
    sameSite: 'strict',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function readPendingMfa(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE });
    return typeof payload.userId === 'string' ? payload.userId : null;
  } catch {
    return null;
  }
}

export async function clearPendingMfa(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
