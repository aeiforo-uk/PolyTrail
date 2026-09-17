'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Info,
  PencilLine,
  PlayCircle,
  RefreshCw,
  SkipForward,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { Legend, StackedBar } from '@/components/viz/bar-chart';
import { STATUS } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';
import { applyFixesAction, reopenMappingAction, startImportAction } from '../actions';
import type { PreviewRow, ReviewData, ReviewRow } from '../queries';

type Lens = 'create' | 'update' | 'skip' | 'error';

const OUTCOMES: Array<{
  key: Lens;
  label: string;
  hint: string;
  colour: string;
  rail: string;
  tone: 'positive' | 'accent' | 'neutral' | 'critical';
  icon: typeof Sparkles;
}> = [
  {
    key: 'create',
    label: 'Will create',
    hint: 'New passports, one per row.',
    colour: STATUS.good,
    rail: 'bg-positive',
    tone: 'positive',
    icon: Sparkles,
  },
  {
    key: 'update',
    label: 'Will update',
    hint: 'Matched an existing passport.',
    colour: 'var(--color-accent)',
    rail: 'bg-accent',
    tone: 'accent',
    icon: RefreshCw,
  },
  {
    key: 'skip',
    label: 'Will skip',
    hint: 'Nothing in any mapped column.',
    colour: STATUS.neutral,
    rail: 'bg-line-strong',
    tone: 'neutral',
    icon: SkipForward,
  },
  {
    key: 'error',
    label: 'Has errors',
    hint: 'Fix them here, or import the rest.',
    colour: STATUS.critical,
    rail: 'bg-critical',
    tone: 'critical',
    icon: AlertCircle,
  },
];

/**
 * The review step, and the reason this module was written.
 *
 * A competitor's importer renders a failed run as seventeen identical lines of
 * red text with nothing to click. The operator is told something is wrong and
 * given no way to act on it, so they go back to the spreadsheet, guess, and
 * upload again.
 *
 * Here the four counters are the filter: pressing one changes what the panel
 * below shows. Failing rows are an editable grid — every failing cell is an
 * input, the message sits under the cell that caused it, and re-checking
 * happens against the corrected data without another upload. The passing rows
 * are previewable but never demanded of anyone, because a row that is fine
 * needs no attention and should not be asking for any.
 */
export function ReviewStep({ jobId, review }: { jobId: string; review: ReviewData }) {
  const router = useRouter();
  const [current, setCurrent] = React.useState(review);
  const [edits, setEdits] = React.useState<Record<number, Record<string, string>>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [lens, setLens] = React.useState<Lens>(review.counts.error > 0 ? 'error' : 'create');
  const [checking, startChecking] = React.useTransition();
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);

  React.useEffect(() => {
    setCurrent(review);
    setEdits({});
  }, [review]);

  const { counts } = current;
  const willWrite = counts.create + counts.update;
  const editedRows = Object.keys(edits).length;
  const dirty = editedRows > 0;

  const values: Record<Lens, number> = {
    create: counts.create,
    update: counts.update,
    skip: counts.skip,
    error: counts.error,
  };

  const edit = (index: number, header: string, value: string) => {
    setEdits((all) => ({ ...all, [index]: { ...(all[index] ?? {}), [header]: value } }));
  };

  const recheck = () => {
    setMessage(null);
    startChecking(async () => {
      const fixes = Object.entries(edits).map(([index, cells]) => ({ index: Number(index), cells }));
      const result = await applyFixesAction(jobId, fixes);
      if (result.ok && result.review) {
        setCurrent(result.review);
        setEdits({});
        if (result.review.counts.error === 0) {
          setMessage('Every row passes now.');
          setLens('create');
        } else {
          setMessage(
            `${result.review.counts.error} row${result.review.counts.error === 1 ? '' : 's'} still need attention.`,
          );
        }
      } else {
        setMessage(result.message ?? 'Those corrections could not be saved.');
      }
    });
  };

  /**
   * Large files are imported in batches, so the action is called until it says
   * there is nothing left. The alternative — one request for two thousand rows
   * — is a request that times out with the job half done and no record of it.
   */
  const run = async () => {
    setRunning(true);
    setMessage(null);
    try {
      for (let pass = 0; pass < 50; pass++) {
        const outcome = await startImportAction(jobId);
        if (!outcome.ok) {
          setMessage(outcome.message ?? 'The import could not be started.');
          return;
        }
        setProgress({
          done: (outcome.succeeded ?? 0) + (outcome.failed ?? 0),
          total: outcome.total ?? counts.total,
        });
        if (!outcome.more) break;
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  };

  const segments = OUTCOMES.map((outcome) => ({
    key: outcome.key,
    label: outcome.label,
    value: values[outcome.key],
    colour: outcome.colour,
  })).filter((segment) => segment.value > 0);

  return (
    <div className="flex flex-col gap-6">
      <StatRow>
        {OUTCOMES.map((outcome) => {
          const selected = lens === outcome.key;
          const value = values[outcome.key];
          return (
            <div key={outcome.key} className="group relative flex flex-col">
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-0 top-0 z-10 h-0.5 transition-opacity duration-[140ms]',
                  outcome.rail,
                  selected ? 'opacity-100' : 'opacity-0',
                )}
              />
              <StatTile
                label={outcome.label}
                value={value.toLocaleString('en-GB')}
                context={
                  counts.total === 0
                    ? outcome.hint
                    : `${Math.round((value / counts.total) * 100)}% of ${counts.total.toLocaleString('en-GB')} rows`
                }
                tone={value === 0 ? 'neutral' : outcome.tone}
                className={cn(
                  'h-full flex-1 group-hover:bg-surface-sunken/60',
                  selected && 'bg-surface-sunken',
                  !selected && value === 0 && 'opacity-60',
                )}
              />
              {/* The tile is the control. The overlay keeps the button's
                  content model valid — a paragraph inside a <button> is not. */}
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setLens(outcome.key)}
                className="absolute inset-0 rounded-xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-info-soft focus-visible:ring-inset"
              >
                <span className="sr-only">
                  Show the {value.toLocaleString('en-GB')} rows that {outcome.label.toLowerCase()}
                </span>
              </button>
            </div>
          );
        })}
      </StatRow>

      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">What pressing import would do</h2>
          <p className="text-xs tabular-nums text-ink-subtle">
            {counts.total.toLocaleString('en-GB')} rows read
          </p>
        </div>
        <div className="mt-4">
          <StackedBar
            ariaLabel={segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}
            segments={segments}
          />
          <Legend
            className="mt-3"
            items={OUTCOMES.map((outcome) => ({
              key: outcome.key,
              label: outcome.label,
              value: values[outcome.key].toLocaleString('en-GB'),
              colour: outcome.colour,
            }))}
          />
        </div>
      </section>

      {message ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
          {message}
        </p>
      ) : null}

      <Advisories review={current} />

      {lens === 'error' ? (
        current.failing.length > 0 ? (
          <FailureGrid
            review={current}
            edits={edits}
            editedRows={editedRows}
            onEdit={edit}
            onRecheck={recheck}
            checking={checking}
            dirty={dirty}
            jobId={jobId}
          />
        ) : (
          <p className="flex items-center gap-2 rounded-md border border-positive-border bg-positive-soft px-4 py-3 text-sm text-positive">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            No row has an error. Nothing needs fixing.
          </p>
        )
      ) : (
        <PreviewTable
          lens={lens}
          review={current}
          rows={
            lens === 'create' ? current.creating : lens === 'update' ? current.updating : current.skipping
          }
          total={values[lens]}
        />
      )}

      <div className="sticky bottom-0 -mx-8 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-8 py-4 backdrop-blur">
        <p className="text-sm text-ink-muted">
          {progress
            ? `${progress.done.toLocaleString('en-GB')} of ${progress.total.toLocaleString('en-GB')} rows processed.`
            : counts.error > 0
              ? `${willWrite.toLocaleString('en-GB')} row${willWrite === 1 ? '' : 's'} are ready. The ${counts.error.toLocaleString('en-GB')} with errors are left behind and can be fixed and re-run.`
              : `${willWrite.toLocaleString('en-GB')} row${willWrite === 1 ? '' : 's'} will be written.`}
        </p>
        <div className="flex items-center gap-2">
          <form action={reopenMappingAction.bind(null, jobId)}>
            <Button type="submit" variant="ghost" size="md">
              Change the mapping
            </Button>
          </form>
          <Button onClick={run} loading={running} disabled={willWrite === 0}>
            <PlayCircle aria-hidden />
            {counts.error > 0
              ? `Import the ${willWrite.toLocaleString('en-GB')} ready rows`
              : `Import ${willWrite.toLocaleString('en-GB')} rows`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The editable grid.
 *
 * Only the columns that carry an error are editable, plus whatever identifies
 * the row — showing forty columns to fix one is how a grid becomes unusable at
 * the width of a laptop. Every failing row carries a red rail so the eye can
 * find where one row ends and the next begins while scrolling sideways.
 */
function FailureGrid({
  review,
  edits,
  editedRows,
  onEdit,
  onRecheck,
  checking,
  dirty,
  jobId,
}: {
  review: ReviewData;
  edits: Record<number, Record<string, string>>;
  editedRows: number;
  onEdit: (index: number, header: string, value: string) => void;
  onRecheck: () => void;
  checking: boolean;
  dirty: boolean;
  jobId: string;
}) {
  const identity = identityColumns(review);
  const editable = review.errorColumns.filter((header) => !identity.includes(header));
  const shown = [...identity, ...editable];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {review.failingTotal.toLocaleString('en-GB')} row
            {review.failingTotal === 1 ? '' : 's'} need fixing
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            Edit the cells here and check them again. Corrections are saved to this import, so the
            file on your computer does not have to be touched — and only the columns that actually
            went wrong are shown.
            {review.failing.length < review.failingTotal
              ? ` Showing the first ${review.failing.length}.`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={`/console/imports/${jobId}/failures`} download>
              <Download aria-hidden />
              Download the failures
            </a>
          </Button>
          <Button onClick={onRecheck} loading={checking} disabled={!dirty} size="sm">
            <RefreshCw aria-hidden />
            {dirty
              ? `Check ${editedRows} edited row${editedRows === 1 ? '' : 's'} again`
              : 'Check again'}
          </Button>
        </div>
      </div>

      {dirty ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-accent-border bg-accent-soft px-4 py-2.5 text-xs text-accent"
        >
          <PencilLine className="size-3.5 shrink-0" aria-hidden />
          {editedRows} row{editedRows === 1 ? '' : 's'} edited but not yet re-checked.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-subtle">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                Line
              </th>
              {shown.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="mono px-4 py-2.5 text-xs font-medium whitespace-nowrap"
                >
                  {header}
                  {review.errorColumns.includes(header) ? (
                    <span className="ml-1.5 text-critical" title="This column has errors">
                      ●
                    </span>
                  ) : null}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 text-xs font-medium">
                Problem
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {review.failing.map((row) => (
              <FailureRow
                key={row.index}
                row={row}
                columns={shown}
                identity={identity}
                edits={edits[row.index] ?? {}}
                onEdit={onEdit}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FailureRow({
  row,
  columns,
  identity,
  edits,
  onEdit,
}: {
  row: ReviewRow;
  columns: string[];
  identity: string[];
  edits: Record<string, string>;
  onEdit: (index: number, header: string, value: string) => void;
}) {
  const touched = Object.keys(edits).length > 0;
  const problems =
    row.rowErrors.length + Object.values(row.errors).reduce((n, list) => n + list.length, 0);

  return (
    <tr className="align-top">
      <td className="py-3 pr-4 pl-4">
        <span className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 h-8 w-0.5 shrink-0 rounded-full',
              touched ? 'bg-accent' : 'bg-critical',
            )}
          />
          <span>
            <span className="mono block text-xs tabular-nums text-ink">{row.line}</span>
            <span className="block text-2xs tabular-nums text-ink-subtle">
              {problems} {problems === 1 ? 'problem' : 'problems'}
            </span>
          </span>
        </span>
      </td>

      {columns.map((header) => {
        const errors = row.errors[header] ?? [];
        const value = edits[header] ?? row.cells[header] ?? '';
        const readOnly = identity.includes(header) && errors.length === 0;

        return (
          <td key={header} className="px-4 py-3">
            {readOnly ? (
              <span className="mono block max-w-48 truncate text-xs text-ink-muted" title={value}>
                {value || '—'}
              </span>
            ) : (
              <>
                <Input
                  value={value}
                  aria-label={`${header}, line ${row.line}`}
                  aria-invalid={errors.length > 0 ? true : undefined}
                  onChange={(event) => onEdit(row.index, header, event.target.value)}
                  className={cn(
                    'mono h-8 w-44 text-xs',
                    errors.length > 0 && 'border-critical',
                    edits[header] !== undefined && 'border-accent',
                  )}
                />
                {errors.map((error, index) => (
                  <p
                    key={index}
                    className="mt-1 flex max-w-48 items-start gap-1 text-2xs leading-snug text-critical"
                  >
                    <AlertCircle className="mt-px size-3 shrink-0" aria-hidden />
                    <span>{error}</span>
                  </p>
                ))}
              </>
            )}
          </td>
        );
      })}

      <td className="px-4 py-3">
        {row.rowErrors.length > 0 ? (
          <div className="flex flex-col gap-1">
            {row.rowErrors.map((error, index) => (
              <p
                key={index}
                className="flex max-w-md items-start gap-1.5 text-xs leading-snug text-critical"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{error}</span>
              </p>
            ))}
          </div>
        ) : (
          <span className="text-xs text-ink-subtle">See the highlighted cells.</span>
        )}
      </td>
    </tr>
  );
}

/** A read-only look at rows that need no attention, for spot-checking. */
function PreviewTable({
  lens,
  review,
  rows,
  total,
}: {
  lens: Exclude<Lens, 'error'>;
  review: ReviewData;
  rows: PreviewRow[];
  total: number;
}) {
  const copy = {
    create: {
      title: 'Rows that would create a new passport',
      body: 'No existing passport matched their GTIN, SKU or style reference, so each one becomes a new draft.',
      empty: 'Every row in this file matched a passport you already hold, so nothing new would be created.',
    },
    update: {
      title: 'Rows that would update a passport you already hold',
      body: 'Each matched an existing passport. A new version is written — nothing is deleted, and the previous version stays in the history.',
      empty: 'No row matched an existing passport, so nothing would be updated.',
    },
    skip: {
      title: 'Rows that would be skipped',
      body: 'Every mapped column is blank on these rows, usually a trailing empty line or a spacer row. They are ignored, not rejected.',
      empty: 'No blank rows in this file.',
    },
  }[lens];

  if (total === 0) {
    return (
      <section className="rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-5 py-10 text-center">
        <p className="text-sm font-medium text-ink">{copy.title}</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">{copy.empty}</p>
      </section>
    );
  }

  const columns = review.previewColumns;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{copy.title}</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          {copy.body}
          {rows.length < total
            ? ` Showing the first ${rows.length} of ${total.toLocaleString('en-GB')} — they pass, so there is nothing to do here.`
            : ''}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-subtle">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                Line
              </th>
              {columns.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="mono px-4 py-2.5 text-xs font-medium whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
              {lens === 'update' ? (
                <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                  Matched on
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.index} className="transition-colors duration-[140ms] hover:bg-surface-sunken/60">
                <td className="py-3 pr-4 pl-4">
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'h-5 w-0.5 shrink-0 rounded-full',
                        lens === 'create'
                          ? 'bg-positive'
                          : lens === 'update'
                            ? 'bg-accent'
                            : 'bg-line-strong',
                      )}
                    />
                    <span className="mono text-xs tabular-nums text-ink-muted">{row.line}</span>
                  </span>
                </td>
                {columns.map((header) => (
                  <td key={header} className="px-4 py-3">
                    <span
                      className="mono block max-w-56 truncate text-xs text-ink"
                      title={row.values[header] ?? ''}
                    >
                      {row.values[header] || <span className="text-ink-subtle">—</span>}
                    </span>
                  </td>
                ))}
                {lens === 'update' ? (
                  <td className="mono px-4 py-3 text-xs text-ink-muted">{row.matchedBy ?? '—'}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Things worth saying before the import runs, none of them fatal — ranked, so
 * the one that will actually bite is at the top rather than sharing an amber
 * box with two housekeeping notes.
 */
function Advisories({ review }: { review: ReviewData }) {
  const notes: Array<{ key: string; severity: 'caution' | 'neutral'; body: React.ReactNode }> = [];

  if (review.unkeyedCount > 0) {
    notes.push({
      key: 'unkeyed',
      severity: 'caution',
      body: (
        <>
          <strong className="font-semibold">
            {review.unkeyedCount.toLocaleString('en-GB')} row
            {review.unkeyedCount === 1 ? ' has' : 's have'} no GTIN, SKU or style reference.
          </strong>{' '}
          {review.unkeyedCount === 1 ? 'It' : 'They'} will create a new passport every time this file
          is imported. Add an identifier now and the next import updates instead of duplicating.
        </>
      ),
    });
  }

  if (review.counts.warning > 0) {
    notes.push({
      key: 'warning',
      severity: 'caution',
      body: (
        <>
          <strong className="font-semibold">
            {review.counts.warning.toLocaleString('en-GB')} row
            {review.counts.warning === 1 ? '' : 's'} contain values that were interpreted rather than
            matched exactly
          </strong>{' '}
          — a fibre written as free text, for example. They will import; check a few afterwards.
        </>
      ),
    });
  }

  if (review.unmappedColumns.length > 0) {
    notes.push({
      key: 'unmapped',
      severity: 'neutral',
      body: (
        <>
          {review.unmappedColumns.length} column
          {review.unmappedColumns.length === 1 ? ' is' : 's are'} not mapped and will be ignored:{' '}
          <span className="mono">{review.unmappedColumns.slice(0, 6).join(', ')}</span>
          {review.unmappedColumns.length > 6 ? ' …' : ''}
        </>
      ),
    });
  }

  if (notes.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {notes.map((note) => (
        <li
          key={note.key}
          className={cn(
            'flex items-start gap-2.5 rounded-md border px-4 py-3 text-sm',
            note.severity === 'caution'
              ? 'border-caution-border bg-caution-soft text-ink'
              : 'border-line bg-surface text-ink-muted',
          )}
        >
          {note.severity === 'caution' ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
          )}
          <span className="min-w-0">{note.body}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columns that tell the operator which product a row is. */
function identityColumns(review: ReviewData): string[] {
  const wanted = ['identity.styleNumber', 'identity.productName', 'identity.sku'];
  return Object.entries(review.mapping)
    .filter(([, path]) => wanted.includes(path))
    .sort(([, a], [, b]) => wanted.indexOf(a) - wanted.indexOf(b))
    .map(([header]) => header);
}
