import { BookOpen, Layers, Puzzle, Scissors, ShieldAlert, Wrench } from 'lucide-react';
import type { PassportPayload } from '@/lib/passport/schema';
import { Meter } from '@/components/viz/meter';
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
 * What a repairer needs, in the order they need it.
 *
 * One fact decides whether a repair happens at all: is there a part. A zip that
 * has no reference and no supply commitment is a different job from one with a
 * part number and a brand that will post it, and the person holding the garment
 * should know which they are looking at before they read a word about fibre
 * content. So the parts answer is the whole top of the page; construction,
 * composition and disassembly follow, in the order a repair actually proceeds.
 */
export function RepairerView({ payload }: { payload: Partial<PassportPayload> }) {
  const composition = payload.composition;
  const care = payload.care;
  const durability = payload.durability;
  const steps = payload.circularity?.recyclability?.disassemblySteps ?? [];
  const repair = care?.repair;
  const spareParts = repair?.spareParts ?? [];
  const located = payload.substances?.substancesOfConcern ?? [];

  const until = repair?.sparePartsUntil ? new Date(repair.sparePartsUntil) : null;
  const untilLabel = until
    ? until.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;
  const expired = until ? until.getTime() < Date.now() : false;

  const verdict: { headline: string; detail: string; tone: VerdictTone } =
    spareParts.length > 0 && !expired
      ? {
          headline: `${spareParts.length} spare ${spareParts.length === 1 ? 'part is' : 'parts are'} listed`,
          detail: untilLabel
            ? `With references, and the brand commits to supplying them until ${untilLabel}. Quote the reference when you order — a part described only by name is the usual reason the wrong one arrives.`
            : 'With references, but no supply end-date is published. Quote the reference when you order and ask the brand how long it stands.',
          tone: 'positive',
        }
      : spareParts.length > 0 && expired
        ? {
            headline: 'Parts are listed, but the commitment has lapsed',
            detail: `The brand's supply commitment ran to ${untilLabel}. The references below are still the right ones to quote, but treat availability as a question rather than an answer.`,
            tone: 'caution',
          }
        : repair?.sparePartsAvailable
          ? {
              headline: 'Parts exist, but none are listed',
              detail:
                'The brand says spare parts are available and has not published references for them. You will have to ask directly, quoting the passport identifier above.',
              tone: 'caution',
            }
          : {
              headline: 'No spare parts published',
              detail:
                'Nothing is listed and no availability is claimed. A repair here has to be made from stock, salvage or a like-for-like substitute — the construction detail below is what you will be matching against.',
              tone: 'critical',
            };

  const strippingSeconds = steps.reduce((total, step) => total + (step.estimatedSeconds ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <Verdict
        eyebrow="Spare parts"
        headline={verdict.headline}
        detail={verdict.detail}
        tone={verdict.tone}
        facts={
          <>
            <Fact
              label="Parts listed"
              value={spareParts.length}
              tone={spareParts.length > 0 ? 'positive' : 'critical'}
              note={
                spareParts.length > 0
                  ? `${spareParts.filter((part) => part.reference).length} with a reference`
                  : 'none published'
              }
            />
            <Fact
              label="Supplied until"
              value={untilLabel ?? '—'}
              tone={expired ? 'critical' : untilLabel ? 'positive' : 'neutral'}
              note={expired ? 'commitment lapsed' : untilLabel ? 'brand commitment' : 'no date given'}
            />
            <Fact
              label="Repair guidance"
              value={repair?.guideUrl ? 'Guide' : repair?.instructions?.en ? 'Notes' : '—'}
              tone={repair?.guideUrl || repair?.instructions?.en ? 'positive' : 'neutral'}
              note={
                repair?.guideUrl
                  ? 'published by the brand'
                  : repair?.instructions?.en
                    ? 'written into the passport'
                    : 'nothing published'
              }
            />
          </>
        }
      />

      <Section title="The parts themselves" icon={Wrench}>
        {spareParts.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {spareParts.map((part, index) => (
              <li
                key={`${part.reference ?? part.name}-${index}`}
                className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3.5"
              >
                <span className="text-base text-ink">{part.name}</span>
                {part.reference ? (
                  <span className="mono text-sm text-ink-muted">{part.reference}</span>
                ) : (
                  <span className="text-xs text-ink-subtle">no reference published</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Missing
            what="a spare-parts list"
            why="Match the component detail below against what you have on the shelf. If you find a substitute that works, record it — the note goes on the passport and the next repairer sees it."
          />
        )}

        {repair?.instructions?.en ? (
          <p className="mt-5 max-w-prose rounded-lg border border-line bg-surface px-5 py-4 text-base leading-relaxed text-ink">
            {repair.instructions.en}
          </p>
        ) : null}
        {repair?.guideUrl ? (
          <a
            href={repair.guideUrl}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-base text-ink shadow-xs transition-colors duration-[140ms] hover:bg-surface-sunken motion-reduce:transition-none"
            rel="noreferrer noopener"
            target="_blank"
          >
            <BookOpen className="size-4 text-ink-subtle" aria-hidden />
            The brand’s repair guide
          </a>
        ) : null}
      </Section>

      <Section
        title="How it is put together"
        icon={Puzzle}
        hint="Construction and fabric weight, so you can match thread, stitch and replacement fabric."
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
                  <th scope="col" className="eyebrow px-4 py-2.5">
                    Construction
                  </th>
                  <th scope="col" className="eyebrow px-4 py-2.5 text-right">
                    Weight
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {composition.components.map((component) => (
                  <tr key={component.ref}>
                    <td className="px-4 py-3 text-base text-ink">
                      {component.name ?? componentLabel(component.kind)}
                      {component.removable ? (
                        <span className="ml-2 text-2xs text-positive">removable</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {component.fibres.map((fibre) => fibreLabel(fibre.fibre)).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {component.construction?.replace(/_/g, ' ') ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                      {component.fabricWeightGsm
                        ? `${component.fabricWeightGsm} gsm`
                        : component.weightGrams
                          ? `${component.weightGrams} g`
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Missing what="a bill of materials" />
        )}
      </Section>

      <Section
        title="What it is made of"
        icon={Layers}
        hint="So your thread, your patch and your wash test all match what is already there."
      >
        {composition?.overall?.length ? (
          <FibreMix fibres={composition.overall} />
        ) : (
          <Missing what="a fibre breakdown" />
        )}
      </Section>

      <Section
        title="Getting it apart"
        icon={Scissors}
        hint="Published for recovery, but it is the same sequence you need to reach a seam or replace a zip."
      >
        {steps.length > 0 ? (
          <Steps steps={steps} />
        ) : (
          <Missing
            what="disassembly steps"
            why="You will work the sequence out at the bench. A note on what you did helps whoever opens this garment next — including the recycler at the end of its life."
          />
        )}
        {strippingSeconds > 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            The brand estimates{' '}
            <span className="tabular-nums text-ink">{Math.ceil(strippingSeconds / 60)} minutes</span>{' '}
            for the full strip-down. A single-seam repair is a fraction of that.
          </p>
        ) : null}
      </Section>

      {durability ? (
        <Section
          title="What it was built to take"
          icon={ShieldAlert}
          hint="Test results against named standards, so you know what the repair has to survive."
        >
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            {durability.expectedWashCycles ? (
              <Fact
                label="Expected washes"
                value={durability.expectedWashCycles}
                note="before it fails its spec"
              />
            ) : null}
            {durability.tensileStrengthN ? (
              <Fact
                label="Tensile strength"
                value={durability.tensileStrengthN}
                unit="N"
                note="fabric, not seam"
              />
            ) : null}
            {durability.warrantyMonths ? (
              <Fact
                label="Warranty"
                value={durability.warrantyMonths}
                unit="months"
                note="from first sale"
              />
            ) : null}
            {durability.abrasionResistance ? (
              <Fact
                label="Abrasion"
                value={durability.abrasionResistance.martindaleCycles.toLocaleString('en-GB')}
                note={`Martindale · ${durability.abrasionResistance.standard}`}
              />
            ) : null}
            {durability.pillingResistance ? (
              <Fact
                label="Pilling"
                value={`${durability.pillingResistance.grade} of 5`}
                note={durability.pillingResistance.standard}
                tone={durability.pillingResistance.grade >= 4 ? 'positive' : 'caution'}
              />
            ) : null}
            {durability.seamSlippage ? (
              <Fact
                label="Seam slippage"
                value={durability.seamSlippage.passed ? 'Passed' : 'Failed'}
                note={durability.seamSlippage.standard}
                tone={durability.seamSlippage.passed ? 'positive' : 'critical'}
              />
            ) : null}
          </div>

          {durability.repairabilityScore != null ? (
            <div className="mt-5 flex flex-wrap items-center gap-5 rounded-lg border border-line bg-surface px-5 py-4">
              <Meter
                value={durability.repairabilityScore}
                size={56}
                label="Repairability"
                sublabel="the brand’s own score"
              />
              <p className="min-w-48 flex-1 text-sm leading-relaxed text-ink-muted">
                A voluntary claim, not a regulated index. The JRC assessed repairability for the
                textile delegated act and rejected it as not objectively quantifiable, so read this
                as the brand’s opinion of its own garment.
              </p>
            </div>
          ) : null}

          {durability.dimensionalStability ? (
            <DataList>
              <DataRow label="Dimensional change">
                <span className="tabular-nums">
                  {durability.dimensionalStability.changePercent}%
                </span>{' '}
                · {durability.dimensionalStability.standard}
              </DataRow>
            </DataList>
          ) : null}
        </Section>
      ) : null}

      {located.length > 0 ? (
        <Section
          title="Substances to be aware of"
          icon={ShieldAlert}
          hint="Where they sit in the garment, so you know what you are cutting into."
        >
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {located.map((substance, index) => (
              <li key={`${substance.name}-${index}`} className="px-5 py-3.5 text-base">
                <span className="text-ink">{substance.name}</span>
                {substance.componentRef ? (
                  <span className="text-ink-muted"> — in {substance.componentRef}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
