'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Meter } from '@/components/viz/meter';
import { cn } from '@/lib/utils';

export interface RailItem {
  slug: string;
  label: string;
  filled: number;
  total: number;
  /** Fields the publication gate will refuse without. */
  missing: number;
}

/**
 * The section list, with each section's own progress against the field
 * registry.
 *
 * The ring is not decoration: it is what lets someone scan ten sections and
 * find the two that have barely been started, which a column of "4/19" does
 * not. Colour here means one specific thing — red is *blocking publication*,
 * not merely unfinished — so a section at 30% with nothing required left stays
 * neutral, and a section at 90% with one missing mandatory field goes red.
 */
export function SectionRail({ dppId, items }: { dppId: string; items: readonly RailItem[] }) {
  const pathname = usePathname();
  const blocking = items.reduce((sum, item) => sum + item.missing, 0);

  return (
    <nav aria-label="Passport sections" className="lg:sticky lg:top-8">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-2">
        <p className="eyebrow">Sections</p>
        {blocking > 0 ? (
          <p className="text-2xs text-critical tabular-nums">{blocking} blocking</p>
        ) : null}
      </div>

      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const href = `/console/passports/${dppId}/edit/${item.slug}`;
          const active = pathname === href;
          const percent = item.total === 0 ? 0 : Math.round((item.filled / item.total) * 100);
          const tone = item.missing > 0 ? 'critical' : percent === 100 ? 'positive' : 'accent';

          return (
            <li key={item.slug}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm py-1 pr-1.5 pl-2',
                  'border-l-2 transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
                  active
                    ? 'border-accent bg-surface shadow-xs'
                    : 'border-transparent hover:bg-surface',
                )}
              >
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block truncate text-sm',
                      active ? 'font-medium text-ink' : 'text-ink-muted',
                    )}
                  >
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      'block text-2xs tabular-nums',
                      item.missing > 0 ? 'text-critical' : 'text-ink-subtle',
                    )}
                  >
                    {item.missing > 0
                      ? `${item.missing} required left`
                      : `${item.filled} of ${item.total} fields`}
                  </span>
                </span>

                <Meter value={percent} size={28} thickness={3} tone={tone} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
