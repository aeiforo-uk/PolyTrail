import QRCode from 'qrcode';
import { buildDigitalLinkUri, validateGtin } from '@/lib/gs1/digital-link';
import { passportUrl } from './identifier';

/**
 * The data carrier for a passport.
 *
 * ESPR requires the passport to be reachable from a carrier on the product, and
 * the JRC textile study assumes that carrier is a printed or woven 2D code. The
 * platform generated none: `qrcode` was in the dependency list, used once, for
 * enrolling an authenticator app.
 *
 * What the code encodes matters more than how it looks. Where the passport has
 * a GTIN it encodes a GS1 Digital Link, because that is the identifier retail
 * and customs already resolve, and a code that only works inside Polytrail is a
 * lock-in dressed as a feature. Without a GTIN it falls back to the passport's
 * own canonical URL, which always resolves.
 */

export interface CarrierTarget {
  /** What a scanner will actually open. */
  uri: string;
  /** `gs1` when the code carries a Digital Link, `native` for the fallback. */
  scheme: 'gs1' | 'native';
}

export function carrierTarget(input: {
  dppId: string;
  gtin?: string | null;
  batchNumber?: string | null;
  serialNumber?: string | null;
  resolverDomain?: string | null;
}): CarrierTarget {
  const { dppId, gtin, batchNumber, serialNumber } = input;
  const domain = input.resolverDomain ?? process.env.NEXT_PUBLIC_RESOLVER_DOMAIN;

  if (gtin && domain && validateGtin(gtin).valid) {
    try {
      return {
        scheme: 'gs1',
        uri: buildDigitalLinkUri(
          {
            gtin,
            batchNumber: batchNumber ?? undefined,
            serialNumber: serialNumber ?? undefined,
          },
          { resolverDomain: domain },
        ),
      };
    } catch {
      // A malformed batch or serial should degrade to a working code, never
      // to a 500 on the page that is supposed to show the carrier.
    }
  }
  return { scheme: 'native', uri: passportUrl(dppId) };
}

/**
 * Error correction is fixed at Q (25%).
 *
 * The lower levels produce a sparser, prettier code, and they are the wrong
 * choice here: this gets woven into a care label or printed on a hangtag, then
 * washed, folded and abraded for the life of the garment. Q is the level GS1
 * recommends for exactly that, and the cost is a slightly denser grid.
 */
const ERROR_CORRECTION = 'Q' as const;

/**
 * An SVG string, not a data URI and not a canvas.
 *
 * SVG prints at any size without resampling — a label house needs vector
 * artwork — and it can be inlined into a server-rendered page, so the public
 * passport shows its own code with no client JavaScript.
 */
export async function carrierSvg(uri: string, options?: { margin?: number }): Promise<string> {
  return QRCode.toString(uri, {
    type: 'svg',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: options?.margin ?? 0,
    // Painted by CSS `currentColor` at the call site instead, so one asset is
    // correct in both themes. `toString` still needs concrete values.
    color: { dark: '#000000', light: '#00000000' },
  });
}

/**
 * The bare module grid, for callers that want to draw the code themselves —
 * rounded modules, a knocked-out centre, a woven-label preview. Returns a
 * square matrix of booleans, `true` meaning a dark module.
 */
export function carrierMatrix(uri: string): boolean[][] {
  const qr = QRCode.create(uri, { errorCorrectionLevel: ERROR_CORRECTION });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x += 1) row.push(data[y * size + x] === 1);
    rows.push(row);
  }
  return rows;
}
