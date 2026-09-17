import 'server-only';
import { and, count, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditEvents, partners, passportVersions, passports, products, tenants, users } from '@/lib/db/schema';
import { scoreCompleteness } from '@/lib/passport/completeness';
import type { PassportPayload } from '@/lib/passport/schema';

/**
 * Every query here takes `tenantId` as its first argument and filters on it.
 * That is the only defence against cross-tenant reads in a shared-schema
 * database, so it is a convention worth keeping absolutely rigid: a query in
 * this file without a tenant predicate is a bug, not a shortcut.
 */

export async function getWorkspace(tenantId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return tenant ?? null;
}

export interface PassportRow {
  id: string;
  dppId: string;
  productName: string;
  styleNumber: string | null;
  sku: string | null;
  colourName: string | null;
  size: string | null;
  status: string;
  completeness: number;
  version: number;
  publishedVersion: number | null;
  updatedAt: Date;
  gtin: string | null;
}

export async function listPassports(tenantId: string): Promise<PassportRow[]> {
  const rows = await db
    .select({
      id: passports.id,
      dppId: passports.dppId,
      productName: products.name,
      styleNumber: products.styleNumber,
      sku: passports.sku,
      colourName: passports.colourName,
      size: passports.size,
      status: passports.status,
      version: passports.currentVersion,
      publishedVersion: passports.publishedVersion,
      updatedAt: passports.updatedAt,
      gtin: passports.gtin,
      payload: passportVersions.payload,
    })
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    // Join the live version so completeness is scored against the registry as
    // it stands now. `passports.completeness` is a cache written on save, and
    // reading it here had the catalogue and the record page reporting 84 and 26
    // for the same passport.
    .leftJoin(
      passportVersions,
      and(
        eq(passportVersions.passportId, passports.id),
        eq(passportVersions.version, passports.currentVersion),
      ),
    )
    // Ownership, not authorship: a passport transferred into this workspace
    // belongs in its list, and one transferred away does not. `ownerTenantId`
    // is null for rows created before transfers existed, hence the coalesce.
    .where(
      and(
        or(
          eq(passports.ownerTenantId, tenantId),
          and(isNull(passports.ownerTenantId), eq(passports.tenantId, tenantId)),
        ),
        isNull(passports.deletedAt),
      ),
    )
    .orderBy(desc(passports.updatedAt));

  return rows.map(({ payload, ...r }) => ({
    ...r,
    productName: r.productName ?? 'Untitled product',
    completeness: scoreCompleteness((payload ?? {}) as Partial<PassportPayload>).score,
  }));
}

export async function getPassportDetail(tenantId: string, dppId: string) {
  const [row] = await db
    .select({ passport: passports, product: products })
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
      dataHash: passportVersions.dataHash,
      changeReason: passportVersions.changeReason,
      createdAt: passportVersions.createdAt,
      payload: passportVersions.payload,
    })
    .from(passportVersions)
    .where(eq(passportVersions.passportId, row.passport.id))
    .orderBy(desc(passportVersions.version));

  const latest = versions[0];
  const payload = (latest?.payload ?? {}) as Partial<PassportPayload>;

  return {
    passport: row.passport,
    product: row.product,
    versions,
    payload,
    completeness: scoreCompleteness(payload),
  };
}

export interface WorkspaceStats {
  total: number;
  published: number;
  drafts: number;
  inReview: number;
  partners: number;
  teamMembers: number;
  averageCompleteness: number;
}

export async function getStats(tenantId: string): Promise<WorkspaceStats> {
  const scoped = and(eq(passports.tenantId, tenantId), isNull(passports.deletedAt));

  const [[totals], [partnerCount], [teamCount]] = await Promise.all([
    db
      .select({
        total: count(),
        published: sql<number>`count(*) filter (where ${passports.status} = 'published')`.mapWith(
          Number,
        ),
        drafts: sql<number>`count(*) filter (where ${passports.status} = 'draft')`.mapWith(Number),
        inReview: sql<number>`count(*) filter (where ${passports.status} = 'in_review')`.mapWith(
          Number,
        ),
      })
      .from(passports)
      .where(scoped),
    db
      .select({ value: count() })
      .from(partners)
      .where(and(eq(partners.tenantId, tenantId), isNull(partners.deletedAt))),
    db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt))),
  ]);

  // Averaged from the live scores rather than the cached column, so the
  // headline figure and every row beneath it are computed the same way.
  const scored = await listPassports(tenantId);
  const averageCompleteness =
    scored.length === 0
      ? 0
      : Math.round(scored.reduce((sum, p) => sum + p.completeness, 0) / scored.length);

  return {
    total: totals?.total ?? 0,
    published: totals?.published ?? 0,
    drafts: totals?.drafts ?? 0,
    inReview: totals?.inReview ?? 0,
    averageCompleteness,
    partners: partnerCount?.value ?? 0,
    teamMembers: teamCount?.value ?? 0,
  };
}

export async function listPartners(tenantId: string) {
  return db
    .select()
    .from(partners)
    .where(and(eq(partners.tenantId, tenantId), isNull(partners.deletedAt)))
    .orderBy(partners.tier, partners.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Passports created per week for the last eight weeks.
 *
 * Generated from a series rather than from the rows, so a week with no activity
 * appears as a zero instead of vanishing — a trend line that silently omits
 * empty periods misrepresents the shape of the work.
 */
export async function getWeeklyActivity(tenantId: string): Promise<number[]> {
  const rows = await db.execute(sql`
    with weeks as (
      select generate_series(
        date_trunc('week', now()) - interval '7 weeks',
        date_trunc('week', now()),
        interval '1 week'
      ) as week_start
    )
    select w.week_start, count(p.id)::int as created
    from weeks w
    left join passports p
      on date_trunc('week', p.created_at) = w.week_start
     and p.tenant_id = ${tenantId}
     and p.deleted_at is null
    group by w.week_start
    order by w.week_start
  `);
  return (rows.rows as Array<{ created: number }>).map((r) => Number(r.created));
}

export interface StatusSlice {
  status: string;
  count: number;
}

export async function getStatusBreakdown(tenantId: string): Promise<StatusSlice[]> {
  const rows = await db
    .select({ status: passports.status, count: count() })
    .from(passports)
    .where(and(eq(passports.tenantId, tenantId), isNull(passports.deletedAt)))
    .groupBy(passports.status);
  return rows.map((r) => ({ status: r.status as string, count: Number(r.count) }));
}

/** Where published passports sit on the completeness scale. */
export async function getCompletenessBands(tenantId: string) {
  const rows = await db.execute(sql`
    select
      count(*) filter (where completeness >= 90)::int as strong,
      count(*) filter (where completeness >= 70 and completeness < 90)::int as fair,
      count(*) filter (where completeness >= 50 and completeness < 70)::int as weak,
      count(*) filter (where completeness < 50)::int as poor
    from passports
    where tenant_id = ${tenantId} and deleted_at is null
  `);
  const r = (rows.rows[0] ?? {}) as Record<string, number>;
  return {
    strong: Number(r.strong ?? 0),
    fair: Number(r.fair ?? 0),
    weak: Number(r.weak ?? 0),
    poor: Number(r.poor ?? 0),
  };
}

/**
 * Supply-chain coverage: how far up the chain each passport is actually mapped.
 * Read from the payload because the join table records partners, not steps.
 */
export async function getTraceabilityCoverage(tenantId: string) {
  const rows = await db.execute(sql`
    select
      coalesce(v.payload -> 'supplyChain' ->> 'traceabilityDepth', 'unmapped') as depth,
      count(*)::int as n
    from passports p
    join passport_versions v
      on v.passport_id = p.id and v.version = p.current_version
    where p.tenant_id = ${tenantId} and p.deleted_at is null
    group by 1
  `);
  return (rows.rows as Array<{ depth: string; n: number }>).map((r) => ({
    depth: r.depth,
    count: Number(r.n),
  }));
}

/** The most recent audit entries, for the activity rail. */
export async function getRecentActivity(tenantId: string, limit = 8) {
  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorLabel: auditEvents.actorLabel,
      subjectType: auditEvents.subjectType,
      subjectId: auditEvents.subjectId,
      metadata: auditEvents.metadata,
      recordedAt: auditEvents.recordedAt,
    })
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId))
    .orderBy(desc(auditEvents.sequence))
    .limit(limit);
}
