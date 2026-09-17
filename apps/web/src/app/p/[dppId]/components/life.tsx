import {
  Factory,
  Hammer,
  Lock,
  PackageCheck,
  Recycle,
  Repeat,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react';
import { LIFECYCLE_EVENT_META, type LifecycleEventType } from '@/lib/lifecycle/vocab';
import { cn } from '@/lib/utils';
import { formatDate } from './care';

/**
 * What has happened to this garment since it was made.
 *
 * This section is the reason the partner portal exists. A repairer signs in,
 * finds an item, records a repair, and is told — in three places in that
 * portal — that the work "appears on the garment's public passport with your
 * workspace's name on it". It did not. The events were loaded, tier-filtered
 * and then dropped on the floor by this page; they surfaced only in the JSON
 * representation, which no shopper opens. A product that asks independent
 * repairers to do data entry and then hides the result from the only audience
 * that would reward them for it has broken the bargain it proposed.
 *
 * Three decisions shape it.
 *
 * **Attribution is by workspace, never by person.** "Menders of Malmö", not
 * "Mira Halvorsen". That is what the portal promises, and it is the only
 * attribution that belongs on a page anyone can open — naming the individual
 * who repaired a garment publishes an employee's work history to the open web.
 *
 * **Restricted events are counted, not hidden.** The projector upstream drops
 * events above the reader's tier. Saying "2 further entries are recorded and
 * released to authorities" is an honest account of a partial record; silently
 * showing three of five entries implies the garment has had a quieter life
 * than it has.
 *
 * **A closed passport says so and stops.** A terminal event is the end of the
 * item, and the timeline ends with it visibly rather than trailing off.
 */

/**
 * One icon per family rather than per event: seventeen distinct glyphs is a
 * puzzle, five is a rhythm a reader picks up by the third row.
 */
const ICONS: Partial<Record<LifecycleEventType, typeof Factory>> = {
  manufactured: Factory,
  placed_on_market: Truck,
  sold: ShoppingBag,
  registered_by_owner: PackageCheck,
  repaired: Hammer,
  refurbished: Sparkles,
  altered: Hammer,
  resold: Repeat,
  rented: Repeat,
  returned: Repeat,
  donated: Repeat,
  collected: Truck,
  sorted: Recycle,
  recycled: Recycle,
  incinerated: Recycle,
  landfilled: Recycle,
  lost: Lock,
};

export interface LifeEvent {
  type: string;
  occurredAt: string;
  summary: string | null;
  by: string | null;
}

export function LifeSection({
  events,
  withheldCount,
  locale,
}: {
  events: LifeEvent[];
  /** Entries this reader's tier is not allowed to see. */
  withheldCount: number;
  locale: string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Nothing has been recorded against this item yet. Repairs, resales and recycling appear
        here as they are logged by the brand and its partners.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="relative flex flex-col">
        {events.map((event, index) => {
          const meta = LIFECYCLE_EVENT_META[event.type as LifecycleEventType];
          const Icon = ICONS[event.type as LifecycleEventType] ?? Factory;
          const terminal = meta?.terminal ?? false;
          const last = index === events.length - 1;

          return (
            <li key={`${event.type}-${event.occurredAt}-${index}`} className="relative flex gap-4 pb-6 last:pb-0">
              {/* The spine, drawn per row so it stops at the final node rather
                  than running past it into empty space. */}
              {!last ? (
                <span
                  aria-hidden
                  className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-line"
                />
              ) : null}

              <span
                aria-hidden
                className={cn(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border',
                  terminal
                    ? 'border-critical-border bg-critical-soft text-critical'
                    : 'border-line bg-surface text-ink-muted',
                )}
              >
                <Icon className="size-4" />
              </span>

              <div className="min-w-0 flex-1 pt-1">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-ink">
                    {meta?.label ?? event.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-ink-subtle tabular-nums">
                    {formatDate(event.occurredAt, locale)}
                  </span>
                </p>

                {event.summary ? (
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{event.summary}</p>
                ) : null}

                {event.by ? (
                  <p className="mt-1 text-xs text-ink-subtle">
                    Recorded by <span className="text-ink-muted">{event.by}</span>
                  </p>
                ) : null}

                {terminal ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-critical">
                    <Lock className="size-3 shrink-0" aria-hidden />
                    This passport is closed. Nothing can be added after this.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {withheldCount > 0 ? (
        <p className="border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
          <span className="font-medium text-ink">
            {withheldCount} further {withheldCount === 1 ? 'entry is' : 'entries are'} recorded
          </span>{' '}
          and released to trade partners, repairers, recyclers or authorities rather than
          published openly.
        </p>
      ) : null}
    </div>
  );
}
