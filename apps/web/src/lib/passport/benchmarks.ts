import type { CategoryKey } from './vocab';

/**
 * Category baselines for the comparator band.
 *
 * A number without a baseline is decoration: "14.3 kg CO₂e" tells a shopper
 * nothing, because nobody carries a mental model of what a jumper ought to
 * cost the atmosphere. So every headline figure on the public passport is
 * rendered against a reference value.
 *
 * These are order-of-magnitude reference points drawn from published apparel
 * LCA literature and the PEFCR Apparel & Footwear screening studies. They are
 * deliberately coarse, and the UI always names the source and the fact that it
 * is a category reference rather than a certified comparison — presenting a
 * precise-looking delta against an unstated baseline is exactly the practice
 * Directive (EU) 2024/825 exists to stop.
 *
 * A brand that has its own verified baseline should override these per tenant;
 * `resolveBenchmark` takes an override first.
 */

export interface Benchmark {
  /** Typical cradle-to-gate carbon for one unit, kg CO₂e. */
  carbonKgCo2e: number;
  /** Typical cradle-to-gate blue water use, litres. */
  waterLitres: number;
  /** Typical garment mass, grams — used to sanity-check declared weights. */
  massGrams: number;
}

const BENCHMARKS: Partial<Record<CategoryKey, Benchmark>> = {
  'apparel.tops.tshirt': { carbonKgCo2e: 6.5, waterLitres: 2100, massGrams: 160 },
  'apparel.tops.shirt': { carbonKgCo2e: 9.0, waterLitres: 2600, massGrams: 220 },
  'apparel.tops.knitwear': { carbonKgCo2e: 13.6, waterLitres: 1450, massGrams: 400 },
  'apparel.tops.sweatshirt': { carbonKgCo2e: 15.2, waterLitres: 2900, massGrams: 520 },
  'apparel.outerwear.jacket': { carbonKgCo2e: 26.0, waterLitres: 2400, massGrams: 750 },
  'apparel.outerwear.coat': { carbonKgCo2e: 34.0, waterLitres: 3000, massGrams: 1200 },
  'apparel.bottoms.trousers': { carbonKgCo2e: 16.0, waterLitres: 3300, massGrams: 480 },
  'apparel.bottoms.jeans': { carbonKgCo2e: 21.0, waterLitres: 6800, massGrams: 600 },
  'apparel.bottoms.skirt': { carbonKgCo2e: 11.0, waterLitres: 2200, massGrams: 300 },
  'apparel.bottoms.shorts': { carbonKgCo2e: 9.5, waterLitres: 1900, massGrams: 260 },
  'apparel.dresses.dress': { carbonKgCo2e: 17.0, waterLitres: 3100, massGrams: 400 },
  'apparel.underwear.underwear': { carbonKgCo2e: 3.2, waterLitres: 900, massGrams: 70 },
  'apparel.hosiery.socks': { carbonKgCo2e: 2.4, waterLitres: 600, massGrams: 60 },
  'apparel.activewear.activewear': { carbonKgCo2e: 12.0, waterLitres: 1100, massGrams: 280 },
  'apparel.swimwear.swimwear': { carbonKgCo2e: 6.0, waterLitres: 700, massGrams: 120 },
  'footwear.shoes.sneaker': { carbonKgCo2e: 14.0, waterLitres: 2400, massGrams: 800 },
  'footwear.shoes.boot': { carbonKgCo2e: 22.0, waterLitres: 3400, massGrams: 1300 },
  'footwear.shoes.formal': { carbonKgCo2e: 18.0, waterLitres: 3000, massGrams: 900 },
  'accessories.bags.bag': { carbonKgCo2e: 16.0, waterLitres: 2000, massGrams: 700 },
  'accessories.headwear.hat': { carbonKgCo2e: 4.0, waterLitres: 800, massGrams: 110 },
  'accessories.scarves.scarf': { carbonKgCo2e: 5.5, waterLitres: 900, massGrams: 150 },
  'accessories.belts.belt': { carbonKgCo2e: 6.0, waterLitres: 1100, massGrams: 200 },
  'home.bedding.bedlinen': { carbonKgCo2e: 19.0, waterLitres: 5200, massGrams: 1500 },
  'home.bath.towel': { carbonKgCo2e: 11.0, waterLitres: 3600, massGrams: 600 },
  'home.living.curtain': { carbonKgCo2e: 15.0, waterLitres: 3800, massGrams: 1400 },
  'home.living.upholstery': { carbonKgCo2e: 13.0, waterLitres: 3200, massGrams: 1000 },
};

export const BENCHMARK_SOURCE =
  'Category reference from published apparel life-cycle studies and PEFCR Apparel & Footwear screening data.';

export interface CategoryBenchmark extends Benchmark {
  /** Plain-language noun for use inside a comparator sentence. */
  label: string;
}

/**
 * The reference figures for a category, or `null` when we have none.
 *
 * Returning `null` matters: a passport for a product group we have no baseline
 * for shows its numbers plainly with no comparison, rather than being measured
 * against an invented reference.
 */
export function benchmarkFor(category: string | undefined): CategoryBenchmark | null {
  if (!category) return null;
  const base = BENCHMARKS[category as CategoryKey];
  if (!base) return null;
  return { ...base, label: categoryNoun(category) };
}

export interface Comparison {
  /** Signed percentage difference from the reference. Negative is lower. */
  deltaPercent: number;
  /**
   * Whether being here is good. For footprint metrics lower is better, which
   * is the only direction these references are used in — a separate metric
   * where higher is better would need its own polarity flag.
   */
  verdict: 'better' | 'worse' | 'similar';
  /** Ready-to-render sentence, e.g. "38% below a typical knit". */
  sentence: string;
}

/**
 * Compare a measured value against its reference.
 *
 * Anything within ±5% is reported as "about the same" rather than as a precise
 * delta, because the underlying reference is not precise enough to support a
 * claim of a 3% advantage — and a passport that overstates its own precision
 * is the exact failure Directive (EU) 2024/825 targets.
 */
export function compare(value: number, reference: number, noun: string): Comparison | null {
  if (!reference || reference <= 0 || !Number.isFinite(value)) return null;
  const deltaPercent = ((value - reference) / reference) * 100;
  const magnitude = Math.round(Math.abs(deltaPercent));

  if (magnitude < 5) {
    return { deltaPercent, verdict: 'similar', sentence: `about the same as ${noun}` };
  }
  return {
    deltaPercent,
    verdict: deltaPercent < 0 ? 'better' : 'worse',
    sentence: `${magnitude}% ${deltaPercent < 0 ? 'below' : 'above'} ${noun}`,
  };
}

/** Plain-language noun for a category, for use inside a comparator sentence. */
export function categoryNoun(category: string | undefined): string {
  if (!category) return 'a typical garment';
  const leaf = category.split('.').pop() ?? '';
  const nouns: Record<string, string> = {
    tshirt: 'a typical T-shirt',
    shirt: 'a typical shirt',
    knitwear: 'a typical knit',
    sweatshirt: 'a typical sweatshirt',
    jacket: 'a typical jacket',
    coat: 'a typical coat',
    trousers: 'typical trousers',
    jeans: 'a typical pair of jeans',
    skirt: 'a typical skirt',
    shorts: 'typical shorts',
    dress: 'a typical dress',
    underwear: 'typical underwear',
    socks: 'a typical pair of socks',
    activewear: 'typical activewear',
    swimwear: 'typical swimwear',
    sneaker: 'a typical pair of trainers',
    boot: 'a typical pair of boots',
    formal: 'typical formal shoes',
    bag: 'a typical bag',
    hat: 'a typical hat',
    scarf: 'a typical scarf',
    belt: 'a typical belt',
    bedlinen: 'typical bed linen',
    towel: 'a typical towel',
    curtain: 'typical curtains',
    upholstery: 'typical upholstery fabric',
  };
  return nouns[leaf] ?? 'a typical garment';
}

/* ─────────────────────────────────────────────────────────────────────────
   Physical equivalences.

   A kilogram of CO₂e is not a quantity anyone has intuition for. Restating it
   as distance driven gives the figure a handle without dressing it up as a
   precise claim, so both helpers round hard — the point is the order of
   magnitude, and a false-precision "1,247 km" would undermine that.
   ───────────────────────────────────────────────────────────────────────── */

/** Average new-car tailpipe intensity across the EU fleet, kg CO₂e per km. */
const CAR_KG_CO2E_PER_KM = 0.12;

/** WHO guideline drinking water, litres per person per day. */
const DRINKING_LITRES_PER_DAY = 2;

export function carbonAsCarKm(kgCo2e: number): number {
  const km = kgCo2e / CAR_KG_CO2E_PER_KM;
  return km >= 100 ? Math.round(km / 10) * 10 : Math.round(km);
}

export function waterAsDrinkingDays(litres: number): number {
  return Math.round(litres / DRINKING_LITRES_PER_DAY);
}
