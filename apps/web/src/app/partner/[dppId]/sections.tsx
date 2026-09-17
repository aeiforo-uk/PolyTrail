import type { LucideIcon } from 'lucide-react';
import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react';
import { COMPONENT_KINDS, FIBRES } from '@/lib/passport/vocab';
import { Legend, StackedBar } from '@/components/viz/bar-chart';
import { seriesColour } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';

/**
 * Presentational parts shared by the two persona views.
 *
 * Sized for a bench: 16px body copy rather than 14px, facts that carry their
 * own context rather than a number in a box, and a single lead block at the top
 * of each view that answers the only question the person is actually holding —
 * what do I do with this.
 */

export function Section({
  title,
  icon: Icon,
  hint,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-t border-line pt-7', className)}>
      <h2 className="flex items-center gap-2.5 text-base font-semibold text-ink">
        {Icon ? <Icon className="size-4.5 text-ink-subtle" aria-hidden /> : null}
        {title}
      </h2>
      {hint ? (
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">{hint}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export type VerdictTone = 'positive' | 'caution' | 'critical' | 'neutral';

const VERDICT_ICON: Record<VerdictTone, LucideIcon> = {
  positive: CircleCheck,
  caution: TriangleAlert,
  critical: CircleAlert,
  neutral: CircleHelp,
};

/**
 * The lead.
 *
 * One or two facts decide what happens to the item next — the recycling route
 * and what will disrupt it, or whether a spare part exists. Those go here, in
 * display type, above everything else, with a severity rail down the side so
 * the answer is legible before a single word is read. Status is colour **and**
 * icon **and** word, because a sorting line is lit badly and half the people on
 * it are reading a phone at arm's length.
 */
export function Verdict({
  eyebrow,
  headline,
  detail,
  tone,
  facts,
}: {
  eyebrow: string;
  headline: string;
  detail: string;
  tone: VerdictTone;
  facts?: React.ReactNode;
}) {
  const Icon = VERDICT_ICON[tone];

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border bg-surface',
        tone === 'positive' && 'border-positive-border',
        tone === 'caution' && 'border-caution-border',
        tone === 'critical' && 'border-critical-border',
        tone === 'neutral' && 'border-line-strong',
      )}
    >
      <div className="flex">
        <span
          aria-hidden
          className={cn(
            'w-1 shrink-0',
            tone === 'positive' && 'bg-positive',
            tone === 'caution' && 'bg-caution',
            tone === 'critical' && 'bg-critical',
            tone === 'neutral' && 'bg-line-strong',
          )}
        />
        <div className="min-w-0 flex-1 px-5 py-5 sm:px-6">
          <p className="eyebrow">{eyebrow}</p>
          <p
            className={cn(
              'mt-2 flex items-start gap-2.5 text-2xl leading-tight sm:text-3xl',
              'display',
              tone === 'positive' && 'text-positive',
              tone === 'caution' && 'text-caution',
              tone === 'critical' && 'text-critical',
              tone === 'neutral' && 'text-ink',
            )}
          >
            <Icon className="mt-1.5 size-5 shrink-0 sm:mt-2" aria-hidden />
            <span className="min-w-0">{headline}</span>
          </p>
          <p className="mt-2.5 max-w-prose text-base leading-relaxed text-ink-muted">{detail}</p>
        </div>
      </div>

      {facts ? (
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3">
          {facts}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * A fact inside the lead block.
 *
 * Takes a `note` rather than allowing a bare figure: "3" is not an answer and
 * "3 of 5 come off without a tool" is.
 */
export function Fact({
  label,
  value,
  unit,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  tone?: VerdictTone;
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd>
        <span
          className={cn(
            'display block text-2xl leading-none tabular-nums',
            tone === 'caution' && 'text-caution',
            tone === 'critical' && 'text-critical',
            tone === 'positive' && 'text-positive',
            tone === 'neutral' && 'text-ink',
          )}
        >
          {value}
          {unit ? <span className="ml-1 text-sm text-ink-muted">{unit}</span> : null}
        </span>
        {note ? <span className="mt-1.5 block text-xs text-ink-subtle">{note}</span> : null}
      </dd>
    </div>
  );
}

export function DataList({ children }: { children: React.ReactNode }) {
  return <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">{children}</dl>;
}

export function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-base text-ink">{children}</dd>
    </div>
  );
}

/** A gap that is a real gap, said out loud rather than rendered as an empty box. */
export function Missing({ what, why }: { what: string; why?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-5 py-4">
      <p className="text-base text-ink">The brand has not published {what}.</p>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        {why ?? 'This is a field the passport is meant to carry. Ask them for it — and until it arrives, treat the item as unknown rather than as clear.'}
      </p>
    </div>
  );
}

export interface FibreShare {
  fibre: string;
  percentage: number;
  recycled?: { share: number; feedstock?: string | null } | null;
}

/**
 * The fibre mix as one bar.
 *
 * A composition, so a stacked bar rather than a set of separate bars: the
 * question a sorter asks is "is this nearly mono-material or is it a blend",
 * and that is a question about the shape of one whole, not about comparing
 * lengths. Every fibre is directly labelled with its share. Slots are assigned
 * in the order the brand declared them and never cycled — with more than seven
 * fibres the tail folds into "Other" rather than repeating a hue.
 */
export function FibreMix({ fibres }: { fibres: FibreShare[] }) {
  const sorted = [...fibres].sort((a, b) => b.percentage - a.percentage);
  const head = sorted.slice(0, 7);
  const tail = sorted.slice(7);
  const segments = [
    ...head.map((fibre, index) => ({
      key: `${fibre.fibre}-${index}`,
      label: fibreLabel(fibre.fibre),
      value: fibre.percentage,
      colour: seriesColour(index),
    })),
    ...(tail.length > 0
      ? [
          {
            key: 'other',
            label: `Other (${tail.length})`,
            value: tail.reduce((sum, fibre) => sum + fibre.percentage, 0),
            colour: 'var(--color-line-strong)',
          },
        ]
      : []),
  ];

  const dominant = sorted[0];

  return (
    <div>
      <StackedBar
        height={14}
        ariaLabel={segments.map((s) => `${s.value}% ${s.label}`).join(', ')}
        segments={segments}
      />
      <Legend
        className="mt-3"
        items={segments.map((segment) => ({
          key: segment.key,
          label: segment.label,
          value: `${segment.value}%`,
          colour: segment.colour,
        }))}
      />

      <ul className="mt-4 flex flex-col gap-2">
        {sorted.map((fibre, index) => (
          <li key={`${fibre.fibre}-${index}`} className="flex items-baseline gap-3 text-base">
            <span className="w-14 shrink-0 text-right tabular-nums text-ink">
              {fibre.percentage}%
            </span>
            <span className="text-ink">{fibreLabel(fibre.fibre)}</span>
            {fibre.recycled ? (
              <span className="text-sm text-ink-muted">
                {fibre.recycled.share}% recycled
                {fibre.recycled.feedstock ? ` from ${fibre.recycled.feedstock}` : ''}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {dominant && dominant.percentage < 100 ? (
        <p className="mt-3 text-sm text-ink-muted">
          {dominant.percentage >= 95
            ? `Effectively mono-material — ${dominant.percentage}% ${fibreLabel(dominant.fibre).toLowerCase()}, which most fibre-to-fibre routes will accept.`
            : `A blend. ${dominant.percentage}% ${fibreLabel(dominant.fibre).toLowerCase()} is the largest share, and blends below 95% are the usual reason a fibre-to-fibre route is refused.`}
        </p>
      ) : null}
    </div>
  );
}

export function fibreLabel(key: string): string {
  return FIBRES[key as keyof typeof FIBRES]?.label ?? key;
}

/** Human label for a component kind, tolerating a value the vocabulary has since dropped. */
export function componentLabel(kind: string): string {
  return COMPONENT_KINDS[kind as keyof typeof COMPONENT_KINDS] ?? kind;
}

/**
 * The disassembly sequence.
 *
 * Shared because it is the same list for both personas — a repairer reaching a
 * seam and a recycler stripping trims follow the same order — and duplicating
 * it once produced two copies that drifted.
 */
export function Steps({
  steps,
}: {
  steps: Array<{
    order: number;
    instruction: { en: string };
    toolRequired?: string | null;
    componentRef?: string | null;
    estimatedSeconds?: number | null;
  }>;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {[...steps]
        .sort((a, b) => a.order - b.order)
        .map((step) => (
          <li key={step.order} className="flex gap-4">
            <span className="display mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-base text-ink-muted tabular-nums">
              {step.order}
            </span>
            <span className="min-w-0 pt-1">
              <span className="block text-base leading-relaxed text-ink">
                {step.instruction.en}
              </span>
              {step.toolRequired || step.componentRef || step.estimatedSeconds ? (
                <span className="mt-1 block text-sm text-ink-muted">
                  {[
                    step.toolRequired ? `Tool: ${step.toolRequired}` : null,
                    step.componentRef ? `Part: ${step.componentRef}` : null,
                    step.estimatedSeconds ? `${step.estimatedSeconds}s` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ) : null}
            </span>
          </li>
        ))}
    </ol>
  );
}
