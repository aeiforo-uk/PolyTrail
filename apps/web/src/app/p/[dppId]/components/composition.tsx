import { CUSTODY_MODELS, FIBRES, RECYCLED_SOURCES, type FibreKey } from '@/lib/passport/vocab';
import { countryName } from '@/lib/partners/vocab';
import type { PassportPayload } from '@/lib/passport/schema';
import { Eyebrow, Row } from './section';

/**
 * Composition, rendered as a nutrition label rather than a paragraph.
 *
 * The nesting is the point: a fibre row can carry sub-rows for recycled share,
 * organic share and chain of custody, which is where the honest detail lives.
 * "34% recycled polyester" and "34% recycled polyester on a mass-balance
 * basis, meaning this garment may contain none of it" are very different
 * claims, and only the second one is true.
 */

const TIER_COLOURS = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
  'var(--color-series-5)',
  'var(--color-series-6)',
  'var(--color-series-7)',
  'var(--color-series-8)',
];

export function CompositionSection({ payload }: { payload: Partial<PassportPayload> }) {
  const composition = payload.composition;
  const overall = composition?.overall ?? [];
  if (overall.length === 0 && !composition?.components?.length) {
    return <NotAvailable what="Fibre composition" />;
  }

  const sorted = [...overall].sort((a, b) => b.percentage - a.percentage);

  return (
    <div className="flex flex-col gap-8">
      {sorted.length > 0 ? (
        <div>
          <FibreBar fibres={sorted} />
          <div className="mt-6">
            {sorted.map((fibre, index) => (
              <div key={`${fibre.fibre}-${index}`}>
                <Row
                  label={
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-xs"
                        style={{ background: TIER_COLOURS[index % TIER_COLOURS.length] }}
                        aria-hidden
                      />
                      <span className="font-medium">{FIBRES[fibre.fibre as FibreKey]?.label ?? fibre.fibre}</span>
                    </span>
                  }
                  value={`${fibre.percentage}%`}
                />
                {fibre.recycled ? (
                  <Row
                    indent={1}
                    label={`Recycled — ${RECYCLED_SOURCES[fibre.recycled.source as keyof typeof RECYCLED_SOURCES]?.label.toLowerCase()}`}
                    value={`${fibre.recycled.share}%`}
                    note={CUSTODY_MODELS[fibre.recycled.custodyModel as keyof typeof CUSTODY_MODELS]?.label}
                  />
                ) : null}
                {fibre.recycled?.custodyModel === 'mass_balance' ? (
                  <p className="border-b border-line/60 py-2 pl-4 text-xs leading-relaxed text-caution">
                    {CUSTODY_MODELS.mass_balance.description}
                  </p>
                ) : null}
                {fibre.organic ? (
                  <Row
                    indent={1}
                    label={`Organic — certified ${fibre.organic.scheme}`}
                    value={`${fibre.organic.share}%`}
                    note={CUSTODY_MODELS[fibre.organic.custodyModel as keyof typeof CUSTODY_MODELS]?.label}
                  />
                ) : null}
                {fibre.originCountry ? (
                  <Row indent={1} label="Grown or produced in" value={countryName(fibre.originCountry)} />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {composition?.totalWeightGrams || composition?.monomaterial !== undefined ? (
        <div>
          <Eyebrow>Physical</Eyebrow>
          {composition.totalWeightGrams ? (
            <Row label="Weight" value={`${composition.totalWeightGrams} g`} />
          ) : null}
          {composition.monomaterial !== undefined ? (
            <Row
              label="Single-fibre construction"
              value={composition.monomaterial ? 'Yes' : 'No'}
              note={
                composition.monomaterial
                  ? undefined
                  : 'blends are harder to recycle than single fibres'
              }
            />
          ) : null}
        </div>
      ) : null}

      {composition?.nonTextileAnimalParts?.length ? (
        <div>
          <Eyebrow>Non-textile parts of animal origin</Eyebrow>
          {composition.nonTextileAnimalParts.map((part, i) => (
            <Row key={i} label={part.description} value={part.species ?? '—'} />
          ))}
        </div>
      ) : null}

      <SubstanceNote payload={payload} />
    </div>
  );
}

function FibreBar({ fibres }: { fibres: Array<{ fibre: string; percentage: number }> }) {
  return (
    <div>
      <div
        className="grow-view flex h-2.5 w-full overflow-hidden rounded-xs"
        role="img"
        aria-label={fibres.map((f) => `${f.percentage}% ${f.fibre}`).join(', ')}
      >
        {fibres.map((fibre, index) => (
          <div
            key={`${fibre.fibre}-${index}`}
            style={{
              width: `${fibre.percentage}%`,
              background: TIER_COLOURS[index % TIER_COLOURS.length],
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SubstanceNote({ payload }: { payload: Partial<PassportPayload> }) {
  const substances = payload.substances;
  if (!substances) return null;

  const ofConcern = substances.substancesOfConcern ?? [];
  const tests = substances.restrictedSubstanceTests ?? [];

  return (
    <div>
      <Eyebrow>Substances</Eyebrow>
      {ofConcern.length === 0 ? (
        <Row
          label="Substances of concern"
          value="None declared"
          note="above the REACH notification threshold"
        />
      ) : (
        ofConcern.map((substance, i) => (
          <Row
            key={i}
            label={substance.name}
            value={substance.svhc ? 'REACH candidate list' : 'Declared'}
            note={substance.casNumber ? `CAS ${substance.casNumber}` : undefined}
          />
        ))
      )}
      {substances.pfasStatus ? (
        <Row
          label="PFAS"
          value={
            substances.pfasStatus === 'none_intentionally_added'
              ? 'None intentionally added'
              : substances.pfasStatus === 'present'
                ? 'Present'
                : 'Not assessed'
          }
        />
      ) : null}
      {tests.length > 0 ? (
        <Row
          label="Independent laboratory testing"
          value={`${tests.filter((t) => t.result === 'pass').length} of ${tests.length} passed`}
        />
      ) : null}
    </div>
  );
}

export function NotAvailable({ what }: { what: string }) {
  return (
    <p className="rounded-md border border-dashed border-line-strong bg-surface-sunken/50 px-4 py-3 text-sm text-ink-muted">
      {what} has not been published for this product yet.
    </p>
  );
}

/**
 * Re-exported so the passport components keep a single import, but resolved by
 * the pinned table in `@/lib/partners/vocab` rather than by `Intl.DisplayNames`.
 * The public passport is server-rendered and hydrated, and Node and the browser
 * ship different ICU builds, so a runtime lookup disagreed with itself on four
 * countries.
 */
export { countryName };
