import type { ZodType } from 'zod';
import { passportPayloadSchema } from '@/lib/passport/schema';

/**
 * Locate the schema that governs a given payload path.
 *
 * The importer needs to know, for every mapped column, whether it is writing a
 * number, a percentage, an enum, a localised string or a list. That knowledge
 * already exists — in `passportPayloadSchema` — and the one thing this module
 * must never become is a second, drifting copy of it. So it reads the schema's
 * own structure instead.
 *
 * This walks Zod 4 internals (`.def`), which is the price of not maintaining a
 * parallel type table. If Zod changes shape, `schema-walk.test.ts` fails loudly
 * rather than the importer quietly guessing wrong.
 */

interface ZodDef {
  type: string;
  shape?: Record<string, ZodType>;
  innerType?: ZodType;
  element?: ZodType;
  entries?: Record<string, string | number>;
  values?: readonly unknown[];
  options?: readonly ZodType[];
  catchall?: ZodType;
  format?: string;
  valueType?: ZodType;
}

function defOf(schema: ZodType): ZodDef {
  return (schema as unknown as { def: ZodDef }).def;
}

/** Strip optional/nullable/default/readonly wrappers to reach the real type. */
export function unwrap(schema: ZodType): ZodType {
  let current = schema;
  for (let guard = 0; guard < 12; guard++) {
    const def = defOf(current);
    const inner = def.innerType;
    if (!inner) return current;
    if (
      def.type === 'optional' ||
      def.type === 'nullable' ||
      def.type === 'default' ||
      def.type === 'prefault' ||
      def.type === 'readonly' ||
      def.type === 'nonoptional' ||
      def.type === 'catch'
    ) {
      current = inner;
      continue;
    }
    return current;
  }
  return current;
}

/**
 * The schema at `path`, or `null` when the path names nothing.
 *
 * Numeric segments index into arrays; `*` is accepted as a stand-in for an
 * index so a registry path can be resolved without expanding it first.
 */
export function schemaAt(path: string, root: ZodType = passportPayloadSchema): ZodType | null {
  if (path === '') return root;
  let current: ZodType = root;

  for (const segment of path.split('.')) {
    const node = unwrap(current);
    const def = defOf(node);

    if (def.type === 'array') {
      if (!/^\d+$/.test(segment) && segment !== '*') return null;
      const element = def.element;
      if (!element) return null;
      current = element;
      continue;
    }

    if (def.type === 'object') {
      const child = def.shape?.[segment];
      // A catchall (localised strings) accepts any further key as a string.
      if (!child) return def.catchall ?? null;
      current = child;
      continue;
    }

    if (def.type === 'union') {
      // Only the first branch that can take the segment is considered; the
      // payload schema has no ambiguous unions, and guessing across branches
      // would make coercion unpredictable.
      const branch = def.options?.find((option) => schemaAt(segment, option) !== null);
      if (!branch) return null;
      current = schemaAt(segment, branch)!;
      continue;
    }

    if (def.type === 'record') {
      current = def.valueType ?? node;
      continue;
    }

    return null;
  }

  return current;
}

export type LeafKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'literal'
  | 'array'
  | 'localized'
  | 'object'
  | 'unknown';

export interface LeafInfo {
  kind: LeafKind;
  /** Whether the schema tolerates the field being absent. */
  optional: boolean;
  /** Permitted values, for enums. */
  options?: readonly string[];
  /** The only permitted value, for literals. */
  literal?: unknown;
  /** Element description, for arrays. */
  element?: LeafInfo;
  /** `date`, `url`, `email` — Zod's own string format tag. */
  format?: string;
}

/**
 * Describe the schema at `path` in the terms coercion needs.
 *
 * Memoised: validation calls this once per cell, and a five-thousand-row file
 * with twenty mapped columns would otherwise walk the same schema a hundred
 * thousand times. The payload schema is a module constant, so the answer for a
 * given path cannot change within a process.
 */
const DESCRIBED = new Map<string, LeafInfo | null>();

export function describePath(path: string): LeafInfo | null {
  const cached = DESCRIBED.get(path);
  if (cached !== undefined) return cached;

  const schema = schemaAt(path);
  const described = schema ? describe(schema) : null;
  DESCRIBED.set(path, described);
  return described;
}

export function describe(schema: ZodType): LeafInfo {
  const optional = isOptional(schema);
  const node = unwrap(schema);
  const def = defOf(node);

  switch (def.type) {
    case 'string':
      return { kind: 'string', optional, ...(def.format ? { format: def.format } : {}) };
    case 'number':
    case 'int':
      return { kind: 'number', optional };
    case 'boolean':
      return { kind: 'boolean', optional };
    case 'enum':
      return { kind: 'enum', optional, options: Object.keys(def.entries ?? {}) };
    case 'literal':
      return { kind: 'literal', optional, literal: def.values?.[0] };
    case 'array':
      return {
        kind: 'array',
        optional,
        element: def.element ? describe(def.element) : { kind: 'unknown', optional: true },
      };
    case 'object':
      // A localised string is an object whose only declared key is `en` and
      // which accepts further language keys through a catchall.
      if (def.catchall && def.shape && Object.keys(def.shape).join() === 'en') {
        return { kind: 'localized', optional };
      }
      return { kind: 'object', optional };
    default:
      return { kind: 'unknown', optional };
  }
}

/**
 * Array fields the object at `path` requires but which may legitimately be
 * empty — `composition.components` is the one that matters, because a brand
 * that knows its headline fibre split months before it has a bill of materials
 * still has a valid composition.
 *
 * The importer fills these in so a spreadsheet carrying only `overall` does not
 * fail with "expected array, received undefined" on a field no column touched.
 */
export function emptyableArrayKeys(path: string): string[] {
  const schema = schemaAt(path);
  if (!schema) return [];
  const def = defOf(unwrap(schema));
  if (def.type !== 'object' || !def.shape) return [];

  return Object.entries(def.shape)
    .filter(([, child]) => {
      const described = describe(child);
      return described.kind === 'array' && !described.optional;
    })
    .map(([key]) => key);
}

function isOptional(schema: ZodType): boolean {
  const def = defOf(schema);
  if (def.type === 'optional' || def.type === 'default' || def.type === 'prefault') return true;
  if (def.innerType && (def.type === 'nullable' || def.type === 'readonly')) {
    return isOptional(def.innerType);
  }
  return false;
}
