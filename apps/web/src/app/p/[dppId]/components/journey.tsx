import { BadgeCheck, CircleDashed, FileCheck2, MessageSquareQuote } from 'lucide-react';
import type { PassportPayload, SupplyStep } from '@/lib/passport/schema';
import { cn } from '@/lib/utils';
import { countryName } from './composition';

/**
 * The production journey.
 *
 * Two decisions carry this section.
 *
 * First, it renders the *expected* chain for the product type, not just the
 * steps the brand happened to fill in. A step nobody has mapped appears as a
 * dashed, greyed node saying so. A blank is indistinguishable from a secret;
 * a visible gap is an honest admission, and it is also the thing that makes a
 * brand want to close it.
 *
 * Second, every mapped node names the actual company. Naming the mill is the
 * whole point of traceability, and a passport that says "a supplier in
 * Portugal" has told the reader nothing they could verify.
 */

/** The canonical order of textile production, coarsest first. */
const EXPECTED_CHAIN = [
  { process: 'farming', label: 'Fibre grown', tier: 'Tier 4' },
  { process: 'material_recovery', label: 'Material recovered', tier: 'Tier 4' },
  { process: 'ginning', label: 'Ginning', tier: 'Tier 4' },
  { process: 'fibre_production', label: 'Fibre produced', tier: 'Tier 4' },
  { process: 'spinning', label: 'Spun into yarn', tier: 'Tier 3' },
  { process: 'weaving', label: 'Woven', tier: 'Tier 2' },
  { process: 'knitting', label: 'Knitted', tier: 'Tier 2' },
  { process: 'tanning', label: 'Tanned', tier: 'Tier 3' },
  { process: 'dyeing', label: 'Dyed', tier: 'Tier 2' },
  { process: 'printing', label: 'Printed', tier: 'Tier 2' },
  { process: 'washing', label: 'Washed', tier: 'Tier 2' },
  { process: 'finishing', label: 'Finished', tier: 'Tier 2' },
  { process: 'embroidery', label: 'Embroidered', tier: 'Tier 1' },
  { process: 'cut_make_trim', label: 'Cut, sewn and assembled', tier: 'Tier 1' },
  { process: 'assembly', label: 'Assembled', tier: 'Tier 1' },
  { process: 'packing', label: 'Packed', tier: 'Tier 1' },
] as const;

type NodeState = 'verified' | 'declared' | 'unmapped';

interface JourneyNode {
  key: string;
  label: string;
  tier: string;
  state: NodeState;
  step?: SupplyStep;
}

export function JourneySection({ payload }: { payload: Partial<PassportPayload> }) {
  const steps = payload.supplyChain?.steps ?? [];
  if (steps.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-strong bg-surface-sunken/50 px-4 py-3 text-sm text-ink-muted">
        This brand has not mapped the production chain for this product yet.
      </p>
    );
  }

  const byProcess = new Map<string, SupplyStep[]>();
  for (const step of steps) {
    byProcess.set(step.process, [...(byProcess.get(step.process) ?? []), step]);
  }

  // Only show expected-but-missing steps that fall *between* mapped ones. A
  // knit jumper has no tanning step, and inventing one to mark it "unmapped"
  // would be noise rather than honesty.
  const mappedIndices = EXPECTED_CHAIN.map((entry, i) => (byProcess.has(entry.process) ? i : -1)).filter(
    (i) => i >= 0,
  );
  const first = mappedIndices[0] ?? 0;
  const last = mappedIndices[mappedIndices.length - 1] ?? EXPECTED_CHAIN.length - 1;

  const nodes: JourneyNode[] = [];
  for (let i = first; i <= last; i++) {
    const entry = EXPECTED_CHAIN[i]!;
    const matches = byProcess.get(entry.process);
    if (matches?.length) {
      for (const step of matches) {
        nodes.push({
          key: step.ref,
          label: entry.label,
          tier: entry.tier,
          state:
            step.evidence === 'third_party_audited' || step.evidence === 'document_verified'
              ? 'verified'
              : 'declared',
          step,
        });
      }
    } else if (isExpectedFor(entry.process, steps)) {
      nodes.push({ key: entry.process, label: entry.label, tier: entry.tier, state: 'unmapped' });
    }
  }

  const verified = nodes.filter((n) => n.state === 'verified').length;

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        {verified} of {nodes.length} steps in this garment&rsquo;s production are backed by a
        document or an independent audit. Every named company below is the actual facility that did
        the work.
      </p>

      <ol className="relative flex flex-col">
        {nodes.map((node, index) => (
          <JourneyNodeRow key={`${node.key}-${index}`} node={node} last={index === nodes.length - 1} />
        ))}
      </ol>

      {payload.supplyChain?.chainOfCustodyModel ? (
        <p className="text-xs text-ink-subtle">
          Chain of custody: {payload.supplyChain.chainOfCustodyModel.replace(/_/g, ' ')}.
        </p>
      ) : null}
    </div>
  );
}

function JourneyNodeRow({ node, last }: { node: JourneyNode; last: boolean }) {
  const { step, state } = node;

  return (
    <li className="relative flex gap-4 pb-7 last:pb-0">
      {/* The rail. Dashed past the last verified node so the eye reads the gap. */}
      {!last ? (
        <span
          aria-hidden
          className={cn(
            'absolute top-6 bottom-0 left-[7px] w-px',
            state === 'unmapped'
              ? 'bg-[repeating-linear-gradient(to_bottom,var(--color-line-strong)_0_4px,transparent_4px_8px)]'
              : 'bg-line-strong',
          )}
        />
      ) : null}

      <span
        aria-hidden
        className={cn(
          'relative z-10 mt-1.5 size-[15px] shrink-0 rounded-full border-2',
          state === 'verified' && 'border-positive bg-positive',
          state === 'declared' && 'border-line-hover bg-surface',
          state === 'unmapped' && 'border-dashed border-line-strong bg-canvas',
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h3
            className={cn(
              'text-sm font-semibold',
              state === 'unmapped' ? 'text-ink-subtle' : 'text-ink',
            )}
          >
            {node.label}
          </h3>
          <span className="eyebrow mb-0">{node.tier}</span>
        </div>

        {state === 'unmapped' ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-subtle">
            <CircleDashed className="size-3.5 shrink-0" aria-hidden />
            Not yet mapped by the brand
          </p>
        ) : step ? (
          <>
            <p className="mt-1 text-sm text-ink">
              {step.facilityDisclosed === false ? (
                <span className="text-ink-muted">Facility not disclosed</span>
              ) : (
                <span className="font-medium">{step.facilityName ?? 'Facility not named'}</span>
              )}
              <span className="text-ink-muted">
                {' · '}
                {step.city ? `${step.city}, ` : ''}
                {countryName(step.country)}
              </span>
            </p>
            <EvidenceChip evidence={step.evidence} workers={step.workerCount} />
          </>
        ) : null}
      </div>
    </li>
  );
}

function EvidenceChip({
  evidence,
  workers,
}: {
  evidence?: SupplyStep['evidence'];
  workers?: number;
}) {
  if (!evidence) return null;

  const config = {
    third_party_audited: {
      Icon: BadgeCheck,
      text: 'Independently audited',
      className: 'text-positive',
    },
    document_verified: {
      Icon: FileCheck2,
      text: 'Verified against documents',
      className: 'text-positive',
    },
    supplier_declared: {
      Icon: MessageSquareQuote,
      text: 'Declared by the supplier',
      className: 'text-ink-subtle',
    },
    self_declared: {
      Icon: MessageSquareQuote,
      text: 'Stated by the brand',
      className: 'text-ink-subtle',
    },
  }[evidence];

  const { Icon, text, className } = config;

  return (
    <p className={cn('mt-1.5 flex items-center gap-1.5 text-xs', className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {text}
      {workers ? <span className="text-ink-subtle">· {workers.toLocaleString()} workers</span> : null}
    </p>
  );
}

/**
 * Should a missing process be shown as a gap?
 *
 * Only when the product plausibly went through it. A knitted garment was never
 * woven, so "Woven — not mapped" would be a false accusation rather than a
 * disclosure.
 */
function isExpectedFor(process: string, steps: SupplyStep[]): boolean {
  const present = new Set(steps.map((s) => s.process));
  if (process === 'weaving' && present.has('knitting')) return false;
  if (process === 'knitting' && present.has('weaving')) return false;
  if (process === 'assembly' && present.has('cut_make_trim')) return false;
  if (process === 'cut_make_trim' && present.has('assembly')) return false;
  if (process === 'material_recovery' && !present.has('material_recovery')) return false;
  if (process === 'tanning') return false;
  if (process === 'printing' || process === 'embroidery' || process === 'washing') return false;
  if (process === 'packing') return false;
  return true;
}
