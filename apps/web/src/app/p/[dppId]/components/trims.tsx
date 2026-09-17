import { COMPONENT_KINDS, FIBRES, type ComponentKind, type FibreKey } from '@/lib/passport/vocab';
import type { PassportPayload } from '@/lib/passport/schema';
import { Row } from './section';

/**
 * Components and trims.
 *
 * The separability note on each row is the bridge to the end-of-life section:
 * a removable zip is a different recycling problem from a bonded membrane, and
 * this is the only place a reader can see which is which.
 */
export function TrimsSection({ payload }: { payload: Partial<PassportPayload> }) {
  const components = payload.composition?.components ?? [];
  if (components.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {components.map((component) => (
        <div key={component.ref} className="border-l-2 border-line pl-4">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold text-ink">
              {component.name ?? COMPONENT_KINDS[component.kind as ComponentKind] ?? component.ref}
            </h3>
            {component.weightShare ? (
              <span className="shrink-0 text-xs text-ink-subtle tabular-nums">
                {component.weightShare.toFixed(1)}% of weight
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-ink-muted">
            {component.fibres
              .map(
                (fibre) =>
                  `${fibre.percentage}% ${(FIBRES[fibre.fibre as FibreKey]?.label ?? fibre.fibre).toLowerCase()}`,
              )
              .join(', ')}
          </p>

          <div className="mt-2">
            {component.construction ? (
              <Row label="Construction" value={component.construction.replace(/_/g, ' ')} />
            ) : null}
            {component.fabricWeightGsm ? (
              <Row label="Fabric weight" value={`${component.fabricWeightGsm} g/m²`} />
            ) : null}
            {component.removable !== undefined ? (
              <Row
                label="Separable for recycling"
                value={component.removable ? 'Yes' : 'No'}
                note={
                  component.removable
                    ? 'can be removed before shredding'
                    : 'stays with the main material'
                }
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
