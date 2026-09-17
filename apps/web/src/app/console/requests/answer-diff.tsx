import { AlertTriangle, Equal, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A supplier answer read against what the passport already says.
 *
 * The screen this feeds is a diff, not a form dump. A reviewer is not reading
 * thirty answers; they are looking for the three that disagree with something
 * already published, and a single column of values hides exactly that. So the
 * recorded value and the incoming one sit side by side, and every row carries
 * a word saying which of the four things it is.
 */

export interface ReviewConflict {
  dppId: string;
  existing: string;
}

export interface ReviewExisting {
  /**
   * False where the path addresses a repeating section — a fibre inside a
   * component has no single current value to compare against.
   */
  known: boolean;
  display: string;
  /** The attached passports disagree with each other about this field. */
  varies: boolean;
}

export interface ReviewItem {
  path: string;
  label: string;
  basis: string;
  sectionLabel: string;
  answer: string;
  answered: boolean;
  existing: ReviewExisting | null;
  conflicts: ReviewConflict[];
}

export type Verdict = 'blank' | 'conflict' | 'same' | 'new';

export function verdictOf(item: ReviewItem): Verdict {
  if (!item.answered) return 'blank';
  if (item.conflicts.length > 0) return 'conflict';
  if (item.existing?.known && item.existing.display !== '—') {
    return item.existing.varies || item.existing.display !== item.answer ? 'conflict' : 'same';
  }
  return 'new';
}

const VERDICTS = {
  blank: { label: 'Left blank', icon: Minus, className: 'text-ink-subtle' },
  conflict: { label: 'Disagrees with the passport', icon: AlertTriangle, className: 'text-caution' },
  same: { label: 'Matches what is recorded', icon: Equal, className: 'text-ink-muted' },
  new: { label: 'New information', icon: Plus, className: 'text-positive' },
} as const;

export function VerdictTag({ verdict }: { verdict: Verdict }) {
  const config = VERDICTS[verdict];
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-2xs', config.className)}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {config.label}
    </span>
  );
}

/** Column headings for the diff. Sticky-free: the list is rarely long enough. */
export function DiffHeader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'hidden gap-6 border-b border-line px-5 py-2 md:grid md:grid-cols-2',
        className,
      )}
      aria-hidden
    >
      <span className="eyebrow">What you asked for</span>
      <span className="eyebrow">What they sent back</span>
    </div>
  );
}

/**
 * One field, both sides.
 *
 * `decision` is where the accept/reject control goes on the review screen; the
 * read-only view passes nothing and the row collapses to just the comparison.
 */
export function DiffRow({
  item,
  decision,
  conflictControl,
}: {
  item: ReviewItem;
  decision?: React.ReactNode;
  conflictControl?: React.ReactNode;
}) {
  const verdict = verdictOf(item);

  return (
    <li className="flex gap-3 px-5 py-4">
      <span
        aria-hidden
        className={cn(
          'w-0.5 shrink-0 rounded-full',
          verdict === 'conflict'
            ? 'bg-caution'
            : verdict === 'new'
              ? 'bg-positive'
              : verdict === 'blank'
                ? 'bg-line'
                : 'bg-line-strong',
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {item.label}
              <span className="ml-2 text-2xs font-normal text-ink-subtle">
                {item.sectionLabel}
              </span>
            </p>
            <p className="mt-0.5 text-2xs leading-relaxed text-ink-subtle">{item.basis}</p>
            <p className="mt-2 text-xs text-ink-muted">
              {item.existing === null ? (
                <span className="text-ink-subtle">No passport attached to compare against</span>
              ) : !item.existing.known ? (
                <span className="text-ink-subtle">
                  Repeating section — no single recorded value
                </span>
              ) : item.existing.display === '—' ? (
                <span className="text-ink-subtle">Nothing recorded yet</span>
              ) : (
                <>
                  <span className="text-ink-subtle">Currently recorded: </span>
                  <span className="text-ink">{item.existing.display}</span>
                  {item.existing.varies ? (
                    <span className="text-caution"> (differs between passports)</span>
                  ) : null}
                </>
              )}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-2 md:items-start">
            <div className="flex w-full flex-wrap items-start justify-between gap-2">
              <p
                className={cn(
                  'min-w-0 text-sm break-words',
                  item.answered ? 'font-medium text-ink' : 'text-ink-subtle italic',
                )}
              >
                {item.answered ? item.answer : 'Left blank'}
              </p>
              {decision}
            </div>
            <VerdictTag verdict={verdict} />
          </div>
        </div>

        {item.conflicts.length > 0 ? (
          <div className="mt-3 rounded-md border border-caution-border bg-caution-soft px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-caution">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              This contradicts a passport that is already published
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink-muted">
              {item.conflicts.map((conflict) => (
                <li key={conflict.dppId}>
                  <span className="mono">{conflict.dppId}</span> currently says{' '}
                  <span className="font-medium text-ink">{conflict.existing}</span>
                </li>
              ))}
            </ul>
            {conflictControl}
          </div>
        ) : null}
      </div>
    </li>
  );
}
