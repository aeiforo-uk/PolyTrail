import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, CircleAlert, ClipboardCheck } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { BarChart, Legend, StackedBar } from '@/components/viz/bar-chart';
import { Meter } from '@/components/viz/meter';
import { rampStep, seriesColour } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';
import { QUEUE_TABS, listQueue, queueCounts, tabFor, type QueueRow } from './queries';
import { AGE_BANDS, bandFor, hoursSince, waitSeverity, waitedFor } from './format';

export const metadata = { title: 'Review queue' };

const REVIEWERS = ['COMPLIANCE_OFFICER', 'BRAND_ADMIN'];

/**
 * Triage, not a list.
 *
 * The queue answers one question — what do I pick up next — so it is ordered by
 * how long each passport has been waiting rather than by when it was last
 * touched, and the rail down the left says which of those waits have gone on
 * too long. Everything a reviewer needs to decide whether to open a row is on
 * the row: who submitted it, how complete it is, and which required fields are
 * still empty, by name.
 */
export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!REVIEWERS.includes(session.role)) redirect('/console');

  const { tab: tabParam } = await searchParams;
  const tab = tabFor(tabParam);

  const [unsorted, counts] = await Promise.all([
    listQueue(session.tenantId, tab.status),
    queueCounts(session.tenantId),
  ]);

  // Oldest first. The whole point of the screen is that the thing which has
  // been waiting longest is the thing that should be picked up next.
  const rows = [...unsorted].sort((a, b) => waitedSince(a).getTime() - waitedSince(b).getTime());

  const oldest = rows[0];
  const stale = rows.filter((row) => hoursSince(waitedSince(row)) >= 72).length;
  const averageCompleteness =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((sum, row) => sum + row.completeness, 0) / rows.length);
  const strong = rows.filter((row) => row.completeness >= 90).length;
  const blocked = rows.filter((row) => row.missingRequired.length > 0).length;

  const ages = AGE_BANDS.map((band, index) => ({
    key: band.key,
    label: band.label,
    value: rows.filter((row) => bandFor(waitedSince(row)) === band.key).length,
    // A sequential ramp: these bands are one measure getting worse, not four
    // unrelated categories.
    colour: rampStep((index + 1) / AGE_BANDS.length),
  }));

  const gaps = topMissingFields(rows);

  const completenessBands = [
    { key: 'low', label: 'Under 60%', value: rows.filter((r) => r.completeness < 60).length },
    {
      key: 'mid',
      label: '60 to 89%',
      value: rows.filter((r) => r.completeness >= 60 && r.completeness < 90).length,
    },
    { key: 'high', label: '90% and above', value: rows.filter((r) => r.completeness >= 90).length },
  ].map((band, index) => ({ ...band, colour: rampStep((index + 1) / 3) }));

  return (
    <>
      <PageHeader
        title="Review queue"
        description={
          counts['needs-review'] === 0
            ? 'Nothing is waiting on a compliance decision.'
            : `${counts['needs-review']} ${counts['needs-review'] === 1 ? 'passport is' : 'passports are'} waiting on a compliance decision, longest wait first.`
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <StatRow>
          <StatTile
            label="Waiting on you"
            value={counts['needs-review']}
            context={`${counts['changes-requested']} sent back to authors`}
            href="/console/review?tab=needs-review"
            tone={counts['needs-review'] > 0 ? 'caution' : 'positive'}
          />
          <StatTile
            label="Longest wait"
            value={oldest ? waitedFor(waitedSince(oldest)) : '—'}
            context={oldest ? oldest.productName : 'nothing in this tab'}
            tone={oldest && hoursSince(waitedSince(oldest)) >= 168 ? 'critical' : 'neutral'}
          />
          <StatTile
            label="Waiting over three days"
            value={stale}
            context={`of ${rows.length} in this tab`}
            tone={stale > 0 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Average completeness"
            value={rows.length === 0 ? '—' : `${averageCompleteness}%`}
            context={`${strong} of ${rows.length} above 90%`}
            tone={averageCompleteness >= 80 ? 'positive' : 'caution'}
          />
        </StatRow>

        <nav aria-label="Queue" className="flex flex-wrap items-center gap-1 border-b border-line">
          {QUEUE_TABS.map((item) => {
            const active = item.key === tab.key;
            return (
              <Link
                key={item.key}
                href={`/console/review?tab=${item.key}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-[140ms]',
                  active
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )}
              >
                {item.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-2xs tabular-nums',
                    active ? 'bg-accent-soft text-accent' : 'bg-surface-sunken text-ink-subtle',
                  )}
                >
                  {counts[item.key]}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">{tab.label}</h2>
              <p className="text-xs text-ink-muted">{tab.blurb}</p>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={tab.key === 'needs-review' ? CheckCircle2 : ClipboardCheck}
                title={
                  tab.key === 'needs-review'
                    ? 'Nothing is waiting on you'
                    : `No passports are ${tab.label.toLowerCase()}`
                }
                description={
                  tab.key === 'needs-review'
                    ? 'When an author submits a passport it lands here — with the change since the last version, what is still missing, and the decision, all on one screen.'
                    : tab.blurb
                }
              />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {rows.map((row) => (
                  <QueueRowItem key={row.id} row={row} waitingLabel={tab.key === 'needs-review'} />
                ))}
              </ul>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">How long they have waited</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                Anything past three days is a passport whose author has stopped expecting an answer.
              </p>
              <BarChart
                data={ages.filter((band) => band.value > 0)}
                emptyMessage="Nothing in this tab."
              />
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">What is holding them up</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                Required fields still empty, counted across {blocked} of {rows.length}{' '}
                {rows.length === 1 ? 'passport' : 'passports'}.
              </p>
              <BarChart
                data={gaps}
                emptyMessage="Every required field is filled in on every passport here."
              />
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Completeness across the queue</h2>
              <div className="mt-4">
                <StackedBar
                  ariaLabel={completenessBands
                    .map((band) => `${band.value} ${band.label}`)
                    .join(', ')}
                  segments={completenessBands.filter((band) => band.value > 0)}
                />
                <Legend
                  className="mt-3"
                  items={completenessBands.map((band) => ({
                    key: band.key,
                    label: band.label,
                    value: String(band.value),
                    colour: band.colour,
                  }))}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * One row of the queue.
 *
 * The severity rail carries the wait, not the status: a passport sitting for a
 * fortnight is the emergency, and a row that paints every entry the same amber
 * is a row that has flagged nothing.
 */
function QueueRowItem({ row, waitingLabel }: { row: QueueRow; waitingLabel: boolean }) {
  const since = waitedSince(row);
  const severity = waitSeverity(since);

  return (
    <li>
      <Link
        href={`/console/review/${row.dppId}`}
        className="grid grid-cols-[2px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors duration-[140ms] hover:bg-surface-sunken sm:grid-cols-[2px_minmax(0,1fr)_9rem_6rem_auto_auto]"
      >
        <span
          aria-hidden
          className={cn(
            'h-10 w-0.5 shrink-0 rounded-full',
            severity === 'critical'
              ? 'bg-critical'
              : severity === 'caution'
                ? 'bg-caution'
                : 'bg-line-strong',
          )}
        />

        <span className="min-w-0">
          <span
            className={cn(
              'block truncate text-ink',
              severity === 'neutral' ? 'text-sm font-medium' : 'text-sm font-semibold',
            )}
          >
            {row.productName}
          </span>
          <span className="mono block truncate text-2xs text-ink-subtle">
            {[row.styleNumber, row.colourName, row.size ? `Size ${row.size}` : null, `v${row.version}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {row.missingRequired.length === 0 ? (
            <span className="mt-1 flex items-center gap-1.5 text-2xs text-positive">
              <CheckCircle2 className="size-3 shrink-0" aria-hidden />
              Nothing required is missing
            </span>
          ) : (
            <span className="mt-1 flex items-start gap-1.5 text-2xs text-caution">
              <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
              <span className="min-w-0">
                Missing {row.missingRequired.slice(0, 3).join(', ')}
                {row.missingRequired.length > 3
                  ? ` and ${row.missingRequired.length - 3} more`
                  : ''}
              </span>
            </span>
          )}
        </span>

        <span className="hidden min-w-0 truncate text-xs text-ink-muted sm:block">
          {row.submitterName ?? 'Unknown author'}
        </span>

        <span className="hidden sm:block">
          <span
            className={cn(
              'block text-sm tabular-nums',
              severity === 'critical'
                ? 'font-semibold text-critical'
                : severity === 'caution'
                  ? 'font-medium text-caution'
                  : 'text-ink-muted',
            )}
          >
            {waitedFor(since)}
          </span>
          <span className="block text-2xs text-ink-subtle">
            {waitingLabel ? 'waiting' : 'in this state'}
          </span>
        </span>

        <Meter value={row.completeness} size={34} thickness={3.5} />
        <StatusBadge status={row.status} />
      </Link>
    </li>
  );
}

/** When the passport entered the state it is in, falling back to its last save. */
function waitedSince(row: QueueRow): Date {
  return row.enteredStatusAt ?? row.updatedAt;
}

/**
 * The required fields missing most often across the queue.
 *
 * Eight categorical slots, assigned in fixed order and never cycled; a ninth
 * distinct field folds into "Other fields" rather than borrowing a colour that
 * already means something else on this chart.
 */
function topMissingFields(rows: QueueRow[]) {
  const tally = new Map<string, number>();
  for (const row of rows) {
    for (const field of row.missingRequired) {
      tally.set(field, (tally.get(field) ?? 0) + 1);
    }
  }

  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = ranked.slice(0, 7).map(([label, value], index) => ({
    key: label,
    label,
    value,
    colour: seriesColour(index),
  }));
  const tail = ranked.slice(7);
  if (tail.length > 0) {
    head.push({
      key: '__other',
      label: `${tail.length} other fields`,
      value: tail.reduce((sum, [, value]) => sum + value, 0),
      colour: 'var(--color-line-strong)',
    });
  }
  return head;
}
