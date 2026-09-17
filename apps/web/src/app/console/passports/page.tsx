import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  ExternalLink,
  FileText,
  FilterX,
  Plus,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getWeeklyActivity } from '../queries';
import { getWeeklyPublications, listCatalogue, type CatalogueRow } from './queries';
import { ChipCount, ChipDot, filterChip } from '@/components/ui/filter-chip';
import { ChainDepth, DEPTH_RANK } from './chain-depth';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { Meter } from '@/components/viz/meter';
import { STATUS_ORDER, statusTone } from '@/components/viz/status-colour';
import { STATUS_LABELS, type PassportStatus } from '@/lib/passport/state';
import { formatDppId } from '@/lib/passport/identifier';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Passports' };

/**
 * The catalogue.
 *
 * This is the screen a product manager lives in, so it is built around the two
 * questions they actually arrive with: *which of these is not finished*, and
 * *which of these is waiting on me*. Both are answered before the table — by
 * counts at the top and by filter chips that are themselves counts — and then
 * again inside it, by a completeness ring per row and a severity rail on the
 * rows that need a decision.
 *
 * Every filter and every sort is a search parameter, which means a filtered
 * view is a URL somebody can paste into a message. No client state: the chips
 * are plain GET forms and the column headers are links.
 */

type SortKey = 'product' | 'status' | 'completeness' | 'chain' | 'updated';
type Direction = 'asc' | 'desc';

const SORT_KEYS: readonly SortKey[] = ['product', 'status', 'completeness', 'chain', 'updated'];

export default async function PassportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  const tenantId = session.tenantId;

  const [rows, weeklyCreated, weeklyPublished] = await Promise.all([
    listCatalogue(tenantId),
    getWeeklyActivity(tenantId),
    getWeeklyPublications(tenantId),
  ]);

  const params = await searchParams;
  const status = single(params.status);
  const gap = single(params.gap) === '1';
  const sort = (SORT_KEYS as readonly string[]).includes(single(params.sort) ?? '')
    ? (single(params.sort) as SortKey)
    : 'updated';
  const direction: Direction = single(params.dir) === 'asc' ? 'asc' : 'desc';
  const filtered = Boolean(status) || gap;

  // ── The shape of the whole catalogue, which the filters narrow but never
  //    change. Counts on the chips have to come from here, or a chip would
  //    report the size of the view it is already inside.
  const total = rows.length;
  const published = rows.filter((row) => row.status === 'published').length;
  const needingWork = rows.filter((row) => row.missingRequired > 0);
  const blankRequired = rows.reduce((sum, row) => sum + row.missingRequired, 0);
  const strong = rows.filter((row) => row.completeness >= 90).length;
  const average =
    total === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.completeness, 0) / total);

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const statusChips = STATUS_ORDER.filter((key) => (counts.get(key) ?? 0) > 0);

  const visible = sortRows(
    rows.filter(
      (row) => (!status || row.status === status) && (!gap || row.missingRequired > 0),
    ),
    sort,
    direction,
  );

  const createdDelta = deltaOf(weeklyCreated);
  const publishedShare = total === 0 ? 0 : Math.round((published / total) * 100);

  return (
    <>
      <PageHeader
        title="Passports"
        description={
          total === 0
            ? 'A passport is the public record of one product — what it is made of, where it was made, and how to look after it.'
            : `${total} ${total === 1 ? 'passport' : 'passports'} · ${published} published · ${needingWork.length} still missing something required.`
        }
        actions={
          <Button asChild>
            <Link href="/console/passports/new">
              <Plus className="size-4" aria-hidden />
              New passport
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-8 py-8">
        <StatRow>
          <StatTile
            label="Passports"
            value={total}
            context={`${total - published} not yet public`}
            trend={weeklyCreated}
            deltaPercent={createdDelta}
            tone="accent"
          />
          <StatTile
            label="Published"
            value={published}
            context={`${publishedShare}% of the catalogue`}
            trend={weeklyPublished}
            href="/console/passports?status=published"
            tone={published > 0 ? 'positive' : 'neutral'}
          />
          <StatTile
            label="Needing work"
            value={needingWork.length}
            context={
              blankRequired === 0
                ? 'no required field is blank'
                : `${blankRequired} required ${blankRequired === 1 ? 'field' : 'fields'} blank in total`
            }
            href="/console/passports?gap=1"
            tone={needingWork.length > 0 ? 'caution' : 'positive'}
          />
          <StatTile
            label="Average completeness"
            value={`${average}%`}
            context={`${strong} of ${total} above 90%`}
            tone={average >= 80 ? 'positive' : average >= 60 ? 'caution' : 'critical'}
          />
        </StatRow>

        {total > 0 ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Two forms, because the two dimensions are independent: picking a
                status must not silently drop the gap filter, and a submit
                button only ever sends its own name and value. */}
            <form method="get" action="/console/passports" className="flex flex-wrap items-center gap-1.5">
              {gap ? <input type="hidden" name="gap" value="1" /> : null}
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={direction} />
              <span className="eyebrow mr-1">Status</span>
              <Chip name="status" value="" active={!status} count={total}>
                All
              </Chip>
              {statusChips.map((key) => (
                <Chip
                  key={key}
                  name="status"
                  value={key}
                  active={status === key}
                  count={counts.get(key) ?? 0}
                  swatch={statusTone(key)}
                >
                  {STATUS_LABELS[key]}
                </Chip>
              ))}
            </form>

            <form method="get" action="/console/passports" className="flex items-center gap-1.5">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={direction} />
              <Chip
                name="gap"
                value={gap ? '' : '1'}
                active={gap}
                count={needingWork.length}
              >
                {/* The chip is neutral and the icon carries the warning, same
                    rule as the badges. When selected it inherits the chip's
                    own ink rather than staying amber on near-black. */}
                <CircleAlert className={cn('size-3', !gap && 'text-caution')} aria-hidden />
                Missing required fields
              </Chip>
            </form>
          </div>
        ) : null}

        {total === 0 ? (
          <EmptyState
            icon={FileText}
            title="No passports yet"
            description="Every product you place on the EU market will need one. Start with a style you already have the composition and care details for — the rest is filled in over time as suppliers answer."
            action={
              <Button asChild>
                <Link href="/console/passports/new">
                  <Plus className="size-4" aria-hidden />
                  Create the first passport
                </Link>
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={FilterX}
            title="Nothing matches this filter"
            description={
              gap && status
                ? `No ${STATUS_LABELS[status as PassportStatus]?.toLowerCase() ?? status} passport is missing a required field.`
                : gap
                  ? 'Every passport has all of its required fields. That is the whole catalogue ready to publish.'
                  : `Nothing in this workspace is ${STATUS_LABELS[status as PassportStatus]?.toLowerCase() ?? status}.`
            }
            action={
              <Button asChild variant="secondary">
                <Link href="/console/passports">Show all passports</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-clip rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
                <tr className="border-b border-line text-ink-subtle">
                  <SortableTh sortKey="product" {...{ sort, direction, status, gap }}>
                    Product
                  </SortableTh>
                  <Th>Identifiers</Th>
                  <SortableTh sortKey="status" {...{ sort, direction, status, gap }}>
                    Status
                  </SortableTh>
                  <SortableTh sortKey="completeness" {...{ sort, direction, status, gap }}>
                    Completeness
                  </SortableTh>
                  <SortableTh sortKey="chain" {...{ sort, direction, status, gap }}>
                    Chain mapped
                  </SortableTh>
                  <SortableTh sortKey="updated" {...{ sort, direction, status, gap }}>
                    Updated
                  </SortableTh>
                  <Th className="text-right">Public</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row) => {
                  const severity = severityOf(row);
                  return (
                    <tr
                      key={row.id}
                      className="group transition-colors duration-[140ms] hover:bg-surface-sunken/60"
                    >
                      <td className="py-3 pr-4 pl-4">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className={cn(
                              'h-8 w-0.5 shrink-0 rounded-full',
                              severity === 'critical'
                                ? 'bg-critical'
                                : severity === 'caution'
                                  ? 'bg-caution'
                                  : severity === 'muted'
                                    ? 'bg-line-strong'
                                    : 'bg-transparent',
                            )}
                          />
                          {/* The garment itself. A catalogue of named rows
                              makes the reader parse text to find a product
                              they would recognise on sight. */}
                          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-sunken">
                            {row.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.imageUrl}
                                alt={row.imageAlt ?? ''}
                                width={36}
                                height={36}
                                loading="lazy"
                                // The garment leans in when the row is hovered.
                                // Transform only, inside a clipped plate, so no
                                // text moves and nothing reflows.
                                className="size-full object-cover transition-transform duration-[220ms] ease-[cubic-bezier(.32,.72,0,1)] group-hover:scale-[1.08]"
                              />
                            ) : (
                              <span className="passport-swatch size-full" aria-hidden />
                            )}
                          </span>
                          <span className="min-w-0">
                            <Link
                              href={`/console/passports/${row.dppId}`}
                              className="block truncate font-medium text-ink transition-colors hover:text-accent"
                            >
                              {row.productName}
                            </Link>
                            <span className="block truncate text-xs text-ink-subtle">
                              {[
                                row.colourName,
                                row.size ? `Size ${row.size}` : null,
                                SCOPE_LABELS[row.scope] ?? null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'No variant details'}
                            </span>
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="mono block text-xs text-ink-muted">
                          {row.styleNumber ?? row.sku ?? '—'}
                        </span>
                        <span className="mono block text-2xs text-ink-subtle">
                          {row.gtin ?? 'no GTIN'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Meter value={row.completeness} size={32} thickness={3.5} />
                          {/* The ring already carries the state in colour, so
                              the sentence beside it does not repeat it. Colour
                              on every row's metadata is what made this table
                              read as muddy rather than as an instrument: the
                              count is emphasised, the words recede. */}
                          <span className="text-xs">
                            {row.missingRequired > 0 ? (
                              <>
                                <span className="font-medium text-ink tabular-nums">
                                  {row.missingRequired}
                                </span>{' '}
                                <span className="text-ink-subtle">
                                  required {row.missingRequired === 1 ? 'field' : 'fields'} left
                                </span>
                              </>
                            ) : (
                              <span className="text-ink-subtle">Nothing required is missing</span>
                            )}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <ChainDepth depth={row.traceabilityDepth} steps={row.supplyChainSteps} />
                      </td>

                      <td className="px-4 py-3">
                        <span className="block text-xs text-ink-muted tabular-nums">
                          {formatDate(row.updatedAt)}
                        </span>
                        <span className="block text-2xs text-ink-subtle tabular-nums">
                          v{row.version}
                          {row.publishedVersion != null && row.publishedVersion !== row.version
                            ? ` · v${row.publishedVersion} public`
                            : ''}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        {row.publishedVersion != null ? (
                          <a
                            href={`/p/${row.dppId}`}
                            target="_blank"
                            rel="noreferrer"
                            // Ink, not accent. An identifier is a fact, not an
                            // action; painting every row's id in the action
                            // colour spends the one saturated colour on the
                            // least urgent thing on the screen. The accent
                            // arrives on hover, where the affordance is.
                            className="mono inline-flex items-center gap-1 text-xs text-ink-muted transition-colors duration-[140ms] hover:text-accent"
                            title={`Open ${formatDppId(row.dppId)} as a shopper sees it`}
                          >
                            {row.dppId}
                            <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-xs text-ink-subtle">Not published</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {visible.length > 0 ? (
          <p className="text-xs text-ink-subtle">
            Showing {visible.length} of {total}
            {filtered ? (
              <>
                {' · '}
                <Link href="/console/passports" className="text-accent hover:underline">
                  clear filters
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  model: 'Model',
  batch: 'Batch',
  item: 'Item',
};

/**
 * A filter chip that is also a count.
 *
 * Submitting rather than linking keeps the whole filter row inside one form,
 * so the parameters it is not changing travel as hidden inputs and a filtered
 * view stays a shareable URL.
 */
function Chip({
  name,
  value,
  active,
  count,
  swatch,
  children,
}: {
  name: string;
  value: string;
  active: boolean;
  count: number;
  swatch?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      aria-pressed={active}
      className={cn('press', filterChip({ state: active ? 'active' : 'idle' }))}
    >
      {swatch ? <ChipDot colour={swatch} /> : null}
      <span className="font-medium">{children}</span>
      <ChipCount value={count} active={active} />
    </button>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      // Tracked micro-caps, not sentence-case body text. A header row set in
      // the same size and case as the data it labels is the single clearest
      // tell of a table nobody designed.
      className={cn(
        'px-4 py-2.5 text-2xs font-medium tracking-[0.06em] whitespace-nowrap uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

function SortableTh({
  sortKey,
  sort,
  direction,
  status,
  gap,
  children,
}: {
  sortKey: SortKey;
  sort: SortKey;
  direction: Direction;
  status?: string;
  gap: boolean;
  children: React.ReactNode;
}) {
  const current = sort === sortKey;
  const next: Direction = current && direction === 'desc' ? 'asc' : 'desc';

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (gap) params.set('gap', '1');
  params.set('sort', sortKey);
  params.set('dir', next);

  const Icon = direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={current ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-4 py-2.5 text-2xs font-medium tracking-[0.06em] whitespace-nowrap uppercase"
    >
      <Link
        href={`/console/passports?${params.toString()}`}
        className={cn(
          'inline-flex items-center gap-1 transition-colors duration-[140ms] hover:text-ink',
          current && 'text-ink',
        )}
      >
        {children}
        {current ? <Icon className="size-3" aria-hidden /> : null}
      </Link>
    </th>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function single(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

/**
 * Which rows are asking for something.
 *
 * Deliberately narrow: a rail on every row is a rail on no row. A draft that
 * is simply unfinished is not competing for attention with a live passport
 * that has been suspended.
 */
function severityOf(row: CatalogueRow): 'critical' | 'caution' | 'muted' | 'none' {
  // Red is reserved for a passport the public can already read and should not
  // be reading. Everything else is a queue, and a queue is not an emergency.
  if (row.status === 'recalled' || row.status === 'suspended') return 'critical';
  if (row.status === 'in_review' || row.status === 'changes_requested') return 'caution';
  if (row.status === 'approved') return 'muted';
  return 'none';
}

function sortRows(rows: CatalogueRow[], key: SortKey, direction: Direction): CatalogueRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const pipeline = (status: string) => {
    const index = (STATUS_ORDER as readonly string[]).indexOf(status);
    return index === -1 ? STATUS_ORDER.length : index;
  };

  return [...rows].sort((a, b) => {
    switch (key) {
      case 'product':
        return sign * a.productName.localeCompare(b.productName, 'en-GB');
      case 'status':
        return sign * (pipeline(a.status) - pipeline(b.status));
      case 'completeness':
        return sign * (a.completeness - b.completeness);
      case 'chain':
        return (
          sign *
          ((a.traceabilityDepth ? (DEPTH_RANK[a.traceabilityDepth] ?? 0) : 0) -
            (b.traceabilityDepth ? (DEPTH_RANK[b.traceabilityDepth] ?? 0) : 0))
        );
      default:
        return sign * (a.updatedAt.getTime() - b.updatedAt.getTime());
    }
  });
}

/** Week-on-week change, or nothing when last week gives no honest baseline. */
function deltaOf(series: number[]): number | undefined {
  const previous = series.at(-2) ?? 0;
  const latest = series.at(-1) ?? 0;
  if (previous === 0) return undefined;
  return ((latest - previous) / previous) * 100;
}

function formatDate(value: Date): string {
  const now = new Date();
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: value.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
