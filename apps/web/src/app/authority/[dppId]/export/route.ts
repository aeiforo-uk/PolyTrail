import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { canEnter } from '@/lib/auth/personas';
import { forbidden, notFound, unauthorized } from '@/lib/api/errors';
import { canonicalHash } from '@/lib/crypto/canonical';
import { normalizeDppId } from '@/lib/passport/identifier';
import { REGULATED_TIER_LABELS } from '@/lib/tier/types';
import { loadEvidenceRecord } from '../../queries';
import { recordAuthorityExport } from '../../audit';

/**
 * One-click export of the whole record.
 *
 * JSON rather than PDF, because the recipient is a case file and an analyst's
 * tooling, not a printer. It carries a hash of its own contents so the file can
 * be shown later to be the file that was exported, which is the property that
 * makes it evidence rather than a screenshot.
 *
 * The export is audited before the bytes are produced, and that write is not
 * best-effort: taking a copy of a brand's complete record away is exactly the
 * event they must be able to see.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dppId: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized().toResponse();
  if (!canEnter(session.role, '/authority')) {
    return forbidden('This export is for market-surveillance authorities.').toResponse();
  }

  const { dppId } = await params;
  const record = await loadEvidenceRecord(dppId);
  if (!record) return notFound('No passport exists at that identifier.').toResponse();

  await recordAuthorityExport({ session, tenantId: record.tenantId, dppId: record.dppId });

  const body = {
    exportedAt: new Date().toISOString(),
    exportedBy: { name: session.name, email: session.email, role: session.role },
    tier: 'authority',
    // Spelled out rather than implied, so the file explains its own tiering to
    // whoever opens it in six months without this product in front of them.
    regulatedTierLabels: REGULATED_TIER_LABELS,
    record,
  };

  const payloadHash = canonicalHash(body);

  return NextResponse.json(
    { ...body, exportHash: payloadHash },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="polytrail-record-${normalizeDppId(dppId)}.json"`,
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
