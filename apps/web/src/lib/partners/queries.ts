import 'server-only';
import { and, asc, count, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  credentials,
  dataRequests,
  partners,
  passportPartners,
  passports,
  products,
  type PostalAddress,
} from '@/lib/db/schema';
import type { PartnerRole, SupplyTier } from './vocab';

/**
 * Reads for the supplier module.
 *
 * Every function takes `tenantId` first and filters on it. In a shared-schema
 * database that predicate is the whole of tenant isolation, so it is not
 * optional and not something a caller may pass through from a URL.
 */

/** Statuses that still need something from somebody. */
export const OPEN_REQUEST_STATUSES = ['sent', 'in_progress', 'submitted', 'under_review'] as const;

export interface PartnerRow {
  id: string;
  name: string;
  legalName: string | null;
  tier: SupplyTier;
  roles: PartnerRole[];
  country: string;
  gln: string | null;
  osId: string | null;
  contactEmail: string | null;
  certificationCount: number;
  openRequestCount: number;
  passportCount: number;
  lastResponseAt: Date | null;
}

export interface PartnerFilters {
  tier?: SupplyTier | null;
  country?: string | null;
}

export async function listPartners(
  tenantId: string,
  filters: PartnerFilters = {},
): Promise<PartnerRow[]> {
  const where = [eq(partners.tenantId, tenantId), isNull(partners.deletedAt)];
  if (filters.tier) where.push(eq(partners.tier, filters.tier));
  if (filters.country) where.push(eq(partners.country, filters.country));

  const rows = await db
    .select({
      id: partners.id,
      name: partners.name,
      legalName: partners.legalName,
      tier: partners.tier,
      roles: partners.roles,
      country: partners.country,
      gln: partners.gln,
      osId: partners.osId,
      contactEmail: partners.contactEmail,
    })
    .from(partners)
    .where(and(...where))
    .orderBy(asc(partners.tier), asc(partners.name));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Three grouped queries rather than a correlated subquery per column: the
  // planner handles them better, and it keeps the row shape readable.
  const [certs, requests, links] = await Promise.all([
    db
      .select({ partnerId: credentials.partnerId, value: count() })
      .from(credentials)
      .where(
        and(
          eq(credentials.tenantId, tenantId),
          inArray(credentials.partnerId, ids),
          eq(credentials.status, 'active'),
        ),
      )
      .groupBy(credentials.partnerId),
    db
      .select({
        partnerId: dataRequests.partnerId,
        open: sql<number>`count(*) filter (where ${dataRequests.status} in ('sent','in_progress','submitted','under_review'))`.mapWith(
          Number,
        ),
        lastResponseAt: max(dataRequests.submittedAt),
      })
      .from(dataRequests)
      .where(and(eq(dataRequests.tenantId, tenantId), inArray(dataRequests.partnerId, ids)))
      .groupBy(dataRequests.partnerId),
    db
      .select({ partnerId: passportPartners.partnerId, value: count() })
      .from(passportPartners)
      .innerJoin(passports, eq(passports.id, passportPartners.passportId))
      .where(and(eq(passports.tenantId, tenantId), inArray(passportPartners.partnerId, ids)))
      .groupBy(passportPartners.partnerId),
  ]);

  const certBy = new Map(certs.map((c) => [c.partnerId, c.value]));
  const reqBy = new Map(requests.map((r) => [r.partnerId, r]));
  const linkBy = new Map(links.map((l) => [l.partnerId, l.value]));

  return rows.map((row) => ({
    ...row,
    tier: row.tier as SupplyTier,
    roles: row.roles as PartnerRole[],
    certificationCount: certBy.get(row.id) ?? 0,
    openRequestCount: reqBy.get(row.id)?.open ?? 0,
    passportCount: linkBy.get(row.id) ?? 0,
    lastResponseAt: reqBy.get(row.id)?.lastResponseAt ?? null,
  }));
}

/** Countries actually present in this workspace, for the filter control. */
export async function listPartnerCountries(tenantId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ country: partners.country })
    .from(partners)
    .where(and(eq(partners.tenantId, tenantId), isNull(partners.deletedAt)))
    .orderBy(asc(partners.country));
  return rows.map((r) => r.country);
}

export async function getPartner(tenantId: string, partnerId: string) {
  const [row] = await db
    .select()
    .from(partners)
    .where(
      and(eq(partners.tenantId, tenantId), eq(partners.id, partnerId), isNull(partners.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

export interface PartnerDetail {
  partner: NonNullable<Awaited<ReturnType<typeof getPartner>>>;
  address: PostalAddress | null;
  passports: Array<{
    passportId: string;
    dppId: string;
    productName: string;
    status: string;
    role: string;
    tier: string;
    componentRef: string | null;
    verifiedAt: Date | null;
  }>;
  requests: Array<{
    id: string;
    title: string;
    status: string;
    fieldCount: number;
    dueAt: Date | null;
    sentAt: Date | null;
    submittedAt: Date | null;
  }>;
  certifications: Array<{
    id: string;
    scheme: string;
    credentialType: string;
    licenceNumber: string | null;
    status: string;
    validUntil: Date | null;
  }>;
}

export async function getPartnerDetail(
  tenantId: string,
  partnerId: string,
): Promise<PartnerDetail | null> {
  const partner = await getPartner(tenantId, partnerId);
  if (!partner) return null;

  const [linked, requests, certs] = await Promise.all([
    db
      .select({
        passportId: passports.id,
        dppId: passports.dppId,
        productName: products.name,
        status: passports.status,
        role: passportPartners.role,
        tier: passportPartners.tier,
        componentRef: passportPartners.componentRef,
        verifiedAt: passportPartners.verifiedAt,
      })
      .from(passportPartners)
      .innerJoin(passports, eq(passports.id, passportPartners.passportId))
      .leftJoin(products, eq(products.id, passports.productId))
      // The tenant predicate lives on `passports` because `passport_partners`
      // has no tenant column of its own.
      .where(
        and(
          eq(passportPartners.partnerId, partnerId),
          eq(passports.tenantId, tenantId),
          isNull(passports.deletedAt),
        ),
      )
      .orderBy(asc(passportPartners.sequence)),
    db
      .select({
        id: dataRequests.id,
        title: dataRequests.title,
        status: dataRequests.status,
        requestedFields: dataRequests.requestedFields,
        dueAt: dataRequests.dueAt,
        sentAt: dataRequests.sentAt,
        submittedAt: dataRequests.submittedAt,
      })
      .from(dataRequests)
      .where(and(eq(dataRequests.tenantId, tenantId), eq(dataRequests.partnerId, partnerId)))
      .orderBy(desc(dataRequests.createdAt)),
    db
      .select({
        id: credentials.id,
        scheme: credentials.scheme,
        credentialType: credentials.credentialType,
        licenceNumber: credentials.licenceNumber,
        status: credentials.status,
        validUntil: credentials.validUntil,
      })
      .from(credentials)
      .where(and(eq(credentials.tenantId, tenantId), eq(credentials.partnerId, partnerId)))
      .orderBy(desc(credentials.validUntil)),
  ]);

  return {
    partner,
    address: partner.address ?? null,
    passports: linked.map((row) => ({ ...row, productName: row.productName ?? 'Untitled product' })),
    requests: requests.map(({ requestedFields, ...rest }) => ({
      ...rest,
      fieldCount: requestedFields.length,
    })),
    certifications: certs,
  };
}

/** Partners a data request can be addressed to, smallest possible shape. */
export async function listPartnerOptions(tenantId: string) {
  return db
    .select({
      id: partners.id,
      name: partners.name,
      tier: partners.tier,
      country: partners.country,
      contactEmail: partners.contactEmail,
      contactName: partners.contactName,
      roles: partners.roles,
    })
    .from(partners)
    .where(and(eq(partners.tenantId, tenantId), isNull(partners.deletedAt)))
    .orderBy(asc(partners.tier), asc(partners.name));
}
