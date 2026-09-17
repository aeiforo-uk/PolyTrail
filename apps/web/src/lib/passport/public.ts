import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  passportEvents,
  passportVersions,
  passports,
  products,
  tenantBranding,
  tenants,
  users,
} from '@/lib/db/schema';
import { projectForTier } from '@/lib/tier/project';
import type { AccessTier } from '@/lib/tier/types';
import type { PassportPayload } from './schema';
import { normalizeDppId } from './identifier';
import { logAccess, readAccessContext } from '@/lib/analytics/access-log';

/** Statuses that resolve at the public URL. */
const RESOLVABLE = ['published', 'suspended', 'recalled', 'withdrawn'] as const;

export interface PublicPassport {
  dppId: string;
  status: (typeof RESOLVABLE)[number];
  version: number;
  dataHash: string;
  publishedAt: string | null;
  updatedAt: string;
  /** The payload as this caller may see it. */
  payload: Partial<PassportPayload>;
  /** Fields that exist but were withheld, so the page can say so honestly. */
  withheld: Array<{ path: string; label: string; audiences: readonly AccessTier[] }>;
  tier: AccessTier;
  recall: {
    reason: string | null;
    severity: string | null;
    instructions: string | null;
    recalledAt: string | null;
  } | null;
  brand: {
    name: string;
    country: string;
    did: string | null;
    website: string | null;
    accentColor: string | null;
    logoUrl: string | null;
    footerText: string | null;
    supportUrl: string | null;
  };
  events: Array<{
    type: string;
    occurredAt: string;
    summary: string | null;
    details: Record<string, unknown> | null;
    /**
     * The workspace that recorded it — "Menders of Malmö", not "Mira
     * Halvorsen". The partner portal promises attribution by workspace, and
     * the workspace is also the only attribution that belongs on a page
     * anyone can open: naming the individual who repaired a garment would
     * publish an employee's work history to the open web.
     */
    by: string | null;
  }>;
  /**
   * Entries this tier was not allowed to see. Counted rather than dropped
   * silently: a timeline that quietly omits three of five entries tells the
   * reader the garment has had a quieter life than it has, which is the same
   * failure as a blank field that is actually a secret.
   */
  eventsWithheld: number;
}

/**
 * Resolve a passport for public consumption.
 *
 * Returns `null` rather than throwing for anything the caller should not know
 * exists — an unpublished or deleted passport is indistinguishable from one
 * that was never created, so the URL space cannot be probed to discover a
 * brand's unreleased line sheet.
 */
export async function resolvePublicPassport(
  rawId: string,
  tier: AccessTier = 'public',
  /**
   * Request headers, when the caller wants the read counted. Omitted by
   * internal callers such as the console preview, which should not inflate a
   * brand's scan figures with its own staff looking at their own passport.
   */
  requestHeaders?: Headers,
): Promise<PublicPassport | null> {
  const dppId = normalizeDppId(rawId);

  const [row] = await db
    .select({
      passport: passports,
      tenant: tenants,
      branding: tenantBranding,
      product: products,
    })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .leftJoin(tenantBranding, eq(tenantBranding.tenantId, passports.tenantId))
    .leftJoin(products, eq(products.id, passports.productId))
    .where(and(eq(passports.dppId, dppId), isNull(passports.deletedAt)))
    .limit(1);

  if (!row) return null;

  const { passport, tenant, branding } = row;
  if (!(RESOLVABLE as readonly string[]).includes(passport.status)) return null;
  if (passport.publishedVersion == null) return null;

  const [version] = await db
    .select()
    .from(passportVersions)
    .where(
      and(
        eq(passportVersions.passportId, passport.id),
        eq(passportVersions.version, passport.publishedVersion),
      ),
    )
    .limit(1);

  if (!version) return null;

  const { data, withheld } = projectForTier(
    withholdUndisclosedFacilities(version.payload as unknown as PassportPayload, tier),
    tier,
  );

  if (requestHeaders) {
    logAccess({ passportId: passport.id, tier, ...readAccessContext(requestHeaders) });
  }

  /*
   * Two left joins to answer "who did this". The actor is a user, the user
   * belongs to a workspace, and it is the workspace that is named. Left, not
   * inner, because a seeded or system-written event has no actor and must
   * still appear — an event that vanished because nobody was logged in when
   * it happened would be a hole in the record.
   */
  const events = await db
    .select({
      eventType: passportEvents.eventType,
      occurredAt: passportEvents.occurredAt,
      summary: passportEvents.summary,
      details: passportEvents.details,
      visibility: passportEvents.visibility,
      byTradeName: tenants.tradeName,
      byLegalName: tenants.legalName,
    })
    .from(passportEvents)
    .leftJoin(users, eq(users.id, passportEvents.actorId))
    .leftJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(passportEvents.passportId, passport.id))
    .orderBy(passportEvents.occurredAt);

  // Event-level visibility is independent of field tiering: a repair event
  // recorded by a partner may be restricted even when the passport is open.
  const visibleEvents = events.filter(
    (e) => e.visibility === 'public' || tier === 'authority' || e.visibility === tier,
  );

  return {
    dppId: passport.dppId,
    status: passport.status as PublicPassport['status'],
    version: passport.publishedVersion,
    dataHash: version.dataHash,
    publishedAt: passport.publishedAt?.toISOString() ?? null,
    updatedAt: passport.updatedAt.toISOString(),
    payload: data,
    withheld,
    tier,
    recall:
      passport.status === 'recalled'
        ? {
            reason: passport.recallReason,
            severity: passport.recallSeverity,
            instructions: passport.recallInstructions,
            recalledAt: passport.recalledAt?.toISOString() ?? null,
          }
        : null,
    brand: {
      name: tenant.tradeName ?? tenant.legalName,
      country: tenant.country,
      did: tenant.did,
      website: tenant.website,
      accentColor: branding?.accentColor ?? null,
      logoUrl: branding?.logoUrl ?? null,
      footerText: branding?.footerText ?? null,
      supportUrl: branding?.supportUrl ?? null,
    },
    events: visibleEvents.map((e) => ({
      type: e.eventType,
      occurredAt: e.occurredAt.toISOString(),
      summary: e.summary,
      details: e.details,
      by: e.byTradeName ?? e.byLegalName ?? null,
    })),
    eventsWithheld: events.length - visibleEvents.length,
  };
}

/**
 * Honour each supply step's `facilityDisclosed` flag.
 *
 * Facility names are registered as public, because naming the mill and the
 * factory is the single most valuable thing a passport can do and the field
 * registry should not quietly prevent a brand that wants to. But disclosure is
 * the brand's decision to make per step — some contracts forbid it, and some
 * suppliers have a legitimate safety interest in not being named.
 *
 * So the flag is enforced here rather than in the registry: a step marked
 * undisclosed loses its facility name for every audience except the
 * authorities, who are entitled to the complete record regardless. The step
 * itself, its country, its process and its evidence level all remain public,
 * so an undisclosed facility still reads as a mapped step rather than a gap.
 */
function withholdUndisclosedFacilities(
  payload: PassportPayload,
  tier: AccessTier,
): PassportPayload {
  if (tier === 'authority') return payload;
  const steps = payload.supplyChain?.steps;
  if (!steps?.length) return payload;
  if (steps.every((step) => step.facilityDisclosed !== false)) return payload;

  return {
    ...payload,
    supplyChain: {
      ...payload.supplyChain!,
      steps: steps.map((step) =>
        step.facilityDisclosed === false ? { ...step, facilityName: undefined } : step,
      ),
    },
  };
}
