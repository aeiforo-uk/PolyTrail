import 'server-only';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { partners, passportEvents, passports, products, users } from '@/lib/db/schema';
import { conflict, forbidden, notFound, unprocessable } from '@/lib/api/errors';
import { recordAudit } from '@/lib/audit/record';
import { normalizeDppId } from '@/lib/passport/identifier';
import type { AccessTier } from '@/lib/tier/types';
import type { Role } from '@/lib/auth/roles';
import {
  LIFECYCLE_EVENT_META,
  TERMINAL_EVENTS,
  isLifecycleEvent,
  type EventAuthor,
  type LifecycleEventType,
} from './vocab';

/**
 * The part of a passport that keeps growing after the garment is sold.
 *
 * Three rules hold this together, and they are the reason this module exists
 * rather than each surface writing its own INSERT:
 *
 *   1. Only the current owner or a partner authorised on the item may append.
 *      A passport anyone can write to records nothing.
 *   2. An event is immutable once written. There is no update and no delete —
 *      a mistake is corrected by appending a correction, so the correction is
 *      itself part of the record.
 *   3. A terminal event closes the passport. Nothing follows `recycled`,
 *      because a garment that has been pulled into fibre cannot then be
 *      repaired, and a record that accepts that claim is not evidence.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export interface EventActor {
  userId: string | null;
  name: string;
  tenantId: string | null;
  role: Role;
}

export interface AppendEventInput {
  dppId: string;
  eventType: LifecycleEventType;
  /** Defaults to now. Never accepted in the future — a passport is not a plan. */
  occurredAt?: Date | string;
  summary?: string | null;
  details?: Record<string, unknown> | null;
  /** Falls back to the vocabulary's default for the event type. */
  visibility?: AccessTier;
  partnerId?: string | null;
  evidenceDocumentId?: string | null;
  /**
   * Assert the author explicitly, for a caller whose authority comes from
   * somewhere other than the actor's role. An accepted transfer is the case
   * this exists for: the person who has just taken the item is its owner, and
   * writing the transfer's event as anything else would misattribute it.
   * The tenant relation is still checked.
   */
  actingAs?: EventAuthor;
}

export interface AppendedEvent {
  id: string;
  passportId: string;
  dppId: string;
  eventType: LifecycleEventType;
  occurredAt: string;
  closesPassport: boolean;
}

const INTERNAL_AUTHOR_ROLES: Record<string, EventAuthor> = {
  BRAND_ADMIN: 'brand',
  PRODUCT_MANAGER: 'brand',
  COMPLIANCE_OFFICER: 'brand',
  REPAIRER: 'repairer',
  RECYCLER: 'recycler',
};

export interface AuthorityInput {
  tenantId: string;
  ownerTenantId: string | null;
}

/**
 * What kind of author this actor is on this item, or `null` for none.
 *
 * Deliberately narrow. The owning workspace writes as the brand; a repair or
 * recycling partner invited into a workspace writes in their own voice on the
 * items that workspace made or owns. Everything else — including a brand
 * looking at somebody else's passport — gets nothing.
 */
export function resolveEventAuthority(
  passport: AuthorityInput,
  actor: Pick<EventActor, 'tenantId' | 'role'>,
): EventAuthor | null {
  if (!actor.tenantId) return null;
  const owner = passport.ownerTenantId ?? passport.tenantId;
  const related = owner === actor.tenantId || passport.tenantId === actor.tenantId;
  if (!related) return null;
  return INTERNAL_AUTHOR_ROLES[actor.role] ?? null;
}

/** Has anything terminal already been recorded against this passport? */
export async function isPassportClosed(
  passportId: string,
  executor: Executor = db,
): Promise<LifecycleEventType | null> {
  const [closing] = await executor
    .select({ eventType: passportEvents.eventType })
    .from(passportEvents)
    .where(
      and(
        eq(passportEvents.passportId, passportId),
        inArray(passportEvents.eventType, [...TERMINAL_EVENTS]),
      ),
    )
    .orderBy(desc(passportEvents.occurredAt))
    .limit(1);
  return closing ? (closing.eventType as LifecycleEventType) : null;
}

/**
 * Append a post-market event.
 *
 * Takes an optional executor so that a transfer can write its lifecycle event
 * inside the same transaction that moves ownership. A transfer that completed
 * without its `resold` event, or an event that survived a rolled-back transfer,
 * are both records that lie about what happened.
 */
export async function appendEvent(
  actor: EventActor,
  input: AppendEventInput,
  executor: Executor = db,
): Promise<AppendedEvent> {
  if (!isLifecycleEvent(input.eventType)) {
    throw unprocessable(`"${input.eventType}" is not a lifecycle event.`);
  }
  const meta = LIFECYCLE_EVENT_META[input.eventType];

  const dppId = normalizeDppId(input.dppId);
  const [passport] = await executor
    .select({
      id: passports.id,
      dppId: passports.dppId,
      tenantId: passports.tenantId,
      ownerTenantId: passports.ownerTenantId,
      status: passports.status,
    })
    .from(passports)
    .where(and(eq(passports.dppId, dppId), isNull(passports.deletedAt)))
    .limit(1);

  if (!passport) throw notFound('No passport with that identifier.');

  const derived = resolveEventAuthority(passport, actor);
  if (!derived) {
    throw forbidden('You are not authorised to record events against this item.');
  }
  const author = input.actingAs ?? derived;
  if (!meta.authors.includes(author)) {
    throw forbidden(`A ${author} cannot record "${meta.label}" against an item.`);
  }

  const closedBy = await isPassportClosed(passport.id, executor);
  if (closedBy) {
    throw conflict(
      `This passport was closed by a "${LIFECYCLE_EVENT_META[closedBy].label}" event. Nothing further can be added to it.`,
    );
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw unprocessable('That is not a date we can read.');
  }
  // A minute of slack, because a client clock a few seconds ahead is a clock
  // problem, not a fraud attempt.
  if (occurredAt.getTime() > Date.now() + 60_000) {
    throw unprocessable('An event cannot have happened in the future.');
  }

  if (input.partnerId) {
    const [partner] = await executor
      .select({ id: partners.id })
      .from(partners)
      .where(
        and(
          eq(partners.id, input.partnerId),
          eq(partners.tenantId, passport.tenantId),
          isNull(partners.deletedAt),
        ),
      )
      .limit(1);
    if (!partner) throw unprocessable('That partner does not belong to this workspace.');
  }

  const [written] = await executor
    .insert(passportEvents)
    .values({
      passportId: passport.id,
      eventType: input.eventType,
      occurredAt,
      partnerId: input.partnerId ?? null,
      actorId: actor.userId,
      summary: input.summary?.trim() || null,
      details: input.details ?? null,
      visibility: input.visibility ?? meta.visibility,
      evidenceDocumentId: input.evidenceDocumentId ?? null,
    })
    .returning({ id: passportEvents.id });

  await recordAudit({
    tenantId: actor.tenantId!,
    actorId: actor.userId,
    actorLabel: actor.name,
    action: 'passport.event.appended',
    subjectType: 'passport_event',
    subjectId: written!.id,
    metadata: {
      dppId: passport.dppId,
      eventType: input.eventType,
      author,
      occurredAt: occurredAt.toISOString(),
      visibility: input.visibility ?? meta.visibility,
      closesPassport: meta.terminal,
    },
  });

  return {
    id: written!.id,
    passportId: passport.id,
    dppId: passport.dppId,
    eventType: input.eventType,
    occurredAt: occurredAt.toISOString(),
    closesPassport: meta.terminal,
  };
}

export interface TimelineEntry {
  id: string;
  eventType: LifecycleEventType;
  label: string;
  occurredAt: string;
  summary: string | null;
  details: Record<string, unknown> | null;
  visibility: AccessTier;
  actorName: string | null;
  partnerName: string | null;
  terminal: boolean;
}

/** The item's history, oldest first, as the console and the partner portal show it. */
export async function listEvents(passportId: string): Promise<TimelineEntry[]> {
  const rows = await db
    .select({
      id: passportEvents.id,
      eventType: passportEvents.eventType,
      occurredAt: passportEvents.occurredAt,
      summary: passportEvents.summary,
      details: passportEvents.details,
      visibility: passportEvents.visibility,
      actorName: users.name,
      partnerName: partners.name,
    })
    .from(passportEvents)
    .leftJoin(users, eq(users.id, passportEvents.actorId))
    .leftJoin(partners, eq(partners.id, passportEvents.partnerId))
    .where(eq(passportEvents.passportId, passportId))
    .orderBy(asc(passportEvents.occurredAt));

  return rows.map((row) => {
    const type = row.eventType as LifecycleEventType;
    return {
      id: row.id,
      eventType: type,
      label: LIFECYCLE_EVENT_META[type]?.label ?? type,
      occurredAt: row.occurredAt.toISOString(),
      summary: row.summary,
      details: row.details,
      visibility: row.visibility as AccessTier,
      actorName: row.actorName,
      partnerName: row.partnerName,
      terminal: LIFECYCLE_EVENT_META[type]?.terminal ?? false,
    };
  });
}

/** Events this workspace's partners recorded recently, newest first. */
export async function listRecentEventsByActor(
  actorId: string,
  limit = 12,
): Promise<Array<TimelineEntry & { dppId: string; productName: string | null }>> {
  const rows = await db
    .select({
      id: passportEvents.id,
      eventType: passportEvents.eventType,
      occurredAt: passportEvents.occurredAt,
      summary: passportEvents.summary,
      details: passportEvents.details,
      visibility: passportEvents.visibility,
      dppId: passports.dppId,
      productName: products.name,
    })
    .from(passportEvents)
    .innerJoin(passports, eq(passports.id, passportEvents.passportId))
    .leftJoin(products, eq(products.id, passports.productId))
    .where(eq(passportEvents.actorId, actorId))
    .orderBy(desc(passportEvents.occurredAt))
    .limit(limit);

  return rows.map((row) => {
    const type = row.eventType as LifecycleEventType;
    return {
      id: row.id,
      eventType: type,
      label: LIFECYCLE_EVENT_META[type]?.label ?? type,
      occurredAt: row.occurredAt.toISOString(),
      summary: row.summary,
      details: row.details,
      visibility: row.visibility as AccessTier,
      actorName: null,
      partnerName: null,
      terminal: LIFECYCLE_EVENT_META[type]?.terminal ?? false,
      dppId: row.dppId,
      productName: row.productName,
    };
  });
}
