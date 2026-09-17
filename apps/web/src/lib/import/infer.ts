import { IMPORT_TARGETS, targetFor, type ImportTarget } from './targets';
import { normalise, similarity } from './vocabulary';

/**
 * Guessing what each column is.
 *
 * A PLM export names its columns in whatever the person who built the report
 * felt like: `Style No.`, `STYLE_NUMBER`, `Article`, `Material 1`, `Fabric 1 %`.
 * Getting most of those right is the difference between a five-minute import
 * and an afternoon of dropdowns.
 *
 * Every guess carries a confidence, which the mapping screen shows. A guess
 * presented as a fact is worse than no guess: the operator skims, accepts, and
 * discovers in the review step that `Colour` went to `colourCode`.
 */

export type MappingConfidence = 'exact' | 'likely' | 'possible' | 'none';

export interface InferredColumn {
  header: string;
  /** Payload path, or `null` when nothing plausible was found. */
  path: string | null;
  confidence: MappingConfidence;
  /** 0–1 score behind the confidence band, for ordering and for tests. */
  score: number;
  target?: ImportTarget;
  /** Other candidates worth offering first in the dropdown. */
  alternatives: string[];
}

export type Mapping = Record<string, string>;

/**
 * Header spellings that no amount of string distance would connect to the
 * registry label. Each is a real column name from a PLM or PIM export.
 */
const HEADER_SYNONYMS: Record<string, readonly string[]> = {
  'identity.productName': ['product', 'product name', 'style name', 'article name', 'item name'],
  'identity.styleNumber': ['style', 'style no', 'style number', 'style ref', 'article', 'article no', 'model', 'model no'],
  'identity.sku': ['sku', 'variant', 'variant code', 'item code', 'material number', 'part number'],
  'identity.gtin': ['gtin', 'ean', 'ean13', 'upc', 'barcode', 'gtin13', 'gtin 14'],
  'identity.category': ['category', 'product type', 'product group', 'garment type', 'class'],
  'identity.colourName': ['colour', 'color', 'colour name', 'color name', 'colourway', 'shade'],
  'identity.colourCode': ['colour code', 'color code', 'colourway code'],
  'identity.size': ['size', 'size name'],
  'identity.countryOfOrigin': ['country of origin', 'coo', 'origin', 'made in', 'manufacture country'],
  'identity.netWeightGrams': ['weight', 'net weight', 'weight g', 'weight grams', 'garment weight'],
  'identity.brandName': ['brand', 'brand name', 'label'],
  'identity.season': ['season', 'collection'],
  'identity.hsCode': ['hs code', 'hs', 'customs code', 'commodity code', 'tariff code', 'cn code'],
  'composition.totalWeightGrams': ['total weight', 'product weight'],
  'composition.totalRecycledContent': ['recycled content', 'recycled percent', 'recycled %'],
  'care.instructions': ['care', 'care instructions', 'washing instructions', 'care label'],
  'care.symbols': ['care symbols', 'care codes'],
  'commercial.launchDate': ['launch date', 'season start', 'release date'],
};

/**
 * Patterns that pick out a numbered slot from a header — `Fibre 2`,
 * `Material #3`, `Fabric 1 %`. Without this every fibre column would match the
 * first slot and the composition would collapse to one fibre.
 */
const SLOT_PATTERN = /(?:^|[^0-9])([1-9])(?:\s*(?:st|nd|rd|th))?\s*$/;

const FIBRE_WORDS = ['fibre', 'fiber', 'material', 'fabric', 'composition', 'yarn'];
const PERCENT_WORDS = ['percent', 'percentage', 'pct', 'share', 'content', 'ratio'];

export function inferMapping(headers: readonly string[]): InferredColumn[] {
  const taken = new Set<string>();
  const columns = headers.map((header) => score(header));

  // Best guesses first, so a strong match claims its path before a weak one
  // does. Two columns can never share a target: the second write would
  // overwrite the first and one column's data would vanish.
  const order = [...columns].sort((a, b) => b.score - a.score);
  for (const column of order) {
    if (!column.path) continue;
    if (taken.has(column.path)) {
      const free = column.alternatives.find((path) => !taken.has(path));
      column.path = free ?? null;
      column.confidence = free ? 'possible' : 'none';
      column.score = free ? Math.min(column.score, 0.5) : 0;
    }
    if (column.path) {
      taken.add(column.path);
      column.target = targetFor(column.path);
    }
  }

  return columns;
}

/** The mapping object the job stores: header → path, unmapped columns omitted. */
export function toMapping(columns: readonly InferredColumn[]): Mapping {
  const mapping: Mapping = {};
  for (const column of columns) {
    if (column.path) mapping[column.header] = column.path;
  }
  return mapping;
}

function score(header: string): InferredColumn {
  const needle = normalise(header);
  if (!needle) {
    return { header, path: null, confidence: 'none', score: 0, alternatives: [] };
  }

  const slot = slotOf(needle);
  const base = slot === null ? needle : needle.replace(SLOT_PATTERN, ' ').trim();

  // The `%` sign is stripped by normalisation but it is the clearest signal in
  // the file, so it is read off the raw header before that happens.
  const percentish = header.includes('%') || hasWord(base, PERCENT_WORDS);
  const fibreish = hasWord(base, FIBRE_WORDS);

  const scored: Array<{ path: string; score: number }> = [];

  for (const target of IMPORT_TARGETS) {
    // A numbered header only ever means the matching slot; an unnumbered one
    // means the first.
    if (target.slot !== null && target.slot !== (slot ?? 0)) continue;

    let best = 0;
    for (const candidate of candidatesFor(target)) {
      best = Math.max(best, similarity(base, normalise(candidate)));
      if (best === 1) break;
    }

    // "Fibre 2 %" is a percentage of a fibre, not a fibre — the percent word
    // decides between two targets whose labels are otherwise equally close.
    if (percentish && fibreish) {
      if (target.path.endsWith('.percentage')) best = Math.max(best, 0.95);
      else if (target.path.endsWith('.fibre')) best = Math.min(best, 0.4);
    }

    if (best > 0.25) scored.push({ path: target.path, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  if (!top || top.score < 0.55) {
    return {
      header,
      path: null,
      confidence: 'none',
      score: top?.score ?? 0,
      alternatives: scored.slice(0, 3).map((item) => item.path),
    };
  }

  return {
    header,
    path: top.path,
    confidence: band(top.score),
    score: top.score,
    target: targetFor(top.path),
    alternatives: scored.slice(1, 4).map((item) => item.path),
  };
}

function candidatesFor(target: ImportTarget): string[] {
  const base = target.slot === null ? target.label : stripSlot(target.label);
  const leaf = target.path.split('.').pop() ?? '';
  return [
    base,
    target.path,
    target.registryPath.replace(/\.\*/g, ''),
    leaf.replace(/([a-z])([A-Z])/g, '$1 $2'),
    ...(HEADER_SYNONYMS[target.registryPath] ?? []),
    ...(HEADER_SYNONYMS[target.path] ?? []),
  ];
}

function stripSlot(label: string): string {
  return label.replace(/\s\d+$/, '');
}

function slotOf(needle: string): number | null {
  const match = SLOT_PATTERN.exec(needle);
  return match ? Number(match[1]) - 1 : null;
}

function hasWord(haystack: string, words: readonly string[]): boolean {
  return words.some((word) => haystack.includes(word));
}

function band(score: number): MappingConfidence {
  if (score >= 0.95) return 'exact';
  if (score >= 0.75) return 'likely';
  return 'possible';
}
