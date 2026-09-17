import { passportPayloadSchema, type PassportPayload } from '@/lib/passport/schema';
import { coerceCell } from './coerce';
import type { Mapping } from './infer';
import { issuePath, prune, setAtPath, type Json } from './paths';
import { emptyableArrayKeys } from './schema-walk';
import { targetFor } from './targets';

/**
 * Turning mapped rows into passport payloads, and saying precisely what is
 * wrong with the ones that will not go.
 *
 * Pure by construction — rows in, verdicts out, no database and no clock — so
 * the review screen can re-run it on the operator's corrections without a round
 * trip, and so the awkward cases can be written as tests rather than reasoned
 * about.
 *
 * Validation is `passportPayloadSchema` itself. An importer that carries its
 * own idea of what a valid passport looks like will eventually disagree with
 * the editor, and the row that passed the import will fail at publication with
 * no explanation the operator can act on.
 */

/** The key used to decide whether a row updates an existing passport. */
export interface MatchKey {
  kind: 'gtin' | 'sku' | 'styleNumber';
  value: string;
}

export interface ValidatedRow {
  /** Index into the job's stored rows. Stable across re-validation. */
  index: number;
  /** Line in the source file, for messages the operator can locate. */
  line: number;
  /** The payload this row would write, or `null` when it will not go. */
  payload: PassportPayload | null;
  /** Errors keyed by column header. `_row` holds anything not attributable. */
  errors: Record<string, string[]>;
  /** Accepted, but something was inferred. Keyed by column header. */
  warnings: Record<string, string[]>;
  matchKey: MatchKey | null;
  /** Every mapped cell was blank, so there is nothing to import. */
  empty: boolean;
  ok: boolean;
}

export interface ValidationSummary {
  rows: ValidatedRow[];
  /** Rows that would create or update a passport. */
  readyCount: number;
  errorCount: number;
  emptyCount: number;
  /** Headers present in the file but mapped to nothing. */
  unmappedColumns: string[];
  /** Rows carrying no identifier, so a re-import would duplicate them. */
  unkeyedCount: number;
}

export interface ValidateOptions {
  /**
   * Brand name to fall back to when the file does not carry one. The schema
   * requires it and a PLM export almost never has it, so the workspace's own
   * legal name is passed in rather than the row being failed for it.
   */
  defaultBrandName?: string;
  /** Column headers present in the file, so unmapped ones can be reported. */
  headers?: readonly string[];
}

/** The generic bucket for an error that belongs to the row, not a column. */
export const ROW_KEY = '_row';

export interface SourceRow {
  line: number;
  cells: Record<string, string>;
}

export function validateRows(
  rows: readonly SourceRow[],
  mapping: Mapping,
  options: ValidateOptions = {},
): ValidationSummary {
  const reverse = reverseMapping(mapping);
  const validated = rows.map((row, index) => validateRow(row, index, mapping, reverse, options));

  const headers = options.headers ?? Object.keys(rows[0]?.cells ?? {});
  const unmappedColumns = headers.filter((header) => !mapping[header]);

  return {
    rows: validated,
    readyCount: validated.filter((row) => row.ok).length,
    errorCount: validated.filter((row) => !row.ok && !row.empty).length,
    emptyCount: validated.filter((row) => row.empty).length,
    unmappedColumns,
    unkeyedCount: validated.filter((row) => row.ok && !row.matchKey).length,
  };
}

/** Validate one row. Exported so the review grid can re-check a single fix. */
export function validateRow(
  row: SourceRow,
  index: number,
  mapping: Mapping,
  reverse: Map<string, string[]>,
  options: ValidateOptions = {},
): ValidatedRow {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};
  const draft: Json = { schemaVersion: '1.0' };
  let sawValue = false;

  for (const [header, path] of Object.entries(mapping)) {
    const raw = row.cells[header] ?? '';
    if (raw.trim() === '') continue;
    sawValue = true;

    if (!targetFor(path)) {
      push(errors, header, `This column is mapped to "${path}", which is not an importable field.`);
      continue;
    }

    const result = coerceCell(path, raw);
    if (result.error) push(errors, header, result.error);
    if (result.warning) push(warnings, header, result.warning);
    if (result.value !== undefined) setAtPath(draft, path, result.value);
  }

  if (!sawValue) {
    return {
      index,
      line: row.line,
      payload: null,
      errors: {},
      warnings: {},
      matchKey: null,
      empty: true,
      ok: false,
    };
  }

  const pruned = (prune(draft) ?? {}) as Json;
  pruned.schemaVersion = '1.0';
  fillEmptyableArrays(pruned, '');

  // The schema requires a brand on every passport; a product export rarely
  // carries one because everything in the file is the same brand.
  const identity = (pruned.identity ??= {}) as Json;
  if (!identity.brandName && options.defaultBrandName) {
    identity.brandName = options.defaultBrandName;
  }

  const parsed = passportPayloadSchema.safeParse(pruned);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issuePath(issue.path);
      for (const header of columnsFor(path, reverse, mapping)) {
        push(errors, header, humanise(issue.message, path));
      }
    }
  }

  const hasErrors = Object.keys(errors).length > 0;

  return {
    index,
    line: row.line,
    payload: parsed.success && !hasErrors ? parsed.data : null,
    errors,
    warnings,
    matchKey: matchKeyOf(pruned),
    empty: false,
    ok: parsed.success && !hasErrors,
  };
}

/**
 * Supply the empty arrays the schema insists on for a section the file
 * mentioned at all.
 *
 * Without this, mapping a single fibre percentage produces "composition:
 * components is required" — an error about a column nobody has, on a section
 * the operator thought they had filled in correctly.
 */
function fillEmptyableArrays(node: Json, path: string): void {
  for (const key of emptyableArrayKeys(path)) {
    if (node[key] === undefined) node[key] = [];
  }

  for (const [key, child] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        if (isObject(item)) fillEmptyableArrays(item, `${childPath}.${index}`);
      });
    } else if (isObject(child)) {
      fillEmptyableArrays(child, childPath);
    }
  }
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Which identifier this row is keyed on.
 *
 * GTIN first because it is the only globally unique one; SKU then style
 * reference because a brand without GTINs still has to be able to re-import a
 * corrected file without doubling its catalogue.
 */
export function matchKeyOf(payload: unknown): MatchKey | null {
  const identity = (payload as { identity?: Record<string, unknown> } | null)?.identity;
  if (!identity) return null;
  for (const kind of ['gtin', 'sku', 'styleNumber'] as const) {
    const value = identity[kind];
    if (typeof value === 'string' && value.trim() !== '') return { kind, value: value.trim() };
  }
  return null;
}

/** Path → the column headers that feed it, including nested ones. */
export function reverseMapping(mapping: Mapping): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  for (const [header, path] of Object.entries(mapping)) {
    const existing = reverse.get(path);
    if (existing) existing.push(header);
    else reverse.set(path, [header]);
  }
  return reverse;
}

/**
 * Attribute a schema issue to the columns that could have caused it.
 *
 * An issue on `composition.overall.0.percentage` belongs to whichever column
 * was mapped there. An issue on `composition.overall` — the array as a whole,
 * which is where cross-field rules land — belongs to every column underneath
 * it, because the operator has to look at all of them to fix it. An issue on a
 * path nobody mapped is the row's problem, not a column's, and has to be shown
 * somewhere rather than swallowed.
 */
function columnsFor(path: string, reverse: Map<string, string[]>, mapping: Mapping): string[] {
  const exact = reverse.get(path);
  if (exact) return exact;

  // A field that could have been mapped but was not is the row's problem, not
  // a column's: there is no cell on screen the operator could edit to fix it,
  // and hanging the message off an unrelated column is how an import screen
  // ends up showing seventeen red lines that point nowhere.
  if (targetFor(path)) return [ROW_KEY];

  const beneath = below(path, mapping);
  if (beneath.length > 0) return beneath;

  // Walk up. An issue on a required child that nobody mapped belongs to
  // whichever columns did touch its parent — those are the cells the operator
  // has to look at.
  const segments = path.split('.');
  for (let i = segments.length - 1; i > 0; i--) {
    const prefix = segments.slice(0, i).join('.');
    const parent = reverse.get(prefix);
    if (parent) return parent;
    const siblings = below(prefix, mapping);
    if (siblings.length > 0) return siblings;
  }

  return [ROW_KEY];
}

function below(path: string, mapping: Mapping): string[] {
  return Object.entries(mapping)
    .filter(([, target]) => target.startsWith(`${path}.`))
    .map(([header]) => header);
}

/**
 * Zod's messages are written for a form where the field label is already on
 * screen. In a grid the reader needs to know which field, so an unlabelled
 * message gets the path appended.
 */
function humanise(message: string, path: string): string {
  const label = targetFor(path)?.label;
  if (!label) return path === '' ? message : `${message} (${path})`;
  return message.toLowerCase().includes(label.toLowerCase()) ? message : `${label}: ${message}`;
}

function push(bag: Record<string, string[]>, key: string, message: string): void {
  (bag[key] ??= []).push(message);
}
