/**
 * The EU Digital Product Passport Registry, as a contract Polytrail can be held to.
 *
 * The Registry went live on 20 July 2026. It created no textile obligation:
 * 18 February 2027 is batteries, and a realistic textile date is late 2028–2029
 * once the ESPR textile delegated act exists. So everything in this module is
 * built to be *ready and testable* against a stated contract rather than to
 * pretend a filing is due today — and the console says so in as many words.
 *
 * What the Registry actually stores is a pointer, not a passport: where the
 * data lives, who is responsible for it, what the product is in customs terms,
 * and a hash that pins the version being pointed at.
 *
 * @see docs/COMPLIANCE.md — dated position on what is law and what is not.
 */

/**
 * The five identifier schemes EN 18219:2026 permits.
 *
 * Hardcoding GTIN would be the single easiest way to build something that is
 * standards-compliant on a slide and non-compliant in a warehouse. A brand
 * arriving with IEC 61406 nameplates, a DID-based identity, or a DOI for a
 * documented archive piece is entitled to file.
 */
export const IDENTIFIER_SCHEMES = [
  'gs1_digital_link',
  'iec_61406',
  'w3c_did',
  'rfid_2d',
  'doi',
] as const;

export type IdentifierScheme = (typeof IDENTIFIER_SCHEMES)[number];

export const IDENTIFIER_SCHEME_LABELS: Record<IdentifierScheme, string> = {
  gs1_digital_link: 'GS1 Digital Link',
  iec_61406: 'IEC 61406 identification link',
  w3c_did: 'W3C Decentralised Identifier',
  rfid_2d: 'RFID / 2D data carrier identifier',
  doi: 'Digital Object Identifier',
};

/** The four operator identifier schemes EN 18219:2026 recognises. */
export const OPERATOR_SCHEMES = ['gleif_lei', 'eori', 'gs1_gln', 'w3c_did'] as const;

export type OperatorScheme = (typeof OPERATOR_SCHEMES)[number];

export const OPERATOR_SCHEME_LABELS: Record<OperatorScheme, string> = {
  gleif_lei: 'GLEIF Legal Entity Identifier',
  eori: 'EORI number',
  gs1_gln: 'GS1 Global Location Number',
  w3c_did: 'W3C Decentralised Identifier',
};

/**
 * The Registry requires the unique product identifier to be a URL, and caps it
 * at 2 000 characters. A bare UUID is not a valid UPI: it is not a URL, not
 * resolvable, and not ISO/IEC 15459 conformant.
 */
export const UPI_MAX_LENGTH = 2000;

/** Proof of registration is valid for 90 days and must then be refreshed. */
export const PROOF_VALIDITY_DAYS = 90;

/** How far ahead of expiry the console starts warning. */
export const PROOF_WARNING_DAYS = 14;

export type Granularity = 'model' | 'batch' | 'item';

/** Where a reader can pick the passport up, at each granularity the Registry asks for. */
export interface IdentifierLinks {
  /** The style, across colourways and sizes. */
  model?: string;
  /** One model, one plant, one run. */
  batch?: string;
  /** One physical garment. */
  item?: string;
}

/**
 * The submission envelope.
 *
 * Deliberately flat and serialisable: this is the object that gets canonicalised,
 * hashed, held in an idempotency key and — one day — sealed by a QTSP. Anything
 * that cannot survive `JSON.stringify` does not belong in it.
 */
export interface RegistryRecord {
  /** Resolvable URL, at most `UPI_MAX_LENGTH` characters. */
  upi: string;
  upiScheme: IdentifierScheme;
  /** Polytrail's own identifier for the passport, carried for reconciliation. */
  dppId: string;
  operator: {
    identifier: string;
    scheme: OperatorScheme;
    legalName: string;
    /** ISO 3166-1 alpha-2 of the establishment placing the product on the market. */
    country: string;
  };
  /** Combined Nomenclature / HS code, 4–10 digits. */
  commodityCode: string;
  /**
   * Who operates the DPP service that answers the UPI. The Registry holds the
   * brand responsible for the data and the service provider responsible for
   * its availability, so both are named.
   */
  serviceProviderReference: string;
  /** SHA-256 over the canonical form of the registry-facing descriptor. */
  versionHash: string;
  /** Content hash of the passport version being pointed at. */
  payloadHash: string;
  version: number;
  granularity: Granularity;
  identifierLinks: IdentifierLinks;
  /** Second URL for the same content, so a resolver outage is not a compliance failure. */
  backupUrl: string;
  /** ESPR product group, in Polytrail's vocabulary. */
  productCategory: string;
}

/** What comes back when the Registry accepts a filing. */
export interface RegistryProof {
  /** The Registry's own identifier. Persisted to `passports.registry_id`. */
  registryId: string;
  /** Web-resolvable address of the registration. Persisted to `passports.registry_url`. */
  registryUrl: string;
  issuedAt: string;
  /** `issuedAt` + 90 days. After this the proof must be refreshed. */
  expiresAt: string;
  /** The version hash the Registry recorded, echoed back for comparison. */
  versionHash: string;
}

export type RegistryState = 'registered' | 'superseded' | 'withdrawn' | 'expired' | 'unknown';

export interface RegistryReceipt {
  proof: RegistryProof;
  state: RegistryState;
  /** Which implementation answered — surfaced in the console, never guessed at. */
  endpoint: RegistryEndpointDescription;
}

export interface RegistryStatusResult {
  registryId: string;
  state: RegistryState;
  proof: RegistryProof | null;
  checkedAt: string;
  endpoint: RegistryEndpointDescription;
}

export interface RegistryWithdrawalResult {
  registryId: string;
  withdrawnAt: string;
  endpoint: RegistryEndpointDescription;
}

export type RegistryMode = 'mock' | 'http';

export interface RegistryEndpointDescription {
  mode: RegistryMode;
  /** Base URL for `http`; a plain-language note for `mock`. */
  target: string;
  /** True only when a filing here would be a filing of record. */
  authoritative: boolean;
}

export interface SubmitOptions {
  /**
   * Stable per (passport, version) so a timeout cannot double-file. A retry
   * carrying the same key must return the original registration, not a second.
   */
  idempotencyKey: string;
  /** Overrides the client default; mainly for tests. */
  timeoutMs?: number;
}

/** The contract both implementations satisfy. */
export interface RegistryClient {
  readonly endpoint: RegistryEndpointDescription;
  submit(record: RegistryRecord, options: SubmitOptions): Promise<RegistryReceipt>;
  status(registryId: string): Promise<RegistryStatusResult>;
  withdraw(registryId: string, reason: string): Promise<RegistryWithdrawalResult>;
}

export type RegistryErrorCode =
  | 'NOT_READY'
  | 'REJECTED'
  | 'UNAVAILABLE'
  | 'NOT_FOUND'
  | 'NOT_CONFIGURED'
  | 'OPERATOR_NOT_VERIFIED';

/**
 * Registry failures carry a code because the console reacts differently to each:
 * `NOT_READY` is the brand's to fix, `UNAVAILABLE` is ours to retry, and
 * `REJECTED` needs a human to read what the Registry said.
 */
export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly detail?: unknown;

  constructor(code: RegistryErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'RegistryError';
    this.code = code;
    this.detail = detail;
  }
}

/** Days until `expiresAt`, negative once it has passed. */
export function daysUntil(expiresAt: string, now: Date = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.floor(ms / 86_400_000);
}

export type ProofHealth = 'valid' | 'expiring' | 'expired';

export function proofHealth(expiresAt: string, now: Date = new Date()): ProofHealth {
  const remaining = daysUntil(expiresAt, now);
  if (remaining < 0) return 'expired';
  if (remaining <= PROOF_WARNING_DAYS) return 'expiring';
  return 'valid';
}
