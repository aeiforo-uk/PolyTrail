import 'server-only';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { isRole, type Role } from './roles';

import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './constants';

const COOKIE = SESSION_COOKIE_NAME;
const ISSUER = 'polytrail';
const AUDIENCE = 'polytrail-console';
const MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;

export interface Session {
  userId: string;
  tenantId: string | null;
  role: Role;
  email: string;
  name: string;
  /** Present while a platform admin is impersonating, for the audit trail. */
  impersonatedBy?: string;
}

function secret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set to at least 32 characters. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return new TextEncoder().encode(raw);
}

export async function encodeSession(session: Session): Promise<string> {
  return new SignJWT({ ...session } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .setSubject(session.userId)
    .sign(secret());
}

export async function decodeSession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!isRole(payload.role)) return null;
    return {
      userId: String(payload.userId),
      tenantId: payload.tenantId ? String(payload.tenantId) : null,
      role: payload.role,
      email: String(payload.email),
      name: String(payload.name ?? ''),
      ...(payload.impersonatedBy ? { impersonatedBy: String(payload.impersonatedBy) } : {}),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(session: Session): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, await encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Current session, or `null` when signed out. Safe to call from any server context. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export { SESSION_COOKIE_NAME };
