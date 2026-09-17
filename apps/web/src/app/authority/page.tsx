import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, FileSearch, SearchX } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { Legend, StackedBar } from '@/components/viz/bar-chart';
import { STATUS_ORDER, statusTone } from '@/components/viz/status-colour';
import { STATUS_LABELS } from '@/lib/passport/state';
import { formatDppId } from '@/lib/passport/identifier';
import { SearchForm } from './search-form';
import { searchPassports, type AuthoritySearchHit } from './queries';
import { recordAuthoritySearch } from './audit';

export const metadata = { title: 'Market surveillance' };
export const dynamic = 'force-dynamic';

/** How precisely the query found a row — and so, how far up the list it belongs. */
const MATCH: Record<
  AuthoritySearchHit['matchedOn'],
  { rank: number; label: string; tone: 'accent' | 'neutral' }
> = {
  identifier: { rank: 0, label: 'Exact identifier', tone: 'accent' },
  gtin: { rank: 1, label: 'GTIN', tone: 'accent' },
  sku: { rank: 2, label: 'SKU', tone: 'neutral' },
  brand: { rank: 3, label: 'Brand name', tone: 'neutral' },
};

/** What an inspector opens first, whatever they searched for. */
const URGENT: Record<string, number> = { recalled: 0, suspended: 1, withdrawn: 2 };

export default async function AuthorityHome({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/authority');

  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const results = query ? await searchPassports(query) : [];

  if (results.length > 0) {
    // Recorded once per brand matched, not once per row, so a broad search does
    // not spam one brand's chain with fifty identical entries.
    await recordAuthoritySearch(session, results.map((hit) => hit.tenantId), query);
  }

  // Precision first, then urgency, then recency: an exact identifier hit is the
  // garment in the inspector's hand, and a recalled product is the one they
  // came for.
  const ordered = [...results].sort(
    (a, b) =>
      MATCH[a.matchedOn].rank - MATCH[b.matchedOn].rank ||
      (URGENT[a.status] ?? 9) - (URGENT[b.status] ?? 9) ||
      (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );

  const brands = new Set(results.map((hit) => hit.tenantId)).size;
  const published = results.filter((hit) => hit.status === 'published').length;
  const flagged = results.filter((hit) => hit.status in URGENT).length;
  const filed = results.filter((hit) => hit.registryId).length;

  const distribution = STATUS_ORDER.map((status) => ({
    key: status,
    label: STATUS_LABELS[status] ?? status,
    value: results.filter((hit) => hit.status === status).length,
    colour: statusTone(status),
  })).filter((segment) => segment.value > 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="display text-3xl">Look up a passport</h1>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">
          You read at authority tier, so you see the complete record — including everything a brand
          withholds from the public. Each field is labelled with the tier it sits in, so you can
          tell what a consumer would have seen.
        </p>
      </div>

      <Suspense fallback={null}>
        <SearchForm />
      </Suspense>

      {query === '' ? (
        <EmptyState
          icon={FileSearch}
          title="Search the register of published passports"
          description="Every textile passport placed on the Union market is readable here at authority tier, across all brands. Scan or type the identifier from the care label; the barcode, the brand name or the supplier's SKU all work when the label has worn off."
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`Nothing matches “${query}”`}
          description="Check the identifier for a transposed character — I, L, O and U are never used, so those are 1, 1, 0 and V. Passports that were deleted do not appear here; a brand that has never filed one will return nothing at all, which is itself worth noting."
        />
      ) : (
        <section aria-label="Search results" className="flex flex-col gap-5">
          <StatRow>
            <StatTile
              label="Matches"
              value={results.length}
              context={`across ${brands} ${brands === 1 ? 'brand' : 'brands'}`}
              tone="accent"
            />
            <StatTile
              label="On the market"
              value={published}
              context={`of ${results.length} ${results.length === 1 ? 'record' : 'records'}`}
            />
            <StatTile
              label="Recalled or suspended"
              value={flagged}
              context={flagged === 0 ? 'none in this set' : 'listed first below'}
              tone={flagged > 0 ? 'critical' : 'neutral'}
            />
            <StatTile
              label="Filed with the Registry"
              value={filed}
              context={
                filed === results.length
                  ? 'all of them'
                  : `${results.length - filed} not filed — textile registration is not yet mandatory`
              }
            />
          </StatRow>

          {distribution.length > 1 ? (
            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Where these stand</h2>
              <div className="mt-3.5">
                <StackedBar
                  ariaLabel={distribution.map((s) => `${s.value} ${s.label}`).join(', ')}
                  segments={distribution}
                />
                <Legend
                  className="mt-3"
                  items={distribution.map((segment) => ({
                    key: segment.key,
                    label: segment.label,
                    value: String(segment.value),
                    colour: segment.colour,
                  }))}
                />
              </div>
            </div>
          ) : null}

          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {ordered.map((hit) => {
              const match = MATCH[hit.matchedOn];
              const urgent = hit.status in URGENT;
              return (
                <li key={hit.dppId}>
                  <Link
                    href={`/authority/${hit.dppId}`}
                    className="flex items-center gap-4 px-4 py-3.5 transition-colors duration-[140ms] hover:bg-surface-sunken motion-reduce:transition-none"
                  >
                    <span
                      aria-hidden
                      className={
                        urgent
                          ? 'h-11 w-0.5 shrink-0 rounded-full bg-critical'
                          : hit.matchedOn === 'identifier' || hit.matchedOn === 'gtin'
                            ? 'h-11 w-0.5 shrink-0 rounded-full bg-accent'
                            : 'h-11 w-0.5 shrink-0 rounded-full bg-line-strong'
                      }
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <span className="truncate text-sm font-medium text-ink">
                          {hit.productName}
                        </span>
                        <span className="text-2xs text-ink-subtle">{hit.scope} level</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-2xs text-ink-subtle">
                        <span className="text-ink-muted">{hit.brandName}</span>
                        <span>{hit.brandCountry}</span>
                        <span className="mono">{formatDppId(hit.dppId)}</span>
                        {hit.gtin ? <span className="mono">GTIN {hit.gtin}</span> : null}
                        {hit.sku ? <span className="mono">SKU {hit.sku}</span> : null}
                      </span>
                    </span>

                    <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                      <Badge tone={match.tone}>{match.label}</Badge>
                      {hit.registryId ? (
                        <span className="mono text-2xs text-ink-subtle">{hit.registryId}</span>
                      ) : (
                        <span className="text-2xs text-ink-subtle">Not filed</span>
                      )}
                    </span>

                    <StatusBadge status={hit.status} />
                    <ArrowRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
