import Link from 'next/link';
import { CircleAlert, Leaf, ShieldCheck } from 'lucide-react';
import { BarChart, Legend, StackedBar } from '@/components/viz/bar-chart';
import { ComparisonBar } from '@/components/viz/comparison-bar';
import { seriesColour, rampStep } from '@/components/viz/tokens';
import {
  BENCHMARK_SOURCE,
  benchmarkFor,
  carbonAsCarKm,
  compare,
  waterAsDrinkingDays,
} from '@/lib/passport/benchmarks';
import type { CompletenessResult } from '@/lib/passport/completeness';
import type { PassportPayload } from '@/lib/passport/schema';
import { FIBRES } from '@/lib/passport/vocab';
import { cn } from '@/lib/utils';
import { ChainDepth, DEPTH_EXPLAINERS } from '../chain-depth';

/**
 * What this passport actually says, read at a glance.
 *
 * Three questions, in the order a reader asks them: what is it made of, what
 * did it cost to make, and how much of the record is still missing. Every
 * figure carries its reference — a footprint number with no baseline is
 * decoration, and a fibre percentage without the rest of the composition
 * beside it cannot be sanity-checked.
 */
export function OverviewTab({
  payload,
  category,
  completeness,
  dppId,
  carrier,
}: {
  payload: Partial<PassportPayload>;
  category: string | null;
  completeness: CompletenessResult;
  dppId: string;
  /**
   * Rendered by the page rather than here, because the QR has to be generated
   * on the server and this component is shared with client-rendered tabs.
   */
  carrier: React.ReactNode;
}) {
  const fibres = compositionSeries(payload);
  const benchmark = benchmarkFor(category ?? undefined);

  const carbon = payload.environment?.carbon?.totalKgCo2e;
  const water = payload.environment?.water?.litres;
  const mass = payload.composition?.totalWeightGrams;
  const hasFootprint = [carbon, water, mass].some((value) => typeof value === 'number');

  const depth = payload.supplyChain?.traceabilityDepth ?? null;
  const steps = payload.supplyChain?.steps ?? [];

  const sectionBars = completeness.sections
    .map((section) => ({
      key: section.key,
      label: section.label,
      value: section.total === 0 ? 0 : Math.round((section.filled / section.total) * 100),
      blocking: section.missingRequired.length,
    }))
    .sort((a, b) => a.value - b.value);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* ── Composition ───────────────────────────────────────────────── */}
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">What it is made of</h2>
            {fibres.total > 0 ? (
              <span
                className={cn(
                  'text-xs tabular-nums',
                  Math.abs(fibres.total - 100) < 0.51 ? 'text-ink-subtle' : 'text-caution',
                )}
              >
                {fibres.total}% declared
                {Math.abs(fibres.total - 100) >= 0.51 ? ' — should be 100%' : ''}
              </span>
            ) : null}
          </div>

          {fibres.segments.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-line-strong bg-surface-sunken/40 px-4 py-6 text-center text-sm text-ink-muted">
              No fibre composition recorded. It is the first thing every reader looks for, and
              publication is refused without it.{' '}
              <Link
                href={`/console/passports/${dppId}/edit/composition`}
                className="text-accent hover:underline"
              >
                Add the composition
              </Link>
            </p>
          ) : (
            <>
              <StackedBar
                className="mt-4"
                height={12}
                ariaLabel={fibres.segments
                  .map((segment) => `${segment.value}% ${segment.label}`)
                  .join(', ')}
                segments={fibres.segments}
              />
              <Legend
                className="mt-3"
                items={fibres.segments.map((segment) => ({
                  key: segment.key,
                  label: segment.label,
                  value: `${segment.value}%`,
                  colour: segment.colour,
                }))}
              />

              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
                <Figure
                  label="Total weight"
                  value={mass != null ? `${mass} g` : '—'}
                  note={mass == null ? 'not recorded' : undefined}
                />
                <Figure
                  label="Recycled content"
                  value={
                    payload.composition?.totalRecycledContent != null
                      ? `${payload.composition.totalRecycledContent}%`
                      : '—'
                  }
                  note={
                    payload.composition?.totalRecycledContent == null ? 'not recorded' : 'of weight'
                  }
                />
                <Figure
                  label="Single-fibre"
                  value={
                    payload.composition?.monomaterial == null
                      ? '—'
                      : payload.composition.monomaterial
                        ? 'Yes'
                        : 'No'
                  }
                  note={
                    payload.composition?.monomaterial
                      ? 'recyclable without separation'
                      : 'trims must come off first'
                  }
                />
              </dl>
            </>
          )}
        </section>

        {/* ── Footprint ─────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">What it cost to make</h2>
            {payload.environment?.footprintClass ? (
              <span className="text-xs text-ink-muted">
                PEF class{' '}
                <span className="mono font-medium text-ink">
                  {payload.environment.footprintClass}
                </span>
              </span>
            ) : null}
          </div>

          {!hasFootprint ? (
            <p className="mt-4 rounded-md border border-dashed border-line-strong bg-surface-sunken/40 px-4 py-6 text-center text-sm text-ink-muted">
              No footprint figures yet.{' '}
              <Link
                href={`/console/passports/${dppId}/edit/environment`}
                className="text-accent hover:underline"
              >
                Record a carbon or water result
              </Link>{' '}
              along with the method that produced it.
            </p>
          ) : !benchmark ? (
            <>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Figure
                  label="Carbon"
                  value={carbon != null ? `${carbon} kg CO₂e` : '—'}
                  note={payload.environment?.carbon?.boundary?.replace(/_/g, ' ')}
                />
                <Figure label="Water" value={water != null ? `${fmt(water)} L` : '—'} />
                <Figure label="Weight" value={mass != null ? `${mass} g` : '—'} />
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
                We hold no category reference for this product group, so these figures are shown on
                their own rather than against an invented baseline.
              </p>
            </>
          ) : (
            <>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <Metric
                  label="Carbon"
                  value={carbon}
                  reference={benchmark.carbonKgCo2e}
                  noun={benchmark.label}
                  format={(n) => `${round(n)} kg CO₂e`}
                  aside={
                    carbon != null ? `about ${fmt(carbonAsCarKm(carbon))} km in a car` : undefined
                  }
                />
                <Metric
                  label="Water"
                  value={water}
                  reference={benchmark.waterLitres}
                  noun={benchmark.label}
                  format={(n) => `${fmt(Math.round(n))} L`}
                  aside={
                    water != null
                      ? `${fmt(waterAsDrinkingDays(water))} days of drinking water`
                      : undefined
                  }
                />
                <Metric
                  label="Weight"
                  value={mass}
                  reference={benchmark.massGrams}
                  noun={benchmark.label}
                  format={(n) => `${round(n)} g`}
                  aside="heavier is not worse — it is a sanity check on the other two"
                />
              </div>
              <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-2xs leading-relaxed text-ink-subtle">
                <Leaf className="mt-px size-3 shrink-0" aria-hidden />
                {BENCHMARK_SOURCE} It is a reference, not a certified comparison.
              </p>
            </>
          )}
        </section>

        {/* ── Supply chain ──────────────────────────────────────────────── */}
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">How far the chain is mapped</h2>
          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
            <ChainDepth depth={depth} steps={steps.length} size="md" />
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-muted">
              {depth
                ? (DEPTH_EXPLAINERS[depth] ?? 'Depth recorded.')
                : 'Nobody has said how far back this product has been traced. Buyers ask for this before they ask for anything else.'}
            </p>
          </div>

          {steps.length > 0 ? (
            <ul className="mt-4 flex flex-col divide-y divide-line border-t border-line">
              {steps.slice(0, 6).map((step, index) => (
                <li
                  key={`${step.ref}-${index}`}
                  className="flex items-baseline justify-between gap-3 py-2 text-xs"
                >
                  <span className="min-w-0 truncate text-ink">
                    {step.facilityDisclosed === false
                      ? 'Undisclosed facility'
                      : (step.facilityName ?? 'Unnamed facility')}
                    <span className="ml-2 text-ink-subtle">
                      {step.process.replace(/_/g, ' ')}
                    </span>
                  </span>
                  <span className="mono shrink-0 text-2xs text-ink-muted">{step.country}</span>
                </li>
              ))}
              {steps.length > 6 ? (
                <li className="pt-2 text-xs text-ink-subtle">
                  and {steps.length - 6} more —{' '}
                  <Link
                    href={`/console/passports/${dppId}/edit/supply-chain`}
                    className="text-accent hover:underline"
                  >
                    see all steps
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>
      </div>

      {/* ── Rail ─────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* ── The passport itself ───────────────────────────────────────────
            Top of the rail, above the diagnostics, because it is the artefact
            the work produces. Everything else on this screen describes how
            finished it is; this is the thing being finished. */}
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">The passport</h2>
          <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
            The code goes on the garment. Turn it over to see what a scanner
            reads, or download the artwork for a label house.
          </p>
          {carrier}
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Completeness by section</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Scored against every field the registry expects, weakest first.
          </p>
          <BarChart
            className="mt-4"
            max={100}
            formatValue={(n) => `${n}%`}
            data={sectionBars.map((section) => ({
              key: section.key,
              label: section.label,
              value: section.value,
              colour: section.blocking > 0 ? 'var(--color-caution)' : rampStep(section.value / 100),
            }))}
            emptyMessage="Nothing scored yet."
          />
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Before it can be published</h2>
          {completeness.missingRequired.length === 0 ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-positive">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Every required field is filled in.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink-muted tabular-nums">
                {completeness.missingRequired.length} required{' '}
                {completeness.missingRequired.length === 1 ? 'field is' : 'fields are'} still blank.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {completeness.missingRequired.slice(0, 10).map((field) => (
                  <li key={field.path} className="flex items-start gap-2 text-xs text-ink-muted">
                    <CircleAlert className="mt-0.5 size-3 shrink-0 text-critical" aria-hidden />
                    {field.label}
                  </li>
                ))}
                {completeness.missingRequired.length > 10 ? (
                  <li className="text-2xs text-ink-subtle tabular-nums">
                    and {completeness.missingRequired.length - 10} more
                  </li>
                ) : null}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  reference,
  noun,
  format,
  aside,
}: {
  label: string;
  value: number | undefined;
  reference: number;
  noun: string;
  format: (n: number) => string;
  aside?: string;
}) {
  if (value == null) {
    return (
      <div className="flex flex-col gap-1">
        <p className="eyebrow">{label}</p>
        <p className="text-sm text-ink-subtle">Not recorded</p>
        <p className="text-2xs text-ink-subtle">
          Reference for this category is {format(reference)}.
        </p>
      </div>
    );
  }

  const verdict = compare(value, reference, noun);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {verdict ? (
          <span
            className={cn(
              'text-2xs font-medium',
              verdict.verdict === 'better'
                ? 'text-positive'
                : verdict.verdict === 'worse'
                  ? 'text-caution'
                  : 'text-ink-subtle',
            )}
          >
            {verdict.sentence}
          </span>
        ) : null}
      </div>
      <p className="text-xl font-semibold leading-none tracking-[-0.012em] text-ink tabular-nums">{format(value)}</p>
      <ComparisonBar
        className="mt-1"
        value={value}
        reference={reference}
        formatValue={format}
        referenceLabel="category reference"
      />
      {aside ? <p className="text-2xs leading-4 text-ink-subtle">{aside}</p> : null}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink tabular-nums">{value}</dd>
      {note ? <p className="text-2xs text-ink-subtle">{note}</p> : null}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fibres as stacked-bar segments.
 *
 * Colours are assigned in fixed order down a stable, largest-first list and
 * never cycled — a ninth fibre folds into "Other" rather than reusing slot 1,
 * because a repeated hue on one bar means two different things.
 */
function compositionSeries(payload: Partial<PassportPayload>) {
  const overall = payload.composition?.overall ?? [];
  const sorted = [...overall].sort((a, b) => b.percentage - a.percentage);
  const total = Math.round(sorted.reduce((sum, fibre) => sum + fibre.percentage, 0) * 100) / 100;

  const head = sorted.slice(0, 7);
  const tail = sorted.slice(7);

  const segments: Array<{ key: string; label: string; value: number; colour: string }> = head.map(
    (fibre, index) => ({
      key: `${fibre.fibre}-${index}`,
      label: FIBRES[fibre.fibre as keyof typeof FIBRES]?.label ?? fibre.fibre,
      value: fibre.percentage,
      colour: seriesColour(index),
    }),
  );

  if (tail.length > 0) {
    segments.push({
      key: 'other',
      label: `Other (${tail.length})`,
      value: Math.round(tail.reduce((sum, fibre) => sum + fibre.percentage, 0) * 100) / 100,
      colour: 'var(--color-line-strong)',
    });
  }

  return { segments, total };
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function fmt(value: number): string {
  return value.toLocaleString('en-GB');
}
