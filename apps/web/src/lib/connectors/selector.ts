/**
 * Finding the records in someone else's JSON.
 *
 * Every API puts its list somewhere different — `{products: [...]}`,
 * `{data: {items: [...]}}`, or a bare array — and the operator is the only
 * person who knows which. A JSONPath-ish selector is the smallest thing that
 * lets them say so without writing code.
 *
 * Supported: `$` for the root, dotted keys, `[0]` for an index and `[*]` or a
 * trailing `[]` for "every element". Filters, recursive descent and expressions
 * are deliberately absent — they would turn a text box into a query language,
 * and none of the APIs this connects to need one.
 */

export type Json = unknown;

/** Read a single value. Returns `undefined` when the path matches nothing. */
export function selectOne(source: Json, selector: string): Json {
  const values = select(source, selector);
  return values.length > 0 ? values[0] : undefined;
}

/** Read every value the selector matches, in document order. */
export function select(source: Json, selector: string): Json[] {
  const steps = parseSelector(selector);
  let current: Json[] = [source];

  for (const step of steps) {
    const next: Json[] = [];
    for (const value of current) {
      if (value == null) continue;
      if (step.kind === 'key') {
        if (typeof value === 'object' && !Array.isArray(value)) {
          next.push((value as Record<string, unknown>)[step.key]);
        }
      } else if (step.kind === 'index') {
        if (Array.isArray(value)) next.push(value[step.index]);
      } else if (Array.isArray(value)) {
        next.push(...value);
      }
    }
    current = next.filter((value) => value !== undefined);
  }

  return current;
}

/**
 * The records a pull should iterate over.
 *
 * An empty selector means "the body is the list", and a selector that lands on
 * a single object yields that object — a source returning one product should
 * import one product rather than nothing.
 */
export function selectRecords(source: Json, selector: string): Array<Record<string, unknown>> {
  const found = selector.trim() === '' ? [source] : select(source, selector);
  const records: Array<Record<string, unknown>> = [];

  for (const value of found) {
    if (Array.isArray(value)) {
      for (const item of value) if (isRecord(item)) records.push(item);
    } else if (isRecord(value)) {
      records.push(value);
    }
  }

  return records;
}

type Step =
  | { kind: 'key'; key: string }
  | { kind: 'index'; index: number }
  | { kind: 'all' };

export function parseSelector(selector: string): Step[] {
  const trimmed = selector.trim().replace(/^\$\.?/, '');
  if (trimmed === '') return [];

  const steps: Step[] = [];
  for (const segment of trimmed.split('.')) {
    if (segment === '') continue;
    // `products[*]` is a key followed by a wildcard; `[*]` on its own is just
    // the wildcard.
    const bracket = segment.indexOf('[');
    const key = bracket === -1 ? segment : segment.slice(0, bracket);
    if (key !== '') steps.push({ kind: 'key', key });
    if (bracket === -1) continue;

    for (const match of segment.slice(bracket).matchAll(/\[([^\]]*)\]/g)) {
      const inner = match[1]!.trim();
      if (inner === '*' || inner === '') steps.push({ kind: 'all' });
      else if (/^\d+$/.test(inner)) steps.push({ kind: 'index', index: Number(inner) });
      else steps.push({ kind: 'key', key: inner.replace(/^['"]|['"]$/g, '') });
    }
  }

  return steps;
}

/**
 * Flatten one record to the string cells the importer expects.
 *
 * Nested objects become dotted column names and arrays of scalars become a
 * semicolon-joined cell, which is the same convention the CSV path uses — so
 * the mapping step cannot tell where a row came from, which is the point.
 */
export function flattenRecord(
  record: Record<string, unknown>,
  prefix = '',
  depth = 0,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (depth > 4) return out;

  for (const [key, value] of Object.entries(record)) {
    const name = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      out[name] = '';
    } else if (Array.isArray(value)) {
      if (value.every((item) => item === null || typeof item !== 'object')) {
        out[name] = value.map((item) => String(item ?? '')).join('; ');
      } else {
        // An array of objects is a bill of materials, not a cell. Number the
        // entries so `variants.0.sku` is addressable from the mapping step.
        value.slice(0, 10).forEach((item, index) => {
          if (isRecord(item)) Object.assign(out, flattenRecord(item, `${name}.${index}`, depth + 1));
        });
      }
    } else if (isRecord(value)) {
      Object.assign(out, flattenRecord(value, name, depth + 1));
    } else {
      out[name] = String(value);
    }
  }

  return out;
}

/** Read one value out of a record using the same selector grammar. */
export function fieldValue(record: Record<string, unknown>, path: string): string {
  const values = select(record, path);
  if (values.length === 0) return '';
  if (values.length === 1) return scalar(values[0]);
  return values.map(scalar).filter(Boolean).join('; ');
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return Array.isArray(value) ? value.map(scalar).join('; ') : '';
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
