/**
 * Merge an approved supplier submission into a passport payload.
 *
 * Pure on purpose. This is the one piece of the supplier flow where a mistake
 * is silent and permanent — a wrong value merged into a published passport is
 * a regulatory statement the brand did not intend to make — so it is written
 * as a function of its inputs, with no database access and no clock, and it is
 * tested directly. The caller persists the result through
 * `savePassportPayload`, which validates and versions it.
 *
 * The rule that shapes everything below: a supplier answer never overwrites an
 * existing value. If the passport already says 340 g/m² and the mill says 355,
 * that disagreement is reported as a conflict for a person to settle. Silent
 * last-write-wins is how brands end up publishing figures nobody chose.
 */

export interface MergeChange {
  /** Concrete path written, e.g. `supplyChain.steps.2.gln`. */
  path: string;
  /** Registry path the answer came from, e.g. `supplyChain.steps.*.gln`. */
  field: string;
  from: unknown;
  to: unknown;
}

export interface MergeConflict {
  path: string;
  field: string;
  existing: unknown;
  incoming: unknown;
  /** True when the reviewer explicitly chose the supplier's value. */
  resolved: boolean;
}

export interface MergeSkip {
  field: string;
  reason: string;
}

export interface MergeResult {
  /** A new payload. The input is never mutated. */
  merged: Record<string, unknown>;
  changes: MergeChange[];
  /** Disagreements. Unresolved ones are reported, not applied. */
  conflicts: MergeConflict[];
  /** Answers that matched what the passport already said. */
  unchanged: string[];
  /** Answers that could not be placed, each with the reason. */
  skipped: MergeSkip[];
}

/**
 * Which element of a repeating list an answer belongs to.
 *
 * A request addressed to a dyehouse answers `supplyChain.steps.*.gln` — but
 * which step? The caller supplies the identity of the element (usually the
 * step `ref` derived from the partner), and the merge finds it or creates it.
 */
export interface MergeAnchor {
  /** Property that identifies the element, e.g. `ref`. */
  key: string;
  value: string;
  /** Written alongside the key when the element has to be created. */
  seed?: Record<string, unknown>;
}

export interface MergeOptions {
  /**
   * Registry paths the reviewer accepted. Omit to accept every answer present.
   * Anything not listed is reported in `skipped`, never quietly dropped.
   */
  accept?: readonly string[];
  /** Paths where the reviewer chose the supplier's value over the existing one. */
  overwrite?: readonly string[];
  /** Keyed by the repeating container, e.g. `supplyChain.steps`. */
  anchors?: Record<string, MergeAnchor>;
  /** Append a list element when the anchor matches nothing. Defaults to true. */
  createMissing?: boolean;
}

export function mergeSubmission(
  payload: unknown,
  answers: Readonly<Record<string, unknown>>,
  options: MergeOptions = {},
): MergeResult {
  const merged = clone(isRecord(payload) ? payload : {});
  const accept = options.accept ? new Set(options.accept) : null;
  const overwrite = new Set(options.overwrite ?? []);
  const createMissing = options.createMissing ?? true;

  const changes: MergeChange[] = [];
  const conflicts: MergeConflict[] = [];
  const unchanged: string[] = [];
  const skipped: MergeSkip[] = [];

  // Sorted so that two runs over the same submission produce the same payload
  // and the same audit metadata, whatever order the keys arrived in.
  for (const field of Object.keys(answers).sort()) {
    const incoming = answers[field];

    if (accept && !accept.has(field)) {
      skipped.push({ field, reason: 'The reviewer did not accept this answer.' });
      continue;
    }
    if (incoming === null || incoming === undefined || incoming === '') {
      skipped.push({ field, reason: 'The supplier left this blank.' });
      continue;
    }
    if (Array.isArray(incoming) && incoming.length === 0) {
      skipped.push({ field, reason: 'The supplier left this blank.' });
      continue;
    }

    const resolved = resolvePath(merged, field, options.anchors ?? {}, createMissing);
    if (!resolved.ok) {
      skipped.push({ field, reason: resolved.reason });
      continue;
    }

    const path = resolved.path;
    const existing = readPath(merged, path);

    if (deepEqual(existing, incoming)) {
      unchanged.push(path);
      continue;
    }

    const occupied = existing !== undefined && existing !== null && existing !== '';
    if (occupied) {
      const chosen = overwrite.has(field) || overwrite.has(path);
      conflicts.push({ path, field, existing, incoming, resolved: chosen });
      if (!chosen) continue;
    }

    writePath(merged, path, incoming);
    changes.push({ path, field, from: existing ?? null, to: incoming });
  }

  return { merged, changes, conflicts, unchanged, skipped };
}

// ───────────────────────────────────────────────────────────────────────────
// Path handling
// ───────────────────────────────────────────────────────────────────────────

type Resolution = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Turn a registry path into a concrete one, creating the list element the
 * answer belongs to when it does not exist yet.
 */
function resolvePath(
  target: Record<string, unknown>,
  field: string,
  anchors: Record<string, MergeAnchor>,
  createMissing: boolean,
): Resolution {
  const star = field.indexOf('.*.');
  if (star === -1) {
    if (field.includes('*')) {
      return { ok: false, reason: 'This field repeats in a way the merge cannot address.' };
    }
    return { ok: true, path: field };
  }

  const container = field.slice(0, star);
  const rest = field.slice(star + 3);
  if (rest.includes('*')) {
    return { ok: false, reason: 'Nested repeating fields have to be edited on the passport.' };
  }

  const anchor = anchors[container];
  if (!anchor) {
    return {
      ok: false,
      reason: `No entry in ${container} was identified for this answer to belong to.`,
    };
  }

  const list = readPath(target, container);
  const items: unknown[] = Array.isArray(list) ? list : [];

  let index = items.findIndex(
    (item) => isRecord(item) && item[anchor.key] === anchor.value,
  );

  if (index === -1) {
    if (!createMissing) {
      return { ok: false, reason: `No ${container} entry matches ${anchor.value}.` };
    }
    items.push({ ...(anchor.seed ?? {}), [anchor.key]: anchor.value });
    index = items.length - 1;
    if (!Array.isArray(list)) writePath(target, container, items);
  }

  return { ok: true, path: `${container}.${index}.${rest}` };
}

function readPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let current: Record<string, unknown> | unknown[] = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    // The next segment decides what this one has to be: a numeric successor
    // means an array, anything else means an object.
    const wantsArray = /^\d+$/.test(segments[i + 1]!);

    if (Array.isArray(current)) {
      const index = Number(segment);
      const existing = current[index];
      if (!isContainer(existing, wantsArray)) current[index] = wantsArray ? [] : {};
      current = current[index] as Record<string, unknown> | unknown[];
      continue;
    }

    const existing = current[segment];
    if (!isContainer(existing, wantsArray)) current[segment] = wantsArray ? [] : {};
    current = current[segment] as Record<string, unknown> | unknown[];
  }

  const last = segments[segments.length - 1]!;
  if (Array.isArray(current)) current[Number(last)] = value;
  else current[last] = value;
}

function isContainer(value: unknown, wantsArray: boolean): boolean {
  return wantsArray ? Array.isArray(value) : isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

/**
 * A one-line summary of what a merge would do, for the review screen and the
 * audit entry. Kept here so the console and the audit trail cannot disagree.
 */
export function describeMerge(result: MergeResult): string {
  const parts: string[] = [];
  parts.push(`${result.changes.length} ${result.changes.length === 1 ? 'field' : 'fields'} updated`);
  const open = result.conflicts.filter((c) => !c.resolved).length;
  if (open > 0) parts.push(`${open} unresolved ${open === 1 ? 'conflict' : 'conflicts'}`);
  if (result.unchanged.length > 0) parts.push(`${result.unchanged.length} already matched`);
  if (result.skipped.length > 0) parts.push(`${result.skipped.length} not applied`);
  return parts.join(', ');
}
