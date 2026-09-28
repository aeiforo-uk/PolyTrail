import { notFound, redirect } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { passports, tenants } from '@/lib/db/schema';

/**
 * `/p/demo` — a stable address for "show me a passport".
 *
 * The landing page's second button pointed here and 404'd, because `demo` is
 * not a passport identifier and the resolver is right to refuse one it does
 * not recognise. Hard-coding a seeded identifier instead would break on the
 * next reseed, since every seed mints fresh random ids.
 *
 * So this resolves at request time to whatever is currently published, and
 * redirects. A redirect rather than rendering the passport here: the reader
 * ends up on the passport's real, shareable URL, which is the one printed on
 * a label, and there is exactly one page that knows how to render a passport.
 *
 * **It is scoped to a designated demo workspace, and that is the load-bearing
 * part.** "The most recently published passport" across a shared-schema
 * multi-tenant database would hand a stranger a real customer's product the
 * moment one existed. Naming the workspace means an install with no such
 * workspace — a real production deployment — answers 404, which is the
 * correct answer to "show me your demo" when there isn't one.
 *
 * `demo` cannot collide with a real identifier: those are 16 characters from
 * a Crockford alphabet, and this is four lowercase letters.
 */

export const dynamic = 'force-dynamic';

/** The seed's demo workspace. Override to point at a different one. */
const DEMO_TENANT_SLUG = process.env.DEMO_TENANT_SLUG ?? 'meridian';

export default async function DemoPassportPage() {
  const [row] = await db
    .select({ dppId: passports.dppId })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .where(
      and(
        eq(tenants.slug, DEMO_TENANT_SLUG),
        eq(passports.status, 'published'),
        isNull(passports.deletedAt),
      ),
    )
    /*
     * Most complete first, not most recent.
     *
     * A demo should open on the passport that shows what the product can do.
     * Ordering by publication date lands on whichever item happened to go out
     * last — in the seed, a beanie with a thin payload and no history — while
     * the fully populated flagship, the one with a composition, a mapped
     * chain, a footprint and a repair history, sits one row down. Recency is
     * the tie-break, not the ranking.
     */
    .orderBy(desc(passports.completeness), desc(passports.publishedAt))
    .limit(1);

  if (!row) notFound();

  redirect(`/p/${row.dppId}`);
}
