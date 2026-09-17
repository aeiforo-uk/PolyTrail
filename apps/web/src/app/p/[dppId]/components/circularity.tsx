import { RECYCLING_DISRUPTORS, type RecyclingDisruptor } from '@/lib/passport/vocab';
import type { PassportPayload } from '@/lib/passport/schema';
import { Eyebrow, Row } from './section';
import { localize } from './care';
import { countryName } from './composition';

/**
 * End of life.
 *
 * Written for two readers at once: the person deciding what to do with a
 * garment they are finished with, and the sorting facility that will receive
 * it. The disassembly steps are for the second reader and are deliberately not
 * hidden from the first — seeing that a garment takes 150 seconds to take
 * apart is the most persuasive argument for repairing it instead.
 */
export function CircularitySection({
  payload,
  locale,
}: {
  payload: Partial<PassportPayload>;
  locale: string;
}) {
  const circularity = payload.circularity;
  if (!circularity) {
    return (
      <p className="rounded-md border border-dashed border-line-strong bg-surface-sunken/50 px-4 py-3 text-sm text-ink-muted">
        End-of-life information has not been published for this product yet.
      </p>
    );
  }

  const recyclability = circularity.recyclability;
  const disruptors = (recyclability?.disruptors ?? []) as RecyclingDisruptor[];

  return (
    <div className="flex flex-col gap-9">
      {circularity.endOfLifeInstructions ? (
        <p className="max-w-prose text-sm leading-relaxed text-ink">
          {localize(circularity.endOfLifeInstructions, locale)}
        </p>
      ) : null}

      {recyclability ? (
        <div>
          <Eyebrow>Recyclability</Eyebrow>
          {typeof recyclability.recyclableShare === 'number' ? (
            <Row
              label="Share that can be recovered"
              value={`${recyclability.recyclableShare}%`}
              note={recyclability.route ? `${recyclability.route} recycling` : undefined}
            />
          ) : null}
          {disruptors.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2.5 text-sm text-ink-muted">
                What makes this garment harder to recycle:
              </p>
              <ul className="flex flex-col gap-2">
                {disruptors.map((key) => (
                  <li key={key} className="text-sm leading-relaxed">
                    <span className="font-medium text-ink">{RECYCLING_DISRUPTORS[key]?.label}</span>
                    <span className="text-ink-muted"> — {RECYCLING_DISRUPTORS[key]?.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {recyclability?.disassemblySteps?.length ? (
        <div>
          <Eyebrow>How to take it apart</Eyebrow>
          <ol className="flex flex-col gap-3">
            {[...recyclability.disassemblySteps]
              .sort((a, b) => a.order - b.order)
              .map((step) => (
                <li key={step.order} className="flex gap-3 text-sm leading-relaxed">
                  <span className="mono mt-0.5 w-5 shrink-0 text-xs text-ink-subtle tabular-nums">
                    {String(step.order).padStart(2, '0')}
                  </span>
                  <span className="text-ink">
                    {localize(step.instruction, locale)}
                    {step.toolRequired || step.estimatedSeconds ? (
                      <span className="block text-xs text-ink-subtle">
                        {[
                          step.toolRequired,
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
        </div>
      ) : null}

      {circularity.eprRegistrations?.length ? (
        <div>
          <Eyebrow>Producer responsibility</Eyebrow>
          {circularity.eprRegistrations.map((reg, i) => (
            <Row
              key={i}
              label={`${countryName(reg.country)} — ${reg.scheme}`}
              value={<span className="mono text-xs">{reg.producerNumber}</span>}
            />
          ))}
        </div>
      ) : null}

      {circularity.wasteCode ? (
        <Row label="European waste code" value={<span className="mono text-xs">{circularity.wasteCode}</span>} />
      ) : null}
    </div>
  );
}
