import { NextResponse } from 'next/server';
import { withApiKey } from '@/lib/api-keys';
import { operationGuard } from '@/lib/export/openapi';
import { passportToJsonLd } from '@/lib/export/json-ld';
import { resolvePublicPassport } from '@/lib/passport/public';
import { notFound } from '@/lib/api/errors';
import { findPassport } from '../../../shared';

export const dynamic = 'force-dynamic';

type Params = { dppId: string };

/**
 * The public-tier projection as linked data.
 *
 * Public tier even though the caller owns the passport, because the question
 * this endpoint answers is "what will a retailer's system see when it reads
 * this?" — and a preview that shows the workspace more than the world gets is
 * not a preview.
 */
export const GET = withApiKey<Params>(operationGuard('getPassportJsonLd'), async (_req, ctx) => {
  const { dppId } = await ctx.params;

  // Tenant check first, so an unpublished passport belonging to someone else
  // and an unpublished passport belonging to nobody are indistinguishable.
  const owned = await findPassport(ctx.principal.tenantId, dppId);
  const passport = await resolvePublicPassport(owned.dppId, 'public');

  if (!passport) {
    throw notFound(
      'This passport has not been published, so it has no public projection yet. Publish it first.',
    );
  }

  return NextResponse.json(passportToJsonLd(passport), {
    headers: { 'Content-Type': 'application/ld+json' },
  });
});
