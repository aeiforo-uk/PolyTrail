import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import {
  BENCHMARK_SOURCE,
  benchmarkFor,
  carbonAsCarKm,
  compare,
  waterAsDrinkingDays,
} from '@/lib/passport/benchmarks';
import type { PassportPayload } from '@/lib/passport/schema';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/motion/count-up';

/**
 * The verdict band.
 *
 * Every passport in the wild opens as a stack of closed grey bars, so a person
 * who scans a label and does not tap anything learns nothing at all. This band
 * is the answer: three or four figures, each already interpreted against a
 * baseline, above the fold and before any disclosure.
 *
 * The rule the band enforces is that a number never appears without the thing
 * it should be measured against. Where there is no baseline, the figure is
 * shown plainly with no comparison rather than with an invented one.
 */

interface Stat {
  value: string;
  /** The raw figure, when there is one, so it can settle rather than appear. */
  numeric?: number;
  decimals?: number;
  unit?: string;
  label: string;
  comparison?: { sentence: string; verdict: 'better' | 'worse' | 'similar' };
  footnote?: string;
}

export function VerdictBand({ payload }: { payload: Partial<PassportPayload> }) {
  const stats = buildStats(payload);
  if (stats.length === 0) return null;

  const hasComparison = stats.some((s) => s.comparison);

  return (
    <section
      aria-label="Summary"
      className="grain border-y border-line bg-surface-sunken/60 px-5 py-8 sm:px-8"
    >
      <dl
        className={cn(
          'grid gap-x-6 gap-y-7',
          stats.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3',
        )}
      >
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            // Left to right, 40ms apart: the counters land in reading order
            // rather than as one simultaneous thud.
            className={cn('animate-in-up flex flex-col gap-1', `stagger-${Math.min(index + 1, 6)}`)}
          >
            <dd className="display text-3xl text-ink tabular-nums sm:text-4xl">
              {typeof stat.numeric === 'number' ? (
                <CountUp value={stat.numeric} decimals={stat.decimals ?? 0} />
              ) : (
                stat.value
              )}
              {stat.unit ? (
                <span className="ml-1 align-baseline text-base font-normal text-ink-muted sm:text-lg">
                  {stat.unit}
                </span>
              ) : null}
            </dd>
            <dt className="text-sm text-ink-muted">{stat.label}</dt>
            {stat.comparison ? (
              <div className="animate-in-fade" style={{ animationDelay: '380ms' }}>
                <Comparator {...stat.comparison} />
              </div>
            ) : null}
            {stat.footnote ? (
              <p className="text-2xs text-ink-subtle">{stat.footnote}</p>
            ) : null}
          </div>
        ))}
      </dl>

      {hasComparison ? (
        <p className="mt-7 max-w-prose border-t border-line pt-4 text-2xs leading-relaxed text-ink-subtle">
          {BENCHMARK_SOURCE}
        </p>
      ) : null}
    </section>
  );
}

function Comparator({
  sentence,
  verdict,
}: {
  sentence: string;
  verdict: 'better' | 'worse' | 'similar';
}) {
  const Icon = verdict === 'better' ? ArrowDown : verdict === 'worse' ? ArrowUp : Minus;
  return (
    <p
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        verdict === 'better' && 'text-positive',
        verdict === 'worse' && 'text-caution',
        verdict === 'similar' && 'text-ink-subtle',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {sentence}
    </p>
  );
}

function buildStats(payload: Partial<PassportPayload>): Stat[] {
  const stats: Stat[] = [];
  const benchmark = benchmarkFor(payload.identity?.category);

  const carbon = payload.environment?.carbon?.totalKgCo2e;
  if (typeof carbon === 'number') {
    const c = benchmark ? compare(carbon, benchmark.carbonKgCo2e, benchmark.label) : null;
    stats.push({
      value: formatNumber(carbon),
      numeric: carbon,
      decimals: carbon >= 100 ? 0 : 1,
      unit: 'kg CO₂e',
      label: 'Carbon footprint',
      ...(c ? { comparison: { sentence: c.sentence, verdict: c.verdict } } : {}),
      footnote: `About ${carbonAsCarKm(carbon).toLocaleString()} km in an average car`,
    });
  }

  const water = payload.environment?.water?.litres;
  if (typeof water === 'number') {
    const c = benchmark ? compare(water, benchmark.waterLitres, benchmark.label) : null;
    stats.push({
      value: formatNumber(water),
      numeric: water,
      decimals: 0,
      unit: 'L',
      label: 'Water used',
      ...(c ? { comparison: { sentence: c.sentence, verdict: c.verdict } } : {}),
      footnote: `${waterAsDrinkingDays(water).toLocaleString()} days of drinking water`,
    });
  }

  // Traceability is the figure brands find hardest and consumers trust most,
  // so it sits beside the environmental numbers rather than inside a section.
  const steps = payload.supplyChain?.steps ?? [];
  if (steps.length > 0) {
    const traced = steps.filter(
      (s) => s.evidence === 'document_verified' || s.evidence === 'third_party_audited',
    ).length;
    stats.push({
      value: `${traced}/${steps.length}`,
      label: 'Production steps verified',
      ...(traced === steps.length
        ? { comparison: { sentence: 'every step independently evidenced', verdict: 'better' as const } }
        : {}),
    });
  }

  const recycled = payload.composition?.totalRecycledContent;
  const overall = payload.composition?.overall;
  if (typeof recycled === 'number' && recycled > 0) {
    stats.push({
      value: `${Math.round(recycled)}`,
      numeric: Math.round(recycled),
      unit: '%',
      label: 'Recycled content',
    });
  } else if (overall?.length) {
    const headline = [...overall].sort((a, b) => b.percentage - a.percentage)[0]!;
    stats.push({
      value: `${Math.round(headline.percentage)}%`,
      label: `${fibreLabel(headline.fibre)}, mainly`,
    });
  }

  return stats.slice(0, 4);
}

function formatNumber(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString('en-GB');
  if (value >= 100) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, '');
}

function fibreLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}
