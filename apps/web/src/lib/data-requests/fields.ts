import { FIELD_REGISTRY } from '@/lib/tier/field-registry';
import { passportPayloadSchema } from '@/lib/passport/schema';

/**
 * What a data request may ask for, and what shape the answer has to take.
 *
 * The question this file answers is "given a registry path, what control does
 * a supplier see and what counts as a valid answer". The answer is read off
 * the passport schema itself rather than from a second hand-written table,
 * because a hand-written table is guaranteed to drift: someone tightens a
 * field in `passport/schema.ts`, the portal keeps offering the old control,
 * and the merge fails silently three weeks later at review time.
 *
 * `FIELD_REGISTRY` supplies the label and the regulatory basis; the Zod schema
 * supplies the type, the enum members and the validation message. Nothing here
 * is invented.
 */

/** Minimal structural view of a Zod node, so this file does not depend on internals more than it must. */
interface ZodNode {
  def: { type: string } & Record<string, unknown>;
  options?: readonly unknown[];
  safeParse: (value: unknown) => { success: boolean; error?: { issues: { message: string }[] } };
}

const ROOT = passportPayloadSchema as unknown as ZodNode;

/** Wrappers that carry no shape of their own. */
function unwrap(node: ZodNode): ZodNode {
  let current = node;
  for (let depth = 0; depth < 12; depth++) {
    const type = current.def.type;
    if (
      type === 'optional' ||
      type === 'nullable' ||
      type === 'default' ||
      type === 'prefault' ||
      type === 'nonoptional' ||
      type === 'readonly' ||
      type === 'catch'
    ) {
      current = current.def.innerType as ZodNode;
      continue;
    }
    if (type === 'pipe') {
      current = current.def.out as ZodNode;
      continue;
    }
    break;
  }
  return current;
}

const nodeCache = new Map<string, ZodNode | null>();

/** Resolve a registry path — `*` standing for "any element" — to its schema node. */
export function schemaNodeFor(path: string): ZodNode | null {
  const cached = nodeCache.get(path);
  if (cached !== undefined) return cached;

  let current: ZodNode | null = unwrap(ROOT);
  for (const segment of path.split('.')) {
    if (!current) break;
    const type = current.def.type;

    if (segment === '*') {
      if (type === 'array') current = unwrap(current.def.element as ZodNode);
      else if (type === 'record') current = unwrap(current.def.valueType as ZodNode);
      else current = null;
      continue;
    }

    if (type !== 'object') {
      current = null;
      continue;
    }
    const shape = current.def.shape as Record<string, ZodNode | undefined>;
    const next = shape[segment];
    current = next ? unwrap(next) : null;
  }

  nodeCache.set(path, current);
  return current;
}

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'email'
  | 'url'
  | 'select'
  | 'list'
  | 'country'
  | 'document'
  | 'unsupported';

function kindOf(path: string, node: ZodNode | null): { kind: FieldKind; options?: string[] } {
  if (!node) return { kind: 'unsupported' };

  // A `documentId` is a pointer at an uploaded file. The portal has nowhere to
  // put the bytes yet, so it collects the metadata and says so.
  if (/documentId$|reportDocumentId$/.test(path)) return { kind: 'document' };

  switch (node.def.type) {
    case 'enum': {
      const options = (node.options ?? []).map(String);
      return { kind: 'select', options };
    }
    case 'number':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'boolean' };
    case 'literal':
      return { kind: 'text' };
    case 'array': {
      const element = unwrap(node.def.element as ZodNode);
      return element.def.type === 'string' ? { kind: 'list' } : { kind: 'unsupported' };
    }
    case 'string': {
      const format = node.def.format as string | undefined;
      if (format === 'date') return { kind: 'date' };
      if (format === 'email') return { kind: 'email' };
      if (format === 'url') return { kind: 'url' };
      if (/country$/i.test(path)) return { kind: 'country' };
      if (/instruction|summary|description|statement|notes?$/i.test(path))
        return { kind: 'longtext' };
      return { kind: 'text' };
    }
    default:
      return { kind: 'unsupported' };
  }
}

export const SECTION_LABELS: Record<string, string> = {
  identity: 'Identity',
  composition: 'Composition',
  substances: 'Substances',
  supplyChain: 'Supply chain',
  environment: 'Environment',
  durability: 'Durability',
  care: 'Care and repair',
  circularity: 'Circularity',
  social: 'Social',
  claims: 'Claims',
  certifications: 'Certifications',
  commercial: 'Commercial',
  schemaVersion: 'Identity',
};

/** Order sections the way a passport reads, not alphabetically. */
export const SECTION_ORDER = [
  'identity',
  'composition',
  'substances',
  'supplyChain',
  'environment',
  'durability',
  'care',
  'circularity',
  'social',
  'claims',
  'certifications',
  'commercial',
];

export interface RequestableField {
  /** Registry path. May contain a single `*` standing for one array element. */
  path: string;
  label: string;
  basis: string;
  section: string;
  sectionLabel: string;
  /** The repeating container, e.g. `supplyChain.steps`, or null for a plain field. */
  collection: string | null;
  kind: FieldKind;
  options?: string[];
  required: boolean;
  sensitive: boolean;
}

function buildRequestable(): RequestableField[] {
  const out: RequestableField[] = [];

  for (const entry of FIELD_REGISTRY) {
    const stars = entry.path.split('.').filter((s) => s === '*').length;

    // Two levels of repetition (a fibre inside a component) cannot be
    // addressed unambiguously by one answer, so they are not offered. A brand
    // that needs them asks for the component and edits the passport directly.
    if (stars > 1) continue;
    if (entry.path === 'schemaVersion') continue;

    const node = schemaNodeFor(entry.path);
    const { kind, options } = kindOf(entry.path, node);
    if (kind === 'unsupported') continue;

    const section = entry.path.split('.')[0]!;
    const starIndex = entry.path.indexOf('.*');

    out.push({
      path: entry.path,
      label: entry.label,
      basis: entry.basis,
      section,
      sectionLabel: SECTION_LABELS[section] ?? section,
      collection: starIndex === -1 ? null : entry.path.slice(0, starIndex),
      kind,
      ...(options ? { options } : {}),
      required: entry.required ?? false,
      sensitive: entry.sensitive ?? false,
    });
  }

  return out;
}

export const REQUESTABLE_FIELDS: readonly RequestableField[] = buildRequestable();

const BY_PATH = new Map(REQUESTABLE_FIELDS.map((f) => [f.path, f]));

export function fieldFor(path: string): RequestableField | null {
  return BY_PATH.get(path) ?? null;
}

export interface FieldSection {
  section: string;
  label: string;
  fields: RequestableField[];
}

/** Grouped for the picker, in passport order. */
export function fieldSections(paths?: readonly string[]): FieldSection[] {
  const wanted = paths ? new Set(paths) : null;
  const buckets = new Map<string, RequestableField[]>();

  for (const field of REQUESTABLE_FIELDS) {
    if (wanted && !wanted.has(field.path)) continue;
    const bucket = buckets.get(field.section);
    if (bucket) bucket.push(field);
    else buckets.set(field.section, [field]);
  }

  return SECTION_ORDER.filter((section) => buckets.has(section)).map((section) => ({
    section,
    label: SECTION_LABELS[section] ?? section,
    fields: buckets.get(section)!,
  }));
}

/**
 * Fields a given supplier is plausibly able to answer.
 *
 * This is a suggestion, not a restriction — a brand can still ask a spinner
 * about packaging if it wants to. It exists because the default "every field"
 * picker is 200 rows long and nobody reads it, which is how suppliers end up
 * being asked for data they have never held.
 */
const TIER_SUGGESTIONS: Record<string, readonly string[]> = {
  tier_0_retail: ['commercial', 'care', 'circularity'],
  tier_1_assembly: ['supplyChain', 'composition', 'care', 'social', 'certifications'],
  tier_2_material: ['composition', 'substances', 'supplyChain', 'environment', 'durability'],
  tier_3_processing: ['substances', 'supplyChain', 'environment', 'social'],
  tier_4_raw_material: ['composition', 'supplyChain', 'social', 'certifications'],
};

export function suggestedSectionsFor(tier: string): readonly string[] {
  return TIER_SUGGESTIONS[tier] ?? SECTION_ORDER;
}

export type AnswerValue = string | number | boolean | string[] | null;

export interface AnswerCheck {
  ok: boolean;
  value?: AnswerValue;
  message?: string;
}

/**
 * Turn what a supplier typed into the value the passport schema expects, and
 * check it against that schema. Returning the schema's own message means the
 * supplier sees "Country codes are uppercase, e.g. IT" rather than a generic
 * "invalid input".
 */
export function checkAnswer(field: RequestableField, raw: string | string[]): AnswerCheck {
  const text = Array.isArray(raw) ? raw.join(',') : raw;
  const trimmed = text.trim();

  if (trimmed === '') return { ok: true, value: null };

  let value: AnswerValue;
  switch (field.kind) {
    case 'number': {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return { ok: false, message: 'Enter a number.' };
      value = parsed;
      break;
    }
    case 'boolean':
      value = trimmed === 'yes' || trimmed === 'true' || trimmed === 'on';
      break;
    case 'list':
      value = trimmed
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      break;
    case 'country':
      value = trimmed.toUpperCase();
      break;
    case 'document':
      // Stored as free text until file upload exists; see `documents` gap.
      return { ok: true, value: trimmed };
    default:
      value = trimmed;
  }

  const node = schemaNodeFor(field.path);
  if (node) {
    const result = node.safeParse(value);
    if (!result.success) {
      return { ok: false, message: result.error?.issues[0]?.message ?? 'That value is not valid.' };
    }
  }

  return { ok: true, value };
}

/** How an answer reads back in the console, without re-deriving the control. */
export function formatAnswer(field: RequestableField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.kind === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
