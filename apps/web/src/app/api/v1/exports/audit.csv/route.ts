import { withApiKey } from '@/lib/api-keys';
import { exportQuerySchema, operationGuard } from '@/lib/export/openapi';
import { exportAuditCsv } from '@/lib/export/reports';
import { attachment } from '@/lib/export/csv';
import { recordAuditSafe } from '@/lib/audit/record';

export const dynamic = 'force-dynamic';

/**
 * The audit chain as CSV, oldest first.
 *
 * Both hash columns are included so the chain can be re-verified from the file
 * alone. An audit export that omits them is a list of assertions about the
 * past; with them it is evidence, because anyone can recompute the links and
 * see whether a row was removed.
 */
export const GET = withApiKey(operationGuard('exportAuditCsv'), async (req, ctx) => {
  const query = exportQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  const csv = await exportAuditCsv(ctx.principal.tenantId, query.limit);

  // Recorded after the read, so this export does not appear in its own output
  // and leave the reader wondering whether the file is complete.
  await recordAuditSafe({
    tenantId: ctx.principal.tenantId,
    actorId: ctx.principal.actor?.userId ?? null,
    actorLabel: `API key “${ctx.principal.keyName}”`,
    action: 'export.generated',
    subjectType: 'tenant',
    subjectId: ctx.principal.tenantId,
    metadata: { export: 'audit_csv', limit: query.limit },
  });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': attachment(`polytrail-audit-${new Date().toISOString().slice(0, 10)}.csv`),
    },
  });
});
