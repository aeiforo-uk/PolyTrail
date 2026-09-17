import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BellRing, ClipboardList, Plus } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { remindRequest } from '@/lib/data-requests/actions';
import {
  STATUS_GROUPS,
  groupOf,
  isStatusGroup,
  listDataRequests,
  type RequestRow,
  type StatusGroup,
} from '@/lib/data-requests/queries';
import { TIER_SHORT, type SupplyTier } from '@/lib/partners/vocab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { BarChart, StackedBar } from '@/components/viz/bar-chart';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { seriesColour } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';
import { daysUntil, formatDate, relativeTime } from '../partners/presentation';
import { RequestStatusBadge } from './request-status';

export const metadata = { title: 'Data requests' };

const GROUP_ORDER: StatusGroup[] = ['not_submitted', 'in_progress', 'completed'];

/** Statuses where the ball is with the supplier and a clock is running. */
const OUTSTANDING = ['sent', 'in_progress', 'rejected'];

/**
 * The chase console.
 *
 * One question: who owes me what, and how late are they. So the three tiles
 * are the filter rather than a separate summary — the first thing anybody does
 * after reading "7 not submitted" is try to click it — and the ordering is by
 * lateness rather than by recency, because a request that went out in March is
 * not competing for attention with one sent this morning.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const params = await searchParams;
  const group = isStatusGroup(params.group) ? params.group : null;

  // Read everything once: the tiles must keep their counts when a filter is
  // applied, and the ageing view describes the whole backlog, not the slice.
  const all = await listDataRequests(session.tenantId);
  const rows = group ? all.filter((row) => groupOf(row.status) === group) : all;

  const now = new Date();
  const counts: Record<StatusGroup, number> = {
    not_submitted: 0,
    in_progress: 0,
    completed: 0,
  };
  for (const row of all) counts[groupOf(row.status)] += 1;

  const outstanding = all.filter((row) => OUTSTANDING.includes(row.status));
  const overdue = outstanding.filter((row) => lateness(row, now) > 0);
  const worst = overdue.reduce((max, row) => Math.max(max, lateness(row, now)), 0);
  const ageing = ageingBuckets(outstanding, now);
  const chasing = chaseList(outstanding, now);

  const ordered = [...rows].sort(urgencyFirst(now));

  if (all.length === 0) {
    return (
      <>
        <PageHeader
          title="Data requests"
          description="What you have asked suppliers for, and what has come back."
          actions={<NewButton />}
        />
        <div className="px-8 py-8">
          <EmptyState
            icon={ClipboardList}
            title="No data requests yet"
            description="Most of what a passport needs sits two or three tiers upstream. Ask for it here — the supplier answers through a link, with no account to create and nothing to install."
            action={
              <Button asChild size="sm">
                <Link href="/console/requests/new">Write the first request</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Data requests"
        description={
          overdue.length === 0
            ? `${outstanding.length} ${outstanding.length === 1 ? 'request is' : 'requests are'} out with suppliers. Nothing is overdue.`
            : `${overdue.length} ${overdue.length === 1 ? 'request is' : 'requests are'} overdue, the oldest by ${worst} days.`
        }
        actions={<NewButton />}
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <StatRow className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3">
          {GROUP_ORDER.map((key) => {
            const active = group === key;
            const late = key === 'not_submitted' || key === 'in_progress' ? overdue.length : 0;
            return (
              <StatTile
                key={key}
                label={STATUS_GROUPS[key].label}
                value={counts[key]}
                context={
                  active
                    ? `showing these · ${STATUS_GROUPS[key].hint.toLowerCase()}`
                    : STATUS_GROUPS[key].hint
                }
                href={active ? '/console/requests' : `/console/requests?group=${key}`}
                tone={
                  active
                    ? 'accent'
                    : key === 'completed'
                      ? 'positive'
                      : late > 0 && key === 'not_submitted'
                        ? 'caution'
                        : 'neutral'
                }
                className={active ? 'bg-accent-soft/40' : undefined}
              />
            );
          })}
        </StatRow>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-semibold text-ink">
                {group ? STATUS_GROUPS[group].label : 'Every request'}
                <span className="ml-2 font-normal text-ink-subtle">most overdue first</span>
              </h2>
              {group ? (
                <Link
                  href="/console/requests"
                  className="text-xs text-accent transition-colors duration-[140ms] hover:underline"
                >
                  Show everything
                </Link>
              ) : null}
            </div>

            {ordered.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nothing in this state"
                description={`No request is currently ${STATUS_GROUPS[group ?? 'not_submitted'].label.toLowerCase()}. Try another tile, or write a new request.`}
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/console/requests">Show everything</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Supplier</TH>
                    <TH>What was asked</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Deadline</TH>
                    <TH className="text-right">Chase</TH>
                  </TR>
                </THead>
                <TBody>
                  {ordered.map((row) => {
                    const late = lateness(row, now);
                    const severity =
                      late > 7 ? 'critical' : late > 0 ? 'caution' : 'none';
                    const canRemind = ['sent', 'in_progress', 'rejected'].includes(row.status);

                    return (
                      <TR key={row.id}>
                        <TD>
                          <span className="flex items-start gap-3">
                            <span
                              aria-hidden
                              className={cn(
                                'mt-0.5 h-8 w-0.5 shrink-0 rounded-full',
                                severity === 'critical'
                                  ? 'bg-critical'
                                  : severity === 'caution'
                                    ? 'bg-caution'
                                    : 'bg-line',
                              )}
                            />
                            <span className="min-w-0">
                              {row.partnerId ? (
                                <Link
                                  href={`/console/partners/${row.partnerId}`}
                                  className="font-medium text-ink transition-colors duration-[140ms] hover:text-accent"
                                >
                                  {row.partnerName}
                                </Link>
                              ) : (
                                <span className="font-medium text-ink-subtle">
                                  Supplier removed
                                </span>
                              )}
                              <span className="block truncate text-2xs text-ink-subtle">
                                {row.partnerTier
                                  ? `${TIER_SHORT[row.partnerTier as SupplyTier]} · `
                                  : ''}
                                <Link
                                  href={`/console/requests/${row.id}`}
                                  className="transition-colors duration-[140ms] hover:text-accent"
                                >
                                  {row.title}
                                </Link>
                              </span>
                            </span>
                          </span>
                        </TD>

                        <TD className="w-44">
                          <Link
                            href={`/console/requests/${row.id}`}
                            className="block transition-colors duration-[140ms] hover:text-accent"
                          >
                            <span className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                              <span className="text-ink">
                                {row.answeredCount} of {row.fieldCount}
                              </span>
                              <span className="text-ink-subtle">
                                {row.fieldCount === 1 ? 'field' : 'fields'}
                              </span>
                            </span>
                            <StackedBar
                              className="mt-1.5"
                              height={4}
                              ariaLabel={`${row.answeredCount} of ${row.fieldCount} fields answered`}
                              segments={[
                                {
                                  key: 'answered',
                                  label: 'Answered',
                                  value: row.answeredCount,
                                  colour: 'var(--color-accent)',
                                },
                                {
                                  key: 'blank',
                                  label: 'Still blank',
                                  value: Math.max(0, row.fieldCount - row.answeredCount),
                                  colour: 'var(--color-line)',
                                },
                              ]}
                            />
                            {row.passportCount > 0 ? (
                              <span className="mt-1 block text-2xs text-ink-subtle tabular-nums">
                                feeds {row.passportCount}{' '}
                                {row.passportCount === 1 ? 'passport' : 'passports'}
                              </span>
                            ) : (
                              <span className="mt-1 block text-2xs text-caution">
                                no passport attached
                              </span>
                            )}
                          </Link>
                        </TD>

                        <TD>
                          <RequestStatusBadge status={row.status} />
                        </TD>

                        <TD className="text-right text-xs tabular-nums">
                          {row.dueAt === null ? (
                            <span className="text-ink-subtle">No deadline</span>
                          ) : late > 0 ? (
                            <span className="inline-flex flex-col items-end gap-0.5">
                              <Badge tone={late > 7 ? 'critical' : 'caution'}>
                                {late} {late === 1 ? 'day' : 'days'} late
                              </Badge>
                              <span className="text-2xs text-ink-subtle">
                                {formatDate(row.dueAt)}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex flex-col items-end gap-0.5">
                              <span className="text-ink-muted">
                                {daysUntil(row.dueAt, now)} days left
                              </span>
                              <span className="text-2xs text-ink-subtle">
                                {formatDate(row.dueAt)}
                              </span>
                            </span>
                          )}
                        </TD>

                        <TD className="text-right">
                          {canRemind ? (
                            <form action={remindRequest.bind(null, row.id)}>
                              <Button
                                type="submit"
                                size="xs"
                                variant={late > 0 ? 'secondary' : 'ghost'}
                              >
                                <BellRing aria-hidden />
                                Remind
                              </Button>
                            </form>
                          ) : (
                            <span className="text-2xs text-ink-subtle">
                              {row.submittedAt
                                ? `answered ${relativeTime(row.submittedAt, now)}`
                                : '—'}
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">How late the backlog is</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Only requests still sitting with a supplier. Anything you have already been sent is
                your problem, not theirs.
              </p>

              <p className="mt-4 flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-3xl font-semibold leading-none tracking-[-0.021em] tabular-nums',
                    overdue.length > 0 ? 'text-critical' : 'text-ink',
                  )}
                >
                  {overdue.length}
                </span>
                <span className="text-xs text-ink-muted">
                  overdue of {outstanding.length} outstanding
                  {overdue.length > 0 ? ` · worst is ${worst} days` : ''}
                </span>
              </p>

              <BarChart
                className="mt-4"
                data={ageing}
                emptyMessage="Nothing is out with a supplier right now."
              />
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Who you are waiting on</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                Suppliers with more than one request open. Chase the facility, not the request.
              </p>
              {chasing.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Nobody is holding more than one of your requests.
                </p>
              ) : (
                <BarChart data={chasing} formatValue={(n) => `${n} open`} />
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function NewButton() {
  return (
    <Button asChild size="sm">
      <Link href="/console/requests/new">
        <Plus aria-hidden />
        New request
      </Link>
    </Button>
  );
}

/** Days past the deadline. Zero or less means it is not late. */
function lateness(row: RequestRow, now: Date): number {
  if (row.dueAt === null || !OUTSTANDING.includes(row.status)) return 0;
  return Math.max(0, -daysUntil(row.dueAt, now));
}

function urgencyFirst(now: Date) {
  return (a: RequestRow, b: RequestRow) => {
    const lateA = lateness(a, now);
    const lateB = lateness(b, now);
    if (lateA !== lateB) return lateB - lateA;

    // Neither is late: the one with the nearest deadline is the one to look at.
    const dueA = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const dueB = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  };
}

/**
 * Lateness in buckets, not a histogram of dates.
 *
 * The bands use the reserved status colours rather than categorical slots
 * because they carry a judgement: "over a month late" is not a category of
 * request, it is a problem. Two bands share the critical tone and are told
 * apart by their labels, which is the right way round — a reader who cannot
 * separate the two reds still reads the words.
 */
function ageingBuckets(rows: RequestRow[], now: Date) {
  const bands = [
    { key: 'none', label: 'No deadline set', colour: 'var(--color-line-strong)', value: 0 },
    { key: 'later', label: 'Due later', colour: 'var(--color-positive)', value: 0 },
    { key: 'soon', label: 'Due within 7 days', colour: 'var(--color-caution)', value: 0 },
    { key: 'late_week', label: '1–7 days late', colour: 'var(--color-caution)', value: 0 },
    { key: 'late_month', label: '8–30 days late', colour: 'var(--color-critical)', value: 0 },
    { key: 'late_worse', label: 'Over 30 days late', colour: 'var(--color-critical)', value: 0 },
  ];
  const by = new Map(bands.map((band) => [band.key, band]));

  for (const row of rows) {
    if (row.dueAt === null) {
      by.get('none')!.value += 1;
      continue;
    }
    const remaining = daysUntil(row.dueAt, now);
    if (remaining > 7) by.get('later')!.value += 1;
    else if (remaining >= 0) by.get('soon')!.value += 1;
    else if (remaining >= -7) by.get('late_week')!.value += 1;
    else if (remaining >= -30) by.get('late_month')!.value += 1;
    else by.get('late_worse')!.value += 1;
  }

  return bands.filter((band) => band.value > 0);
}

/** Suppliers holding more than one open request, worst first, eight at most. */
function chaseList(rows: RequestRow[], now: Date) {
  const counts = new Map<string, { name: string; count: number; worst: number }>();

  for (const row of rows) {
    if (!row.partnerId || !row.partnerName) continue;
    const entry = counts.get(row.partnerId) ?? { name: row.partnerName, count: 0, worst: 0 };
    entry.count += 1;
    entry.worst = Math.max(entry.worst, lateness(row, now));
    counts.set(row.partnerId, entry);
  }

  return [...counts.entries()]
    .filter(([, entry]) => entry.count > 1)
    .sort((a, b) => b[1].count - a[1].count || b[1].worst - a[1].worst)
    .slice(0, 8)
    .map(([id, entry], index) => ({
      key: id,
      label: entry.worst > 0 ? `${entry.name} — ${entry.worst} days late` : entry.name,
      value: entry.count,
      colour: seriesColour(index),
    }));
}
