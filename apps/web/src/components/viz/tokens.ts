/**
 * The eight categorical slots, in fixed order.
 *
 * Assigned by position and never cycled: a ninth series folds into "Other" or
 * becomes small multiples rather than reusing slot 1, because a repeated hue
 * means two different things on one chart. Colour follows the entity, not its
 * rank — a filter that removes a series must not repaint the survivors, so
 * callers index by a stable key, not by array position after filtering.
 */
export const SERIES = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
  'var(--color-series-5)',
  'var(--color-series-6)',
  'var(--color-series-7)',
  'var(--color-series-8)',
] as const;

export const MAX_SERIES = SERIES.length;

/** Stable colour for a key, so adding or removing a series repaints nothing. */
export function seriesColour(index: number): string {
  return SERIES[index % MAX_SERIES]!;
}

/**
 * The sequential ramp, light to dark, for magnitude. One hue only — a rainbow
 * ramp invents category boundaries that are not in the data.
 */
export const RAMP = [
  'var(--color-ramp-100)',
  'var(--color-ramp-200)',
  'var(--color-ramp-300)',
  'var(--color-ramp-400)',
  'var(--color-ramp-500)',
  'var(--color-ramp-600)',
  'var(--color-ramp-700)',
] as const;

export function rampStep(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  return RAMP[Math.round(clamped * (RAMP.length - 1))]!;
}

/**
 * Status colours are reserved. They never serve as "series 4", and they always
 * ship with an icon and a word — colour alone fails for a colour-blind reader
 * and is unusable in a printed compliance export.
 */
export const STATUS = {
  good: 'var(--color-positive)',
  warning: 'var(--color-caution)',
  critical: 'var(--color-critical)',
  neutral: 'var(--color-ink-subtle)',
} as const;

export type StatusKey = keyof typeof STATUS;
