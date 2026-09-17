import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_SOURCE,
  benchmarkFor,
  carbonAsCarKm,
  compare,
  waterAsDrinkingDays,
} from '@/lib/passport/benchmarks';

describe('benchmarks', () => {
  it('returns a baseline for a known category', () => {
    const benchmark = benchmarkFor('apparel.tops.knitwear');
    expect(benchmark?.carbonKgCo2e).toBeGreaterThan(0);
    expect(benchmark?.label).toBeTruthy();
  });

  it('returns null for an unknown category rather than inventing one', () => {
    // A passport measured against a baseline we do not have would be a
    // fabricated comparative claim, which Directive (EU) 2024/825 prohibits.
    expect(benchmarkFor('spacecraft.hull.plating')).toBeNull();
    expect(benchmarkFor(undefined)).toBeNull();
  });

  it('labels its own figures as indicative', () => {
    expect(BENCHMARK_SOURCE.toLowerCase()).toMatch(/reference|indicative|screening/);
  });
});

describe('compare', () => {
  it('reports a clear improvement as better', () => {
    const result = compare(8.4, 13.5, 'a typical knit');
    expect(result?.verdict).toBe('better');
    expect(result?.sentence).toContain('below');
    expect(result?.deltaPercent).toBeLessThan(0);
  });

  it('reports a clear excess as worse', () => {
    expect(compare(20, 13.5, 'a typical knit')?.verdict).toBe('worse');
  });

  it('refuses to claim precision it does not have within five percent', () => {
    const result = compare(13.6, 13.5, 'a typical knit');
    expect(result?.verdict).toBe('similar');
    expect(result?.sentence).toContain('about the same');
  });

  it('returns null for a nonsensical reference', () => {
    expect(compare(5, 0, 'x')).toBeNull();
    expect(compare(Number.NaN, 10, 'x')).toBeNull();
  });
});

describe('physical equivalences', () => {
  it('converts carbon to car kilometres', () => {
    // 0.12 kg CO₂e/km, the EU new-car fleet average.
    expect(carbonAsCarKm(8.4)).toBe(70);
    expect(carbonAsCarKm(0)).toBe(0);
  });

  it('converts litres to days of drinking water', () => {
    expect(waterAsDrinkingDays(1180)).toBe(590);
  });
});
