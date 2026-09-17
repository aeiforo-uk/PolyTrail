import { CircleAlert, Layers, Scissors, Split, TriangleAlert } from 'lucide-react';
import { RECYCLING_DISRUPTORS } from '@/lib/passport/vocab';
import type { PassportPayload } from '@/lib/passport/schema';
import { Meter } from '@/components/viz/meter';
import { cn } from '@/lib/utils';
import {
  DataList,
  DataRow,
  Fact,
  FibreMix,
  Missing,
  Section,
  Steps,
  Verdict,
  componentLabel,
  fibreLabel,
  type VerdictTone,
} from './sections';

/**
 * What a recycler needs, in the order a sorting line works.
 *
 * The first decision on a line is a routing decision — mechanical, chemical,
 * thermal or nothing — and it is made in seconds. So the route is the whole top
 * of the page, in display type, with the thing that most often overturns it
 * (the disruptors) sitting immediately beneath it rather than three scrolls
 * down. Everything else is detail for whoever pulls the item out for a closer
 * look.
 */

const ROUTES: Record<
  string,
  { headline: string; detail: string; tone: VerdictTone }
> = {
  mechanical: {
    headline: 'Mechanical recycling',
    detail:
      'Shred and re-spin. The cheapest route and the one most facilities can run, but it needs the blend to be clean and the hard trims off first.',
    tone: 'positive',
  },
  chemical: {
    headline: 'Chemical recycling',
    detail:
      'Depolymerise and re-polymerise. Tolerates blends a mechanical line would refuse, but the feedstock specification is narrow — check the disruptors below before committing the item.',
    tone: 'positive',
  },
  thermal: {
    headline: 'Thermal recovery only',
    detail:
      'The brand expects energy recovery rather than fibre recovery. The material does not come back, so this is the last route before disposal.',
    tone: 'caution',
  },
  none_available: {
    headline: 'No recycling route',
    detail:
      'The brand states no recovery route exists for this item as built. Recording that honestly is more useful than routing it to a line that will reject it.',
    tone: 'critical',
  },
};

/**
 * Disruptors are not equal, and a list that flags them all the same way flags
 * nothing. A flame-retardant finish can rule out recovery altogether; a metal
 * zip is thirty seconds with a pair of snips. Rank accordingly.
 */
const DISRUPTOR_SEVERITY: Record<string, { rank: number; tone: 'critical' | 'caution' | 'neutral'; verdict: string }> = {
  flame_retardant: { rank: 0, tone: 'critical', verdict: 'Can rule out recovery entirely' },
  coatings: { rank: 1, tone: 'critical', verdict: 'Contaminates the fibre stream' },
  glue_bonding: { rank: 2, tone: 'critical', verdict: 'Resists disassembly' },
  elastane_content: { rank: 3, tone: 'critical', verdict: 'Blocks most routes above ~5%' },
  sewn_in_padding: { rank: 4, tone: 'caution', verdict: 'Not economically separable' },
  mixed_fibres: { rank: 5, tone: 'caution', verdict: 'Needs fibre separation first' },
  pu_print: { rank: 6, tone: 'caution', verdict: 'Contaminates if large' },
  metal_trims: { rank: 7, tone: 'neutral', verdict: 'Remove before shredding' },
};

export function RecyclerView({ payload }: { payload: Partial<PassportPayload> }) {
  const composition = payload.composition;
  const recyclability = payload.circularity?.recyclability;
  const steps = recyclability?.disassemblySteps ?? [];
  const disruptors = recyclability?.disruptors ?? [];
  const substances = payload.substances?.substancesOfConcern ?? [];

  const strippingSeconds = steps.reduce((total, step) => total + (step.estimatedSeconds ?? 0), 0);
  const strippingMinutes = strippingSeconds > 0 ? Math.ceil(strippingSeconds / 60) : null;

  const ranked = [...disruptors]
    .map((key) => ({
      key,
      entry: RECYCLING_DISRUPTORS[key as keyof typeof RECYCLING_DISRUPTORS],
      severity: DISRUPTOR_SEVERITY[key] ?? { rank: 9, tone: 'caution' as const, verdict: 'Check before routing' },
    }))
    .sort((a, b) => a.severity.rank - b.severity.rank);

  const blockers = ranked.filter((item) => item.severity.tone === 'critical').length;

  const route = recyclability?.route ? ROUTES[recyclability.route] : undefined;
  const verdict = route ?? {
    headline: 'No route declared',
    detail:
      'The brand has not said how this item is meant to be recovered. Sort it on the fibre mix below and record what you did — an unanswered field is a gap the brand should be told about.',
    tone: 'neutral' as VerdictTone,
  };

  // A clean route with blockers under it is not a clean route. Say so up top
  // rather than letting the reader discover it four sections later.
  const tone: VerdictTone =
    verdict.tone === 'positive' && blockers > 0 ? 'caution' : verdict.tone;
  const detail =
    verdict.tone === 'positive' && blockers > 0
      ? `${verdict.detail} ${blockers === 1 ? 'One declared disruptor' : `${blockers} declared disruptors`} could still overturn this — read them first.`
      : verdict.detail;

  return (
    <div className="flex flex-col gap-8">
      <Verdict
        eyebrow="Recycling route"
        headline={verdict.headline}
        detail={detail}
        tone={tone}
        facts={
          <>
            <Fact
              label="Disruptors"
              value={ranked.length}
              tone={blockers > 0 ? 'critical' : ranked.length > 0 ? 'caution' : 'positive'}
              note={
                ranked.length === 0
                  ? 'none declared'
                  : blockers > 0
                    ? `${blockers} can block recovery`
                    : 'all are workable'
              }
            />
            <Fact
              label="Stripping time"
              value={strippingMinutes ?? '—'}
              unit={strippingMinutes ? 'min' : undefined}
              note={
                strippingMinutes
                  ? `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}, brand's estimate`
                  : 'no steps published'
              }
            />
            <Fact
              label="Recyclable share"
              value={
                recyclability?.recyclableShare != null ? `${recyclability.recyclableShare}%` : '—'
              }
              note={
                recyclability?.recyclableShare != null
                  ? `of ${composition?.totalWeightGrams ? `${composition.totalWeightGrams} g` : 'total weight'}`
                  : 'not stated'
              }
              tone={
                recyclability?.recyclableShare == null
                  ? 'neutral'
                  : recyclability.recyclableShare >= 80
                    ? 'positive'
                    : recyclability.recyclableShare >= 50
                      ? 'caution'
                      : 'critical'
              }
            />
          </>
        }
      />

      <Section
        title="What will disrupt recovery"
        icon={TriangleAlert}
        hint="Ranked by what it costs you, worst first. The top of this list is what decides whether the route above survives contact with the item."
      >
        {ranked.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {ranked.map(({ key, entry, severity }) => (
              <li
                key={key}
                className={cn(
                  'flex gap-3.5 rounded-lg border px-4 py-3.5',
                  severity.tone === 'critical' && 'border-critical-border bg-critical-soft',
                  severity.tone === 'caution' && 'border-caution-border bg-caution-soft',
                  severity.tone === 'neutral' && 'border-line bg-surface',
                )}
              >
                <CircleAlert
                  className={cn(
                    'mt-0.5 size-4.5 shrink-0',
                    severity.tone === 'critical' && 'text-critical',
                    severity.tone === 'caution' && 'text-caution',
                    severity.tone === 'neutral' && 'text-ink-subtle',
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span
                      className={cn(
                        'text-base font-medium',
                        severity.tone === 'critical' && 'text-critical',
                        severity.tone === 'caution' && 'text-caution',
                        severity.tone === 'neutral' && 'text-ink',
                      )}
                    >
                      {entry?.label ?? key}
                    </span>
                    <span className="text-xs text-ink-subtle">{severity.verdict}</span>
                  </p>
                  {entry?.detail ? (
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">{entry.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-positive-border bg-positive-soft px-5 py-4 text-base leading-relaxed text-ink">
            <span className="font-medium text-positive">None declared.</span> That is the brand’s
            claim, not a guarantee. Check the trims and the print before you commit the item to a
            line — an undeclared laminate is discovered by the shredder otherwise.
          </p>
        )}
      </Section>

      <Section
        title="Fibre breakdown"
        icon={Layers}
        hint="What the item is, by weight. The width of each band is its share."
      >
        {composition?.overall?.length ? (
          <>
            <FibreMix fibres={composition.overall} />
            <DataList>
              {composition.totalWeightGrams ? (
                <DataRow label="Total weight">
                  <span className="tabular-nums">{composition.totalWeightGrams}</span> g
                </DataRow>
              ) : null}
              {composition.monomaterial != null ? (
                <DataRow label="Mono-material">
                  {composition.monomaterial ? 'Yes — declared' : 'No — blended'}
                </DataRow>
              ) : null}
            </DataList>
          </>
        ) : (
          <Missing
            what="a fibre breakdown"
            why="Without it there is no way to route the item other than by feel. It is a mandatory field on a published passport, so its absence is worth reporting."
          />
        )}
      </Section>

      <Section
        title="Separation points"
        icon={Split}
        hint="Which part is which fibre, and what comes off cleanly."
      >
        {composition?.components?.length ? (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-md text-left text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className="eyebrow px-4 py-2.5">
                    Part
                  </th>
                  <th scope="col" className="eyebrow px-4 py-2.5">
                    Fibres
                  </th>
                  <th scope="col" className="eyebrow px-4 py-2.5 text-right">
                    Weight
                  </th>
                  <th scope="col" className="eyebrow px-4 py-2.5 text-right">
                    Comes off
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {composition.components.map((component) => (
                  <tr key={component.ref}>
                    <td className="px-4 py-3 text-base text-ink">
                      {component.name ?? componentLabel(component.kind)}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {component.fibres
                        .map((fibre) => `${fibre.percentage}% ${fibreLabel(fibre.fibre)}`)
                        .join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                      {component.weightGrams
                        ? `${component.weightGrams} g`
                        : component.weightShare
                          ? `${component.weightShare}%`
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {component.removable == null ? (
                        <span className="text-ink-subtle">Not stated</span>
                      ) : component.removable ? (
                        <span className="text-positive">Yes</span>
                      ) : (
                        <span className="text-caution">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Missing what="a component breakdown" />
        )}

        {recyclability?.separationNotes?.en ? (
          <p className="mt-4 max-w-prose rounded-lg border border-line bg-surface px-5 py-4 text-base leading-relaxed text-ink">
            {recyclability.separationNotes.en}
          </p>
        ) : null}
      </Section>

      <Section
        title="Getting it apart"
        icon={Scissors}
        hint={
          strippingMinutes
            ? `About ${strippingMinutes} ${strippingMinutes === 1 ? 'minute' : 'minutes'} end to end, on the brand's own estimate.`
            : undefined
        }
      >
        {steps.length > 0 ? (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
            <div className="min-w-0 flex-1">
              <Steps steps={steps} />
            </div>
            {strippingMinutes ? (
              <div className="shrink-0 rounded-lg border border-line bg-surface px-5 py-4">
                {/* Against a ten-minute bench budget, which is where a sorting
                    line stops stripping and starts baling. */}
                <Meter
                  value={Math.min(100, (strippingSeconds / 600) * 100)}
                  size={52}
                  tone={strippingSeconds <= 300 ? 'positive' : strippingSeconds <= 600 ? 'caution' : 'critical'}
                  label={`${strippingMinutes} min`}
                  sublabel="of a 10 min bench budget"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <Missing
            what="disassembly steps"
            why="You will have to work the sequence out at the bench. Record how long it actually took — that is the feedback that gets the field filled in next season."
          />
        )}
      </Section>

      {substances.length > 0 ? (
        <Section
          title="Substances of concern"
          icon={TriangleAlert}
          hint="What is in it, where, and the identifiers you need for your own reporting."
        >
          <ul className="flex flex-col gap-2">
            {substances.map((substance, index) => (
              <li
                key={`${substance.name}-${index}`}
                className="rounded-lg border border-line bg-surface px-5 py-3.5"
              >
                <p className="text-base text-ink">{substance.name}</p>
                <p className="mono mt-1 text-2xs text-ink-muted">
                  {[
                    substance.casNumber ? `CAS ${substance.casNumber}` : null,
                    substance.ecNumber ? `EC ${substance.ecNumber}` : null,
                    substance.scipNumber ? `SCIP ${substance.scipNumber}` : null,
                    substance.componentRef ? `in ${substance.componentRef}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
