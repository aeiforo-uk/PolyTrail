import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { passportVersions, passports, products, tenants } from '@/lib/db/schema';
import type { Session } from '@/lib/auth/session';
import type { PassportPayload } from '@/lib/passport/schema';
import { normalizeDppId } from '@/lib/passport/identifier';
import { projectForTier } from '@/lib/tier/project';
import type { AccessTier } from '@/lib/tier/types';
import { isPassportClosed, listEvents, resolveEventAuthority } from '@/lib/lifecycle/events';
import { LIFECYCLE_EVENT_META, type LifecycleEventType, type TimelineEntry } from '@/lib/lifecycle';

/**
 * Reads for the partner portal.
 *
 * The tier projection happens here, on the server, against the field registry —
 * never by rendering everything and hiding the sensitive half in CSS. A
 * repairer and a recycler are handed two genuinely different documents, and
 * what a repairer is not entitled to never reaches their browser.
 */

export type Persona = 'repairer' | 'recycler';

export function personaFor(role: string): Persona | null {
  if (role === 'REPAIRER') return 'repairer';
  if (role === 'RECYCLER') return 'recycler';
  return null;
}

const TIER_BY_PERSONA: Record<Persona, AccessTier> = {
  repairer: 'repairer',
  recycler: 'recycler',
};

export interface PartnerItem {
  passportId: string;
  dppId: string;
  productName: string;
  brandName: string;
  status: string;
  version: number;
  persona: Persona;
  tier: AccessTier;
  /** Exactly what this persona is entitled to read, and nothing else. */
  payload: Partial<PassportPayload>;
  /** Registered fields that exist but were withheld, so the gap is honest. */
  withheldCount: number;
  events: TimelineEntry[];
  /** The event that closed the passport, when one has. */
  closedBy: LifecycleEventType | null;
  closedLabel: string | null;
}

export type LookupOutcome =
  | { kind: 'found'; item: PartnerItem }
  | { kind: 'unknown' }
  | { kind: 'not_authorised'; brandName: string };

/**
 * Load one item as this partner may see it.
 *
 * Authorisation is the same rule that governs writing: the partner must belong
 * to the workspace that made the item or to the one that owns it now. A
 * passport they have no relationship with returns `not_authorised` rather than
 * `unknown`, because pretending an item does not exist when the person is
 * holding it in their hands is unhelpful and they can read the public page
 * anyway.
 */
export async function loadItemForPartner(
  session: Session,
  rawId: string,
): Promise<LookupOutcome> {
  const persona = personaFor(session.role);
  if (!persona) return { kind: 'unknown' };

  const dppId = normalizeDppId(rawId);
  const [row] = await db
    .select({
      passport: passports,
      productName: products.name,
      brandLegalName: tenants.legalName,
      brandTradeName: tenants.tradeName,
    })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .leftJoin(products, eq(products.id, passports.productId))
    .where(and(eq(passports.dppId, dppId), isNull(passports.deletedAt)))
    .limit(1);

  if (!row) return { kind: 'unknown' };

  const { passport } = row;
  const brandName = row.brandTradeName ?? row.brandLegalName;

  if (!resolveEventAuthority(passport, session)) {
    return { kind: 'not_authorised', brandName };
  }

  const version = passport.publishedVersion ?? passport.currentVersion;
  const [versionRow] = await db
    .select({ payload: passportVersions.payload, version: passportVersions.version })
    .from(passportVersions)
    .where(
      and(eq(passportVersions.passportId, passport.id), eq(passportVersions.version, version)),
    )
    .limit(1);

  if (!versionRow) return { kind: 'unknown' };

  const tier = TIER_BY_PERSONA[persona];
  const { data, withheld } = projectForTier(
    versionRow.payload as unknown as PassportPayload,
    tier,
  );

  const [events, closedBy] = await Promise.all([
    listEvents(passport.id),
    isPassportClosed(passport.id),
  ]);

  return {
    kind: 'found',
    item: {
      passportId: passport.id,
      dppId: passport.dppId,
      productName: row.productName ?? 'Untitled item',
      brandName,
      status: passport.status,
      version: versionRow.version,
      persona,
      tier,
      payload: data,
      withheldCount: withheld.length,
      events: events.filter(
        (event) => event.visibility === 'public' || event.visibility === tier,
      ),
      closedBy,
      closedLabel: closedBy ? LIFECYCLE_EVENT_META[closedBy].label : null,
    },
  };
}
