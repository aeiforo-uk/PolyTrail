/**
 * Dot-path reading and writing over a passport payload.
 *
 * The rest of the repository has a read-only `getByPath` in
 * `src/lib/tier/project.ts`, but an importer also has to *build* a nested
 * object from flat columns, and it has to merge one over another without
 * deleting the fields the spreadsheet did not mention. Those two operations
 * live here.
 */

export type Json = Record<string, unknown>;

export function getAtPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Json)[key];
  }, source);
}

/**
 * Write `value` at `path`, creating containers as it goes. A numeric segment
 * creates an array, so `composition.overall.0.fibre` yields an array of one
 * fibre rather than an object keyed `"0"` — which Zod would reject.
 */
export function setAtPath(target: Json, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor: Json = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]!;
    const next = segments[i + 1]!;
    const existing = cursor[key];
    if (existing == null || typeof existing !== 'object') {
      cursor[key] = isIndex(next) ? [] : {};
    }
    cursor = cursor[key] as Json;
  }

  cursor[segments[segments.length - 1]!] = value;
}

/**
 * Merge `patch` over `base`, recursing into plain objects.
 *
 * Arrays are replaced wholesale rather than merged element-wise. A spreadsheet
 * that states a three-fibre composition is stating the whole composition; the
 * alternative would leave a fourth fibre behind from a previous import and
 * produce a passport whose percentages no longer add to 100.
 */
export function deepMerge<T extends Json>(base: T, patch: Json): T {
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Remove empty objects and arrays left behind when every mapped column in a
 * branch was blank. Zod treats `{}` at `composition` as "components missing",
 * which is a confusing error to show for a section nobody filled in.
 */
export function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (isPlainObject(value)) {
    const out: Json = {};
    for (const [key, child] of Object.entries(value)) {
      const pruned = prune(child);
      if (pruned !== undefined) out[key] = pruned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (value === '' || value === null) return undefined;
  return value;
}

/** Turn a Zod issue path into the dot-path notation the mapping speaks. */
export function issuePath(segments: ReadonlyArray<PropertyKey>): string {
  return segments.map((segment) => String(segment)).join('.');
}

function isIndex(segment: string): boolean {
  return /^\d+$/.test(segment);
}

function isPlainObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
