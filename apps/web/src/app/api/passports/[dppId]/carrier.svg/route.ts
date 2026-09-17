import { withAuth } from '@/lib/api/handler';
import { notFound } from '@/lib/api/errors';
import { getPassportDetail } from '@/app/console/queries';
import { carrierSvg, carrierTarget } from '@/lib/passport/qr';

/**
 * The passport's data carrier, as vector artwork.
 *
 * SVG rather than PNG because this goes to a label house: it has to print on a
 * woven care label at whatever size the garment allows, and a raster code
 * resampled up is a code that fails to scan.
 *
 * Authenticated, and available before publication. A brand commits artwork to
 * production weeks before a passport goes live, so gating this on `published`
 * would mean the carrier could never be printed in time — and the URI it
 * encodes is fixed from the moment the passport is created, which is the
 * property that makes printing early safe.
 */
export const GET = withAuth<{ dppId: string }>(
  { roles: ['BRAND_ADMIN', 'COMPLIANCE_OFFICER', 'PRODUCT_MANAGER'] },
  async (_request, { session, params }) => {
    const { dppId } = await params;
    const detail = await getPassportDetail(session.tenantId!, dppId);
    if (!detail) throw notFound('No passport with that identifier in this workspace.');

    const target = carrierTarget({
      dppId,
      gtin: detail.passport.gtin,
      batchNumber: detail.passport.batchNumber,
      serialNumber: detail.passport.serialNumber,
    });

    const svg = await carrierSvg(target.uri, { margin: 2 });

    return new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'content-disposition': `attachment; filename="polytrail-${dppId}.svg"`,
        // The URI is fixed for the life of the passport, but a passport can be
        // recalled, so this revalidates rather than caching outright.
        'cache-control': 'private, max-age=0, must-revalidate',
      },
    });
  },
);
