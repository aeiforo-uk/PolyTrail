/**
 * GS1 Digital Link.
 *
 * The 2D barcode on a garment's care label is, increasingly, a GS1 Digital
 * Link URI rather than a bare URL — one symbol that a till can read as a GTIN
 * and a phone can open as a passport. GS1's "Sunrise 2027" programme is what
 * makes this the default expectation for retail, so Polytrail mints these URIs
 * natively rather than treating them as an export format.
 *
 * @see https://ref.gs1.org/standards/digital-link/uri-syntax/
 */

/** Application Identifiers Polytrail mints and parses. */
export const AI = {
  GTIN: '01',
  BATCH_LOT: '10',
  PRODUCTION_DATE: '11',
  SERIAL: '21',
  /** GS1 Global Model Number — the style, across colourways and sizes. */
  GMN: '8013',
} as const;

export type Granularity = 'model' | 'batch' | 'item';

export interface DigitalLinkParams {
  /** GTIN-8/12/13/14. Zero-padded to 14 on the way out. */
  gtin: string;
  /** AI(21) — identifies one physical garment. */
  serialNumber?: string | null;
  /** AI(10) — identifies a production lot. */
  batchNumber?: string | null;
  /** AI(11) — YYMMDD. */
  productionDate?: string | null;
}

/** Pad a GTIN to the 14 digits the Digital Link syntax requires. */
export function padGtin(gtin: string): string {
  const trimmed = gtin.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`A GTIN may contain only digits. Received "${gtin}".`);
  }
  if (trimmed.length > 14) {
    throw new Error(`A GTIN may not exceed 14 digits. Received ${trimmed.length}.`);
  }
  return trimmed.padStart(14, '0');
}

/**
 * GS1 modulo-10 check digit: weight digits 3,1,3,1… from the right of the
 * payload, sum, and take the amount needed to reach the next multiple of ten.
 */
export function computeGtinCheckDigit(payloadWithoutCheck: string): number {
  let sum = 0;
  const digits = payloadWithoutCheck.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export interface GtinValidation {
  valid: boolean;
  normalized?: string;
  reason?: string;
}

export function validateGtin(gtin: string): GtinValidation {
  let padded: string;
  try {
    padded = padGtin(gtin);
  } catch (error) {
    return { valid: false, reason: (error as Error).message };
  }
  const body = padded.slice(0, 13);
  const check = Number(padded.slice(13));
  const expected = computeGtinCheckDigit(body);
  if (check !== expected) {
    return {
      valid: false,
      normalized: padded,
      reason: `Check digit is ${check} but should be ${expected}. The GTIN was likely mistyped.`,
    };
  }
  return { valid: true, normalized: padded };
}

export function granularityOf(params: DigitalLinkParams): Granularity {
  if (params.serialNumber) return 'item';
  if (params.batchNumber) return 'batch';
  return 'model';
}

export interface DigitalLinkConfig {
  /** Host that answers the link, e.g. `id.polytrail.eu`. */
  resolverDomain: string;
  protocol?: 'https' | 'http';
}

/**
 * Build a canonical Digital Link URI.
 *
 * GS1 requires key qualifiers in AI order after the primary key, so batch
 * precedes serial; emitting them in any other order produces a URI that
 * conformant resolvers will reject.
 */
export function buildDigitalLinkUri(
  params: DigitalLinkParams,
  config: DigitalLinkConfig,
): string {
  const check = validateGtin(params.gtin);
  if (!check.valid) throw new Error(check.reason ?? 'Invalid GTIN');

  const protocol = config.protocol ?? 'https';
  const domain = config.resolverDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const segments = [AI.GTIN, check.normalized!];
  if (params.batchNumber) segments.push(AI.BATCH_LOT, encodeURIComponent(params.batchNumber));
  if (params.productionDate) {
    if (!/^\d{6}$/.test(params.productionDate)) {
      throw new Error('AI(11) production date must be exactly six digits, YYMMDD.');
    }
    segments.push(AI.PRODUCTION_DATE, params.productionDate);
  }
  if (params.serialNumber) segments.push(AI.SERIAL, encodeURIComponent(params.serialNumber));

  return `${protocol}://${domain}/${segments.join('/')}`;
}

export interface ParsedDigitalLink {
  gtin: string;
  batchNumber?: string;
  productionDate?: string;
  serialNumber?: string;
  granularity: Granularity;
}

/**
 * Parse the path of a Digital Link URI back into identifiers. Returns `null`
 * for anything that is not a GTIN-keyed link, so the resolver route can fall
 * through to Polytrail's own short-ID scheme without throwing.
 */
export function parseDigitalLinkPath(path: string): ParsedDigitalLink | null {
  const parts = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
  if (parts.length < 2 || parts[0] !== AI.GTIN) return null;

  const gtinCheck = validateGtin(parts[1]!);
  if (!gtinCheck.valid) return null;

  const result: ParsedDigitalLink = { gtin: gtinCheck.normalized!, granularity: 'model' };

  for (let i = 2; i + 1 < parts.length; i += 2) {
    const ai = parts[i]!;
    const value = decodeURIComponent(parts[i + 1]!);
    if (ai === AI.BATCH_LOT) result.batchNumber = value;
    else if (ai === AI.PRODUCTION_DATE) result.productionDate = value;
    else if (ai === AI.SERIAL) result.serialNumber = value;
  }

  result.granularity = granularityOf({
    gtin: result.gtin,
    batchNumber: result.batchNumber,
    serialNumber: result.serialNumber,
  });
  return result;
}

/**
 * The `linkset` a conformant GS1 resolver serves alongside the redirect,
 * telling a machine client which other representations exist. Publishing this
 * is what lets a retailer's system find the JSON passport without scraping
 * the consumer page.
 */
export function buildLinkset(passportUrl: string): Record<string, unknown> {
  return {
    linkset: [
      {
        anchor: passportUrl,
        'https://gs1.org/voc/defaultLink': [{ href: passportUrl, title: 'Product passport' }],
        'https://gs1.org/voc/sustainabilityInfo': [
          { href: passportUrl, type: 'text/html', title: 'Digital Product Passport' },
        ],
        'https://gs1.org/voc/epcis': [
          { href: `${passportUrl}.jsonld`, type: 'application/ld+json', title: 'Passport as JSON-LD' },
        ],
      },
    ],
  };
}
