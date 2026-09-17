import { canonicalHash } from '@/lib/crypto/canonical';
import { buildDigitalLinkUri, validateGtin } from '@/lib/gs1/digital-link';
import { passportUrl } from '@/lib/passport/identifier';
import {
  UPI_MAX_LENGTH,
  type Granularity,
  type IdentifierLinks,
  type IdentifierScheme,
  type OperatorScheme,
  type RegistryRecord,
} from './types';

/**
 * Build the Registry submission envelope from what Polytrail already holds.
 *
 * Pure on purpose. Everything the Registry sees is derived here from three
 * plain objects, so the envelope can be unit-tested, diffed between versions,
 * shown to a brand before it is filed, and — once the QTSP step exists —
 * canonicalised and sealed without a database round-trip.
 */

export interface RegistryPassportInput {
  dppId: string;
  scope: Granularity;
  gtin?: string | null;
  serialNumber?: string | null;
  batchNumber?: string | null;
}

export interface RegistryVersionInput {
  version: number;
  /** SHA-256 over the RFC 8785 canonical form of the payload. */
  dataHash: string;
  payload: Record<string, unknown>;
}

export interface RegistryTenantInput {
  legalName: string;
  tradeName?: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string;
  lei?: string | null;
  eoriNumber?: string | null;
  gln?: string | null;
  did?: string | null;
}

export interface BuildRegistryRecordOptions {
  /** Overrides `NEXT_PUBLIC_RESOLVER_BASE_URL`. */
  resolverBaseUrl?: string;
  /** Overrides the identifier scheme derived from the data. */
  identifierScheme?: IdentifierScheme;
  /** Overrides `REGISTRY_SERVICE_PROVIDER_REF`. */
  serviceProviderReference?: string;
}

/** The DPP service operator named alongside the brand on every filing. */
export function serviceProviderReference(options?: BuildRegistryRecordOptions): string {
  const explicit = options?.serviceProviderReference ?? process.env.REGISTRY_SERVICE_PROVIDER_REF;
  if (explicit) return explicit;
  // Derived rather than hardcoded so a white-label deployment files under its
  // own host instead of quietly filing under ours.
  return `dpp-service:${hostOf(resolverBase(options))}`;
}

function resolverBase(options?: BuildRegistryRecordOptions): string {
  return (
    options?.resolverBaseUrl ??
    process.env.NEXT_PUBLIC_RESOLVER_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

function hostOf(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

/**
 * Pick the operator identifier.
 *
 * LEI first because it is the scheme ESPR registries prefer and the only one
 * of the four that is globally unique, publicly resolvable and independently
 * maintained. EORI is the realistic fallback for a brand that has never had a
 * reason to obtain an LEI; GLN and DID are accepted but ranked last because a
 * GLN identifies a location and a DID identifies a key, neither of which is
 * quite the same thing as a legal person.
 */
export function selectOperatorIdentifier(
  tenant: RegistryTenantInput,
): { identifier: string; scheme: OperatorScheme } | null {
  const lei = tenant.lei?.trim();
  if (lei) return { identifier: lei.toUpperCase(), scheme: 'gleif_lei' };

  const eori = tenant.eoriNumber?.trim();
  if (eori) return { identifier: eori.toUpperCase(), scheme: 'eori' };

  const gln = tenant.gln?.trim();
  if (gln) return { identifier: gln, scheme: 'gs1_gln' };

  const did = tenant.did?.trim();
  if (did) return { identifier: did, scheme: 'w3c_did' };

  return null;
}

/**
 * Identifier granularity is not disclosure granularity.
 *
 * A passport scoped to a model may still carry a serial, because the brand mints
 * item-level identifiers now and populates them by inheritance. The Registry
 * wants the links it can resolve, so all three are offered where the data
 * supports them and the declared scope decides which one is primary.
 */
export function buildIdentifierLinks(
  passport: RegistryPassportInput,
  options?: BuildRegistryRecordOptions,
): IdentifierLinks {
  const fallback = passportUrl(passport.dppId, resolverBase(options));
  const gtin = passport.gtin?.trim();
  if (!gtin || !validateGtin(gtin).valid) {
    // Without a GTIN there is one resolvable address, and it answers at every
    // granularity. Saying so is more useful than omitting the links entirely.
    return { model: fallback };
  }

  const domain = hostOf(resolverBase(options));
  const links: IdentifierLinks = { model: buildDigitalLinkUri({ gtin }, { resolverDomain: domain }) };

  if (passport.batchNumber) {
    links.batch = buildDigitalLinkUri(
      { gtin, batchNumber: passport.batchNumber },
      { resolverDomain: domain },
    );
  }
  if (passport.serialNumber) {
    links.item = buildDigitalLinkUri(
      { gtin, serialNumber: passport.serialNumber },
      { resolverDomain: domain },
    );
  }
  return links;
}

/**
 * The UPI: a URL, resolvable, and no longer than 2 000 characters.
 *
 * The most specific link the data supports is the one that gets filed, because
 * an item-level passport registered at model level is a passport a market
 * surveillance officer cannot use to identify the garment in their hand.
 */
export function selectUpi(
  passport: RegistryPassportInput,
  links: IdentifierLinks,
  options?: BuildRegistryRecordOptions,
): { upi: string; scheme: IdentifierScheme } {
  const preferred =
    (passport.scope === 'item' && links.item) ||
    (passport.scope === 'batch' && links.batch) ||
    links.model ||
    passportUrl(passport.dppId, resolverBase(options));

  const scheme: IdentifierScheme =
    options?.identifierScheme ??
    // A Digital Link URI carries GS1 application identifiers in its path; a
    // plain passport URL is an IEC 61406 identification link, which is exactly
    // what that standard describes and is the correct declaration to make.
    (/\/01\/\d{14}(\/|$)/.test(preferred) ? 'gs1_digital_link' : 'iec_61406');

  return { upi: preferred, scheme };
}

function readCommodityCode(payload: Record<string, unknown>): string {
  const identity = payload.identity;
  if (identity && typeof identity === 'object') {
    const hs = (identity as Record<string, unknown>).hsCode;
    if (typeof hs === 'string' && hs.trim()) return hs.trim();
  }
  return '';
}

function readCategory(payload: Record<string, unknown>): string {
  const identity = payload.identity;
  if (identity && typeof identity === 'object') {
    const category = (identity as Record<string, unknown>).category;
    if (typeof category === 'string') return category;
  }
  return '';
}

export function buildRegistryRecord(
  passport: RegistryPassportInput,
  version: RegistryVersionInput,
  tenant: RegistryTenantInput,
  options?: BuildRegistryRecordOptions,
): RegistryRecord {
  const links = buildIdentifierLinks(passport, options);
  const { upi, scheme } = selectUpi(passport, links, options);
  const operator = selectOperatorIdentifier(tenant);
  const base = resolverBase(options);

  const record: Omit<RegistryRecord, 'versionHash'> = {
    upi: upi.slice(0, UPI_MAX_LENGTH),
    upiScheme: scheme,
    dppId: passport.dppId,
    operator: {
      identifier: operator?.identifier ?? '',
      scheme: operator?.scheme ?? 'gleif_lei',
      legalName: tenant.legalName,
      country: tenant.country.toUpperCase(),
    },
    commodityCode: readCommodityCode(version.payload),
    serviceProviderReference: serviceProviderReference(options),
    payloadHash: version.dataHash,
    version: version.version,
    granularity: passport.scope,
    identifierLinks: links,
    // A second address for the same content. The Registry holds a pointer, and
    // a pointer with one address is a pointer with a single point of failure.
    backupUrl: `${passportUrl(passport.dppId, base)}/dpp.json`,
    productCategory: readCategory(version.payload),
  };

  // The version hash covers the whole descriptor, not just the payload. A
  // brand that corrects its LEI or re-points the UPI has changed what the
  // Registry is attesting to, even though the garment data is untouched, and
  // the hash has to move with it or the registration silently goes stale.
  return { ...record, versionHash: canonicalHash(record) };
}

/**
 * Idempotency key for a submission.
 *
 * Derived, never random: a retry after a timeout must produce the same key so
 * the Registry recognises it as the same filing. Randomising here is precisely
 * how a network blip becomes two registrations for one garment.
 */
export function idempotencyKeyFor(record: RegistryRecord): string {
  return canonicalHash({
    dppId: record.dppId,
    version: record.version,
    versionHash: record.versionHash,
  }).slice(2, 34);
}
