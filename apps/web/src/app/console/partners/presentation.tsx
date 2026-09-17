import { SUPPLY_TIERS, TIER_LABEL, TIER_SHORT, type SupplyTier } from '@/lib/partners/vocab';
import { seriesColour } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';

/**
 * Shared presentation for the supplier screens.
 *
 * Tier is a rank, not a category, so it is drawn as a rising ladder: the
 * reader sees how deep into the chain a facility sits without having to
 * remember whether tier 4 is the farm or the shop. The colour is the
 * categorical slot for that tier index and never moves, so the ladder in the
 * table and the bars in the distribution chart are the same colour for the
 * same tier.
 */

export const TIER_INDEX: Record<SupplyTier, number> = Object.fromEntries(
  SUPPLY_TIERS.map((tier, index) => [tier.value, index]),
) as Record<SupplyTier, number>;

export function tierColour(tier: SupplyTier): string {
  return seriesColour(TIER_INDEX[tier] ?? 0);
}

export function TierRank({ tier, className }: { tier: SupplyTier; className?: string }) {
  const index = TIER_INDEX[tier] ?? 0;
  const colour = tierColour(tier);

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden className="flex items-end gap-[2px]">
        {SUPPLY_TIERS.map((step, position) => (
          <span
            key={step.value}
            className="w-[3px] rounded-xs"
            style={{
              height: 5 + position * 2.5,
              background: position <= index ? colour : 'var(--color-line)',
            }}
          />
        ))}
      </span>
      <span className="text-xs text-ink-muted">{TIER_SHORT[tier]}</span>
      <span className="sr-only">{TIER_LABEL[tier]}</span>
    </span>
  );
}

const DAY = 86_400_000;

export function daysUntil(date: Date, from: Date = new Date()): number {
  return Math.round((date.getTime() - from.getTime()) / DAY);
}

const RELATIVE = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

/**
 * "Eleven days ago" is a fact an operator can act on; "3 Sep 2026" is a date
 * they have to subtract from today first. The exact date stays in the title
 * attribute for anyone who needs it for a record.
 */
export function relativeTime(date: Date, from: Date = new Date()): string {
  const days = daysUntil(date, from);
  if (Math.abs(days) < 1) return 'today';
  if (Math.abs(days) < 7) return RELATIVE.format(days, 'day');
  if (Math.abs(days) < 30) return RELATIVE.format(Math.round(days / 7), 'week');
  if (Math.abs(days) < 365) return RELATIVE.format(Math.round(days / 30), 'month');
  return RELATIVE.format(Math.round(days / 365), 'year');
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
