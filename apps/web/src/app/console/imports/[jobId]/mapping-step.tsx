'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CircleDashed,
  CircleSlash,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { Meter } from '@/components/viz/meter';
import { cn } from '@/lib/utils';
import { saveMappingAction } from '../actions';

export interface MappingTarget {
  path: string;
  label: string;
  basis: string;
  section: string;
  required: boolean;
}

export interface MappingColumn {
  header: string;
  /** Two real values from the file, so a guess can be checked against data. */
  samples: string[];
  /** How many rows have a value in this column at all. */
  filled: number;
  path: string | null;
  confidence: string;
  /** Paths the guesser also considered, offered first in the picker. */
  alternatives: string[];
}

type Lens = 'all' | 'needs-a-look' | 'unmapped';

/**
 * Matching columns to passport fields.
 *
 * One card per column, each showing two values actually in the file. A mapping
 * screen that shows only column names asks the operator to remember what
 * `ATTR_17` contains; showing "Navy" and "Ecru" beside it answers the question
 * without them having to open the spreadsheet again.
 *
 * Confidence is drawn as three segments rather than written as a word, because
 * the operator is scanning forty cards for the two that are wrong and a word
 * has to be read one at a time. The word stays as well — colour alone is not a
 * status.
 *
 * The right-hand rail is the part that stops a bad import: it lists every field
 * a passport cannot be published without and says, for each, which column is
 * feeding it. An unmapped required field sits at the top of that list under a
 * red rail and is repeated as a banner. Nothing is hidden.
 */
export function MappingStep({
  jobId,
  columns,
  targets,
  rowCount,
}: {
  jobId: string;
  columns: MappingColumn[];
  targets: MappingTarget[];
  rowCount: number;
}) {
  const router = useRouter();
  const [mapping, setMapping] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(columns.filter((c) => c.path).map((c) => [c.header, c.path!])),
  );
  const [filter, setFilter] = React.useState('');
  const [lens, setLens] = React.useState<Lens>('all');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, startSaving] = React.useTransition();

  const byPath = React.useMemo(
    () => new Map(targets.map((target) => [target.path, target])),
    [targets],
  );

  const sections = React.useMemo(() => {
    const groups = new Map<string, MappingTarget[]>();
    for (const target of targets) {
      const existing = groups.get(target.section);
      if (existing) existing.push(target);
      else groups.set(target.section, [target]);
    }
    return [...groups];
  }, [targets]);

  const requiredTargets = React.useMemo(
    () => targets.filter((target) => target.required),
    [targets],
  );

  // A path can only be claimed once — two columns writing the same field means
  // one of them is silently discarded, which is the failure this whole module
  // exists to prevent.
  const claimed = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const path of Object.values(mapping)) counts.set(path, (counts.get(path) ?? 0) + 1);
    return counts;
  }, [mapping]);

  const columnForPath = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const [header, path] of Object.entries(mapping)) if (!out.has(path)) out.set(path, header);
    return out;
  }, [mapping]);

  const byHeader = React.useMemo(
    () => new Map(columns.map((column) => [column.header, column])),
    [columns],
  );

  const mappedCount = Object.keys(mapping).length;
  const duplicates = [...claimed].filter(([, count]) => count > 1).map(([path]) => path);
  const confident = columns.filter(
    (column) =>
      mapping[column.header] &&
      (column.confidence === 'exact' || column.confidence === 'chosen'),
  ).length;
  const needsALook = columns.filter(
    (column) =>
      mapping[column.header] && column.confidence !== 'exact' && column.confidence !== 'chosen',
  ).length;
  const missingRequired = requiredTargets.filter((target) => !columnForPath.has(target.path));

  const visible = columns.filter((column) => {
    const path = mapping[column.header] ?? '';
    if (lens === 'unmapped' && path !== '') return false;
    if (lens === 'needs-a-look') {
      if (path === '') return false;
      if (column.confidence === 'exact' || column.confidence === 'chosen') return false;
    }
    if (filter.trim() === '') return true;
    const needle = filter.toLowerCase();
    const target = path ? byPath.get(path) : undefined;
    return (
      column.header.toLowerCase().includes(needle) ||
      (target?.label ?? '').toLowerCase().includes(needle) ||
      column.samples.some((sample) => sample.toLowerCase().includes(needle))
    );
  });

  const choose = (header: string, path: string) => {
    setMapping((current) => {
      const next = { ...current };
      if (path === '') delete next[header];
      else next[header] = path;
      return next;
    });
  };

  const submit = () => {
    setError(null);
    startSaving(async () => {
      const result = await saveMappingAction(jobId, mapping);
      if (result.ok) router.refresh();
      else setError(result.message ?? 'That mapping could not be saved.');
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <StatRow>
        <StatTile
          label="Columns mapped"
          value={mappedCount}
          context={`of ${columns.length} in the file`}
          tone="accent"
        />
        <StatTile
          label="Required fields covered"
          value={requiredTargets.length - missingRequired.length}
          context={`of ${requiredTargets.length} needed to publish`}
          tone={missingRequired.length > 0 ? 'critical' : 'positive'}
        />
        <StatTile
          label="Matched with certainty"
          value={confident}
          context={
            needsALook === 0
              ? 'nothing left to check'
              : `${needsALook} ${needsALook === 1 ? 'guess needs' : 'guesses need'} a look`
          }
          tone={needsALook > 0 ? 'caution' : 'positive'}
        />
        <StatTile
          label="Columns ignored"
          value={columns.length - mappedCount}
          context="stay in the file, never imported"
        />
      </StatRow>

      {missingRequired.length > 0 ? (
        <div
          role="alert"
          className="overflow-hidden rounded-lg border border-critical-border bg-critical-soft"
        >
          <div className="flex items-start gap-3 px-5 py-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-critical">
                {missingRequired.length} required{' '}
                {missingRequired.length === 1 ? 'field has' : 'fields have'} no column
              </p>
              <p className="mt-1 max-w-prose text-sm text-ink">
                Rows missing{' '}
                {missingRequired.length === 1 ? 'this field' : 'any of these'} will be rejected at
                the next step rather than imported half-finished. Map{' '}
                {missingRequired.length === 1 ? 'a column to it' : 'columns to them'}, or carry on
                and fix the rows in the review grid.
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {missingRequired.map((target) => (
                  <li key={target.path}>
                    <Badge tone="critical">{target.label}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {duplicates.length > 0 ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-caution-border bg-caution-soft px-4 py-3 text-sm text-caution"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Two columns are mapped to the same field
            {duplicates.map((path) => ` — ${byPath.get(path)?.label ?? path}`).join(', ')}. Only one
            of them would be kept, so change one before continuing.
          </span>
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Every column in the file</h2>
              <p className="mt-1 max-w-prose text-sm text-ink-muted">
                Check each guess against the two sample values beside it. Anything left unmapped is
                ignored — that is not an error, and the column stays in your file.
              </p>
            </div>
            <Input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Find a column or a value"
              aria-label="Find a column or a value"
              className="w-60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { key: 'all', label: `All ${columns.length}` },
                { key: 'needs-a-look', label: `Needs a look ${needsALook}` },
                { key: 'unmapped', label: `Unmapped ${columns.length - mappedCount}` },
              ] as Array<{ key: Lens; label: string }>
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={lens === option.key}
                onClick={() => setLens(option.key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium tabular-nums',
                  'transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
                  lens === option.key
                    ? 'border-accent-border bg-accent-soft text-accent'
                    : 'border-line bg-surface text-ink-muted hover:border-line-hover hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-5 py-10 text-center text-sm text-ink-muted">
              {lens === 'needs-a-look'
                ? 'Every mapped column was matched exactly or chosen by hand. Nothing here needs checking.'
                : lens === 'unmapped'
                  ? 'Every column in the file is mapped to a passport field.'
                  : 'No column matches that search.'}
            </p>
          ) : (
            <ul className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
              {visible.map((column) => {
                const path = mapping[column.header] ?? '';
                const target = path ? byPath.get(path) : undefined;
                const duplicated = path !== '' && (claimed.get(path) ?? 0) > 1;
                const fill = rowCount === 0 ? 0 : Math.round((column.filled / rowCount) * 100);

                return (
                  <li
                    key={column.header}
                    className={cn(
                      'flex flex-col gap-2.5 rounded-lg border bg-surface px-3.5 py-3',
                      'transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
                      duplicated
                        ? 'border-caution-border'
                        : target?.required
                          ? 'border-accent-border'
                          : path
                            ? 'border-line'
                            : 'border-dashed border-line bg-surface-sunken/30',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="min-w-0 flex-1">
                        <span
                          className="mono block truncate text-sm font-medium text-ink"
                          title={column.header}
                        >
                          {column.header}
                        </span>
                        <span className="mt-0.5 block text-2xs tabular-nums text-ink-subtle">
                          {column.filled.toLocaleString('en-GB')} of{' '}
                          {rowCount.toLocaleString('en-GB')} rows have a value
                        </span>
                      </span>
                      <Meter value={fill} size={28} thickness={3} tone="accent" />
                    </div>

                    <Confidence confidence={column.confidence} mapped={path !== ''} />

                    <div className="flex flex-col gap-1">
                      {column.samples.length > 0 ? (
                        column.samples.map((sample, index) => (
                          <p
                            key={index}
                            className="mono truncate rounded-sm bg-surface-sunken px-2 py-1 text-2xs text-ink-muted"
                            title={sample}
                          >
                            {sample}
                          </p>
                        ))
                      ) : (
                        <p className="rounded-sm border border-dashed border-line px-2 py-1 text-2xs text-ink-subtle">
                          Every row is blank in this column
                        </p>
                      )}
                    </div>

                    <NativeSelect
                      aria-label={`Passport field for ${column.header}`}
                      value={path}
                      onChange={(event) => choose(column.header, event.target.value)}
                      className="h-8 text-xs"
                    >
                      <option value="">Do not import this column</option>
                      {column.alternatives.length > 0 ? (
                        <optgroup label="Suggested">
                          {column.alternatives.map((suggestion) => (
                            <option key={suggestion} value={suggestion}>
                              {byPath.get(suggestion)?.label ?? suggestion}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {sections.map(([section, entries]) => (
                        <optgroup key={section} label={section}>
                          {entries.map((entry) => (
                            <option key={entry.path} value={entry.path}>
                              {entry.label}
                              {entry.required ? ' *' : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </NativeSelect>

                    {target ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {target.required ? <Badge tone="accent">Required</Badge> : null}
                        <span className="mono truncate text-2xs text-ink-subtle" title={target.path}>
                          {target.path}
                        </span>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-2xs text-ink-subtle">
                        <CircleSlash className="size-3 shrink-0" aria-hidden />
                        Ignored — the column stays in your file
                      </p>
                    )}

                    {duplicated ? (
                      <p className="flex items-start gap-1.5 text-2xs text-caution">
                        <AlertCircle className="mt-px size-3 shrink-0" aria-hidden />
                        Another column is already mapped here. One of the two would be discarded.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Required fields</h2>
              <span className="text-xs tabular-nums text-ink-subtle">
                {requiredTargets.length - missingRequired.length}/{requiredTargets.length}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              A passport cannot be published without these. Unmapped ones are listed first.
            </p>

            <ul className="mt-3 flex flex-col gap-px overflow-hidden rounded-md bg-line">
              {[...requiredTargets]
                .sort((a, b) => {
                  const aHas = columnForPath.has(a.path) ? 1 : 0;
                  const bHas = columnForPath.has(b.path) ? 1 : 0;
                  return aHas - bHas;
                })
                .map((target) => {
                  const header = columnForPath.get(target.path);
                  return (
                    <li
                      key={target.path}
                      className="flex items-start gap-2.5 bg-surface px-3 py-2.5"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                          header ? 'bg-positive-soft text-positive' : 'bg-critical-soft text-critical',
                        )}
                      >
                        {header ? (
                          <Check className="size-2.5" />
                        ) : (
                          <CircleDashed className="size-2.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-ink">{target.label}</span>
                        {header ? (
                          <span
                            className="mono block truncate text-2xs text-ink-subtle"
                            title={header}
                          >
                            {header}
                            {byHeader.get(header)?.samples[0]
                              ? ` · ${byHeader.get(header)!.samples[0]}`
                              : ''}
                          </span>
                        ) : (
                          <span className="block text-2xs font-medium text-critical">
                            No column maps here
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">How a guess is graded</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {(
                [
                  ['exact', 'Matched', 'The header is a name we know exactly.'],
                  ['likely', 'Likely', 'Close enough that it is usually right. Check the samples.'],
                  ['possible', 'Guess', 'Plausible only. Check this one properly.'],
                  ['chosen', 'Chosen', 'You picked this, so it is not a guess at all.'],
                ] as Array<[string, string, string]>
              ).map(([key, label, note]) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Strength confidence={key} className="mt-1 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink">{label}</span>
                    <span className="block text-2xs leading-relaxed text-ink-subtle">{note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-8 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-8 py-4 backdrop-blur">
        <p className="text-sm text-ink-muted">
          {mappedCount} of {columns.length} columns will be imported
          {missingRequired.length > 0 ? (
            <span className="text-critical">
              {' '}
              · {missingRequired.length} required{' '}
              {missingRequired.length === 1 ? 'field is' : 'fields are'} still unmapped
            </span>
          ) : null}
          .
        </p>
        <Button
          onClick={submit}
          loading={saving}
          disabled={mappedCount === 0 || duplicates.length > 0}
        >
          Check the rows
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** Confidence as a shape and a word. Colour alone is never the message. */
function Confidence({ confidence, mapped }: { confidence: string; mapped: boolean }) {
  if (!mapped) {
    return (
      <p className="flex items-center gap-2 text-2xs font-medium text-ink-subtle">
        <Strength confidence="none" />
        Not imported
      </p>
    );
  }

  const copy: Record<string, { label: string; tone: string }> = {
    exact: { label: 'Matched exactly', tone: 'text-positive' },
    likely: { label: 'Likely — worth a glance', tone: 'text-accent' },
    possible: { label: 'A guess — check it', tone: 'text-caution' },
    chosen: { label: 'Chosen by you', tone: 'text-ink-muted' },
  };
  const entry = copy[confidence] ?? { label: 'A guess — check it', tone: 'text-caution' };

  return (
    <p className={cn('flex items-center gap-2 text-2xs font-medium', entry.tone)}>
      <Strength confidence={confidence} />
      {confidence === 'chosen' ? (
        <Check className="size-3 shrink-0" aria-hidden />
      ) : (
        <Sparkles className="size-3 shrink-0" aria-hidden />
      )}
      {entry.label}
    </p>
  );
}

/**
 * Three segments. Read at a glance across a grid of forty cards, which is the
 * thing a badge full of words cannot do.
 */
function Strength({ confidence, className }: { confidence: string; className?: string }) {
  const level =
    confidence === 'exact' || confidence === 'chosen'
      ? 3
      : confidence === 'likely'
        ? 2
        : confidence === 'possible'
          ? 1
          : 0;

  const fill =
    confidence === 'chosen'
      ? 'bg-ink-muted'
      : level === 3
        ? 'bg-positive'
        : level === 2
          ? 'bg-accent'
          : 'bg-caution';

  return (
    <span className={cn('flex items-center gap-0.5', className)} aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn(
            'h-2.5 w-1 rounded-xs',
            index < level ? fill : 'bg-line-strong',
          )}
        />
      ))}
    </span>
  );
}
