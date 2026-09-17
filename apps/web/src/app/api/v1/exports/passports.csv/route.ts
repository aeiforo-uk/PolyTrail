import { withApiKey } from '@/lib/api-keys';
import { exportQuerySchema, operationGuard } from '@/lib/export/openapi';
import { exportPassportsCsv } from '@/lib/export/reports';
import { attachment } from '@/lib/export/csv';
import { recordAuditSafe } from '@/lib/audit/record';

export const dynamic = 'force-dynamic';

export const GET = withApiKey(operationGuard('exportPassportsCsv'), async (req, ctx) => {
  const query = exportQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));

  const csv = await exportPassportsCsv(ctx.principal.tenantId, {
    ...(query.status ? { status: query.status } : {}),
    ...(query.updatedSince ? { updatedSince: new Date(query.updatedSince) } : {}),
    limit: query.limit,
  });

  await recordAuditSafe({
    tenantId: ctx.principal.tenantId,
    actorId: ctx.principal.actor?.userId ?? null,
    actorLabel: `API key “${ctx.principal.keyName}”`,
    action: 'export.generated',
    subjectType: 'tenant',
    subjectId: ctx.principal.tenantId,
    metadata: { export: 'passports_csv', status: query.status ?? null },
  });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': attachment(`polytrail-passports-${today()}.csv`),
    },
  });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
