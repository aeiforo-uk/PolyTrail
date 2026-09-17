import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenants, users } from '@/lib/db/schema';
import type { Session } from './session';

/**
 * Confirm the session still describes something that exists.
 *
 * A signed JWT proves the session was issued by us; it does not prove the user
 * still has an account or the workspace still exists. Those can disappear
 * while a cookie is live — a member is removed, a workspace is closed, or a
 * database is restored from a point before the account was created.
 *
 * Without this check the session survives its subject and every page that
 * resolves a workspace throws a 404 from somewhere deep in a query, which
 * reads to the operator as "half the product is broken" rather than "you need
 * to sign in again".
 */
export interface SessionCheck {
  ok: boolean;
  /** Why the session was rejected, for the sign-in page to explain. */
  reason?: 'user_gone' | 'user_inactive' | 'workspace_gone' | 'workspace_closed';
}

export async function verifySession(session: Session): Promise<SessionCheck> {
  const [user] = await db
    .select({ id: users.id, status: users.status, tenantId: users.tenantId })
    .from(users)
    .where(and(eq(users.id, session.userId), isNull(users.deletedAt)))
    .limit(1);

  if (!user) return { ok: false, reason: 'user_gone' };
  if (user.status !== 'active') return { ok: false, reason: 'user_inactive' };

  // A platform admin has no workspace of their own, so there is nothing to
  // check beyond the account itself.
  if (!session.tenantId) return { ok: true };

  const [tenant] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(and(eq(tenants.id, session.tenantId), isNull(tenants.deletedAt)))
    .limit(1);

  if (!tenant) return { ok: false, reason: 'workspace_gone' };
  if (tenant.status === 'closed') return { ok: false, reason: 'workspace_closed' };

  return { ok: true };
}

export const SESSION_REJECTION_MESSAGE: Record<
  NonNullable<SessionCheck['reason']>,
  string
> = {
  user_gone: 'That account no longer exists. Sign in again.',
  user_inactive: 'That account has been suspended. Ask an administrator to reactivate it.',
  workspace_gone: 'That workspace no longer exists. Sign in again.',
  workspace_closed: 'That workspace has been closed.',
};

/**
 * Where to send a reader whose session no longer describes anything.
 *
 * Pure — it does not touch cookies, because a layout may not. The route it
 * points at clears them on the response and then forwards to sign-in.
 */
export function rejectSession(reason: NonNullable<SessionCheck['reason']>): string {
  return `/api/auth/expired?reason=${reason}`;
}
