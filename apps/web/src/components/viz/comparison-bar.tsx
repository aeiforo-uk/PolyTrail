import { cn } from '@/lib/utils';

/**
 * A value against its reference.
 *
 * The single most useful mark in this product: a footprint figure with no
 * baseline is decoration, and this is the thing that turns it into a claim
 * someone can act on. The reference is drawn as a tick on the track rather than
 * as a second bar, because two bars invite the reader to compare their lengths
 * when the question is only "which side of the line is this".
 */
export function ComparisonBar({
  value,
  reference,
  /** `lower` means a smaller value is better — true for every footprint here. */
  better = 'lower',
  formatValue,
  referenceLabel,
  className,
}: {
  value: number;
  reference: number;
  better?: 'lower' | 'higher';
  formatValue: (n: number) => string;
  referenceLabel: string;
  className?: string;
}) {
  // Scale so the reference sits at 60% of the track: a value twice the
  // reference still fits, and the common case is not squashed at one end.
  const scale = Math.max(value, reference * 1.6);
  const valuePct = Math.min(100, (value / scale) * 100);
  const refPct = Math.min(100, (reference / scale) * 100);

  const isBetter = better === 'lower' ? value < reference : value > reference;
  const withinNoise = Math.abs(value - reference) / reference < 0.05;
  const tone = withinNoise
    ? 'bg-ink-subtle'
    : isBetter
      ? 'bg-positive'
      : 'bg-caution';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className="relative h-2 w-full rounded-full bg-surface-sunken"
        role="img"
        aria-label={`${formatValue(value)} against ${referenceLabel} of ${formatValue(reference)}`}
      >
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-[width]', tone)}
          style={{ width: `${valuePct}%` }}
        />
        {/* The reference tick. A 2px surface ring keeps it visible where it
            overlaps the value bar. */}
        <span
          aria-hidden
          className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-surface"
          style={{ left: `${refPct}%` }}
        />
      </div>
      <p className="flex items-baseline justify-between gap-3 text-2xs text-ink-subtle">
        <span className="tabular-nums">{formatValue(value)}</span>
        <span>
          {referenceLabel} <span className="tabular-nums">{formatValue(reference)}</span>
        </span>
      </p>
    </div>
  );
}
