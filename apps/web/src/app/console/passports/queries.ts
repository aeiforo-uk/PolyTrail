import 'server-only';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
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

/**
 * Reads for the passports module.
 *
 * Same rule as `src/app/console/queries.ts`: every function takes `tenantId`
 * first and filters on it. Nothing here writes.
 *
 * The catalogue needs facts that live inside the payload — how far the supply
 * chain is mapped, how many required fields are still blank — and those cannot
 * be answered from the `passports` row alone. So the current version is joined
 * once and scored in one pass, rather than the list page fetching a payload per
 * row after it has already rendered.
 */

export interface CatalogueRow {
  id: string;
  dppId: string;
  productName: string;
  category: string | null;
  styleNumber: string | null;
  sku: string | null;
  gtin: string | null;
  colourName: string | null;
  size: string | null;
  scope: string;
  status: string;
  completeness: number;
  version: number;
  publishedVersion: number | null;
  updatedAt: Date;
  createdAt: Date;
  /** Required fields the publication gate would still refuse. */
  missingRequired: number;
  /** The first product image, for the row thumbnail. */
  imageUrl: string | null;
  imageAlt: string | null;
  /** `tier_1` … `full`, or null where the chain has not been mapped at all. */
  traceabilityDepth: string | null;
  supplyChainSteps: number;
  fibreCount: number;
}

const ownedByTenant = (tenantId: string) =>
  and(
    // Ownership, not authorship — matches `listPassports` in the console
    // queries, so a transferred passport appears in exactly one workspace.
    or(
      eq(passports.ownerTenantId, tenantId),
      and(isNull(passports.ownerTenantId), eq(passports.tenantId, tenantId)),
    ),
    isNull(passports.deletedAt),
  );

export async function listCatalogue(tenantId: string): Promise<CatalogueRow[]> {
  const rows = await db
    .select({
      id: passports.id,
      dppId: passports.dppId,
      productName: products.name,
      category: products.category,
      styleNumber: products.styleNumber,
      sku: passports.sku,
      gtin: passports.gtin,
      colourName: passports.colourName,
      size: passports.size,
      scope: passports.scope,
      status: passports.status,
      completeness: passports.completeness,
      version: passports.currentVersion,
      publishedVersion: passports.publishedVersion,
      updatedAt: passports.updatedAt,
      createdAt: passports.createdAt,
      payload: passportVersions.payload,
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
    .where(ownedByTenant(tenantId))
    .orderBy(desc(passports.updatedAt));

  return rows.map((row) => {
    const payload = (row.payload ?? {}) as Partial<PassportPayload>;
    const scored = scoreCompleteness(payload);
    return {
      id: row.id,
      dppId: row.dppId,
      productName: row.productName ?? 'Untitled product',
      category: row.category,
      styleNumber: row.styleNumber,
      sku: row.sku,
      gtin: row.gtin,
      colourName: row.colourName,
      size: row.size,
      scope: row.scope as string,
      status: row.status as string,
      // The live registry score, not `passports.completeness`. That column is a
      // denormalised cache written on save, so it goes stale the moment a field
      // is added to the registry — and it was showing 84 on a record the record
      // page scored at 26. Two screens disagreeing about the same passport is
      // worse than a slightly more expensive query.
      completeness: scored.score,
      version: row.version,
      publishedVersion: row.publishedVersion,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      missingRequired: scored.missingRequired.length,
      imageUrl: payload.identity?.images?.[0]?.url ?? null,
      imageAlt: payload.identity?.images?.[0]?.alt ?? null,
      traceabilityDepth: payload.supplyChain?.traceabilityDepth ?? null,
      supplyChainSteps: payload.supplyChain?.steps?.length ?? 0,
      fibreCount: payload.composition?.overall?.length ?? 0,
    };
  });
}

/**
 * Passports published per week for the last eight weeks.
 *
 * Built from a generated series so a quiet week shows as a zero rather than
 * disappearing — a trend line that drops empty periods flatters the shape of
 * the work. Mirrors `getWeeklyActivity`, but on publication rather than
 * creation, because those are different questions.
 */
export async function getWeeklyPublications(tenantId: string): Promise<number[]> {
  const rows = await db.execute(sql`
    with weeks as (
      select generate_series(
        date_trunc('week', now()) - interval '7 weeks',
        date_trunc('week', now()),
        interval '1 week'
      ) as week_start
    )
    select w.week_start, count(p.id)::int as published
    from weeks w
    left join passports p
      on date_trunc('week', p.published_at) = w.week_start
     and p.tenant_id = ${tenantId}
     and p.deleted_at is null
    group by w.week_start
    order by w.week_start
  `);
  return (rows.rows as Array<{ published: number }>).map((r) => Number(r.published));
}

export interface VersionEntry {
  version: number;
  dataHash: string;
  credentialHash: string | null;
  changeReason: string | null;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
}

export interface StatusEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  createdAt: Date;
  actorName: string | null;
}

/**
 * The passport's own history: what changed, and what it was allowed to become.
 *
 * Versions and status transitions are two different records on purpose — a
 * save is a claim about content, a transition is a claim about fitness — so
 * they are read separately and shown on separate tabs rather than interleaved
 * into one stream that answers neither question.
 */
export async function getPassportHistory(
  tenantId: string,
  dppId: string,
): Promise<{ versions: VersionEntry[]; statusHistory: StatusEntry[] } | null> {
  const [row] = await db
    .select({ id: passports.id })
    .from(passports)
    .where(and(eq(passports.dppId, dppId), ownedByTenant(tenantId)))
    .limit(1);

  if (!row) return null;

  const [versions, statusHistory] = await Promise.all([
    db
      .select({
        version: passportVersions.version,
        dataHash: passportVersions.dataHash,
        credentialHash: passportVersions.credentialHash,
        changeReason: passportVersions.changeReason,
        createdAt: passportVersions.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(passportVersions)
      .leftJoin(users, eq(users.id, passportVersions.createdBy))
      .where(eq(passportVersions.passportId, row.id))
      .orderBy(desc(passportVersions.version)),
    db
      .select({
        id: passportStatusHistory.id,
        fromStatus: passportStatusHistory.fromStatus,
        toStatus: passportStatusHistory.toStatus,
        reason: passportStatusHistory.reason,
        createdAt: passportStatusHistory.createdAt,
        actorName: users.name,
      })
      .from(passportStatusHistory)
      .leftJoin(users, eq(users.id, passportStatusHistory.actorId))
      .where(eq(passportStatusHistory.passportId, row.id))
      .orderBy(desc(passportStatusHistory.createdAt), asc(passportStatusHistory.id)),
  ]);

  return {
    versions,
    statusHistory: statusHistory.map((s) => ({
      id: s.id,
      fromStatus: (s.fromStatus as string | null) ?? null,
      toStatus: s.toStatus as string,
      reason: s.reason,
      createdAt: s.createdAt,
      actorName: s.actorName,
    })),
  };
}
