import 'server-only';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  dataRequestPassports,
  dataRequests,
  partners,
  passportVersions,
  passports,
  products,
  users,
} from '@/lib/db/schema';
import { readSubmission, type RequestSubmission } from './submission';

/**
 * Reads for the data-request module. As in `lib/partners/queries.ts`, every
 * function takes `tenantId` first and every query filters on it.
 */

export type RequestStatus =
  | 'draft'
  | 'sent'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

/**
 * Three buckets, because "which of my nine statuses is this" is not a question
 * anybody wants to answer at a glance. The only thing a brand needs to know is
 * whether the ball is with the supplier, with them, or nowhere.
 */
export const STATUS_GROUPS = {
  not_submitted: {
    label: 'Not submitted',
    hint: 'Waiting on the supplier to start.',
    statuses: ['draft', 'sent'] as const,
  },
  in_progress: {
    label: 'In progress',
    hint: 'Being answered, or waiting on your review.',
    statuses: ['in_progress', 'submitted', 'under_review'] as const,
  },
  completed: {
    label: 'Completed',
    hint: 'Approved, rejected, expired or cancelled.',
    statuses: ['approved', 'rejected', 'expired', 'cancelled'] as const,
  },
} as const;

export type StatusGroup = keyof typeof STATUS_GROUPS;

export function isStatusGroup(value: string | undefined): value is StatusGroup {
  return value === 'not_submitted' || value === 'in_progress' || value === 'completed';
}

export function groupOf(status: string): StatusGroup {
  for (const [group, config] of Object.entries(STATUS_GROUPS)) {
    if ((config.statuses as readonly string[]).includes(status)) return group as StatusGroup;
  }
  return 'not_submitted';
}

export interface RequestRow {
  id: string;
  title: string;
  status: RequestStatus;
  partnerId: string | null;
  partnerName: string | null;
  partnerTier: string | null;
  fieldCount: number;
  answeredCount: number;
  passportCount: number;
  dueAt: Date | null;
  sentAt: Date | null;
  submittedAt: Date | null;
  updatedAt: Date;
}

export async function listDataRequests(
  tenantId: string,
  group?: StatusGroup | null,
): Promise<RequestRow[]> {
  const where = [eq(dataRequests.tenantId, tenantId)];
  if (group) {
    where.push(inArray(dataRequests.status, [...STATUS_GROUPS[group].statuses]));
  }

  const rows = await db
    .select({
      id: dataRequests.id,
      title: dataRequests.title,
      status: dataRequests.status,
      partnerId: dataRequests.partnerId,
      partnerName: partners.name,
      partnerTier: partners.tier,
      requestedFields: dataRequests.requestedFields,
      submission: dataRequests.submission,
      dueAt: dataRequests.dueAt,
      sentAt: dataRequests.sentAt,
      submittedAt: dataRequests.submittedAt,
      updatedAt: dataRequests.updatedAt,
      passportCount: sql<number>`(
        select count(*) from ${dataRequestPassports}
        where ${dataRequestPassports.dataRequestId} = ${dataRequests.id}
      )`.mapWith(Number),
    })
    .from(dataRequests)
    .leftJoin(partners, eq(partners.id, dataRequests.partnerId))
    .where(and(...where))
    .orderBy(desc(dataRequests.updatedAt));

  return rows.map((row) => {
    const submission = readSubmission(row.submission);
    const answered = row.requestedFields.filter((path) => hasAnswer(submission, path)).length;
    return {
      id: row.id,
      title: row.title,
      status: row.status as RequestStatus,
      partnerId: row.partnerId,
      partnerName: row.partnerName,
      partnerTier: row.partnerTier,
      fieldCount: row.requestedFields.length,
      answeredCount: answered,
      passportCount: row.passportCount,
      dueAt: row.dueAt,
      sentAt: row.sentAt,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
    };
  });
}

function hasAnswer(submission: RequestSubmission, path: string): boolean {
  const value = submission.values[path];
  if (value === null || value === undefined || value === '') return false;
  return !(Array.isArray(value) && value.length === 0);
}

export type GroupCounts = Record<StatusGroup, number>;

export async function countByGroup(tenantId: string): Promise<GroupCounts> {
  const rows = await db
    .select({ status: dataRequests.status, value: sql<number>`count(*)`.mapWith(Number) })
    .from(dataRequests)
    .where(eq(dataRequests.tenantId, tenantId))
    .groupBy(dataRequests.status);

  const counts: GroupCounts = { not_submitted: 0, in_progress: 0, completed: 0 };
  for (const row of rows) counts[groupOf(row.status)] += row.value;
  return counts;
}

export interface RequestDetail {
  request: typeof dataRequests.$inferSelect;
  submission: RequestSubmission;
  partner: {
    id: string;
    name: string;
    tier: string;
    country: string;
    contactName: string | null;
    contactEmail: string | null;
  } | null;
  passports: Array<{ id: string; dppId: string; productName: string; status: string }>;
  reviewer: { name: string; email: string } | null;
  createdBy: { name: string } | null;
}

export async function getDataRequest(
  tenantId: string,
  requestId: string,
): Promise<RequestDetail | null> {
  const [row] = await db
    .select({
      request: dataRequests,
      partner: {
        id: partners.id,
        name: partners.name,
        tier: partners.tier,
        country: partners.country,
        contactName: partners.contactName,
        contactEmail: partners.contactEmail,
      },
    })
    .from(dataRequests)
    .leftJoin(partners, eq(partners.id, dataRequests.partnerId))
    .where(and(eq(dataRequests.tenantId, tenantId), eq(dataRequests.id, requestId)))
    .limit(1);

  if (!row) return null;

  const linked = await db
    .select({
      id: passports.id,
      dppId: passports.dppId,
      productName: products.name,
      status: passports.status,
    })
    .from(dataRequestPassports)
    .innerJoin(passports, eq(passports.id, dataRequestPassports.passportId))
    .leftJoin(products, eq(products.id, passports.productId))
    .where(
      and(
        eq(dataRequestPassports.dataRequestId, requestId),
        eq(passports.tenantId, tenantId),
        isNull(passports.deletedAt),
      ),
    )
    .orderBy(asc(products.name));

  const actorIds = [row.request.reviewedBy, row.request.createdBy].filter(
    (id): id is string => Boolean(id),
  );
  const actors = actorIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, actorIds)))
    : [];
  const actorBy = new Map(actors.map((a) => [a.id, a]));

  return {
    request: row.request,
    submission: readSubmission(row.request.submission),
    partner: row.partner?.id ? row.partner : null,
    passports: linked.map((p) => ({ ...p, productName: p.productName ?? 'Untitled product' })),
    reviewer: row.request.reviewedBy ? (actorBy.get(row.request.reviewedBy) ?? null) : null,
    createdBy: row.request.createdBy ? (actorBy.get(row.request.createdBy) ?? null) : null,
  };
}

/** Passports a request can be attached to, smallest possible shape. */
export async function listPassportOptions(tenantId: string) {
  return db
    .select({
      id: passports.id,
      dppId: passports.dppId,
      name: products.name,
      status: passports.status,
    })
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .where(and(eq(passports.tenantId, tenantId), isNull(passports.deletedAt)))
    .orderBy(asc(products.name));
}

/**
 * The current payload of a passport, for the merge preview on the review
 * screen. Reading the version row directly rather than going through the
 * passport service keeps this a read with no side effects.
 */
export async function currentPayload(tenantId: string, passportId: string) {
  const [row] = await db
    .select({
      dppId: passports.dppId,
      version: passports.currentVersion,
      status: passports.status,
      payload: passportVersions.payload,
    })
    .from(passports)
    .leftJoin(
      passportVersions,
      and(
        eq(passportVersions.passportId, passports.id),
        eq(passportVersions.version, passports.currentVersion),
      ),
    )
    .where(
      and(
        eq(passports.tenantId, tenantId),
        eq(passports.id, passportId),
        isNull(passports.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}
