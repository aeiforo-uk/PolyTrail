import { validateGtin } from '@/lib/gs1/digital-link';
import { COUNTRY_OPTIONS } from '@/lib/partners/vocab';
import { describePath, type LeafInfo } from './schema-walk';
import {
  inlineVocabulary,
  labelFor,
  matchVocabulary,
  normalise,
  vocabularyForOptions,
} from './vocabulary';

/**
 * Turning a spreadsheet cell into a passport value.
 *
 * Everything arriving from a CSV or a REST connector is a string, and the
 * payload schema wants numbers, booleans, enums, ISO dates and localised
 * objects. The type to coerce to is read from the schema itself
 * (`schema-walk.ts`), so this module never has to be updated when a field is
 * added — only when a new *kind* of field is.
 *
 * Two rules run through it:
 *   • A value that cannot be coerced is an error naming the value and what was
 *     expected, never a silent drop.
 *   • A value coerced by guessing carries a warning, so the operator can see
 *     what the importer decided on their behalf before they commit to it.
 */

export interface CoercionResult {
  value: unknown;
  error?: string;
  /** Set when the value was accepted but something was inferred. */
  warning?: string;
}

const EMPTY: CoercionResult = { value: undefined };

/** Values a spreadsheet uses for "no value here". */
const BLANKS = new Set(['', '-', '–', 'n/a', 'na', 'none', 'null', 'undefined', '#n/a']);

export function coerceCell(path: string, raw: string): CoercionResult {
  const input = unguard(raw).trim();
  if (BLANKS.has(input.toLowerCase())) return EMPTY;

  const leaf = describePath(path);
  if (!leaf) {
    return { value: undefined, error: `"${path}" is not a field in the passport schema.` };
  }

  // The check digit is the whole point of a GTIN and a mistyped one is the
  // single most common error in a product import, so it is caught here with
  // the digit it should have been rather than as a generic regex failure.
  if (path.endsWith('identity.gtin')) return coerceGtin(input);

  return coerceTo(leaf, input, path);
}

function coerceTo(leaf: LeafInfo, input: string, path: string): CoercionResult {
  switch (leaf.kind) {
    case 'number':
      return coerceNumber(input);
    case 'boolean':
      return coerceBoolean(input);
    case 'enum':
      return coerceEnum(input, leaf.options ?? []);
    case 'literal':
      return { value: leaf.literal };
    case 'localized':
      return { value: { en: input } };
    case 'array':
      return coerceArray(input, leaf, path);
    case 'string':
      return coerceString(input, leaf, path);
    default:
      return { value: input };
  }
}

/**
 * Strip the apostrophe `toCsv` adds in front of a cell that would otherwise be
 * read as a formula. Without this, exporting a passport and re-importing it
 * turns `-3.2` into a validation error — which would make the round trip the
 * brief asks for useless in exactly the cases that matter.
 */
function unguard(raw: string): string {
  return raw.startsWith("'") && /^'[=+\-@]/.test(raw) ? raw.slice(1) : raw;
}

function coerceNumber(input: string): CoercionResult {
  // Percentages arrive as "45 %", weights as "1,250 g", and European exports
  // use a comma for the decimal point.
  let text = input.replace(/[%\s]/g, '').replace(/[a-zA-Z]+$/, '');
  const commas = (text.match(/,/g) ?? []).length;
  const dots = (text.match(/\./g) ?? []).length;
  if (commas > 0 && dots === 0) {
    text = commas === 1 && /,\d{1,2}$/.test(text) ? text.replace(',', '.') : text.replace(/,/g, '');
  } else if (commas > 0) {
    text = text.replace(/,/g, '');
  }

  const value = Number(text);
  if (text === '' || !Number.isFinite(value)) {
    return { value: undefined, error: `"${input}" is not a number.` };
  }
  return { value };
}

const TRUE = new Set(['true', 'yes', 'y', '1', 'x', 'on', 'ja', 'oui']);
const FALSE = new Set(['false', 'no', 'n', '0', 'off', 'nein', 'non']);

function coerceBoolean(input: string): CoercionResult {
  const key = input.toLowerCase();
  if (TRUE.has(key)) return { value: true };
  if (FALSE.has(key)) return { value: false };
  return { value: undefined, error: `"${input}" is not a yes or no. Use Yes, No, TRUE or FALSE.` };
}

function coerceEnum(input: string, options: readonly string[]): CoercionResult {
  const vocabulary = vocabularyForOptions(options) ?? inlineVocabulary(options);
  const match = matchVocabulary(input, vocabulary);

  if (!match.key) {
    const nearby = match.suggestions.map((key) => labelFor(vocabulary, key));
    return {
      value: undefined,
      error: nearby.length
        ? `"${input}" is not a recognised value. Did you mean ${nearby.join(', ')}?`
        : `"${input}" is not a recognised value.`,
    };
  }

  if (match.confidence < 0.95) {
    return {
      value: match.key,
      warning: `Read "${input}" as ${labelFor(vocabulary, match.key)}.`,
    };
  }

  return { value: match.key };
}

/**
 * Lists arrive as one cell. Semicolon first because a comma is the delimiter
 * of the file itself and a brand that uses it inside a cell has usually
 * quoted the cell, at which point either separator works.
 */
function coerceArray(input: string, leaf: LeafInfo, path: string): CoercionResult {
  const separator = input.includes(';') ? ';' : input.includes('|') ? '|' : ',';
  const parts = input
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part !== '');

  const element = leaf.element ?? { kind: 'string' as const, optional: true };
  const values: unknown[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const part of parts) {
    const result = coerceTo(element, part, path);
    if (result.error) errors.push(result.error);
    else if (result.value !== undefined) values.push(result.value);
    if (result.warning) warnings.push(result.warning);
  }

  if (errors.length > 0) return { value: undefined, error: errors.join(' ') };
  return {
    value: values.length > 0 ? values : undefined,
    ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
  };
}

function coerceString(input: string, leaf: LeafInfo, path: string): CoercionResult {
  if (isCountryPath(path)) return coerceCountry(input);
  if (leaf.format === 'date') return coerceDate(input);
  if (leaf.format === 'url') return coerceUrl(input);
  return { value: input };
}

/**
 * Country fields hold ISO 3166-1 alpha-2, and supplier systems hold whatever
 * a human typed. "Portugal", "PRT" and "portugal " all mean PT.
 */
function coerceCountry(input: string): CoercionResult {
  const upper = input.toUpperCase().trim();
  if (/^[A-Z]{2}$/.test(upper)) {
    return COUNTRY_OPTIONS.some((option) => option.code === upper)
      ? { value: upper }
      : { value: undefined, error: `"${input}" is not an ISO 3166-1 country code.` };
  }

  const needle = normalise(input);
  const byName = COUNTRY_OPTIONS.find((option) => normalise(option.name) === needle);
  if (byName) return { value: byName.code, warning: `Read "${input}" as ${byName.name}.` };

  return {
    value: undefined,
    error: `"${input}" is not a country. Use a two-letter code such as PT, or the English name.`,
  };
}

/** Accept ISO, UK and US orderings; store ISO. Ambiguity is refused, not guessed. */
function coerceDate(input: string): CoercionResult {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (iso) return isoOrError(input, iso[1]!, iso[2]!, iso[3]!);

  const slashed = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(input);
  if (slashed) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    // Day-first is the British and European convention and this is an EU
    // compliance product; an unambiguous US-style date is still accepted.
    if (first > 12 && second > 12) {
      return { value: undefined, error: `"${input}" is not a date.` };
    }
    const [day, month] = first > 12 ? [second, first] : [first, second];
    const result = isoOrError(input, slashed[3]!, pad(month), pad(day));
    if (result.error || first <= 12) return result;
    return { ...result, warning: `Read "${input}" as ${result.value} (day first).` };
  }

  return {
    value: undefined,
    error: `"${input}" is not a date. Use YYYY-MM-DD.`,
  };
}

function isoOrError(input: string, year: string, month: string, day: string): CoercionResult {
  const value = `${year}-${month}-${day}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value)) {
    return { value: undefined, error: `"${input}" is not a real date.` };
  }
  return { value };
}

function coerceUrl(input: string): CoercionResult {
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme');
    return candidate === input
      ? { value: candidate }
      : { value: candidate, warning: `Read "${input}" as ${candidate}.` };
  } catch {
    return { value: undefined, error: `"${input}" is not a web address.` };
  }
}

function coerceGtin(input: string): CoercionResult {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) {
    return { value: undefined, error: `"${input}" is not a GTIN — it must be digits only.` };
  }
  const check = validateGtin(digits);
  if (!check.valid) return { value: undefined, error: check.reason ?? 'That GTIN is not valid.' };
  return digits === input ? { value: digits } : { value: digits, warning: 'Removed separators.' };
}

function isCountryPath(path: string): boolean {
  return /(^|\.)(country|countryOfOrigin|originCountry|marketsPlaced)$/.test(path);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
