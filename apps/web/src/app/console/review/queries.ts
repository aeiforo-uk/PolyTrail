import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  passportStatusHistory,
  passportVersions,
  passports,
  products,
  users,
} from '@/lib/db/schema';
import { scoreCompleteness } from '@/lib/passport/completeness';
import type { PassportPayload } from '@/lib/passport/schema';
import type { PassportStatus } from '@/lib/passport/state';

/**
 * The review queue.
 *
 * Every query filters on `tenantId`, without exception — the same rule as
 * `src/app/console/queries.ts`, and for the same reason.
 */

export const QUEUE_TABS = [
  {
    key: 'needs-review',
    status: 'in_review' as PassportStatus,
    label: 'Needs review',
    blurb: 'Submitted by an author and waiting on a decision.',
  },
  {
    key: 'changes-requested',
    status: 'changes_requested' as PassportStatus,
    label: 'Changes requested',
    blurb: 'Sent back to the author. Waiting on them, not on you.',
  },
  {
    key: 'approved',
    status: 'approved' as PassportStatus,
    label: 'Approved',
    blurb: 'Signed off and ready to publish.',
  },
  {
    key: 'published',
    status: 'published' as PassportStatus,
    label: 'Published',
    blurb: 'Live at the public URL.',
  },
] as const;

export type QueueTabKey = (typeof QUEUE_TABS)[number]['key'];

export function tabFor(key: string | undefined): (typeof QUEUE_TABS)[number] {
  return QUEUE_TABS.find((tab) => tab.key === key) ?? QUEUE_TABS[0];
}

export interface QueueRow {
  id: string;
  dppId: string;
  productName: string;
  styleNumber: string | null;
  colourName: string | null;
  size: string | null;
  status: PassportStatus;
  version: number;
  completeness: number;
  submitterName: string | null;
  /** When the passport entered its current status. Null if history is missing. */
  enteredStatusAt: Date | null;
  updatedAt: Date;
  missingRequired: string[];
}

export async function listQueue(tenantId: string, status: PassportStatus): Promise<QueueRow[]> {
  const rows = await db
    .select({
      id: passports.id,
      dppId: passports.dppId,
      productName: products.name,
      styleNumber: products.styleNumber,
      colourName: passports.colourName,
      size: passports.size,
      status: passports.status,
      version: passports.currentVersion,
      completeness: passports.completeness,
      submitterName: users.name,
      payload: passportVersions.payload,
      updatedAt: passports.updatedAt,
      // The last time this passport moved *into* the status it is in now. The
      // passport's own `updatedAt` also changes on a content save, which would
      // make an edited draft look freshly submitted.
      enteredStatusAt: sql<Date | null>`(
        select max(${passportStatusHistory.createdAt})
        from ${passportStatusHistory}
        where ${passportStatusHistory.passportId} = ${passports.id}
          and ${passportStatusHistory.toStatus} = ${passports.status}
      )`,
    })
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .leftJoin(
      passportVersions,
      and(
        eq(passportVersions.passportId, passports.id),
        eq(passportVersions.version, passports.currentVersion),
      ),
    )
    .leftJoin(users, eq(users.id, passportVersions.createdBy))
    .where(
      and(
        eq(passports.tenantId, tenantId),
        eq(passports.status, status),
        isNull(passports.deletedAt),
      ),
    )
    .orderBy(passports.updatedAt);

  return rows.map((row) => {
    const payload = (row.payload ?? {}) as Partial<PassportPayload>;
    return {
      id: row.id,
      dppId: row.dppId,
      productName: row.productName ?? 'Untitled product',
      styleNumber: row.styleNumber,
      colourName: row.colourName,
      size: row.size,
      status: row.status as PassportStatus,
      version: row.version,
      completeness: row.completeness,
      submitterName: row.submitterName,
      enteredStatusAt: row.enteredStatusAt ? new Date(row.enteredStatusAt) : null,
      updatedAt: row.updatedAt,
      missingRequired: scoreCompleteness(payload).missingRequired.map((f) => f.label),
    };
  });
}

/** Counts for the tab bar, in one pass so the header does not cost four queries. */
export async function queueCounts(tenantId: string): Promise<Record<QueueTabKey, number>> {
  const rows = await db
    .select({ status: passports.status, value: sql<number>`count(*)`.mapWith(Number) })
    .from(passports)
    .where(
      and(
        eq(passports.tenantId, tenantId),
        isNull(passports.deletedAt),
        inArray(
          passports.status,
          QUEUE_TABS.map((tab) => tab.status),
        ),
      ),
    )
    .groupBy(passports.status);

  const byStatus = new Map(rows.map((row) => [row.status, row.value]));
  return Object.fromEntries(
    QUEUE_TABS.map((tab) => [tab.key, byStatus.get(tab.status) ?? 0]),
  ) as Record<QueueTabKey, number>;
}

export interface ReviewDetail {
  passport: typeof passports.$inferSelect;
  productName: string;
  /** The version being reviewed. */
  current: { version: number; payload: Record<string, unknown>; dataHash: string; changeReason: string | null; createdAt: Date; authorName: string | null };
  /**
   * What the reviewer is comparing against: the live published version where
   * there is one, otherwise the version immediately before this one.
   */
  baseline:
    | { version: number; payload: Record<string, unknown>; createdAt: Date; kind: 'published' | 'previous' }
    | null;
  history: Array<{
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    actorName: string | null;
    createdAt: Date;
  }>;
}

export async function getReviewDetail(
  tenantId: string,
  dppId: string,
): Promise<ReviewDetail | null> {
  const [row] = await db
    .select({ passport: passports, productName: products.name })
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .where(
      and(eq(passports.tenantId, tenantId), eq(passports.dppId, dppId), isNull(passports.deletedAt)),
    )
    .limit(1);

  if (!row) return null;

  const versions = await db
    .select({
      version: passportVersions.version,
      payload: passportVersions.payload,
      dataHash: passportVersions.dataHash,
      changeReason: passportVersions.changeReason,
      createdAt: passportVersions.createdAt,
      authorName: users.name,
    })
    .from(passportVersions)
    .leftJoin(users, eq(users.id, passportVersions.createdBy))
    .where(eq(passportVersions.passportId, row.passport.id))
    .orderBy(desc(passportVersions.version));

  const current = versions.find((v) => v.version === row.passport.currentVersion) ?? versions[0];
  if (!current) return null;

  const publishedVersion = row.passport.publishedVersion;
  const published =
    publishedVersion != null && publishedVersion !== current.version
      ? versions.find((v) => v.version === publishedVersion)
      : undefined;
  const previous = versions.find((v) => v.version === current.version - 1);
  const chosen = published ?? previous;

  const history = await db
    .select({
      fromStatus: passportStatusHistory.fromStatus,
      toStatus: passportStatusHistory.toStatus,
      reason: passportStatusHistory.reason,
      actorName: users.name,
      createdAt: passportStatusHistory.createdAt,
    })
    .from(passportStatusHistory)
    .leftJoin(users, eq(users.id, passportStatusHistory.actorId))
    .where(eq(passportStatusHistory.passportId, row.passport.id))
    .orderBy(desc(passportStatusHistory.createdAt))
    .limit(20);

  return {
    passport: row.passport,
    productName: row.productName ?? 'Untitled product',
    current: { ...current, payload: current.payload },
    baseline: chosen
      ? {
          version: chosen.version,
          payload: chosen.payload,
          createdAt: chosen.createdAt,
          kind: published ? 'published' : 'previous',
        }
      : null,
    history,
  };
}
