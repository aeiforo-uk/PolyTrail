import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ScrollText, X } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { BarChart } from '@/components/viz/bar-chart';
import { seriesColour } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';
import {
  actionBreakdown,
  chainSpan,
  countChain,
  eventVolume,
  getAuditEvent,
  listAuditEvents,
  usedActions,
  type VolumePoint,
} from './queries';
import { VerifyPanel } from './verify-panel';
import { ExportButton } from './export-button';

export const metadata = { title: 'Audit log' };

const AUDIT_READERS = ['BRAND_ADMIN', 'COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'];

/** Eight weeks: long enough to show a rhythm, short enough to read as bars. */
const VOLUME_DAYS = 56;

interface SearchParams {
  action?: string;
  from?: string;
  to?: string;
  page?: string;
  entry?: string;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!AUDIT_READERS.includes(session.role)) redirect('/console');

  const query = await searchParams;
  const filters = {
    action: query.action || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    page: query.page ? Number(query.page) : 1,
  };

  const [{ rows, total, page, pages }, chainLength, actions, selected, volume, breakdown, span] =
    await Promise.all([
      listAuditEvents(session.tenantId, filters),
      countChain(session.tenantId),
      usedActions(session.tenantId),
      query.entry ? getAuditEvent(session.tenantId, query.entry) : Promise.resolve(null),
      eventVolume(session.tenantId, VOLUME_DAYS),
      actionBreakdown(session.tenantId, { action: filters.action, from: filters.from, to: filters.to }),
      chainSpan(session.tenantId),
    ]);

  const filtered = Boolean(filters.action || filters.from || filters.to);
  const params = (extra: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...extra })) {
      if (value) search.set(key, value);
    }
    const text = search.toString();
    return text ? `/console/audit?${text}` : '/console/audit';
  };

  const weeks = byWeek(volume);
  const daily = volume.slice(-14).map((point) => point.count);
  const thisWeek = volume.slice(-7).reduce((sum, point) => sum + point.count, 0);
  const lastWeek = volume.slice(-14, -7).reduce((sum, point) => sum + point.count, 0);
  const weekDelta = lastWeek === 0 ? undefined : ((thisWeek - lastWeek) / lastWeek) * 100;
  const busiest = volume.reduce<VolumePoint | null>(
    (best, point) => (best === null || point.count > best.count ? point : best),
    null,
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every consequential action in this workspace, hash-chained so it can be proven unaltered."
        actions={<ExportButton action={filters.action} from={filters.from} to={filters.to} />}
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <VerifyPanel
          entryCount={chainLength}
          firstEntryAt={span.first ? formatDay(span.first) : null}
          lastEntryAt={span.last ? formatDay(span.last) : null}
        />

        <StatRow>
          <StatTile
            label="Entries in the chain"
            value={chainLength.toLocaleString('en-GB')}
            context={span.first ? `since ${formatDay(span.first)}` : 'nothing recorded yet'}
            trend={daily}
            tone="accent"
          />
          <StatTile
            label="Recorded this week"
            value={thisWeek}
            context={`${lastWeek} the week before`}
            deltaPercent={weekDelta}
            tone="neutral"
          />
          <StatTile
            label="Busiest day"
            value={busiest?.count ?? 0}
            context={busiest && busiest.count > 0 ? formatDay(busiest.day) : 'no activity in 8 weeks'}
          />
          <StatTile
            label="Kinds of action"
            value={actions.length}
            context={
              breakdown[0]
                ? `${actionLabel(breakdown[0].action).toLowerCase()} most often`
                : 'nothing recorded yet'
            }
          />
        </StatRow>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Action" htmlFor="action" className="min-w-52">
            <NativeSelect id="action" name="action" defaultValue={filters.action ?? ''}>
              <option value="">All actions</option>
              {actions.map((value) => (
                <option key={value} value={value}>
                  {actionLabel(value)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="From" htmlFor="from" className="w-40">
            <Input id="from" name="from" type="date" defaultValue={filters.from ?? ''} />
          </Field>

          <Field label="To" htmlFor="to" className="w-40">
            <Input id="to" name="to" type="date" defaultValue={filters.to ?? ''} />
          </Field>

          <Button type="submit" variant="secondary">
            Apply
          </Button>

          {filtered ? (
            <Button asChild variant="ghost">
              <Link href="/console/audit">
                <X aria-hidden />
                Clear
              </Link>
            </Button>
          ) : null}

          <p className="ml-auto text-xs text-ink-muted tabular-nums">
            {total.toLocaleString('en-GB')} {total === 1 ? 'entry' : 'entries'}
            {filtered ? ' matching' : ''}
          </p>
        </form>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {rows.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title={filtered ? 'Nothing matches those filters' : 'No events recorded yet'}
                description={
                  filtered
                    ? 'Widen the date range, or clear the action filter. The chain itself is unaffected by what you filter — verification always covers every entry.'
                    : 'The log fills as people create, review and publish passports. Each entry carries the hash of the one before it, which is what lets the whole record be proven unaltered later.'
                }
              />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Time</TH>
                      <TH>Actor</TH>
                      <TH>Action</TH>
                      <TH>Subject</TH>
                      <TH>IP</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {rows.map((row) => {
                      const active = selected?.id === row.id;
                      return (
                        <TR key={row.id} className={cn(active && 'bg-accent-soft/50')}>
                          <TD className="whitespace-nowrap">
                            <Link
                              href={params({ entry: active ? undefined : row.id })}
                              className="text-xs text-ink tabular-nums hover:text-accent"
                              aria-current={active ? 'true' : undefined}
                            >
                              {formatStamp(row.recordedAt)}
                            </Link>
                            <span className="mono block text-2xs text-ink-subtle">
                              #{row.sequence}
                            </span>
                          </TD>
                          <TD className="text-ink">{row.actorLabel}</TD>
                          <TD>
                            <Badge tone={toneFor(row.action)}>{actionLabel(row.action)}</Badge>
                          </TD>
                          <TD>
                            <span className="text-xs text-ink-muted">{row.subjectType}</span>
                            <span className="mono block max-w-56 truncate text-2xs text-ink-subtle">
                              {row.subjectId}
                            </span>
                          </TD>
                          <TD className="mono text-2xs text-ink-subtle">{row.ip ?? '—'}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>

                {pages > 1 ? (
                  <nav
                    aria-label="Pagination"
                    className="mt-4 flex items-center justify-between gap-3"
                  >
                    <p className="text-xs text-ink-muted tabular-nums">
                      Page {page} of {pages}
                    </p>
                    <div className="flex gap-2">
                      {page > 1 ? (
                        <Button asChild variant="secondary" size="sm">
                          <Link href={params({ page: String(page - 1) })}>Newer</Link>
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" disabled>
                          Newer
                        </Button>
                      )}
                      {page < pages ? (
                        <Button asChild variant="secondary" size="sm">
                          <Link href={params({ page: String(page + 1) })}>Older</Link>
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" disabled>
                          Older
                        </Button>
                      )}
                    </div>
                  </nav>
                ) : null}
              </>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            {selected ? (
              <section className="rounded-lg border border-line-strong bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">Entry #{selected.sequence}</p>
                    <h2 className="mt-1 text-sm font-semibold text-ink">
                      {actionLabel(selected.action)}
                    </h2>
                  </div>
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link href={params({ entry: undefined })} aria-label="Close entry">
                      <X aria-hidden />
                    </Link>
                  </Button>
                </div>

                <dl className="mt-4 flex flex-col gap-2.5 text-xs">
                  <Row label="Recorded" value={formatStamp(selected.recordedAt)} />
                  <Row label="Actor" value={selected.actorLabel} />
                  <Row
                    label="Subject"
                    value={`${selected.subjectType} · ${selected.subjectId}`}
                    mono
                  />
                  <Row label="IP" value={selected.ip ?? '—'} mono />
                  <Row label="Device" value={selected.userAgent ?? '—'} />
                </dl>

                <div className="mt-4 border-t border-line pt-4">
                  <p className="eyebrow mb-2">Chain</p>
                  <p className="text-2xs text-ink-muted">Previous</p>
                  <p className="mono text-2xs break-all text-ink-subtle">{selected.previousHash}</p>
                  <p className="mt-2 text-2xs text-ink-muted">This entry</p>
                  <p className="mono text-2xs break-all text-ink">{selected.entryHash}</p>
                </div>

                <div className="mt-4 border-t border-line pt-4">
                  <p className="eyebrow mb-2">Metadata</p>
                  <pre className="mono max-h-80 overflow-auto rounded-md bg-surface-sunken p-3 text-2xs leading-relaxed whitespace-pre-wrap text-ink">
                    {JSON.stringify(selected.metadata ?? {}, null, 2)}
                  </pre>
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Entries per week</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                The last eight weeks, whole workspace. A quiet week is not a gap in the chain — the
                chain has no gaps by construction.
              </p>
              <BarChart data={weeks} emptyMessage="Nothing has been recorded in the last eight weeks." />
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">What people have been doing</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                {filtered
                  ? 'Across the entries matching your filters.'
                  : 'Across every entry in the chain.'}
              </p>
              <BarChart
                data={topActions(breakdown)}
                emptyMessage="Nothing recorded yet."
              />
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className={cn('min-w-0 text-right break-words text-ink', mono && 'mono text-2xs')}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Daily counts folded into weeks.
 *
 * Fifty-six horizontal bars is a barcode, not a chart. Weeks keep the rhythm of
 * the log readable while still showing the quiet stretches that a monthly
 * rollup would flatten away.
 */
function byWeek(volume: VolumePoint[]) {
  const buckets: Array<{ key: string; label: string; value: number; colour: string }> = [];
  for (let start = 0; start < volume.length; start += 7) {
    const week = volume.slice(start, start + 7);
    const first = week[0];
    if (!first) continue;
    buckets.push({
      key: first.day,
      label: `Week of ${formatDay(first.day)}`,
      value: week.reduce((sum, point) => sum + point.count, 0),
      colour: 'var(--color-ramp-500)',
    });
  }
  return buckets;
}

/**
 * The seven most frequent actions, with the tail folded into one bar.
 *
 * Slots are assigned in fixed order and never cycled — an eighth colour that
 * repeats the first would say two unrelated actions are the same thing.
 */
function topActions(breakdown: Array<{ action: string; count: number }>) {
  const head = breakdown.slice(0, 7).map((entry, index) => ({
    key: entry.action,
    label: actionLabel(entry.action),
    value: entry.count,
    colour: seriesColour(index),
  }));
  const tail = breakdown.slice(7);
  if (tail.length > 0) {
    head.push({
      key: '__other',
      label: `${tail.length} other kinds of action`,
      value: tail.reduce((sum, entry) => sum + entry.count, 0),
      colour: 'var(--color-line-strong)',
    });
  }
  return head;
}

/** `passport.published` → `Passport published`. Keeps the table readable without a lookup table to maintain. */
function actionLabel(action: string): string {
  const [subject, ...rest] = action.split('.');
  const verb = rest.join(' ').replace(/_/g, ' ');
  const noun = (subject ?? action).replace(/_/g, ' ');
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}${verb ? ` ${verb}` : ''}`;
}

function toneFor(action: string): 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' {
  if (action.endsWith('.published')) return 'positive';
  if (action.endsWith('.recalled') || action.endsWith('.revoked') || action.endsWith('.removed')) {
    return 'critical';
  }
  if (action.endsWith('.unpublished') || action.endsWith('.archived')) return 'caution';
  if (action.startsWith('user.') || action.startsWith('tenant.')) return 'accent';
  return 'neutral';
}

function formatStamp(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
