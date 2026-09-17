import 'server-only';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import type { Role } from '@/lib/auth/roles';

/**
 * Workspace membership.
 *
 * Every function here takes `tenantId` first and filters on it, for the same
 * reason the console queries do: in a shared-schema database the predicate is
 * the isolation boundary. Removal is a soft delete because `audit_events`,
 * `passport_versions` and `passport_status_history` all point at `users.id` —
 * a hard delete would either cascade away the evidence or leave the audit
 * trail naming a row that no longer exists.
 */

export type MemberStatus = 'invited' | 'active' | 'suspended';

export interface MemberRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: MemberStatus;
  jobTitle: string | null;
  lastSignInAt: Date | null;
  lockedUntil: Date | null;
  mfaEnabledAt: Date | null;
  createdAt: Date;
}

export async function listMembers(tenantId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      jobTitle: users.jobTitle,
      lastSignInAt: users.lastSignInAt,
      lockedUntil: users.lockedUntil,
      mfaEnabledAt: users.mfaEnabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt)))
    .orderBy(asc(users.name));

  return rows as MemberRow[];
}

export async function getMember(tenantId: string, userId: string): Promise<MemberRow | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      jobTitle: users.jobTitle,
      lastSignInAt: users.lastSignInAt,
      lockedUntil: users.lockedUntil,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)))
    .limit(1);

  return (row as MemberRow | undefined) ?? null;
}

/**
 * How many admins would be left if `excludingUserId` stopped being one.
 * Guards against the workspace locking itself out — the one mistake in this
 * screen that support cannot undo from the product.
 */
export async function countOtherActiveAdmins(
  tenantId: string,
  excludingUserId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.role, 'BRAND_ADMIN'),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        ne(users.id, excludingUserId),
      ),
    );
  return row?.value ?? 0;
}

export async function updateMemberRole(tenantId: string, userId: string, role: Role) {
  await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)));
}

export async function updateMemberStatus(
  tenantId: string,
  userId: string,
  status: MemberStatus,
) {
  await db
    .update(users)
    .set({
      status,
      // Reactivating should also clear a lockout, or the person is told their
      // account is active and still cannot sign in.
      ...(status === 'active' ? { failedSignInCount: 0, lockedUntil: null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)));
}

export async function softDeleteMember(tenantId: string, userId: string) {
  await db
    .update(users)
    .set({ deletedAt: new Date(), status: 'suspended', updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)));
}
