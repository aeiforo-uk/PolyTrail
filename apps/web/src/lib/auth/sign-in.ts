'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { verifyForUser } from '@/lib/mfa/service';
import { clearPendingMfa, readPendingMfa, setPendingMfa } from './pending-mfa';
import { users, tenants } from '@/lib/db/schema';
import { verifyPassword } from './password';
import { clearSessionCookie, setSessionCookie } from './session';
import { isRole, type Role } from './roles';
import { canEnter, homeFor } from './personas';

const credentials = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

/**
 * Only same-origin console paths are accepted as a post-sign-in destination.
 * Echoing an arbitrary `next` parameter back as a redirect is an open-redirect
 * hole — an attacker sends a victim to a genuine sign-in page that bounces them
 * to a hostile one afterwards.
 */
function safeDestination(value: FormDataEntryValue | null, role: Role): string {
  const fallback = homeFor(role);
  const raw = typeof value === 'string' ? value : '';
  // A protocol-relative path is an off-site redirect wearing a local path's
  // clothes, so it is rejected before anything else.
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  const path = raw.split('?')[0] ?? raw;
  return canEnter(role, path) ? raw : fallback;
}

export interface SignInState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set once the password is accepted and a second factor is outstanding. */
  mfaRequired?: boolean;
  /** Shown after a recovery code is spent, so the user knows to regenerate. */
  notice?: string;
}

/** How long a locked-out account stays locked, and after how many failures. */
const MAX_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    password: String(formData.get('password') ?? ''),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.')] = issue.message;
    }
    return { fieldErrors };
  }

  const { email, password } = parsed.data;

  const [row] = await db
    .select({ user: users, tenant: tenants })
    .from(users)
    .leftJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  // Always spend the cost of a hash comparison, even when the account does not
  // exist, so that response time does not reveal which emails are registered.
  const stored = row?.user.passwordHash ?? '$scrypt$131072$8$1$notarealsalt$notarealhash';
  const ok = await verifyPassword(password, stored);

  if (!row || !ok) {
    if (row) {
      const attempts = row.user.failedSignInCount + 1;
      await db
        .update(users)
        .set({
          failedSignInCount: attempts,
          lockedUntil:
            attempts >= MAX_ATTEMPTS
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
              : row.user.lockedUntil,
        })
        .where(eq(users.id, row.user.id));
    }
    return { error: 'That email and password do not match an account.' };
  }

  if (row.user.lockedUntil && row.user.lockedUntil > new Date()) {
    return {
      error: `Too many failed attempts. Try again after ${row.user.lockedUntil.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`,
    };
  }

  if (row.user.status !== 'active') {
    return { error: 'This account is not active. Ask an administrator to reactivate it.' };
  }

  if (!isRole(row.user.role)) {
    return { error: 'This account has an unrecognised role. Contact support.' };
  }

  await db
    .update(users)
    .set({ failedSignInCount: 0, lockedUntil: null, lastSignInAt: new Date() })
    .where(eq(users.id, row.user.id));

  // A correct password is not a session when a second factor is enrolled. The
  // real cookie is only written after `completeMfa` succeeds; until then the
  // user holds nothing but a five-minute marker naming who is part-way in.
  if (row.user.mfaEnabledAt) {
    await setPendingMfa(row.user.id);
    return { mfaRequired: true };
  }

  await setSessionCookie({
    userId: row.user.id,
    tenantId: row.user.tenantId,
    role: row.user.role,
    email: row.user.email,
    name: row.user.name,
  });

  redirect(safeDestination(formData.get('next'), row.user.role));
}

/**
 * Second step of sign-in: the authenticator code, or a recovery code.
 *
 * Reads the pending marker rather than trusting a user id from the form, so a
 * caller cannot skip the password by posting somebody else's id straight to
 * this action.
 */
export async function completeMfa(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const userId = await readPendingMfa();
  if (!userId) {
    return { error: 'That took too long. Enter your email and password again.' };
  }

  const code = String(formData.get('code') ?? '').replace(/[\s-]/g, '');
  if (!code) return { mfaRequired: true, fieldErrors: { code: 'Enter the six-digit code.' } };

  let outcome: Awaited<ReturnType<typeof verifyForUser>>;
  try {
    outcome = await verifyForUser(userId, code);
  } catch (error) {
    return { mfaRequired: true, error: (error as Error).message };
  }

  if (!outcome.ok) {
    return { mfaRequired: true, fieldErrors: { code: 'That code is not right. Try again.' } };
  }

  const [row] = await db
    .select({ user: users })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!row || row.user.status !== 'active' || !isRole(row.user.role)) {
    await clearPendingMfa();
    return { error: 'This account is no longer active.' };
  }

  await db
    .update(users)
    .set({ failedSignInCount: 0, lockedUntil: null, lastSignInAt: new Date() })
    .where(eq(users.id, row.user.id));

  await clearPendingMfa();
  await setSessionCookie({
    userId: row.user.id,
    tenantId: row.user.tenantId,
    role: row.user.role,
    email: row.user.email,
    name: row.user.name,
  });

  redirect(safeDestination(formData.get('next'), row.user.role));
}

export async function signOut() {
  await clearSessionCookie();
  await clearPendingMfa();
  redirect('/login');
}
