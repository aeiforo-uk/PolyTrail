import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  Plug,
  Upload,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { canImport } from '@/lib/import/access';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { BarChart, Legend, StackedBar } from '@/components/viz/bar-chart';
import { seriesColour, STATUS } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';
import { ImportStatus } from './import-status';
import { listImportJobs, type ImportJobSummary } from './queries';

export const metadata = { title: 'Imports' };

/** How many jobs the aggregates are honest about. */
const HISTORY_LIMIT = 50;

/**
 * Import history.
 *
 * Every run stays here with its per-row outcome, because the question an
 * operator asks three weeks later is never "did the import work" — it is
 * "which forty styles did not go in, and why".
 *
 * The list is ranked by what is waiting on a person rather than by date. A job
 * parked at the mapping step three days ago is the one that needs picking up;
 * a clean run from this morning is not competing with it for attention.
 */
export default async function ImportsPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!canImport(session)) redirect('/console');

  const jobs = await listImportJobs(session.tenantId, HISTORY_LIMIT);

  const imported = sum(jobs, (job) => job.succeededRows);
  const failed = sum(jobs, (job) => job.failedRows);
  const read = sum(jobs, (job) => job.totalRows);
  const processed = imported + failed;
  const successRate = processed === 0 ? null : Math.round((imported / processed) * 100);

  // Oldest first, so the sparkline reads left-to-right as time passing.
  const trend = [...jobs].reverse().slice(-12).map((job) => job.succeededRows);
  const waiting = jobs.filter((job) => isWaiting(job));
  const withFailures = jobs.filter((job) => job.failedRows > 0);
  const queue = [...jobs].sort((a, b) => rank(a) - rank(b)).filter((job) => rank(job) < 3);

  const fromCsv = jobs.filter((job) => job.source !== 'api').length;
  const fromConnector = jobs.length - fromCsv;

  return (
    <>
      <PageHeader
        title="Imports"
        description={
          jobs.length === 0
            ? 'Bring a catalogue in from a spreadsheet or a connected system. Nothing is written until you have seen what it would do.'
            : waiting.length > 0
              ? `${waiting.length} ${waiting.length === 1 ? 'import is' : 'imports are'} waiting on you.`
              : `${imported.toLocaleString('en-GB')} rows imported across the last ${jobs.length} ${jobs.length === 1 ? 'run' : 'runs'}.`
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/console/imports/template">
                <Download aria-hidden />
                Starter template
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/console/connectors">
                <Plug aria-hidden />
                Connectors
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/console/imports/new">
                <Upload aria-hidden />
                New import
              </Link>
            </Button>
          </>
        }
      />

      {jobs.length === 0 ? (
        <div className="px-8 py-8">
          <EmptyState
            icon={FileSpreadsheet}
            title="Nothing has been imported yet"
            description="A brand with two thousand styles in a PLM is not going to type them in. Upload a CSV, confirm what each column means once, and the same mapping is waiting for the file you upload next season. Nothing is written to a passport until you have seen what it would do."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/console/imports/new">
                    <Upload aria-hidden />
                    Import a CSV
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/console/imports/template">
                    <Download aria-hidden />
                    Download the template
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/console/connectors">
                    <Plug aria-hidden />
                    Connect a system instead
                  </Link>
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8 px-8 py-8">
          <StatRow>
            <StatTile
              label="Rows imported"
              value={imported.toLocaleString('en-GB')}
              context={`from ${read.toLocaleString('en-GB')} read`}
              trend={trend.length > 1 ? trend : undefined}
              tone="accent"
            />
            <StatTile
              label="Rows that failed"
              value={failed.toLocaleString('en-GB')}
              context={
                processed === 0
                  ? 'nothing run yet'
                  : failed === 0
                    ? 'every row landed'
                    : `${Math.round((failed / processed) * 100)}% of everything run`
              }
              tone={failed > 0 ? 'critical' : 'neutral'}
            />
            <StatTile
              label="Rows that landed first time"
              value={successRate === null ? '—' : `${successRate}%`}
              context={
                processed === 0
                  ? 'no rows processed yet'
                  : `${imported.toLocaleString('en-GB')} of ${processed.toLocaleString('en-GB')} processed`
              }
              tone={successRate === null ? 'neutral' : successRate >= 95 ? 'positive' : 'caution'}
            />
            <StatTile
              label="Runs"
              value={jobs.length}
              context={
                waiting.length > 0
                  ? `${waiting.length} still open`
                  : `last one ${formatWhen(jobs[0]!)}`
              }
              tone={waiting.length > 0 ? 'caution' : 'neutral'}
            />
          </StatRow>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              {queue.length > 0 ? (
                <section className="min-w-0">
                  <div className="mb-3 flex items-baseline justify-between gap-4">
                    <h2 className="text-sm font-semibold text-ink">Waiting on you</h2>
                    <p className="text-xs text-ink-subtle">
                      Most urgent first, not most recent
                    </p>
                  </div>
                  <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                    {queue.map((job) => (
                      <li key={job.id}>
                        <Link
                          href={`/console/imports/${job.id}`}
                          className="flex items-center gap-4 px-4 py-3 transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)] hover:bg-surface-sunken"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'h-9 w-0.5 shrink-0 rounded-full',
                              severityOf(job) === 'critical'
                                ? 'bg-critical'
                                : severityOf(job) === 'caution'
                                  ? 'bg-caution'
                                  : 'bg-line-strong',
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {job.filename}
                            </span>
                            <span className="block truncate text-xs text-ink-subtle">
                              {nextStep(job)}
                            </span>
                          </span>
                          <span className="hidden shrink-0 text-xs tabular-nums text-ink-muted sm:block">
                            {job.totalRows.toLocaleString('en-GB')} rows
                          </span>
                          <ImportStatus status={job.status} />
                          <ArrowRight className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="min-w-0">
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h2 className="text-sm font-semibold text-ink">Every run</h2>
                  <p className="text-xs text-ink-subtle">
                    Last {jobs.length}, newest first
                  </p>
                </div>

                <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-line text-ink-subtle">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 text-xs font-medium">
                          File
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                          Status
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-xs font-medium">
                          Outcome
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-2.5 text-right text-xs font-medium whitespace-nowrap"
                        >
                          Imported
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-2.5 text-right text-xs font-medium whitespace-nowrap"
                        >
                          Failed
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-2.5 text-right text-xs font-medium whitespace-nowrap"
                        >
                          When
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {jobs.map((job) => {
                        const pending = Math.max(
                          job.totalRows - job.succeededRows - job.failedRows,
                          0,
                        );
                        return (
                          <tr
                            key={job.id}
                            className="transition-colors duration-[140ms] hover:bg-surface-sunken/60"
                          >
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-3">
                                <span
                                  aria-hidden
                                  className={cn(
                                    'h-7 w-0.5 shrink-0 rounded-full',
                                    severityOf(job) === 'critical'
                                      ? 'bg-critical'
                                      : severityOf(job) === 'caution'
                                        ? 'bg-caution'
                                        : job.status === 'completed'
                                          ? 'bg-positive'
                                          : 'bg-line-strong',
                                  )}
                                />
                                <span className="min-w-0">
                                  <Link
                                    href={`/console/imports/${job.id}`}
                                    className="block truncate font-medium text-ink hover:text-accent"
                                  >
                                    {job.filename}
                                  </Link>
                                  <span className="block truncate text-2xs text-ink-subtle">
                                    {job.source === 'api' ? 'Connector' : 'CSV'} ·{' '}
                                    {job.totalRows.toLocaleString('en-GB')} rows ·{' '}
                                    {job.createdByName ?? 'Unknown'}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <ImportStatus status={job.status} />
                            </td>
                            <td className="px-4 py-3">
                              {job.succeededRows + job.failedRows === 0 ? (
                                <span className="text-xs text-ink-subtle">Not run yet</span>
                              ) : (
                                <span className="block w-40 max-w-full">
                                  <StackedBar
                                    height={6}
                                    ariaLabel={`${job.succeededRows} imported, ${job.failedRows} failed, ${pending} not processed`}
                                    segments={[
                                      {
                                        key: 'ok',
                                        label: 'Imported',
                                        value: job.succeededRows,
                                        colour: STATUS.good,
                                      },
                                      {
                                        key: 'failed',
                                        label: 'Failed',
                                        value: job.failedRows,
                                        colour: STATUS.critical,
                                      },
                                      {
                                        key: 'pending',
                                        label: 'Not processed',
                                        value: pending,
                                        colour: 'var(--color-line-strong)',
                                      },
                                    ]}
                                  />
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {job.succeededRows > 0 ? (
                                <span className="text-positive">
                                  {job.succeededRows.toLocaleString('en-GB')}
                                </span>
                              ) : (
                                <span className="text-ink-subtle">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {job.failedRows > 0 ? (
                                <Link
                                  href={`/console/imports/${job.id}`}
                                  className="font-medium text-critical hover:underline"
                                >
                                  {job.failedRows.toLocaleString('en-GB')}
                                </Link>
                              ) : (
                                <span className="text-ink-subtle">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-xs tabular-nums text-ink-muted whitespace-nowrap">
                              {formatWhen(job)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="text-sm font-semibold text-ink">Where every row ended up</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Across the last {jobs.length} {jobs.length === 1 ? 'run' : 'runs'}.
                </p>
                <div className="mt-4">
                  <StackedBar
                    ariaLabel={`${imported} imported, ${failed} failed, ${Math.max(read - processed, 0)} never run`}
                    segments={[
                      { key: 'ok', label: 'Imported', value: imported, colour: STATUS.good },
                      { key: 'failed', label: 'Failed', value: failed, colour: STATUS.critical },
                      {
                        key: 'pending',
                        label: 'Never run',
                        value: Math.max(read - processed, 0),
                        colour: 'var(--color-line-strong)',
                      },
                    ]}
                  />
                  <Legend
                    className="mt-3"
                    items={[
                      {
                        key: 'ok',
                        label: 'Imported',
                        value: imported.toLocaleString('en-GB'),
                        colour: STATUS.good,
                      },
                      {
                        key: 'failed',
                        label: 'Failed',
                        value: failed.toLocaleString('en-GB'),
                        colour: STATUS.critical,
                      },
                      {
                        key: 'pending',
                        label: 'Never run',
                        value: Math.max(read - processed, 0).toLocaleString('en-GB'),
                        colour: 'var(--color-line-strong)',
                      },
                    ]}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="text-sm font-semibold text-ink">Where the data came from</h2>
                <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                  A connector removes the export step. The mapping and review are identical either
                  way.
                </p>
                <BarChart
                  data={[
                    {
                      key: 'csv',
                      label: 'Uploaded file',
                      value: fromCsv,
                      colour: seriesColour(0),
                    },
                    {
                      key: 'api',
                      label: 'Connector',
                      value: fromConnector,
                      colour: seriesColour(1),
                    },
                  ].filter((entry) => entry.value > 0)}
                  formatValue={(n) => `${n} ${n === 1 ? 'run' : 'runs'}`}
                  emptyMessage="No runs to compare yet."
                />
                {fromConnector === 0 ? (
                  <Link
                    href="/console/connectors"
                    className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    Connect a PIM or PLM instead
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                ) : null}
              </section>

              {withFailures.length > 0 ? (
                <section className="rounded-lg border border-line bg-surface p-5">
                  <h2 className="text-sm font-semibold text-ink">Runs with rows left behind</h2>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    Each one has a failures file you can fix and re-import. Rows that already went in
                    are matched, not duplicated.
                  </p>
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {withFailures.slice(0, 5).map((job) => (
                      <li key={job.id} className="flex items-baseline gap-2.5 text-xs">
                        <span
                          aria-hidden
                          className="mt-1 size-1.5 shrink-0 rounded-full bg-critical"
                        />
                        <Link
                          href={`/console/imports/${job.id}`}
                          className="min-w-0 flex-1 truncate text-ink hover:text-accent"
                        >
                          {job.filename}
                        </Link>
                        <span className="shrink-0 tabular-nums text-critical">
                          {job.failedRows.toLocaleString('en-GB')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function sum(jobs: ImportJobSummary[], pick: (job: ImportJobSummary) => number): number {
  return jobs.reduce((total, job) => total + pick(job), 0);
}

function isWaiting(job: ImportJobSummary): boolean {
  return job.status === 'mapping' || job.status === 'ready' || job.status === 'importing';
}

/**
 * Urgency, not recency.
 *
 * A half-finished import is the worst state a job can be in — some rows are
 * written and some are not — so it sorts above everything, including a failure.
 */
function rank(job: ImportJobSummary): number {
  if (job.status === 'importing') return 0;
  if (job.status === 'failed') return 1;
  if (job.status === 'mapping' || job.status === 'ready' || job.status === 'uploaded') return 2;
  if (job.failedRows > 0) return 3;
  return 4;
}

function severityOf(job: ImportJobSummary): 'critical' | 'caution' | 'neutral' {
  if (job.status === 'failed' || job.status === 'importing') return 'critical';
  if (isWaiting(job) || job.failedRows > 0) return 'caution';
  return 'neutral';
}

function nextStep(job: ImportJobSummary): string {
  switch (job.status) {
    case 'importing':
      return `Part-way through — ${job.succeededRows.toLocaleString('en-GB')} of ${job.totalRows.toLocaleString('en-GB')} written. Carry on.`;
    case 'failed':
      return 'The run stopped. Open it to see where.';
    case 'uploaded':
    case 'mapping':
      return 'Columns are not confirmed yet. Match them to passport fields.';
    case 'ready':
      return 'Mapped and checked. Review what it would do, then import.';
    default:
      return `${job.failedRows.toLocaleString('en-GB')} rows did not go in.`;
  }
}

function formatWhen(job: ImportJobSummary): string {
  const date = job.completedAt ?? job.createdAt;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
