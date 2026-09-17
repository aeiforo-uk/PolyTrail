import type { NextRequest } from 'next/server';
import { withApiKey, apiJson } from '@/lib/api-keys';
import type { ApiV1Context } from '@/lib/api-keys/handler';
import { issueCredentialBodySchema, operationGuard } from '@/lib/export/openapi';
import { issuePassportCredential, listPassportCredentials } from '@/lib/credentials';
import { findPassport } from '../../../shared';

export const dynamic = 'force-dynamic';

type Params = { dppId: string };

export const GET = withApiKey<Params>(operationGuard('listCredentials'), async (_req, ctx) => {
  const { dppId } = await ctx.params;
  const passport = await findPassport(ctx.principal.tenantId, dppId);
  const rows = await listPassportCredentials(ctx.principal.tenantId, passport.id);

  return apiJson({
    dppId: passport.dppId,
    data: rows.map((row) => ({
      ...row,
      validFrom: row.validFrom?.toISOString() ?? null,
      validUntil: row.validUntil?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

export const POST = withApiKey<Params>(
  operationGuard('issueCredential'),
  async (req: NextRequest, ctx: ApiV1Context<Params>) => {
    const { dppId } = await ctx.params;
    const body = issueCredentialBodySchema.parse(await req.json().catch(() => ({})));

    const passport = await findPassport(ctx.principal.tenantId, dppId);
    const issued = await issuePassportCredential(ctx.principal.tenantId, passport.id, {
      ...(body.version === undefined ? {} : { version: body.version }),
      ...(body.validForDays === undefined ? {} : { validForDays: body.validForDays }),
      actor: {
        userId: ctx.principal.actor?.userId ?? null,
        label: ctx.principal.actor
          ? `${ctx.principal.actor.name} (via API key “${ctx.principal.keyName}”)`
          : `API key “${ctx.principal.keyName}”`,
      },
    });

    return apiJson(
      {
        id: issued.id,
        dppId: passport.dppId,
        version: issued.version,
        mechanism: issued.mechanism,
        issuerDid: issued.issuerDid,
        subject: issued.subject,
        documentHash: issued.documentHash,
        validFrom: issued.validFrom.toISOString(),
        validUntil: issued.validUntil?.toISOString() ?? null,
        document: issued.document,
      },
      { status: 201 },
    );
  },
);
