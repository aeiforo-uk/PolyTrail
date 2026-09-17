import { FIELD_REGISTRY } from './field-registry';
import { tierAllows, type AccessTier, type FieldEntry } from './types';

/**
 * Deny-by-default projector.
 *
 * Reads the field registry, not the payload, and copies across only what the
 * registry explicitly permits for the caller. A field nobody remembered to
 * register is therefore invisible rather than public — the failure mode of a
 * forgotten field is an incomplete passport, not a leak.
 */

function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]!;
    const nextKey = segments[i + 1]!;
    const existing = cursor[key];
    if (existing == null || typeof existing !== 'object') {
      // Rebuild arrays as arrays so that projected element order survives and
      // consumers can still map over them.
      cursor[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

/**
 * Expand `*` segments against the actual payload, yielding concrete paths.
 * A wildcard that matches nothing yields nothing, so absent data never
 * materialises as an empty shell in the projection.
 */
export function expandWildcards(source: unknown, path: string): string[] {
  if (!path.includes('*')) return [path];
  const segments = path.split('.');
  const out: string[] = [];

  function walk(current: unknown, index: number, acc: string[]): void {
    if (index === segments.length) {
      out.push(acc.join('.'));
      return;
    }
    const segment = segments[index]!;
    if (segment === '*') {
      if (current == null || typeof current !== 'object') return;
      const keys = Array.isArray(current)
        ? current.map((_, i) => String(i))
        : Object.keys(current as Record<string, unknown>);
      for (const key of keys) {
        walk((current as Record<string, unknown>)[key], index + 1, [...acc, key]);
      }
    } else {
      const next =
        current != null && typeof current === 'object'
          ? (current as Record<string, unknown>)[segment]
          : undefined;
      walk(next, index + 1, [...acc, segment]);
    }
  }

  walk(source, 0, []);
  return out;
}

export interface ProjectionResult<T> {
  /** The payload as this caller may see it. */
  data: Partial<T>;
  /**
   * Registry paths that exist in the source but were withheld. The public
   * passport uses this to say "3 fields are available to authorities" rather
   * than pretending the data does not exist — visible redaction beats a
   * silent gap, and it is what makes the tiering legible to a regulator.
   */
  withheld: Array<{ path: string; label: string; audiences: readonly AccessTier[] }>;
}

export function projectForTier<T extends object>(
  source: T,
  caller: AccessTier,
  registry: readonly FieldEntry[] = FIELD_REGISTRY,
): ProjectionResult<T> {
  const data: Record<string, unknown> = {};
  const withheld: ProjectionResult<T>['withheld'] = [];

  for (const entry of registry) {
    const allowed = tierAllows(caller, entry.audiences);
    const paths = expandWildcards(source, entry.path);

    for (const path of paths) {
      const value = getByPath(source, path);
      if (value === undefined) continue;
      if (allowed) {
        setByPath(data, path, value);
      } else {
        withheld.push({ path, label: entry.label, audiences: entry.audiences });
      }
    }
  }

  return { data: data as Partial<T>, withheld };
}

/** Convenience wrapper when the caller does not need the redaction list. */
export function applyAccessTier<T extends object>(source: T, caller: AccessTier): Partial<T> {
  return projectForTier(source, caller).data;
}

/**
 * Registry paths that are present in `source` but registered to nobody, i.e.
 * data the passport carries that the registry does not describe. Used by the
 * build-time guard in `registry.test.ts` to stop undocumented fields shipping.
 */
export function findUnregisteredPaths(
  source: object,
  registry: readonly FieldEntry[] = FIELD_REGISTRY,
): string[] {
  const covered = new Set<string>();
  for (const entry of registry) {
    for (const path of expandWildcards(source, entry.path)) covered.add(path);
  }

  const unregistered: string[] = [];
  function walk(node: unknown, prefix: string[]): void {
    if (node == null) return;
    if (typeof node !== 'object') {
      const path = prefix.join('.');
      if (!covered.has(path)) unregistered.push(path);
      return;
    }
    const keys = Array.isArray(node)
      ? node.map((_, i) => String(i))
      : Object.keys(node as Record<string, unknown>);
    if (keys.length === 0) return;
    for (const key of keys) walk((node as Record<string, unknown>)[key], [...prefix, key]);
  }
  walk(source, []);
  return unregistered;
}
