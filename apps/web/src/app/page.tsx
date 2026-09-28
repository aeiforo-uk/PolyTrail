import { carrierSvg } from '@/lib/passport/qr';
import { appUrlFor } from '@/lib/app-url';
import { CoverFilm } from './cover-film';

/**
 * The cover page is a film: one viewport, no scroll, a looping animation of
 * a garment's life from fibre to recycling with the passport filling up as
 * each actor writes to it. See `cover-film.tsx` for the choreography.
 *
 * This wrapper stays a server component so the QR is generated here and
 * handed over as markup. It is real — it encodes `/p/demo`, so scanning the
 * screen opens the demo passport.
 */
/**
 * Prerendered at build, served from the edge.
 *
 * Without this the page was rendered on a serverless function for every
 * visitor: the root layout calls `getLocale()`, whose request config reads
 * `cookies()` and `headers()`, and that forces the whole tree dynamic — for a
 * page that uses no locale at all. `force-static` makes those calls return
 * empty values, so next-intl falls through to the default locale at build
 * time and the result is a cached HTML file rather than a cold start.
 */
export const dynamic = 'force-static';

export default async function HomePage() {
  const qrSvg = await carrierSvg(appUrlFor('/p/demo'), { margin: 1 });
  return <CoverFilm qrSvg={qrSvg} />;
}
