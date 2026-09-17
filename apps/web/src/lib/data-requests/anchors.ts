import type { MergeAnchor } from './merge';

/**
 * Which supply-chain step a supplier's answers belong to.
 *
 * A request is addressed to one facility, so answers to repeating fields like
 * `supplyChain.steps.*.gln` have exactly one sensible home: that facility's
 * step. The reference is derived from the partner id rather than stored, so
 * two requests to the same mill land on the same step instead of quietly
 * creating a second one.
 */
export function stepRefFor(partnerId: string): string {
  return `p-${partnerId.slice(0, 8)}`;
}

/**
 * Partner role → the process the step records.
 *
 * Returns null when the role does not correspond to a production step (a
 * certifier does not make anything). Without a process there is nothing valid
 * to seed a step with, so no anchor is offered and the merge reports the
 * answer as unplaced rather than inventing one.
 */
const ROLE_TO_PROCESS: Record<string, string> = {
  brand: 'design',
  cut_make_trim: 'cut_make_trim',
  manufacturer: 'assembly',
  weaving: 'weaving',
  knitting: 'knitting',
  dyeing: 'dyeing',
  printing: 'printing',
  finishing: 'finishing',
  tanning: 'tanning',
  spinning: 'spinning',
  ginning: 'ginning',
  farm: 'farming',
  fibre_producer: 'fibre_production',
  recycler: 'material_recovery',
  trim_supplier: 'packing',
  logistics: 'distribution',
  importer: 'distribution',
  retailer: 'distribution',
};

export function processFor(roles: readonly string[]): string | null {
  for (const role of roles) {
    const process = ROLE_TO_PROCESS[role];
    if (process) return process;
  }
  return null;
}

export interface AnchorPartner {
  id: string;
  name: string;
  tier: string;
  country: string;
  roles: readonly string[];
  gln?: string | null;
  osId?: string | null;
}

/** Anchors for `mergeSubmission`, or an empty map when none can be derived. */
export function anchorsFor(partner: AnchorPartner | null): Record<string, MergeAnchor> {
  if (!partner) return {};
  const process = processFor(partner.roles);
  if (!process) return {};

  return {
    'supplyChain.steps': {
      key: 'ref',
      value: stepRefFor(partner.id),
      seed: {
        tier: partner.tier,
        process,
        country: partner.country,
        facilityName: partner.name,
        facilityDisclosed: true,
        ...(partner.gln ? { gln: partner.gln } : {}),
        ...(partner.osId ? { osId: partner.osId } : {}),
      },
    },
  };
}
