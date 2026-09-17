import 'server-only';
import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema';
import type { ChainRow } from '@/lib/audit';

/**
 * Reading the audit chain.
 *
 * Two shapes, deliberately kept apart: the filtered, paged view a person
 * browses, and the complete, ordered chain that verification needs. The second
 * must never be filtered — a chain read with a `where` clause in it always
 * verifies, and would verify a lie.
 */

export const PAGE_SIZE = 50;

export interface AuditFilters {
  action?: string;
  /** Inclusive, `YYYY-MM-DD` as typed into a date input. */
  from?: string;
  to?: string;
  page?: number;
}

export interface AuditRow {
  id: string;
  sequence: number;
  recordedAt: string;
  actorLabel: string;
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  ip: string | null;
  userAgent: string | null;
  entryHash: string;
  previousHash: string;
  metadata: Record<string, unknown> | null;
}

function predicates(tenantId: string, filters: AuditFilters): SQL[] {
  const where: SQL[] = [eq(auditEvents.tenantId, tenantId)];
  if (filters.action) where.push(eq(auditEvents.action, filters.action));
  if (filters.from) where.push(gte(auditEvents.recordedAt, `${filters.from}T00:00:00.000Z`));
  // The `to` bound is a whole day, not a midnight instant — otherwise filtering
  // "to today" silently hides everything that happened today.
  if (filters.to) where.push(lte(auditEvents.recordedAt, `${filters.to}T23:59:59.999Z`));
  return where;
}

export async function listAuditEvents(
  tenantId: string,
  filters: AuditFilters = {},
): Promise<{ rows: AuditRow[]; total: number; page: number; pages: number }> {
  const where = predicates(tenantId, filters);
  const page = Math.max(1, filters.page ?? 1);

  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .where(and(...where))
      .orderBy(desc(auditEvents.sequence))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(auditEvents)
      .where(and(...where)),
  ]);

  const total = totals?.value ?? 0;
  return {
    rows: rows as AuditRow[],
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getAuditEvent(tenantId: string, id: string): Promise<AuditRow | null> {
  const [row] = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.id, id)))
    .limit(1);
  return (row as AuditRow | undefined) ?? null;
}

/**
 * The whole chain for one tenant, oldest first.
 *
 * No filters and no limit on purpose: `verifyAuditChain` starts from the
 * genesis hash and follows every link, so a partial read would report a break
 * at entry zero. Tenant chains are one row per meaningful action, which stays
 * well inside what a single query can carry.
 */
export async function readFullChain(tenantId: string): Promise<ChainRow[]> {
  const rows = await db
    .select({
      previousHash: auditEvents.previousHash,
      entryHash: auditEvents.entryHash,
      recordedAt: auditEvents.recordedAt,
      tenantId: auditEvents.tenantId,
      actorId: auditEvents.actorId,
      // Part of the hashed material: the chain covers who the log says did it,
      // not just their id.
      actorLabel: auditEvents.actorLabel,
      action: auditEvents.action,
      subjectType: auditEvents.subjectType,
      subjectId: auditEvents.subjectId,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId))
    .orderBy(asc(auditEvents.sequence));

  return rows;
}

/** Rows matching the current filters, oldest first, for the CSV export. */
export async function readForExport(
  tenantId: string,
  filters: AuditFilters = {},
): Promise<AuditRow[]> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...predicates(tenantId, filters)))
    .orderBy(asc(auditEvents.sequence));
  return rows as AuditRow[];
}

/** Total entries in the chain, ignoring filters — what verification will actually cover. */
export async function countChain(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId));
  return row?.value ?? 0;
}

/** Distinct actions this tenant has actually recorded, so the filter offers only real options. */
export async function usedActions(tenantId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ action: auditEvents.action })
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId))
    .orderBy(asc(auditEvents.action));
  return rows.map((row) => row.action);
}

export interface VolumePoint {
  /** `YYYY-MM-DD`, the start of the bucket. */
  day: string;
  count: number;
}

/**
 * Entries per day for the last `days` days, zero-filled.
 *
 * Zero-filling matters: a gap in a log is information — a week where nobody
 * touched a passport looks very different from a week that is simply missing
 * from the chart — and a query that returns only the days with rows draws the
 * quiet weeks as if they never happened.
 */
export async function eventVolume(
  tenantId: string,
  days = 28,
  filters: AuditFilters = {},
): Promise<VolumePoint[]> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const where = predicates(tenantId, filters);
  where.push(gte(auditEvents.recordedAt, since.toISOString()));

  const rows = await db
    .select({
      // Bucketed in UTC so the keys line up with the zero-filled range below,
      // whatever timezone the database session happens to be in.
      day: sql<string>`to_char(date_trunc('day', ${auditEvents.recordedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(auditEvents)
    .where(and(...where))
    .groupBy(sql`date_trunc('day', ${auditEvents.recordedAt} at time zone 'UTC')`);

  const byDay = new Map(rows.map((row) => [row.day, Number(row.value)]));
  const out: VolumePoint[] = [];
  for (let index = 0; index < days; index += 1) {
    const day = new Date(since);
    day.setUTCDate(since.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    out.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}

export interface ActionCount {
  action: string;
  count: number;
}

/** How the log breaks down by action, most frequent first. Honours the filters. */
export async function actionBreakdown(
  tenantId: string,
  filters: AuditFilters = {},
): Promise<ActionCount[]> {
  const rows = await db
    .select({ action: auditEvents.action, value: count() })
    .from(auditEvents)
    .where(and(...predicates(tenantId, filters)))
    .groupBy(auditEvents.action);

  return rows
    .map((row) => ({ action: row.action, count: Number(row.value) }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
}

/** The first and last entry in the chain, so the page can say what it covers. */
export async function chainSpan(
  tenantId: string,
): Promise<{ first: string | null; last: string | null }> {
  const [row] = await db
    .select({
      first: sql<string | null>`min(${auditEvents.recordedAt})`,
      last: sql<string | null>`max(${auditEvents.recordedAt})`,
    })
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId));
  return { first: row?.first ?? null, last: row?.last ?? null };
}
