import { FIELD_REGISTRY } from '@/lib/tier/field-registry';
import { expandWildcards } from '@/lib/tier/project';
import type { PassportPayload } from './schema';

/**
 * How finished is this passport?
 *
 * Scored against the field registry rather than against a hand-written
 * checklist, so that adding a regulated field automatically lowers every
 * passport's score instead of silently going unnoticed. Required fields are
 * weighted four times an optional one — a passport missing its fibre
 * composition is not 90% done, whatever else it has.
 */

const REQUIRED_WEIGHT = 4;
const OPTIONAL_WEIGHT = 1;

export interface CompletenessSection {
  key: string;
  label: string;
  filled: number;
  total: number;
  missingRequired: string[];
}

export interface CompletenessResult {
  /** 0-100. */
  score: number;
  sections: CompletenessSection[];
  missingRequired: Array<{ path: string; label: string }>;
}

export const SECTION_LABELS: Record<string, string> = {
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

function hasValue(source: unknown, path: string): boolean {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

export function scoreCompleteness(payload: Partial<PassportPayload>): CompletenessResult {
  const sections = new Map<string, CompletenessSection>();
  const missingRequired: CompletenessResult['missingRequired'] = [];
  let earned = 0;
  let possible = 0;

  for (const entry of FIELD_REGISTRY) {
    if (entry.path === 'schemaVersion') continue;
    const sectionKey = entry.path.split('.')[0]!;
    const section = sections.get(sectionKey) ?? {
      key: sectionKey,
      label: SECTION_LABELS[sectionKey] ?? sectionKey,
      filled: 0,
      total: 0,
      missingRequired: [],
    };

    const weight = entry.required ? REQUIRED_WEIGHT : OPTIONAL_WEIGHT;

    // A wildcard path scores once for the whole collection: a passport with
    // twelve fibres should not out-score one with two just for having more rows.
    const concrete = expandWildcards(payload, entry.path);
    const present = entry.path.includes('*')
      ? concrete.length > 0 && concrete.some((p) => hasValue(payload, p))
      : hasValue(payload, entry.path);

    possible += weight;
    section.total += 1;
    if (present) {
      earned += weight;
      section.filled += 1;
    } else if (entry.required) {
      section.missingRequired.push(entry.label);
      missingRequired.push({ path: entry.path, label: entry.label });
    }

    sections.set(sectionKey, section);
  }

  return {
    score: possible === 0 ? 0 : Math.round((earned / possible) * 100),
    sections: [...sections.values()].sort((a, b) => a.label.localeCompare(b.label)),
    missingRequired,
  };
}
