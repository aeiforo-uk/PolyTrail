import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  passportStatusHistory,
  passportVersions,
  passports,
  products,
  tenants,
} from '@/lib/db/schema';
import { canonicalHash } from '@/lib/crypto/canonical';
import { recordAudit } from '@/lib/audit/record';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '@/lib/api/errors';
import type { Session } from '@/lib/auth/session';
import { generateDppId } from './identifier';
import { scoreCompleteness } from './completeness';
import { passportPayloadSchema, validateForPublication, type PassportPayload } from './schema';
import { findTransition, isEditable, type PassportStatus } from './state';
import { passportUrl } from './identifier';
import {
  emitPassportPublished,
  emitPassportRecalled,
  emitPassportUpdated,
} from '@/lib/webhooks/passport-events';

/**
 * All passport mutation goes through here.
 *
 * Three invariants this module exists to hold:
 *   1. Content is immutable once written. Editing a passport appends a new
 *      version with a change reason; it never rewrites history.
 *   2. Publication is gated on validation, not on the user remembering.
 *   3. Every mutation writes an audit entry in the same transaction, so a
 *      change and its record cannot come apart.
 */

export interface CreatePassportInput {
  productName: string;
  category: string;
  styleNumber?: string;
  sku?: string;
  gtin?: string;
  colourName?: string;
  size?: string;
  scope?: 'model' | 'batch' | 'item';
}

export async function createPassport(session: Session, input: CreatePassportInput) {
  const tenantId = requireTenant(session);

  const [tenant] = await db
    .select({ quota: tenants.passportQuota, name: tenants.legalName })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) throw notFound('Workspace not found.');

  const [usage] = await db
    .select({ used: sql<number>`count(*)`.mapWith(Number) })
    .from(passports)
    .where(and(eq(passports.tenantId, tenantId), isNull(passports.deletedAt)));

  if ((usage?.used ?? 0) >= tenant.quota) {
    throw conflict(
      `This workspace has reached its limit of ${tenant.quota} passports. Archive some, or contact us to raise the limit.`,
    );
  }

  return db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        tenantId,
        name: input.productName,
        styleNumber: input.styleNumber ?? null,
        category: input.category,
        createdBy: session.userId,
      })
      .returning();

    const payload: PassportPayload = {
      schemaVersion: '1.0',
      identity: {
        productName: { en: input.productName },
        brandName: tenant.name,
        category: input.category as PassportPayload['identity']['category'],
        ...(input.styleNumber ? { styleNumber: input.styleNumber } : {}),
        ...(input.sku ? { sku: input.sku } : {}),
        ...(input.gtin ? { gtin: input.gtin } : {}),
        ...(input.colourName ? { colourName: input.colourName } : {}),
        ...(input.size ? { size: input.size } : {}),
      },
    };

    const [passport] = await tx
      .insert(passports)
      .values({
        tenantId,
        productId: product!.id,
        dppId: generateDppId(),
        scope: input.scope ?? 'model',
        gtin: input.gtin ?? null,
        sku: input.sku ?? null,
        colourName: input.colourName ?? null,
        size: input.size ?? null,
        status: 'draft',
        currentVersion: 1,
        completeness: scoreCompleteness(payload).score,
        createdBy: session.userId,
      })
      .returning();

    await tx.insert(passportVersions).values({
      passportId: passport!.id,
      version: 1,
      payload,
      dataHash: canonicalHash(payload),
      changeReason: 'Initial draft',
      createdBy: session.userId,
    });

    await recordAudit({
      tenantId,
      actorId: session.userId,
      actorLabel: session.name,
      action: 'passport.created',
      subjectType: 'passport',
      subjectId: passport!.id,
      metadata: { dppId: passport!.dppId, productName: input.productName },
    });

    return passport!;
  });
}

export interface SavePayloadInput {
  dppId: string;
  payload: unknown;
  changeReason?: string;
}

/**
 * Write a new version.
 *
 * Every save creates a version rather than updating one, which sounds
 * expensive until you consider that the alternative is a passport whose
 * history a regulator cannot reconstruct. Saves that change nothing are
 * discarded by comparing the content hash, so autosave does not inflate the
 * chain.
 */
export async function savePassportPayload(session: Session, input: SavePayloadInput) {
  const tenantId = requireTenant(session);
  const result = await savePassportPayloadInTransaction(session, tenantId, input);

  // Only a passport the outside world can already read is worth an event; a
  // draft being edited is noise to every subscriber.
  if (!result.unchanged && result.passport.publishedVersion != null) {
    await emitPassportUpdated(tenantId, {
      dppId: result.passport.dppId,
      version: result.version,
      dataHash: result.dataHash,
      status: result.passport.status,
      passportUrl: passportUrl(result.passport.dppId),
    });
  }

  return result;
}

async function savePassportPayloadInTransaction(
  session: Session,
  tenantId: string,
  input: SavePayloadInput,
) {

  const parsed = passportPayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (errors[issue.path.join('.') || '_'] ??= []).push(issue.message);
    }
    throw unprocessable('The passport could not be saved because some values are invalid.', errors);
  }

  return db.transaction(async (tx) => {
    const [passport] = await tx
      .select()
      .from(passports)
      .where(
        and(
          eq(passports.tenantId, tenantId),
          eq(passports.dppId, input.dppId),
          isNull(passports.deletedAt),
        ),
      )
      .limit(1)
      .for('update');

    if (!passport) throw notFound('That passport does not exist.');

    if (!isEditable(passport.status as PassportStatus)) {
      throw conflict(
        `A passport that is ${passport.status.replace(/_/g, ' ')} cannot be edited. Return it to draft first.`,
      );
    }

    const dataHash = canonicalHash(parsed.data);

    const [current] = await tx
      .select({ dataHash: passportVersions.dataHash })
      .from(passportVersions)
      .where(
        and(
          eq(passportVersions.passportId, passport.id),
          eq(passportVersions.version, passport.currentVersion),
        ),
      )
      .limit(1);

    // Nothing changed — don't write a version just because someone opened the
    // form and left.
    if (current?.dataHash === dataHash) {
      return { passport, version: passport.currentVersion, unchanged: true, dataHash };
    }

    const version = passport.currentVersion + 1;
    const completeness = scoreCompleteness(parsed.data).score;

    await tx.insert(passportVersions).values({
      passportId: passport.id,
      version,
      payload: parsed.data,
      dataHash,
      changeReason: input.changeReason?.trim() || 'Updated',
      createdBy: session.userId,
    });

    await tx
      .update(passports)
      .set({ currentVersion: version, completeness, updatedAt: new Date() })
      .where(eq(passports.id, passport.id));

    await recordAudit({
      tenantId,
      actorId: session.userId,
      actorLabel: session.name,
      action: 'passport.version.created',
      subjectType: 'passport',
      subjectId: passport.id,
      metadata: { dppId: passport.dppId, version, dataHash, reason: input.changeReason ?? null },
    });

    return { passport, version, unchanged: false, dataHash };
  });
}

export interface TransitionInput {
  dppId: string;
  to: PassportStatus;
  reason?: string;
  /** Structured recall detail, required when transitioning to `recalled`. */
  recall?: { severity: 'low' | 'medium' | 'high'; instructions: string };
}

export async function transitionPassport(session: Session, input: TransitionInput) {
  const tenantId = requireTenant(session);
  const outcome = await runTransition(session, tenantId, input);

  // After the commit, never inside it: a subscriber told about a publish that
  // then rolled back has no way to find out it did not happen.
  const facts = {
    dppId: outcome.dppId,
    version: outcome.version,
    dataHash: outcome.dataHash,
    status: outcome.to,
    passportUrl: passportUrl(outcome.dppId),
  };
  if (outcome.to === 'published') {
    await emitPassportPublished(tenantId, facts);
  } else if (outcome.to === 'recalled') {
    await emitPassportRecalled(tenantId, {
      ...facts,
      severity: outcome.recall?.severity ?? null,
      reason: outcome.recall?.reason ?? null,
      instructions: outcome.recall?.instructions ?? null,
      recalledAt: outcome.recall?.at ?? null,
    });
  }

  return { from: outcome.from, to: outcome.to, dppId: outcome.dppId };
}

async function runTransition(session: Session, tenantId: string, input: TransitionInput) {
  return db.transaction(async (tx) => {
    const [passport] = await tx
      .select()
      .from(passports)
      .where(
        and(
          eq(passports.tenantId, tenantId),
          eq(passports.dppId, input.dppId),
          isNull(passports.deletedAt),
        ),
      )
      .limit(1)
      .for('update');

    if (!passport) throw notFound('That passport does not exist.');

    const from = passport.status as PassportStatus;
    const transition = findTransition(from, input.to, session.role);
    if (!transition) {
      throw forbidden(
        `You cannot move a passport from ${from.replace(/_/g, ' ')} to ${input.to.replace(/_/g, ' ')}.`,
      );
    }

    const reason = input.reason?.trim();
    if (transition.requiresReason && !reason) {
      throw badRequest('This change needs a written reason. It is recorded in the audit trail.');
    }

    if (transition.validates) {
      const [version] = await tx
        .select({ payload: passportVersions.payload })
        .from(passportVersions)
        .where(
          and(
            eq(passportVersions.passportId, passport.id),
            eq(passportVersions.version, passport.currentVersion),
          ),
        )
        .limit(1);

      const check = validateForPublication(version?.payload ?? {});
      if (!check.success) {
        const errors: Record<string, string[]> = {};
        for (const issue of check.error.issues) {
          (errors[issue.path.join('.') || '_'] ??= []).push(issue.message);
        }
        throw unprocessable(
          'This passport is not ready. Fix the items below and try again.',
          errors,
        );
      }
    }

    if (input.to === 'recalled' && !input.recall?.instructions?.trim()) {
      throw badRequest('A recall must tell people what to do with the product they own.');
    }

    const now = new Date();
    const patch: Partial<typeof passports.$inferInsert> = {
      status: input.to,
      updatedAt: now,
    };

    if (input.to === 'published') {
      patch.publishedVersion = passport.currentVersion;
      patch.publishedAt = passport.publishedAt ?? now;
      patch.placedOnMarketAt = passport.placedOnMarketAt ?? now;
    }
    if (input.to === 'recalled') {
      patch.recallReason = reason ?? null;
      patch.recallSeverity = input.recall?.severity ?? 'medium';
      patch.recallInstructions = input.recall?.instructions ?? null;
      patch.recalledAt = now;
    }

    await tx.update(passports).set(patch).where(eq(passports.id, passport.id));

    await tx.insert(passportStatusHistory).values({
      passportId: passport.id,
      fromStatus: from,
      toStatus: input.to,
      reason: reason ?? null,
      actorId: session.userId,
    });

    await recordAudit({
      tenantId,
      actorId: session.userId,
      actorLabel: session.name,
      action: auditActionFor(input.to),
      subjectType: 'passport',
      subjectId: passport.id,
      metadata: {
        dppId: passport.dppId,
        from,
        to: input.to,
        reason: reason ?? null,
        version: passport.currentVersion,
      },
    });

    return {
      from,
      to: input.to,
      dppId: passport.dppId,
      version: passport.currentVersion,
      dataHash: null as string | null,
      recall:
        input.to === 'recalled'
          ? {
              severity: patch.recallSeverity ?? null,
              reason: reason ?? null,
              instructions: input.recall?.instructions ?? null,
              at: now.toISOString(),
            }
          : null,
    };
  });
}

function auditActionFor(to: PassportStatus) {
  switch (to) {
    case 'published':
      return 'passport.published' as const;
    case 'recalled':
      return 'passport.recalled' as const;
    case 'archived':
      return 'passport.archived' as const;
    case 'withdrawn':
    case 'suspended':
      return 'passport.unpublished' as const;
    default:
      return 'passport.updated' as const;
  }
}

function requireTenant(session: Session): string {
  if (!session.tenantId) {
    throw forbidden('Your account is not attached to a workspace.');
  }
  return session.tenantId;
}
