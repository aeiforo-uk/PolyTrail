'use client';

import * as React from 'react';
import { Legend, StackedBar } from '@/components/viz/bar-chart';
import { seriesColour, MAX_SERIES } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';

interface Slice {
  key: string;
  label: string;
  value: number;
}

/**
 * A running total for a set of percentage inputs, drawn as the composition it
 * describes.
 *
 * Fibre percentages that do not add to 100 are the single most common reason a
 * composition is wrong, and the publication gate rejects them — so the sum is
 * shown while the user types rather than reported back after a failed publish.
 * The bar is the same mark a shopper will see on the published passport, which
 * makes "60% cotton, 40% polyester" something you can check by eye instead of
 * by arithmetic, and makes the shortfall visible as a gap rather than as a
 * sentence.
 *
 * Inputs are read from the DOM instead of being lifted into React state, which
 * keeps the rows uncontrolled and therefore safe to add and remove.
 */
export function PercentageTotal({
  label = 'Total',
  target = 100,
  children,
}: {
  label?: string;
  target?: number;
  children: React.ReactNode;
}) {
  const scope = React.useRef<HTMLDivElement>(null);
  const [slices, setSlices] = React.useState<Slice[]>([]);

  // Colour follows the fibre, not its position: adding a row above an existing
  // one must not repaint it. Slots are handed out on first sight and kept.
  const slots = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    const node = scope.current;
    if (!node) return;

    const recompute = () => {
      const inputs = node.querySelectorAll<HTMLInputElement>('input[data-percentage]');
      const next: Slice[] = [];

      inputs.forEach((input, index) => {
        // The control naming this row sits beside it — the fibre select in a
        // fibre row. Falling back to the row number keeps an unnamed row
        // visible in the bar rather than dropping it.
        const row = input.closest('li');
        const named = row?.querySelector<HTMLSelectElement>('select[data-series]');
        const key = named?.value || `row-${index}`;
        const label =
          named && named.value
            ? (named.options[named.selectedIndex]?.text ?? named.value)
            : `Not chosen (${index + 1})`;
        next.push({ key, label, value: Number(input.value) || 0 });
      });

      setSlices((previous) => (sameSlices(previous, next) ? previous : next));
    };

    recompute();
    node.addEventListener('input', recompute);
    node.addEventListener('change', recompute);
    // Adding or removing a row changes the set of inputs without firing input.
    const observer = new MutationObserver(recompute);
    observer.observe(node, { childList: true, subtree: true });

    return () => {
      node.removeEventListener('input', recompute);
      node.removeEventListener('change', recompute);
      observer.disconnect();
    };
  }, []);

  const total = Math.round(slices.reduce((sum, slice) => sum + slice.value, 0) * 100) / 100;
  const off = slices.length > 0 && Math.abs(total - target) >= 0.51;
  const shortfall = Math.round((target - total) * 100) / 100;

  const segments = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      let slot = slots.current.get(slice.key);
      if (slot === undefined) {
        slot = slots.current.size;
        slots.current.set(slice.key, slot);
      }
      return {
        key: slice.key,
        label: slice.label,
        value: slice.value,
        // A ninth fibre folds into a neutral rather than reusing slot 1, which
        // would put one hue on two different things in the same bar.
        colour: slot < MAX_SERIES ? seriesColour(slot) : 'var(--color-line-strong)',
      };
    });

  const withRemainder =
    shortfall > 0.51
      ? [
          ...segments,
          {
            key: '_remainder',
            label: 'Not yet declared',
            value: shortfall,
            colour: 'var(--color-line)',
          },
        ]
      : segments;

  return (
    <div ref={scope} className="flex flex-col gap-3">
      {children}

      <div
        className={cn(
          'flex flex-col gap-2.5 rounded-md border px-3.5 py-3',
          off ? 'border-caution-border bg-caution-soft' : 'border-line bg-surface-sunken',
        )}
        aria-live="polite"
      >
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className={off ? 'text-caution' : 'text-ink-muted'}>{label}</span>
          <span className={cn('font-medium tabular-nums', off ? 'text-caution' : 'text-ink')}>
            {total}%
            {off ? (
              <span className="ml-2 font-normal">
                {total > target
                  ? `${Math.round((total - target) * 100) / 100}% over`
                  : `${shortfall}% missing`}
              </span>
            ) : null}
          </span>
        </p>

        {withRemainder.length > 0 ? (
          <>
            <StackedBar
              height={10}
              ariaLabel={segments
                .map((segment) => `${segment.value}% ${segment.label}`)
                .join(', ')}
              segments={withRemainder}
            />
            <Legend
              items={withRemainder.map((segment) => ({
                key: segment.key,
                label: segment.label,
                value: `${segment.value}%`,
                colour: segment.colour,
              }))}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function sameSlices(a: Slice[], b: Slice[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (slice, index) =>
      slice.key === b[index]!.key &&
      slice.label === b[index]!.label &&
      slice.value === b[index]!.value,
  );
}
