import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sparkline } from './sparkline';

/**
 * A headline number with the context needed to read it.
 *
 * The rule this enforces: a figure never ships alone. It carries either a
 * trend, a delta, or a denominator — because "8" tells an operator nothing and
 * "8 of 12, up 2 this week" tells them whether to act. A tile with nothing to
 * compare against renders the number plainly rather than inventing a baseline.
 */
export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  /** e.g. "of 12" — a denominator is context even without a trend. */
  context?: string;
  /** Signed percentage change. Omit when there is no honest comparison. */
  deltaPercent?: number;
  /** Whether a rise is good. Footprints invert this. */
  deltaGood?: 'up' | 'down';
  trend?: number[];
  /** Turns the tile into a filter. Deel's pattern: the stat is the control. */
  href?: string;
  tone?: 'positive' | 'caution' | 'critical' | 'neutral' | 'accent';
  className?: string;
}

export function StatTile({
  label,
  value,
  unit,
  context,
  deltaPercent,
  deltaGood = 'up',
  trend,
  href,
  tone = 'neutral',
  className,
}: StatTileProps) {
  const hasDelta = typeof deltaPercent === 'number' && Number.isFinite(deltaPercent);
  const rising = hasDelta && deltaPercent! > 0;
  const flat = hasDelta && Math.abs(deltaPercent!) < 0.5;
  const good = flat ? null : rising === (deltaGood === 'up');
  const DeltaIcon = flat ? ArrowRight : rising ? ArrowUp : ArrowDown;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        {/* The label as an eyebrow, not a sentence: tracked caps at 11px is
            what lets the figure below it carry the tile. */}
        <p className="flex items-center gap-1.5 text-2xs font-medium tracking-[0.07em] text-ink-subtle uppercase">
          {tone !== 'neutral' ? (
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                tone === 'positive' && 'bg-positive',
                tone === 'caution' && 'bg-caution',
                tone === 'critical' && 'bg-critical',
                tone === 'accent' && 'bg-accent',
              )}
            />
          ) : null}
          {label}
        </p>
        {trend && trend.length > 1 ? (
          <Sparkline
            values={trend}
            tone={tone === 'neutral' ? 'accent' : tone}
            width={64}
            height={20}
            label={`${label} over the last ${trend.length} periods`}
          />
        ) : null}
      </div>

      <p className="mt-2.5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold leading-none tracking-[-0.022em] text-ink tabular-nums">{value}</span>
        {unit ? <span className="text-sm text-ink-muted">{unit}</span> : null}
      </p>

      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {hasDelta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium tabular-nums',
              good === null && 'text-ink-subtle',
              good === true && 'text-positive',
              good === false && 'text-caution',
            )}
          >
            <DeltaIcon className="size-3" aria-hidden />
            {Math.abs(Math.round(deltaPercent!))}%
          </span>
        ) : null}
        {context ? <span className="text-ink-muted">{context}</span> : null}
      </div>
    </>
  );

  /*
   * The accent tile stands on the chrome ground — one dark tile in a white row
   * is the featured-metric treatment, and it costs no new components. The
   * sparkline, the delta and the context line inside it are written against
   * the semantic roles, and `.on-chrome` re-points those roles, so all three
   * recolour themselves without knowing anything has changed.
   *
   * This used to be seven hand-written variable overrides here, including two
   * lifted state colours picked by eye that agreed with nothing else in the
   * product. The ground is a system primitive now.
   */
  const dark = tone === 'accent';
  const shell = cn(
    'flex flex-col justify-between px-4 py-3.5 transition-colors',
    dark
      ? ['on-chrome', href && 'hover:bg-chrome-raised']
      : ['bg-surface', href && 'hover:bg-surface-sunken'],
    className,
  );

  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/**
 * A row of tiles sharing hairlines instead of gaps, so the group reads as one
 * instrument panel rather than as scattered cards.
 */
export function StatRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border border-line bg-line',
        'grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </dl>
  );
}
