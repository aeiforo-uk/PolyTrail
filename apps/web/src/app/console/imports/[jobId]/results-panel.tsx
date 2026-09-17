'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  PlayCircle,
  Upload,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { BarChart, Legend, StackedBar } from '@/components/viz/bar-chart';
import { STATUS } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';
import { startImportAction } from '../actions';
import type { JobResultRow } from '../queries';

/** Rows listed before the table is cut off; the rest are in the export. */
const ROW_LIMIT = 300;

/** Distinct problems ranked before the tail is folded away. */
const REASON_LIMIT = 6;

/**
 * What the run actually did, row by row.
 *
 * A finished import is not a number — it is a list of which products went in
 * and which did not, kept for as long as the job is kept. The problems are
 * ranked before they are listed, because "forty rows failed" is not actionable
 * and "thirty-one of them failed on the same unrecognised category" is: it is
 * one find-and-replace rather than forty edits.
 *
 * The failures are one click from being a file somebody can fix and re-upload,
 * because that is what happens next in every real workspace.
 */
export function ResultsPanel({
  jobId,
  status,
  total,
  succeeded,
  failed,
  rows,
}: {
  jobId: string;
  status: string;
  total: number;
  succeeded: number;
  failed: number;
  rows: JobResultRow[];
}) {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  const unfinished = status === 'importing';
  const cancelled = status === 'cancelled';
  const failures = React.useMemo(() => rows.filter((row) => !row.ok), [rows]);
  const processed = succeeded + failed;
  const pending = Math.max(total - processed, 0);

  const reasons = React.useMemo(() => rankReasons(failures), [failures]);
  const shown = showAll || failures.length === 0 ? rows : failures;

  const resume = async () => {
    setRunning(true);
    setMessage(null);
    try {
      for (let pass = 0; pass < 50; pass++) {
        const outcome = await startImportAction(jobId);
        if (!outcome.ok) {
          setMessage(outcome.message ?? 'The import could not be resumed.');
          return;
        }
        if (!outcome.more) break;
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <StatRow>
        <StatTile
          label="Passports written"
          value={succeeded.toLocaleString('en-GB')}
          context={
            total === 0 ? 'nothing to write' : `${Math.round((succeeded / total) * 100)}% of the file`
          }
          tone={succeeded > 0 ? 'positive' : 'neutral'}
        />
        <StatTile
          label="Rows left behind"
          value={failed.toLocaleString('en-GB')}
          context={
            failed === 0
              ? 'every row landed'
              : `${reasons.length} distinct ${reasons.length === 1 ? 'problem' : 'problems'}`
          }
          tone={failed > 0 ? 'critical' : 'neutral'}
        />
        <StatTile
          label="Rows in the file"
          value={total.toLocaleString('en-GB')}
          context={pending > 0 ? `${pending.toLocaleString('en-GB')} not processed yet` : 'all processed'}
          tone={pending > 0 ? 'caution' : 'neutral'}
        />
        <StatTile
          label="Biggest single cause"
          value={reasons[0] ? reasons[0].count.toLocaleString('en-GB') : '—'}
          context={reasons[0] ? reasons[0].label : 'nothing failed'}
          tone={reasons[0] ? 'critical' : 'positive'}
        />
      </StatRow>

      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">How the run finished</h2>
          <p className="text-xs tabular-nums text-ink-subtle">
            {processed.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')} rows processed
          </p>
        </div>
        <div className="mt-4">
          <StackedBar
            ariaLabel={`${succeeded} imported, ${failed} failed, ${pending} not processed`}
            segments={[
              { key: 'ok', label: 'Imported', value: succeeded, colour: STATUS.good },
              { key: 'failed', label: 'Failed', value: failed, colour: STATUS.critical },
              {
                key: 'pending',
                label: 'Not processed',
                value: pending,
                colour: 'var(--color-line-strong)',
              },
            ].filter((segment) => segment.value > 0)}
          />
          <Legend
            className="mt-3"
            items={[
              {
                key: 'ok',
                label: 'Imported',
                value: succeeded.toLocaleString('en-GB'),
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
                label: 'Not processed',
                value: pending.toLocaleString('en-GB'),
                colour: 'var(--color-line-strong)',
              },
            ]}
          />
        </div>
      </section>

      {message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
      ) : null}

      {unfinished ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent-border bg-accent-soft px-4 py-3">
          <p className="text-sm text-ink">
            This import is part-way through — {pending.toLocaleString('en-GB')} rows are still
            waiting. Rows already imported are matched, not written twice, when it resumes.
          </p>
          <Button onClick={resume} loading={running} size="sm">
            <PlayCircle aria-hidden />
            Carry on importing
          </Button>
        </div>
      ) : cancelled ? (
        <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
          This import was cancelled. Nothing further will be written from it.
        </p>
      ) : failed > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-caution-border bg-caution-soft px-4 py-3">
          <p className="text-sm text-ink">
            {succeeded.toLocaleString('en-GB')} row{succeeded === 1 ? '' : 's'} went in and{' '}
            {failed.toLocaleString('en-GB')} did not. The failures file carries every rejected row
            with its problem spelled out in the last column — fix it, import that file, and the{' '}
            {succeeded.toLocaleString('en-GB')} already imported will be matched rather than
            duplicated.
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={`/console/imports/${jobId}/failures`} download>
                <Download aria-hidden />
                Download the failures
              </a>
            </Button>
            <Button asChild size="sm">
              <Link href="/console/imports/new">
                <Upload aria-hidden />
                Import the fixed file
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-md border border-positive-border bg-positive-soft px-4 py-3 text-sm text-positive">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Every row imported. {succeeded.toLocaleString('en-GB')} passports are now in your
          catalogue.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                {showAll || failures.length === 0
                  ? 'Every row'
                  : `The ${failures.length.toLocaleString('en-GB')} rows that did not go in`}
              </h2>
              <p className="mt-1 max-w-prose text-sm text-ink-muted">
                {failures.length === 0
                  ? 'Each row links to the passport it created or updated.'
                  : 'Failing rows first — the ones that worked need no attention.'}
              </p>
            </div>
            {failures.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => setShowAll((value) => !value)}>
                {showAll
                  ? `Only the ${failures.length.toLocaleString('en-GB')} failures`
                  : `All ${rows.length.toLocaleString('en-GB')} rows`}
              </Button>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                    Line
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-medium">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                    Outcome
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-medium">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.slice(0, ROW_LIMIT).map((row) => (
                  <tr key={row.index} className="align-top">
                    <td className="py-3 pr-4 pl-4">
                      <span className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className={cn(
                            'mt-0.5 h-6 w-0.5 shrink-0 rounded-full',
                            row.ok ? 'bg-positive' : 'bg-critical',
                          )}
                        />
                        <span className="mono text-xs tabular-nums text-ink-muted">{row.line}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">{row.label}</td>
                    <td className="px-4 py-3">
                      {row.ok ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-positive">
                          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                          Imported
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-critical">
                          <XCircle className="size-3.5 shrink-0" aria-hidden />
                          Rejected
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.ok && row.dppId ? (
                        <Link
                          href={`/console/passports/${row.dppId}`}
                          className="mono inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          {row.dppId}
                          <ExternalLink className="size-3" aria-hidden />
                        </Link>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {row.rowErrors.map((error, index) => (
                            <p key={index} className="max-w-xl text-xs leading-snug text-critical">
                              {error}
                            </p>
                          ))}
                          {Object.entries(row.errors).map(([column, messages]) => (
                            <p key={column} className="max-w-xl text-xs leading-snug text-critical">
                              <span className="mono text-ink-muted">{column}: </span>
                              {messages.join(' ')}
                            </p>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {shown.length > ROW_LIMIT ? (
            <p className="text-sm text-ink-muted">
              Showing the first {ROW_LIMIT} of {shown.length.toLocaleString('en-GB')}. The rest are
              in the download.
            </p>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          {reasons.length > 0 ? (
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Why rows were rejected</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                Ranked by how many rows each affects. The top one is usually a single
                find-and-replace in the source file.
              </p>
              <BarChart
                data={reasons.slice(0, REASON_LIMIT).map((reason) => ({
                  key: reason.key,
                  label: reason.label,
                  value: reason.count,
                  colour: STATUS.critical,
                }))}
                formatValue={(n) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'row' : 'rows'}`}
                emptyMessage="Nothing failed."
              />
              {reasons.length > REASON_LIMIT ? (
                <p className="mt-3 text-2xs text-ink-subtle">
                  and {reasons.length - REASON_LIMIT} other{' '}
                  {reasons.length - REASON_LIMIT === 1 ? 'problem' : 'problems'} affecting one or two
                  rows each.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">What to do next</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {failed > 0 ? (
                <li className="flex gap-2.5">
                  <Download className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                  <span className="min-w-0">
                    <a
                      href={`/console/imports/${jobId}/failures`}
                      download
                      className="block text-xs font-medium text-accent hover:underline"
                    >
                      Download the failures
                    </a>
                    <span className="block text-2xs leading-relaxed text-ink-subtle">
                      Every rejected row, its original values, and its problem in the last column.
                      Forward it to whoever owns the data.
                    </span>
                  </span>
                </li>
              ) : null}
              <li className="flex gap-2.5">
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                <span className="min-w-0">
                  <Link
                    href="/console/passports"
                    className="block text-xs font-medium text-accent hover:underline"
                  >
                    Open the catalogue
                  </Link>
                  <span className="block text-2xs leading-relaxed text-ink-subtle">
                    Imported rows arrive as drafts. They are not public until someone publishes them.
                  </span>
                </span>
              </li>
              <li className="flex gap-2.5">
                <Upload className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                <span className="min-w-0">
                  <Link
                    href="/console/imports/new"
                    className="block text-xs font-medium text-accent hover:underline"
                  >
                    Import another file
                  </Link>
                  <span className="block text-2xs leading-relaxed text-ink-subtle">
                    Rows carrying a GTIN, SKU or style reference already seen here will update rather
                    than duplicate.
                  </span>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

interface Reason {
  key: string;
  label: string;
  count: number;
}

/**
 * Group identical problems.
 *
 * Numbers inside a message are replaced before grouping, so "row 12" and
 * "row 340" do not count as two different problems when they are one.
 */
function rankReasons(failures: JobResultRow[]): Reason[] {
  const counts = new Map<string, Reason>();

  const add = (label: string) => {
    const key = label.toLowerCase().replace(/\d+/g, '#');
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { key, label, count: 1 });
  };

  for (const row of failures) {
    const seen = new Set<string>();
    for (const error of row.rowErrors) seen.add(error);
    for (const [column, messages] of Object.entries(row.errors)) {
      for (const message of messages) seen.add(`${column}: ${message}`);
    }
    for (const label of seen) add(label);
  }

  return [...counts.values()].sort((a, b) => b.count - a.count);
}
