import { NextResponse } from 'next/server';
import { withApiKey } from '@/lib/api-keys';
import { operationGuard } from '@/lib/export/openapi';
import { buildEvidencePack } from '@/lib/export/evidence-pack';
import { attachment } from '@/lib/export/csv';
import { recordAuditSafe } from '@/lib/audit/record';

export const dynamic = 'force-dynamic';

type Params = { dppId: string };

/**
 * The artefact a market-surveillance authority actually asks for.
 *
 * Served as a download rather than a JSON body, because it is evidence: it gets
 * saved, attached to an email and hashed by the recipient. Generating it is
 * audited — being asked for the complete record of a product is itself a fact
 * worth having in the chain.
 */
export const GET = withApiKey<Params>(operationGuard('getEvidencePack'), async (_req, ctx) => {
  const { dppId } = await ctx.params;
  const pack = await buildEvidencePack(ctx.principal.tenantId, dppId);

  await recordAuditSafe({
    tenantId: ctx.principal.tenantId,
    actorId: ctx.principal.actor?.userId ?? null,
    actorLabel: ctx.principal.actor
      ? `${ctx.principal.actor.name} (via API key “${ctx.principal.keyName}”)`
      : `API key “${ctx.principal.keyName}”`,
    action: 'export.generated',
    subjectType: 'passport',
    subjectId: dppId,
    metadata: { export: 'evidence_pack', bundleHash: pack.manifest.bundleHash },
  });

  return NextResponse.json(pack, {
    headers: {
      'Content-Disposition': attachment(`polytrail-evidence-${pack.passport.dppId}.json`),
      'Content-Type': 'application/json',
    },
  });
});
