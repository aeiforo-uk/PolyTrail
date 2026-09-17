import { rampStep } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';

/**
 * How far up the chain a passport actually reaches.
 *
 * Shared between the catalogue and the record so the two never disagree about
 * what "tier 2" looks like. A word alone means nothing to anyone outside
 * sourcing; four pips with two filled says "two of four steps back" at a
 * glance, and the word is still there for the people who do speak in tiers.
 */

export const DEPTH_RANK: Record<string, number> = {
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
  tier_4: 4,
  full: 5,
};

export const DEPTH_LABELS: Record<string, string> = {
  tier_1: 'To assembly',
  tier_2: 'To fabric',
  tier_3: 'To yarn',
  tier_4: 'To fibre',
  full: 'Full chain',
};

export const DEPTH_EXPLAINERS: Record<string, string> = {
  tier_1: 'The factory that cut and sewed it is known.',
  tier_2: 'The mill that made the fabric is known.',
  tier_3: 'The spinner or dyehouse behind the yarn is known.',
  tier_4: 'The farm or fibre producer is known. Most brands never get here.',
  full: 'Every stage from fibre to finished garment is named.',
};

export function ChainDepth({
  depth,
  steps,
  size = 'sm',
}: {
  depth: string | null;
  steps: number;
  size?: 'sm' | 'md';
}) {
  const rank = depth ? (DEPTH_RANK[depth] ?? 0) : 0;
  const filled = Math.min(rank, 4);

  return (
    <span className="flex items-center gap-2">
      <span
        className="flex shrink-0 items-center gap-0.5"
        role="img"
        aria-label={depth ? `${DEPTH_LABELS[depth] ?? depth}, ${filled} of 4 tiers` : 'Not mapped'}
      >
        {[0, 1, 2, 3].map((index) => {
          const on = index < filled;
          return (
            <span
              key={index}
              className={cn(
                'rounded-full transition-colors duration-[140ms]',
                size === 'md' ? 'h-4 w-1.5' : 'h-3 w-1',
                !on && 'bg-line-strong',
              )}
              /*
               * Tier depth is ordinal — tier 4 is further back than tier 2 —
               * so the pips darken with depth along the sequential ramp. Four
               * identical accent blocks said "alarm" and carried no order,
               * and it disagreed with the overview page, which already draws
               * this same figure on the ramp.
               */
              style={
                on
                  ? { background: rank === 5 ? 'var(--color-positive)' : rampStep((index + 1) / 4) }
                  : undefined
              }
            />
          );
        })}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate',
            size === 'md' ? 'text-sm' : 'text-xs',
            depth ? 'font-medium text-ink' : 'text-ink-subtle',
          )}
        >
          {depth ? (DEPTH_LABELS[depth] ?? depth) : 'Not mapped'}
        </span>
        {steps > 0 ? (
          <span className="block text-2xs text-ink-subtle tabular-nums">
            {steps} {steps === 1 ? 'step' : 'steps'} recorded
          </span>
        ) : null}
      </span>
    </span>
  );
}
