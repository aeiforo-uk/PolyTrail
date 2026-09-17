import 'server-only';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  credentials,
  passportStatusHistory,
  passportVersions,
  passports,
  tenants,
} from '@/lib/db/schema';
import { isValidDppId, normalizeDppId } from '@/lib/passport/identifier';
import { FIELD_REGISTRY } from '@/lib/tier/field-registry';
import { expandWildcards } from '@/lib/tier/project';
import {
  REGULATED_TIER_LABELS,
  TIER_LABELS,
  regulatedTierOf,
  type AccessTier,
  type RegulatedTier,
} from '@/lib/tier/types';

/**
 * Reads for the market-surveillance persona.
 *
 * These queries are deliberately **not** tenant-scoped, which is the only place
 * in this product where that is true. An authority reads across brands by
 * definition — Regulation (EU) 2019/1020 Art. 14 gives market-surveillance
 * authorities the power to require and obtain this data from any operator. The
 * safeguard is not scoping but attribution: every read is written into the
 * brand's own audit chain, so a regulator looking at a brand's data is an event
 * the brand can see.
 */

export interface AuthoritySearchHit {
  dppId: string;
  productName: string;
  brandName: string;
  brandCountry: string;
  gtin: string | null;
  sku: string | null;
  status: string;
  scope: string;
  publishedAt: string | null;
  registryId: string | null;
  tenantId: string;
  /**
   * Which field the query actually hit.
   *
   * A brand-name search returns forty garments that look identical in a table;
   * a GTIN search returns one. Saying which is which is the difference between
   * a result list an inspector can act on and one they have to re-read.
   */
  matchedOn: 'identifier' | 'gtin' | 'brand' | 'sku';
}

function localise(payload: Record<string, unknown> | null): string {
  const identity = payload?.identity;
  if (identity && typeof identity === 'object') {
    const name = (identity as Record<string, unknown>).productName;
    if (name && typeof name === 'object') {
      const en = (name as Record<string, unknown>).en;
      if (typeof en === 'string' && en) return en;
      const first = Object.values(name as Record<string, unknown>).find(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      if (first) return first;
    }
  }
  return 'Untitled passport';
}

/**
 * Look a garment up the three ways an inspector actually holds one: the
 * identifier printed on the label, the barcode on the swing ticket, or the
 * brand name when neither of those is legible any more.
 */
export async function searchPassports(query: string, limit = 50): Promise<AuthoritySearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const normalized = normalizeDppId(trimmed);
  const digits = trimmed.replace(/[\s-]/g, '');

  const conditions = [
    isValidDppId(trimmed) ? eq(passports.dppId, normalized) : undefined,
    /^\d{8,14}$/.test(digits) ? eq(passports.gtin, digits) : undefined,
    ilike(tenants.legalName, `%${trimmed}%`),
    ilike(tenants.tradeName, `%${trimmed}%`),
    ilike(passports.sku, `%${trimmed}%`),
  ].filter((condition) => condition !== undefined);

  const rows = await db
    .select({
      passport: passports,
      tenant: tenants,
      payload: passportVersions.payload,
    })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .leftJoin(
      passportVersions,
      and(
        eq(passportVersions.passportId, passports.id),
        eq(passportVersions.version, passports.currentVersion),
      ),
    )
    .where(and(isNull(passports.deletedAt), or(...conditions)))
    .orderBy(desc(passports.updatedAt))
    .limit(limit);

  const needle = trimmed.toLowerCase();

  return rows.map(({ passport, tenant, payload }) => ({
    dppId: passport.dppId,
    productName: localise(payload),
    brandName: tenant.tradeName ?? tenant.legalName,
    brandCountry: tenant.country,
    gtin: passport.gtin,
    sku: passport.sku,
    status: passport.status,
    scope: passport.scope,
    publishedAt: passport.publishedAt?.toISOString() ?? null,
    registryId: passport.registryId,
    tenantId: passport.tenantId,
    matchedOn:
      passport.dppId === normalized
        ? ('identifier' as const)
        : passport.gtin && passport.gtin === digits
          ? ('gtin' as const)
          : passport.sku && passport.sku.toLowerCase().includes(needle)
            ? ('sku' as const)
            : ('brand' as const),
  }));
}

export interface FieldDisclosure {
  path: string;
  label: string;
  /** The value as the authority sees it — which is everything. */
  value: unknown;
  regulated: RegulatedTier;
  regulatedLabel: string;
  /** Polytrail's finer-grained audiences, named. */
  audiences: string[];
  basis: string;
  /** True when this field is part of the content the JRC proposes to mandate. */
  espr: boolean;
}

export interface EvidenceRecord {
  dppId: string;
  tenantId: string;
  status: string;
  scope: string;
  currentVersion: number;
  publishedVersion: number | null;
  publishedAt: string | null;
  placedOnMarketAt: string | null;
  gtin: string | null;
  serialNumber: string | null;
  batchNumber: string | null;
  registry: { id: string | null; url: string | null; submittedAt: string | null };
  recall: { reason: string | null; severity: string | null; recalledAt: string | null } | null;
  brand: {
    legalName: string;
    tradeName: string | null;
    country: string;
    lei: string | null;
    eoriNumber: string | null;
    gln: string | null;
    vatNumber: string | null;
    did: string | null;
    contactEmail: string | null;
  };
  /** Every field the passport carries, with the tier the public sees it in. */
  disclosure: FieldDisclosure[];
  /** Fields in the payload that no registry entry describes. Deny-by-default hides these. */
  unregistered: string[];
  versions: Array<{
    version: number;
    dataHash: string;
    credentialHash: string | null;
    changeReason: string | null;
    createdAt: string;
  }>;
  transitions: Array<{
    from: string | null;
    to: string;
    reason: string | null;
    at: string;
  }>;
  credentials: Array<{
    scheme: string;
    credentialType: string;
    issuerName: string;
    issuerDid: string | null;
    licenceNumber: string | null;
    status: string;
    documentHash: string;
    validFrom: string | null;
    validUntil: string | null;
    revokedAt: string | null;
    revocationReason: string | null;
  }>;
}

function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((accumulator, key) => {
    if (accumulator == null || typeof accumulator !== 'object') return undefined;
    return (accumulator as Record<string, unknown>)[key];
  }, source);
}

/**
 * Build the field-by-field disclosure table.
 *
 * The point of this view is not that an authority can see everything — that is
 * table stakes. It is that the inspector can see, for each value, what the
 * public can and cannot see, because a passport that looks complete to a
 * regulator and hollow to a consumer is exactly the failure mode the access
 * tiers are supposed to make visible.
 */
export function describeDisclosure(payload: Record<string, unknown>): {
  disclosure: FieldDisclosure[];
  unregistered: string[];
} {
  const disclosure: FieldDisclosure[] = [];
  const covered = new Set<string>();

  for (const entry of FIELD_REGISTRY) {
    const regulated = regulatedTierOf(entry);
    for (const path of expandWildcards(payload, entry.path)) {
      covered.add(path);
      const value = getByPath(payload, path);
      if (value === undefined) continue;
      disclosure.push({
        path,
        label: entry.label,
        value,
        regulated,
        regulatedLabel: REGULATED_TIER_LABELS[regulated],
        audiences: entry.audiences.map((tier: AccessTier) => TIER_LABELS[tier]),
        basis: entry.basis,
        espr: entry.espr === true,
      });
    }
  }

  const unregistered: string[] = [];
  function walk(node: unknown, prefix: string[]): void {
    if (node == null) return;
    if (typeof node !== 'object') {
      const path = prefix.join('.');
      if (!covered.has(path)) unregistered.push(path);
      return;
    }
    const keys = Array.isArray(node)
      ? node.map((_, index) => String(index))
      : Object.keys(node as Record<string, unknown>);
    for (const key of keys) walk((node as Record<string, unknown>)[key], [...prefix, key]);
  }
  walk(payload, []);

  return { disclosure, unregistered };
}

export async function loadEvidenceRecord(rawDppId: string): Promise<EvidenceRecord | null> {
  const dppId = normalizeDppId(rawDppId);

  const [row] = await db
    .select({ passport: passports, tenant: tenants })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .where(and(eq(passports.dppId, dppId), isNull(passports.deletedAt)))
    .limit(1);

  if (!row) return null;
  const { passport, tenant } = row;

  const [versions, transitions, issued] = await Promise.all([
    db
      .select()
      .from(passportVersions)
      .where(eq(passportVersions.passportId, passport.id))
      .orderBy(desc(passportVersions.version)),
    db
      .select()
      .from(passportStatusHistory)
      .where(eq(passportStatusHistory.passportId, passport.id))
      .orderBy(desc(passportStatusHistory.createdAt)),
    db
      .select()
      .from(credentials)
      .where(eq(credentials.passportId, passport.id))
      .orderBy(desc(credentials.createdAt)),
  ]);

  // The version an inspector is looking at is the one on the market, falling
  // back to the working draft when nothing has been published — a draft is
  // still evidence of what a brand intends to place on the market.
  const current =
    versions.find((version) => version.version === passport.publishedVersion) ?? versions[0];

  const { disclosure, unregistered } = current
    ? describeDisclosure(current.payload)
    : { disclosure: [], unregistered: [] };

  return {
    dppId: passport.dppId,
    tenantId: passport.tenantId,
    status: passport.status,
    scope: passport.scope,
    currentVersion: passport.currentVersion,
    publishedVersion: passport.publishedVersion,
    publishedAt: passport.publishedAt?.toISOString() ?? null,
    placedOnMarketAt: passport.placedOnMarketAt?.toISOString() ?? null,
    gtin: passport.gtin,
    serialNumber: passport.serialNumber,
    batchNumber: passport.batchNumber,
    registry: {
      id: passport.registryId,
      url: passport.registryUrl,
      submittedAt: passport.registrySubmittedAt?.toISOString() ?? null,
    },
    recall:
      passport.status === 'recalled'
        ? {
            reason: passport.recallReason,
            severity: passport.recallSeverity,
            recalledAt: passport.recalledAt?.toISOString() ?? null,
          }
        : null,
    brand: {
      legalName: tenant.legalName,
      tradeName: tenant.tradeName,
      country: tenant.country,
      lei: tenant.lei,
      eoriNumber: tenant.eoriNumber,
      gln: tenant.gln,
      vatNumber: tenant.vatNumber,
      did: tenant.did,
      contactEmail: tenant.contactEmail,
    },
    disclosure,
    unregistered,
    versions: versions.map((version) => ({
      version: version.version,
      dataHash: version.dataHash,
      credentialHash: version.credentialHash,
      changeReason: version.changeReason,
      createdAt: version.createdAt.toISOString(),
    })),
    transitions: transitions.map((transition) => ({
      from: transition.fromStatus,
      to: transition.toStatus,
      reason: transition.reason,
      at: transition.createdAt.toISOString(),
    })),
    credentials: issued.map((credential) => ({
      scheme: credential.scheme,
      credentialType: credential.credentialType,
      issuerName: credential.issuerName,
      issuerDid: credential.issuerDid,
      licenceNumber: credential.licenceNumber,
      status: credential.status,
      documentHash: credential.documentHash,
      validFrom: credential.validFrom?.toISOString() ?? null,
      validUntil: credential.validUntil?.toISOString() ?? null,
      revokedAt: credential.revokedAt?.toISOString() ?? null,
      revocationReason: credential.revocationReason,
    })),
  };
}
