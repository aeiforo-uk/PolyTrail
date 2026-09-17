'use client';

import { useEffect, useState } from 'react';

/**
 * A timestamp that reads as "3 minutes ago" without breaking hydration.
 *
 * Relative time is computed from `Date.now()`, and the server and the browser
 * never run at the same instant. Rendering it directly means the server writes
 * "2 minutes ago", the client hydrates a moment later and writes "3 minutes
 * ago", and React discards the whole tree with a mismatch error.
 *
 * So the first paint is the absolute date — stable, correct, and what a
 * compliance reader wants anyway — and the relative phrasing is swapped in
 * after mount, where only the browser's clock is involved. The absolute value
 * stays in `title` and in `dateTime` so it is always recoverable.
 */
export function RelativeTime({
  value,
  className,
  /** Below this many seconds, say "just now" rather than counting. */
  threshold = 45,
}: {
  value: string | Date;
  className?: string;
  threshold?: number;
}) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const iso = Number.isNaN(date.getTime()) ? '' : date.toISOString();
  const absolute = formatAbsolute(date);
  const [label, setLabel] = useState(absolute);

  useEffect(() => {
    if (!iso) return;
    const update = () => setLabel(formatRelative(date, threshold));
    update();
    // A minute is the finest granularity anything here reports, so there is no
    // reason to tick faster than that.
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [iso, threshold, date]);

  if (!iso) return <span className={className}>—</span>;

  return (
    <time dateTime={iso} title={absolute} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}

function formatAbsolute(date: Date): string {
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatRelative(date: Date, threshold = 45): string {
  const seconds = (date.getTime() - Date.now()) / 1000;
  if (Math.abs(seconds) < threshold) return 'just now';

  const formatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
