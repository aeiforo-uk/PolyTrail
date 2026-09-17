/**
 * How long something has been waiting, in the words a reviewer would use.
 *
 * Rendered from a timestamp on the server, so it is stable and printable
 * rather than a ticking relative clock — a compliance screen that shows a
 * different value on every refresh is one an auditor cannot screenshot.
 */
export function waitedFor(since: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - since.getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;

  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? 'day' : 'days'}`;

  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? 'month' : 'months'}`;
}

export function formatDateTime(value: Date): string {
  return value.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Whole hours a passport has been sitting where it is. Used for banding. */
export function hoursSince(since: Date): number {
  return Math.max(0, (Date.now() - since.getTime()) / 3_600_000);
}

/**
 * How urgent a wait is.
 *
 * Three bands, not five: a reviewer triaging a queue is deciding whether to
 * pick something up now, next, or later, and a finer scale only makes the
 * severity rail harder to read at a glance.
 */
export type WaitSeverity = 'critical' | 'caution' | 'neutral';

export function waitSeverity(since: Date): WaitSeverity {
  const hours = hoursSince(since);
  if (hours >= 168) return 'critical';
  if (hours >= 72) return 'caution';
  return 'neutral';
}

/** The age bands the queue is distributed across, oldest band last. */
export const AGE_BANDS = [
  { key: 'today', label: 'Under a day', max: 24 },
  { key: 'two', label: 'One to two days', max: 72 },
  { key: 'week', label: 'Three to seven days', max: 168 },
  { key: 'over', label: 'Over a week', max: Infinity },
] as const;

export function bandFor(since: Date): (typeof AGE_BANDS)[number]['key'] {
  const hours = hoursSince(since);
  return (AGE_BANDS.find((band) => hours < band.max) ?? AGE_BANDS[AGE_BANDS.length - 1]!).key;
}
