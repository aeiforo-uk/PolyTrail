import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Lock, ScanLine } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { listRecentEventsByActor } from '@/lib/lifecycle/events';
import { LIFECYCLE_EVENT_META, type LifecycleEventType } from '@/lib/lifecycle/vocab';
import { formatDppId } from '@/lib/passport/identifier';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { BarChart } from '@/components/viz/bar-chart';
import { seriesColour } from '@/components/viz/tokens';
import { LookupForm } from './lookup-form';
import { personaFor } from './queries';

export const metadata = { title: 'Find an item' };

/** Fixed order, so a partner's own chart never repaints when a category drops out. */
const EVENT_SLOTS: LifecycleEventType[] = [
  'collected',
  'sorted',
  'recycled',
  'repaired',
  'refurbished',
  'altered',
];

/**
 * The entry screen.
 *
 * One field, sized for someone standing at a bench holding the item. Below it,
 * the two things a partner actually wants from a portal they did not choose:
 * proof that what they recorded landed somewhere, and the shape of their own
 * week. Nothing competes with the scan.
 */
export default async function PartnerHomePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const persona = personaFor(session.role);
  if (!persona) redirect('/console');

  const history = await listRecentEventsByActor(session.userId, 60);
  const work = summarise(history);

  return (
    <div className="flex flex-col gap-12">
      <section>
        <h1 className="display text-4xl leading-tight sm:text-5xl">
          {persona === 'repairer' ? 'What are you fixing?' : 'What have you taken in?'}
        </h1>
        <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-muted">
          {persona === 'repairer'
            ? 'Scan the label or type the identifier. You will get what the garment is made of, how it is put together, which spare parts fit it, and how to get it apart.'
            : 'Scan the label or type the identifier. You will get the recycling route, what will disrupt it, the fibre breakdown and where the separation points are.'}
        </p>

        <div className="mt-7 rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6">
          <LookupForm />
        </div>

        <WhereTheCodeIs />
      </section>

      <section aria-labelledby="work-heading">
        <h2 id="work-heading" className="eyebrow">
          Your work
        </h2>

        {work.total === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-line-strong bg-surface-sunken/40 px-6 py-10 text-center">
            <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-surface text-ink-subtle">
              <ScanLine className="size-5" aria-hidden />
            </span>
            <p className="text-base font-medium text-ink">Nothing recorded yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
              {persona === 'repairer'
                ? 'Every repair you record appears on the garment’s public passport with your workspace’s name on it — that is the point of the portal. Scan the first one above.'
                : 'Every collection, sort and recycling run you record appears on the item’s public passport with your workspace’s name on it. Scan the first one above.'}
            </p>
          </div>
        ) : (
          <>
            <StatRow className="mt-3">
              <StatTile
                label="Events recorded"
                value={work.total}
                context={`across ${work.items} ${work.items === 1 ? 'item' : 'items'}`}
                trend={work.weekly}
                deltaPercent={work.weeklyDelta}
                tone="accent"
              />
              <StatTile
                label="This week"
                value={work.thisWeek}
                context={
                  work.lastWeek === 0 ? 'nothing last week' : `${work.lastWeek} the week before`
                }
              />
              <StatTile
                label={persona === 'repairer' ? 'Repairs' : 'Passports closed'}
                value={persona === 'repairer' ? work.repairs : work.closed}
                context={
                  persona === 'repairer'
                    ? `${work.total - work.repairs} other ${work.total - work.repairs === 1 ? 'event' : 'events'}`
                    : 'recycled, and final'
                }
                tone={persona === 'recycler' && work.closed > 0 ? 'critical' : 'neutral'}
              />
              <StatTile
                label="Last recorded"
                value={work.lastLabel}
                context={work.lastDate ?? undefined}
              />
            </StatRow>

            {work.breakdown.length > 1 ? (
              <div className="mt-4 rounded-lg border border-line bg-surface p-5">
                <h3 className="text-sm font-semibold text-ink">What you have been doing</h3>
                <p className="mt-0.5 mb-4 text-xs text-ink-muted">
                  Your last {work.total} {work.total === 1 ? 'entry' : 'entries'}, by kind.
                </p>
                <BarChart data={work.breakdown} />
              </div>
            ) : null}
          </>
        )}
      </section>

      {history.length > 0 ? (
        <section aria-labelledby="recent-heading">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="recent-heading" className="eyebrow">
              Most recent
            </h2>
            <span className="text-xs text-ink-subtle">Newest first</span>
          </div>

          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {history.slice(0, 8).map((event) => (
              <li key={event.id}>
                <Link
                  href={`/partner/${event.dppId}`}
                  className="flex min-h-16 items-center gap-4 px-4 py-3.5 transition-colors duration-[140ms] hover:bg-surface-sunken motion-reduce:transition-none"
                >
                  <span
                    aria-hidden
                    className={
                      event.terminal
                        ? 'h-10 w-0.5 shrink-0 rounded-full bg-critical'
                        : 'h-10 w-0.5 shrink-0 rounded-full bg-line-strong'
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-ink">
                      {event.productName ?? 'Untitled item'}
                    </span>
                    <span className="mono block truncate text-2xs text-ink-subtle">
                      {formatDppId(event.dppId)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="flex items-center justify-end gap-1.5 text-sm text-ink">
                      {event.terminal ? (
                        <Lock className="size-3.5 text-critical" aria-hidden />
                      ) : null}
                      {event.label}
                    </span>
                    <span className="block text-xs tabular-nums text-ink-subtle">
                      {new Date(event.occurredAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Where the code is printed.
 *
 * The single most common failure at a bench is not a mistyped character — it is
 * looking at the wrong label. So this is drawn rather than described: the care
 * label as it actually appears, with the block that matters ringed.
 */
function WhereTheCodeIs() {
  return (
    <div className="mt-6 grid gap-5 rounded-xl border border-line bg-surface-sunken/50 p-5 sm:grid-cols-[13rem_1fr] sm:items-center">
      <svg
        viewBox="0 0 208 132"
        className="w-full max-w-52 justify-self-center"
        role="img"
        aria-label="A care label with a QR code and, beneath it, a sixteen-character identifier printed in four groups of four."
      >
        {/* The label itself */}
        <rect
          x="8"
          y="8"
          width="192"
          height="116"
          rx="4"
          fill="var(--color-surface)"
          stroke="var(--color-line-strong)"
        />
        {/* Stitch line down the left, the way a care label is caught into a seam */}
        <line
          x1="20"
          y1="16"
          x2="20"
          y2="116"
          stroke="var(--color-line)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        {/* Care symbols */}
        <g fill="none" stroke="var(--color-ink-subtle)" strokeWidth="1.5">
          <path d="M34 26h14l-2 10H36z" />
          <path d="M58 26h14v10H58z" />
          <circle cx="83" cy="31" r="5.5" />
        </g>
        <rect x="34" y="44" width="72" height="3" rx="1.5" fill="var(--color-line)" />
        <rect x="34" y="52" width="56" height="3" rx="1.5" fill="var(--color-line)" />
        {/* QR block */}
        <rect x="132" y="22" width="46" height="46" rx="2" fill="var(--color-surface-sunken)" stroke="var(--color-line)" />
        <g fill="var(--color-ink)">
          <rect x="138" y="28" width="10" height="10" />
          <rect x="162" y="28" width="10" height="10" />
          <rect x="138" y="52" width="10" height="10" />
          <rect x="152" y="42" width="5" height="5" />
          <rect x="162" y="47" width="5" height="5" />
          <rect x="157" y="57" width="5" height="5" />
        </g>
        {/* The identifier, ringed */}
        <rect
          x="30"
          y="80"
          width="148"
          height="26"
          rx="4"
          fill="var(--color-accent-soft)"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
        />
        <text
          x="104"
          y="97"
          textAnchor="middle"
          fill="var(--color-accent)"
          style={{ font: '600 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace' }}
        >
          XK4T-9PMB-2QW7-5RHC
        </text>
        <text
          x="104"
          y="118"
          textAnchor="middle"
          fill="var(--color-ink-subtle)"
          style={{ font: '400 8px/1 ui-sans-serif, system-ui, sans-serif' }}
        >
          DIGITAL PRODUCT PASSPORT
        </text>
      </svg>

      <div>
        <h2 className="text-sm font-semibold text-ink">Where the code is printed</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          On the care label, under the QR code, in four groups of four. Scanning the QR opens the
          public page — the code beneath it is the one to type here.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-muted">
          <li className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-line-hover" />
            <span>
              The letters <span className="mono text-ink">I</span>,{' '}
              <span className="mono text-ink">L</span>, <span className="mono text-ink">O</span> and{' '}
              <span className="mono text-ink">U</span> are never used. If you see one, it is a{' '}
              <span className="mono text-ink">1</span>, <span className="mono text-ink">1</span>,{' '}
              <span className="mono text-ink">0</span> or <span className="mono text-ink">V</span>.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-line-hover" />
            <span>If the label has worn through, the brand can look the item up by its SKU.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

interface WorkSummary {
  total: number;
  items: number;
  weekly: number[];
  thisWeek: number;
  lastWeek: number;
  weeklyDelta: number | undefined;
  repairs: number;
  closed: number;
  lastLabel: string;
  lastDate: string | null;
  breakdown: Array<{ key: string; label: string; value: number; colour: string }>;
}

/**
 * The partner's own week, derived from the entries already fetched rather than
 * from a second round of queries — sixty rows is the whole picture at this
 * volume, and a partner with more than sixty entries a quarter has a different
 * problem than a dashboard.
 */
function summarise(
  history: Array<{
    dppId: string;
    eventType: LifecycleEventType;
    label: string;
    occurredAt: string;
    terminal: boolean;
  }>,
): WorkSummary {
  const week = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const weekly = Array.from({ length: 8 }, (_, index) => {
    const end = now - (7 - index) * week;
    return history.filter((event) => {
      const at = new Date(event.occurredAt).getTime();
      return at > end - week && at <= end;
    }).length;
  });

  const thisWeek = weekly.at(-1) ?? 0;
  const lastWeek = weekly.at(-2) ?? 0;

  const counts = new Map<LifecycleEventType, number>();
  for (const event of history) counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);

  const breakdown = EVENT_SLOTS.map((type, index) => ({
    key: type,
    label: LIFECYCLE_EVENT_META[type]?.label ?? type,
    value: counts.get(type) ?? 0,
    // Indexed by the fixed slot, never by position after filtering, so removing
    // a category does not repaint the ones that remain.
    colour: seriesColour(index),
  })).filter((datum) => datum.value > 0);

  const latest = history[0];

  return {
    total: history.length,
    items: new Set(history.map((event) => event.dppId)).size,
    weekly,
    thisWeek,
    lastWeek,
    weeklyDelta: lastWeek === 0 ? undefined : ((thisWeek - lastWeek) / lastWeek) * 100,
    breakdown,
    repairs: counts.get('repaired') ?? 0,
    closed: history.filter((event) => event.terminal).length,
    lastLabel: latest?.label ?? '—',
    lastDate: latest
      ? new Date(latest.occurredAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        })
      : null,
  };
}
