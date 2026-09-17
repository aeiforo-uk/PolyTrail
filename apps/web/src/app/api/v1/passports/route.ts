import type { NextRequest } from 'next/server';
import { withApiKey, apiJson, actingSession } from '@/lib/api-keys';
import type { ApiV1Context } from '@/lib/api-keys/handler';
import {
  createPassportBodySchema,
  listPassportsQuerySchema,
  operationGuard,
} from '@/lib/export/openapi';
import { createPassport } from '@/lib/passport/service';
import { findPassport, listPassportsPage } from '../shared';

export const dynamic = 'force-dynamic';

export const GET = withApiKey(operationGuard('listPassports'), async (req, ctx) => {
  const query = listPassportsQuerySchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );

  const page = await listPassportsPage(ctx.principal.tenantId, {
    ...(query.status ? { status: query.status } : {}),
    ...(query.updatedSince ? { updatedSince: new Date(query.updatedSince) } : {}),
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });

  return apiJson({
    data: page.data,
    page: { limit: query.limit, nextCursor: page.nextCursor },
  });
});

export const POST = withApiKey(
  operationGuard('createPassport'),
  async (req: NextRequest, ctx: ApiV1Context) => {
    const body = createPassportBodySchema.parse(await req.json());

    // Straight through the service layer the console uses. Quota, validation
    // and the audit entry are all enforced in one place, so an integration
    // cannot create a passport the console would have refused.
    const passport = await createPassport(actingSession(ctx.principal), body);
    const resource = await findPassport(ctx.principal.tenantId, passport.dppId);

    return apiJson(resource, {
      status: 201,
      headers: { Location: `/api/v1/passports/${passport.dppId}` },
    });
  },
);
