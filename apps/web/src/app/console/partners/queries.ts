import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { credentials } from '@/lib/db/schema';

/**
 * Certificate reads for the supplier module.
 *
 * These live beside the screens that use them rather than in `lib/partners`
 * because they answer a presentation question — "is this facility's paperwork
 * about to lapse" — rather than a domain one. As everywhere else in the
 * console, `tenantId` comes first and every query filters on it.
 */

/**
 * Ninety days is the window a sourcing team can actually act inside: most
 * schemes take six to ten weeks to re-audit, so a certificate flagged at
 * thirty days is already a production problem rather than a warning.
 */
export const EXPIRY_WINDOW_DAYS = 90;

export interface CertificateHealth {
  total: number;
  active: number;
  /** Active, but lapsing inside the window above. */
  expiringSoon: number;
  expired: number;
  nextExpiry: Date | null;
}

export const NO_CERTIFICATES: CertificateHealth = {
  total: 0,
  active: 0,
  expiringSoon: 0,
  expired: 0,
  nextExpiry: null,
};

function windowEnd(now: Date): Date {
  return new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 86_400_000);
}

export async function certificateHealthByPartner(
  tenantId: string,
  partnerIds: readonly string[],
): Promise<Map<string, CertificateHealth>> {
  const health = new Map<string, CertificateHealth>();
  if (partnerIds.length === 0) return health;

  const rows = await db
    .select({
      partnerId: credentials.partnerId,
      status: credentials.status,
      validUntil: credentials.validUntil,
    })
    .from(credentials)
    .where(and(eq(credentials.tenantId, tenantId), inArray(credentials.partnerId, [...partnerIds])));

  const now = new Date();
  const horizon = windowEnd(now);

  for (const row of rows) {
    if (!row.partnerId) continue;
    const current = health.get(row.partnerId) ?? { ...NO_CERTIFICATES };
    current.total += 1;

    const lapsed =
      row.status === 'expired' || (row.validUntil !== null && row.validUntil.getTime() < now.getTime());

    if (lapsed) {
      current.expired += 1;
    } else if (row.status === 'active') {
      current.active += 1;
      if (row.validUntil !== null && row.validUntil.getTime() <= horizon.getTime()) {
        current.expiringSoon += 1;
      }
    }

    if (
      row.validUntil !== null &&
      !lapsed &&
      (current.nextExpiry === null || row.validUntil.getTime() < current.nextExpiry.getTime())
    ) {
      current.nextExpiry = row.validUntil;
    }

    health.set(row.partnerId, current);
  }

  return health;
}

export interface PartnerCertificate {
  id: string;
  scheme: string;
  credentialType: string;
  licenceNumber: string | null;
  issuerName: string;
  status: string;
  validFrom: Date | null;
  validUntil: Date | null;
}

/**
 * One facility's certificates, with `validFrom` — which the shared partner
 * query omits, and which is the whole of a validity bar: without the start
 * date there is no span to draw, only a date to read.
 */
export async function partnerCertificates(
  tenantId: string,
  partnerId: string,
): Promise<PartnerCertificate[]> {
  return db
    .select({
      id: credentials.id,
      scheme: credentials.scheme,
      credentialType: credentials.credentialType,
      licenceNumber: credentials.licenceNumber,
      issuerName: credentials.issuerName,
      status: credentials.status,
      validFrom: credentials.validFrom,
      validUntil: credentials.validUntil,
    })
    .from(credentials)
    .where(and(eq(credentials.tenantId, tenantId), eq(credentials.partnerId, partnerId)))
    .orderBy(asc(credentials.validUntil));
}
