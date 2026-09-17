import { FIELD_REGISTRY } from '@/lib/tier/field-registry';
import type { FieldEntry } from '@/lib/tier/types';

/**
 * Looking a field up by the path it writes.
 *
 * The registry is the compliance surface, so the editor reads its labels and
 * its `basis` from there rather than restating them. A field the registry has
 * never heard of is a field nobody may read, which is worth noticing while
 * building a form rather than after publication.
 */

const BY_PATH = new Map(FIELD_REGISTRY.map((entry) => [entry.path, entry] as const));

/** Registry paths use `*` where a payload path carries a row index. */
export function registryPath(path: string): string {
  return path.replace(/\.\d+(?=\.|$)/g, '.*');
}

/** Exact match only — this is what decides whether a field is required. */
export function entryFor(path: string): FieldEntry | undefined {
  return BY_PATH.get(registryPath(path));
}

/**
 * The nearest entry at or above a path.
 *
 * A localised string is stored as `{ en: … }`, so the input writes
 * `identity.productName.en` while the registry knows `identity.productName`.
 * The citation for the parent is the citation for the leaf, so walking up is
 * right — but only a couple of levels, or a stray path would inherit a basis
 * that has nothing to do with it.
 */
function nearestEntry(path: string): FieldEntry | undefined {
  let current = registryPath(path);
  for (let depth = 0; depth < 3; depth++) {
    const found = BY_PATH.get(current);
    if (found) return found;
    const cut = current.lastIndexOf('.');
    if (cut === -1) return undefined;
    current = current.slice(0, cut);
  }
  return undefined;
}

export function labelFor(path: string): string {
  return nearestEntry(path)?.label ?? humanise(path);
}

/**
 * The citation, trimmed to its leading clause when the full text is long.
 *
 * Several entries carry a sentence of reasoning after the instrument name.
 * That belongs in the registry, but beside a form label it pushes the input
 * around, so only the instrument itself is shown.
 */
export function basisFor(path: string): string | undefined {
  const basis = nearestEntry(path)?.basis;
  if (!basis) return undefined;
  if (basis.length <= 48) return basis;

  const clause = basis.split(/ [—–-] |; |\. /)[0]!.trim();
  return clause.length <= 48 ? clause : `${clause.slice(0, 47).trimEnd()}…`;
}

function humanise(path: string): string {
  const segment = path.split('.').filter((part) => !/^\d+$/.test(part)).pop() ?? path;
  const words = segment.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
