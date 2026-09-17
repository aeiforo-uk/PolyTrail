import { cn } from '@/lib/utils';
import { seriesColour } from './tokens';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Overrides the categorical slot — use for status, never for rank. */
  colour?: string;
  href?: string;
}

/**
 * Horizontal bars, because category labels are words and words read
 * left-to-right. A vertical bar chart with eight category names underneath
 * either truncates them or tilts them 45°, and both are worse than turning the
 * chart on its side.
 *
 * Every bar is directly labelled with its value, which is also what discharges
 * the contrast obligation on the three lighter palette slots.
 */
export function BarChart({
  data,
  formatValue = (n) => String(n),
  max,
  className,
  emptyMessage = 'Nothing to show yet.',
}: {
  data: BarDatum[];
  formatValue?: (n: number) => string;
  max?: number;
  className?: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-subtle">{emptyMessage}</p>;
  }

  const ceiling = max ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className={cn('flex flex-col gap-2.5', className)}>
      {data.map((datum, index) => {
        const pct = (datum.value / ceiling) * 100;
        const colour = datum.colour ?? seriesColour(index);
        return (
          <li key={datum.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="min-w-0">
              <span className="mb-1 block truncate text-xs text-ink-muted">{datum.label}</span>
              <span className="block h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(pct, datum.value > 0 ? 2 : 0)}%`, background: colour }}
                />
              </span>
            </span>
            <span className="text-sm tabular-nums text-ink">{formatValue(datum.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One bar split into segments — a composition, not a comparison.
 *
 * Segments carry a 2px surface-coloured right border rather than a flex `gap`.
 * A gap looks equivalent but is not: percentage widths already sum to 100%, so
 * every gap pushes the total past the container and the last segments are
 * clipped out of sight entirely. The border is drawn inside the segment's own
 * box, so the widths still add up.
 */
export function StackedBar({
  segments,
  height = 10,
  className,
  ariaLabel,
}: {
  segments: Array<{ key: string; label: string; value: number; colour?: string }>;
  height?: number;
  className?: string;
  ariaLabel: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full', className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      {visible.map((segment, index) => (
        <span
          key={segment.key}
          className="first:rounded-l-full last:rounded-r-full"
          style={{
            width: `${(segment.value / total) * 100}%`,
            background: segment.colour ?? seriesColour(index),
            borderRight:
              index === visible.length - 1 ? undefined : '2px solid var(--color-surface)',
            // Without this the border eats into the fill rather than sitting
            // beside it, and a 1-unit segment can vanish behind its own border.
            boxSizing: 'border-box',
          }}
        />
      ))}
    </div>
  );
}

/** Legend for a stacked bar or grouped chart. Always present for two or more. */
export function Legend({
  items,
  className,
}: {
  items: Array<{ key: string; label: string; value?: string; colour?: string }>;
  className?: string;
}) {
  if (items.length < 2) return null;
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item, index) => (
        <li key={item.key} className="flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-xs"
            style={{ background: item.colour ?? seriesColour(index) }}
          />
          <span className="text-ink-muted">{item.label}</span>
          {item.value ? <span className="tabular-nums text-ink">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}
