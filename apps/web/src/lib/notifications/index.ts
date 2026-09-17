import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { notifications, users } from '@/lib/db/schema';
import type { Role } from '@/lib/auth/roles';

/**
 * In-app notifications.
 *
 * Addressed by role rather than by user wherever possible: "a passport is
 * waiting for review" belongs to whoever holds the compliance role today, not
 * to the individual who happened to hold it when the rule was written.
 */

export type Severity = 'info' | 'success' | 'warning' | 'critical';

export interface NotifyInput {
  tenantId: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
  severity?: Severity;
}

export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  await db.insert(notifications).values({
    tenantId: input.tenantId,
    userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    severity: input.severity ?? 'info',
  });
}

export async function notifyRoles(roles: readonly Role[], input: NotifyInput): Promise<number> {
  const recipients = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(
      and(eq(users.tenantId, input.tenantId), eq(users.status, 'active'), isNull(users.deletedAt)),
    );

  const targets = recipients.filter((r) => roles.includes(r.role as Role));
  if (targets.length === 0) return 0;

  await db.insert(notifications).values(
    targets.map((target) => ({
      tenantId: input.tenantId,
      userId: target.id,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      severity: input.severity ?? 'info',
    })),
  );
  return targets.length;
}

export async function listNotifications(userId: string, limit = 30) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markRead(userId: string, id: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
