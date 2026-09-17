import { SECTION_LABELS } from '@/lib/passport/completeness';
import { FIELD_REGISTRY } from '@/lib/tier/field-registry';
import { describePath } from './schema-walk';

/**
 * Every payload path a CSV column may be mapped to.
 *
 * Derived from `FIELD_REGISTRY` rather than hand-listed, so the column picker
 * offers exactly the fields the product claims to carry, each with the label
 * and the legal basis the registry already states. A field nobody registered
 * is not importable, which is the same rule the access-tier projector applies
 * and for the same reason.
 *
 * Registry paths use `*` for repeated structures. A spreadsheet column has to
 * name one slot, so each wildcard is expanded into a fixed number of numbered
 * targets — "Fibre 1", "Fibre 2" — which is how brands lay these files out
 * anyway. Paths with two wildcards (a fibre inside a component) are left out:
 * a flat file cannot express them, and pretending otherwise would produce a
 * picker nobody can read.
 */

export interface ImportTarget {
  /** Concrete payload path, e.g. `composition.overall.0.percentage`. */
  path: string;
  /** The registry path it came from, wildcards intact. */
  registryPath: string;
  /** Human label, numbered when the field repeats. */
  label: string;
  /** The regulation or standard that asks for the field. */
  basis: string;
  /** Top-level payload section, for grouping the picker. */
  section: string;
  sectionLabel: string;
  /** Publication needs it. Only the first slot of a repeated field can be. */
  required: boolean;
  /** 0-based slot for a repeated field, `null` when the field is singular. */
  slot: number | null;
}

/**
 * How many slots each repeated structure gets.
 *
 * Five fibres because that is where fibre-name labelling stops being readable
 * and brands stop declaring; three components and three supply steps because a
 * flat file that carries more than that has really become a second file.
 */
const SLOTS: Record<string, number> = {
  'composition.overall': 5,
  'composition.components': 3,
  'supplyChain.steps': 3,
  'identity.images': 2,
  'identity.economicOperators': 1,
  certifications: 3,
  claims: 2,
  'substances.substancesOfConcern': 3,
  'composition.nonTextileAnimalParts': 2,
};

const DEFAULT_SLOTS = 1;

function slotsFor(registryPath: string): number {
  const root = registryPath.slice(0, registryPath.indexOf('.*'));
  return SLOTS[root] ?? DEFAULT_SLOTS;
}

function buildTargets(): ImportTarget[] {
  const targets: ImportTarget[] = [];

  for (const entry of FIELD_REGISTRY) {
    // `schemaVersion` is a literal the importer writes itself; offering it as a
    // mappable column invites someone to map a column of "1.0" to it.
    if (entry.path === 'schemaVersion') continue;

    const stars = (entry.path.match(/\*/g) ?? []).length;
    if (stars > 1) continue;

    const section = entry.path.split('.')[0]!;
    const sectionLabel = SECTION_LABELS[section] ?? section;

    if (stars === 0) {
      if (!describePath(entry.path)) continue;
      targets.push({
        path: entry.path,
        registryPath: entry.path,
        label: entry.label,
        basis: entry.basis,
        section,
        sectionLabel,
        required: entry.required === true,
        slot: null,
      });
      continue;
    }

    const count = slotsFor(entry.path);
    for (let slot = 0; slot < count; slot++) {
      const path = entry.path.replace('*', String(slot));
      if (!describePath(path)) continue;
      targets.push({
        path,
        registryPath: entry.path,
        label: count === 1 ? entry.label : `${entry.label} ${slot + 1}`,
        basis: entry.basis,
        section,
        sectionLabel,
        // Only the first of a repeated field can be required — nothing asks a
        // brand for a second fibre.
        required: entry.required === true && slot === 0,
        slot,
      });
    }
  }

  return targets;
}

export const IMPORT_TARGETS: readonly ImportTarget[] = buildTargets();

const BY_PATH = new Map(IMPORT_TARGETS.map((target) => [target.path, target]));

export function targetFor(path: string): ImportTarget | undefined {
  return BY_PATH.get(path);
}

export function isImportable(path: string): boolean {
  return BY_PATH.has(path);
}

/** Targets grouped by payload section, in registry order, for the picker. */
export function targetsBySection(): Array<{ section: string; label: string; targets: ImportTarget[] }> {
  const groups = new Map<string, ImportTarget[]>();
  for (const target of IMPORT_TARGETS) {
    const existing = groups.get(target.section);
    if (existing) existing.push(target);
    else groups.set(target.section, [target]);
  }
  return [...groups].map(([section, targets]) => ({
    section,
    label: targets[0]!.sectionLabel,
    targets,
  }));
}

/**
 * The columns a starter template offers.
 *
 * Deliberately the publication-required set plus the handful of fields every
 * brand already has in its PIM — a template with three hundred columns is a
 * template nobody fills in.
 */
export const TEMPLATE_PATHS: readonly string[] = [
  'identity.productName',
  'identity.brandName',
  'identity.styleNumber',
  'identity.sku',
  'identity.gtin',
  'identity.category',
  'identity.colourName',
  'identity.size',
  'identity.countryOfOrigin',
  'identity.netWeightGrams',
  'identity.economicOperators.0.name',
  'identity.economicOperators.0.role',
  'identity.economicOperators.0.address.country',
  'composition.overall.0.fibre',
  'composition.overall.0.percentage',
  'composition.overall.1.fibre',
  'composition.overall.1.percentage',
  'composition.overall.2.fibre',
  'composition.overall.2.percentage',
  'care.instructions',
  'circularity.takeBack.available',
];
