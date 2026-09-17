import { FIELD_REGISTRY } from '@/lib/tier/field-registry';

/**
 * A field-by-field diff of two passport payloads.
 *
 * A reviewer's actual question is "what am I being asked to approve that I did
 * not already approve", and a JSON diff answers a different question — it
 * shows the shape of the document rather than the claims in it. So this walks
 * to the leaves, names each one with its registry label, and renders values as
 * the words a person would use. The reviewer should never have to read a
 * bracket.
 */

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface FieldChange {
  /** Concrete dot-path into the payload, e.g. `composition.overall.0.percentage`. */
  path: string;
  /** Registry pattern the path matched, e.g. `composition.overall.*.percentage`. */
  pattern: string;
  label: string;
  /** Which repeated item this is, when the path runs through an array. */
  qualifier: string | null;
  section: string;
  sectionLabel: string;
  kind: ChangeKind;
  before: string | null;
  after: string | null;
}

export interface PayloadDiff {
  changes: FieldChange[];
  sections: Array<{ key: string; label: string; changes: FieldChange[] }>;
  added: number;
  removed: number;
  changed: number;
}

// Duplicated from `completeness.ts` rather than imported, because that module's
// copy is not exported and this file must not reach into it.
const SECTION_LABELS: Record<string, string> = {
  schemaVersion: 'Document',
  identity: 'Identity',
  composition: 'Composition',
  substances: 'Substances',
  supplyChain: 'Supply chain',
  environment: 'Environment',
  durability: 'Durability',
  care: 'Care & repair',
  circularity: 'Circularity',
  social: 'Social',
  claims: 'Claims',
  certifications: 'Certifications',
  commercial: 'Commercial',
};

/** Registry patterns, indexed by pattern for O(1) label lookup. */
const LABELS = new Map(FIELD_REGISTRY.map((entry) => [entry.path, entry.label]));

/** `composition.overall.0.fibre` → `composition.overall.*.fibre`. */
function toPattern(path: string): string {
  return path
    .split('.')
    .map((segment) => (/^\d+$/.test(segment) ? '*' : segment))
    .join('.');
}

/** "item 1", "item 2 · item 1" — enough to tell two fibre rows apart. */
function qualifierFor(path: string): string | null {
  const indices = path.split('.').filter((segment) => /^\d+$/.test(segment));
  if (indices.length === 0) return null;
  return indices.map((i) => `item ${Number(i) + 1}`).join(' · ');
}

/**
 * Render a leaf value as a reviewer would say it out loud. Localised strings
 * collapse to their English text, because a reviewer comparing translations is
 * a different screen from a reviewer approving a product.
 */
function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.en === 'string') return record.en;
    return Object.entries(record)
      .map(([key, inner]) => `${key}: ${display(inner)}`)
      .join(', ');
  }
  return String(value);
}

/** Collect every leaf path in a payload, flattening arrays by index. */
function leaves(node: unknown, prefix: string, out: Map<string, unknown>): void {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') {
    out.set(prefix, node);
    return;
  }
  const entries = Array.isArray(node)
    ? node.map((item, index) => [String(index), item] as const)
    : Object.entries(node as Record<string, unknown>);

  if (entries.length === 0) return;
  for (const [key, child] of entries) {
    leaves(child, prefix ? `${prefix}.${key}` : key, out);
  }
}

export function diffPayloads(before: unknown, after: unknown): PayloadDiff {
  const beforeLeaves = new Map<string, unknown>();
  const afterLeaves = new Map<string, unknown>();
  leaves(before, '', beforeLeaves);
  leaves(after, '', afterLeaves);

  const paths = [...new Set([...beforeLeaves.keys(), ...afterLeaves.keys()])].sort();
  const changes: FieldChange[] = [];

  for (const path of paths) {
    const had = beforeLeaves.has(path);
    const has = afterLeaves.has(path);
    const from = beforeLeaves.get(path);
    const to = afterLeaves.get(path);

    if (had && has && display(from) === display(to)) continue;

    const pattern = toPattern(path);
    const section = path.split('.')[0] ?? 'identity';

    changes.push({
      path,
      pattern,
      label: LABELS.get(pattern) ?? humanise(path),
      qualifier: qualifierFor(path),
      section,
      sectionLabel: SECTION_LABELS[section] ?? humanise(section),
      kind: !had ? 'added' : !has ? 'removed' : 'changed',
      before: had ? display(from) : null,
      after: has ? display(to) : null,
    });
  }

  const sectionOrder: string[] = [];
  const grouped = new Map<string, FieldChange[]>();
  for (const change of changes) {
    if (!grouped.has(change.section)) {
      grouped.set(change.section, []);
      sectionOrder.push(change.section);
    }
    grouped.get(change.section)!.push(change);
  }

  return {
    changes,
    sections: sectionOrder.map((key) => ({
      key,
      label: SECTION_LABELS[key] ?? humanise(key),
      changes: grouped.get(key)!,
    })),
    added: changes.filter((c) => c.kind === 'added').length,
    removed: changes.filter((c) => c.kind === 'removed').length,
    changed: changes.filter((c) => c.kind === 'changed').length,
  };
}

/** Last resort for a path the registry does not describe: `fabricWeightGsm` → `Fabric weight gsm`. */
function humanise(path: string): string {
  const last = path.split('.').filter((s) => !/^\d+$/.test(s)).pop() ?? path;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Flatten a payload into labelled rows, for the "passport content" panel that
 * sits beside the diff. Same naming rules, so a reviewer reads one vocabulary.
 */
export function readableFields(payload: unknown): Array<{
  key: string;
  label: string;
  rows: Array<{ path: string; label: string; qualifier: string | null; value: string }>;
}> {
  const flat = new Map<string, unknown>();
  leaves(payload, '', flat);

  const order: string[] = [];
  const grouped = new Map<string, Array<{ path: string; label: string; qualifier: string | null; value: string }>>();

  for (const [path, value] of [...flat.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const section = path.split('.')[0] ?? 'identity';
    const pattern = toPattern(path);
    if (!grouped.has(section)) {
      grouped.set(section, []);
      order.push(section);
    }
    grouped.get(section)!.push({
      path,
      label: LABELS.get(pattern) ?? humanise(path),
      qualifier: qualifierFor(path),
      value: display(value),
    });
  }

  return order.map((key) => ({
    key,
    label: SECTION_LABELS[key] ?? humanise(key),
    rows: grouped.get(key)!,
  }));
}
