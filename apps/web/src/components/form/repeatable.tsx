'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Add-and-remove rows for the repeated structures a passport is mostly made of.
 *
 * Rows are keyed by a stable id while their field names come from position, so
 * removing the middle row leaves the surviving rows' typed-in values attached
 * to the surviving rows — React keeps the DOM nodes and only the `name`
 * attributes shift down. Renumbering the values by hand would be the bug.
 *
 * Each row is a card with its own header strip, because the previous layout put
 * an unlabelled icon button in the corner of an unbounded block and left people
 * unsure what it would delete. The remove control now sits inside the thing it
 * removes and says the word.
 */
export function Repeatable({
  legend,
  description,
  addLabel,
  rowNoun,
  initialCount,
  max,
  readOnly,
  empty,
  children,
}: {
  legend: string;
  description?: React.ReactNode;
  addLabel: string;
  /** Used in the remove button's accessible name: "Remove fibre 2". */
  rowNoun: string;
  initialCount: number;
  max?: number;
  readOnly?: boolean;
  empty?: React.ReactNode;
  children: (index: number) => React.ReactNode;
}) {
  const [ids, setIds] = React.useState<number[]>(() =>
    Array.from({ length: initialCount }, (_, index) => index),
  );
  const nextId = React.useRef(initialCount);

  const atMax = max != null && ids.length >= max;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{legend}</h3>
        <span className="text-2xs text-ink-subtle tabular-nums">
          {ids.length} {ids.length === 1 ? rowNoun.toLowerCase() : `${rowNoun.toLowerCase()}s`}
          {max != null ? ` of up to ${max}` : ''}
        </span>
      </div>
      {description ? (
        <p className="-mt-1 max-w-prose text-xs leading-relaxed text-ink-muted">{description}</p>
      ) : null}

      {ids.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong bg-surface-sunken/40 px-4 py-6 text-center text-xs text-ink-muted">
          {empty ?? 'Nothing added yet.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {ids.map((id, index) => (
            <li key={id} className="overflow-hidden rounded-md border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-sunken/60 py-1.5 pr-1.5 pl-4">
                <span className="eyebrow">
                  {rowNoun} {index + 1}
                </span>
                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-label={`Remove ${rowNoun.toLowerCase()} ${index + 1}`}
                    className="text-ink-subtle hover:bg-critical-soft hover:text-critical"
                    onClick={() => setIds((current) => current.filter((value) => value !== id))}
                  >
                    <Trash2 aria-hidden />
                    Remove
                  </Button>
                )}
              </div>
              <div className="p-4">{children(index)}</div>
            </li>
          ))}
        </ol>
      )}

      {readOnly ? null : atMax ? (
        <p className="text-xs text-ink-muted">
          That is as many {rowNoun.toLowerCase()}s as a passport may carry.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => {
            setIds((current) => [...current, nextId.current]);
            nextId.current += 1;
          }}
          className={[
            'flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong',
            'px-4 py-2.5 text-sm font-medium text-ink-muted',
            'transition-[background-color,border-color,color] duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
            'hover:border-accent-border hover:bg-accent-soft hover:text-accent',
            'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-info-soft',
          ].join(' ')}
        >
          <Plus className="size-4" aria-hidden />
          {addLabel}
        </button>
      )}
    </section>
  );
}
