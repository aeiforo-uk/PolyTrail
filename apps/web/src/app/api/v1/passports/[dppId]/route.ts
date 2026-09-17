import type { NextRequest } from 'next/server';
import { withApiKey, apiJson, actingSession } from '@/lib/api-keys';
import { requireScopes } from '@/lib/api-keys/authenticate';
import type { ApiV1Context } from '@/lib/api-keys/handler';
import { operationGuard, updatePassportBodySchema } from '@/lib/export/openapi';
import { savePassportPayload, transitionPassport } from '@/lib/passport/service';
import type { PassportStatus } from '@/lib/passport/state';
import {
  emitPassportPublished,
  emitPassportRecalled,
  emitPassportUpdated,
} from '@/lib/webhooks/passport-events';
import { findPassport, findPayload } from '../../shared';

export const dynamic = 'force-dynamic';

type Params = { dppId: string };

export const GET = withApiKey<Params>(operationGuard('getPassport'), async (_req, ctx) => {
  const { dppId } = await ctx.params;
  const passport = await findPassport(ctx.principal.tenantId, dppId);
  const payload = await findPayload(passport.id, passport.version);
  return apiJson({ ...passport, payload });
});

export const PATCH = withApiKey<Params>(
  operationGuard('updatePassport'),
  async (req: NextRequest, ctx: ApiV1Context<Params>) => {
    const { dppId } = await ctx.params;
    const body = updatePassportBodySchema.parse(await req.json());
    const tenantId = ctx.principal.tenantId;

    const before = await findPassport(tenantId, dppId);
    const session = actingSession(ctx.principal);

    if (body.payload) {
      const current = await findPayload(before.id, before.version);
      // Section-level merge: a client sending `{care: {...}}` replaces care and
      // leaves the rest alone. Documented in the contract, because a merge
      // strategy a caller has to discover by experiment is a bug waiting.
      const merged = { ...current, ...body.payload };
      await savePassportPayload(session, {
        dppId: before.dppId,
        payload: merged,
        ...(body.changeReason ? { changeReason: body.changeReason } : {}),
      });
    }

    if (body.status) {
      // Publishing is a separate scope from writing. An integration that pushes
      // product data all day should not be able to put an unreviewed passport
      // in front of a consumer because someone ticked one box.
      requireScopes(ctx.principal, ['passports:publish']);
      await transitionPassport(session, {
        dppId: before.dppId,
        to: body.status as PassportStatus,
        ...(body.statusReason ? { reason: body.statusReason } : {}),
        ...(body.recall ? { recall: body.recall } : {}),
      });
    }

    const after = await findPassport(tenantId, dppId);
    const payload = await findPayload(after.id, after.version);

    await notifySubscribers(tenantId, before.status, after, {
      reason: body.statusReason ?? null,
      severity: body.recall?.severity ?? null,
      instructions: body.recall?.instructions ?? null,
    });

    return apiJson({ ...after, payload });
  },
);

/**
 * Fire whichever event this change was.
 *
 * A transition into `published` is a publication; a new version on a passport
 * that was already public is an update, because the content behind a URL
 * consumers already hold has changed. A new version on a draft is neither, and
 * subscribers are not told about it.
 */
async function notifySubscribers(
  tenantId: string,
  previousStatus: string,
  after: Awaited<ReturnType<typeof findPassport>>,
  recall: { reason: string | null; severity: string | null; instructions: string | null },
) {
  const facts = {
    dppId: after.dppId,
    version: after.publishedVersion ?? after.version,
    dataHash: after.dataHash,
    status: after.status,
    productName: after.productName,
    passportUrl: after.passportUrl,
  };

  if (after.status === 'recalled' && previousStatus !== 'recalled') {
    await emitPassportRecalled(tenantId, {
      ...facts,
      ...recall,
      recalledAt: new Date().toISOString(),
    });
    return;
  }

  if (after.status === 'published' && previousStatus !== 'published') {
    await emitPassportPublished(tenantId, facts);
    return;
  }

  if (after.publishedVersion !== null && after.status === previousStatus) {
    await emitPassportUpdated(tenantId, facts);
  }
}
