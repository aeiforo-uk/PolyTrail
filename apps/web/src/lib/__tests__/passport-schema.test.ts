import { describe, expect, it } from 'vitest';
import { validateDraft, validateForPublication } from '@/lib/passport/schema';
import { scoreCompleteness } from '@/lib/passport/completeness';

const minimal = {
  schemaVersion: '1.0' as const,
  identity: {
    productName: { en: 'Coastline Half-Zip' },
    brandName: 'Meridian',
    category: 'apparel.tops.knitwear' as const,
    countryOfOrigin: 'PT',
    economicOperators: [
      {
        name: 'Meridian Studio B.V.',
        role: 'manufacturer' as const,
        address: { country: 'NL' },
      },
    ],
  },
  composition: {
    components: [],
    overall: [
      { fibre: 'cotton' as const, percentage: 62 },
      { fibre: 'polyester' as const, percentage: 34 },
      { fibre: 'elastane' as const, percentage: 4 },
    ],
  },
  care: { instructions: { en: 'Wash at 30 °C.' } },
};

describe('draft validation', () => {
  it('accepts a passport that has barely been started', () => {
    // A brand builds a passport over months as suppliers answer requests, so
    // the draft schema must not complain about an incomplete one.
    const result = validateDraft({
      schemaVersion: '1.0',
      identity: {
        productName: { en: 'X' },
        brandName: 'Y',
        category: 'apparel.tops.tshirt',
      },
    });
    expect(result.success).toBe(true);
  });

  it('still rejects structurally wrong values', () => {
    const result = validateDraft({
      schemaVersion: '1.0',
      identity: { productName: { en: 'X' }, brandName: 'Y', category: 'not.a.category' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a country code that is not ISO 3166 alpha-2', () => {
    const result = validateDraft({
      ...minimal,
      identity: { ...minimal.identity, countryOfOrigin: 'PRT' },
    });
    expect(result.success).toBe(false);
  });
});

describe('publication gate', () => {
  it('accepts a complete passport', () => {
    expect(validateForPublication(minimal).success).toBe(true);
  });

  it('refuses a passport with no fibre composition', () => {
    const { composition, ...rest } = minimal;
    void composition;
    const result = validateForPublication(rest);
    expect(result.success).toBe(false);
  });

  it('refuses fibre percentages that do not total 100', () => {
    const result = validateForPublication({
      ...minimal,
      composition: { components: [], overall: [{ fibre: 'cotton', percentage: 90 }] },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('100');
  });

  it('tolerates rounding within half a percent', () => {
    const result = validateForPublication({
      ...minimal,
      composition: {
        components: [],
        overall: [
          { fibre: 'cotton', percentage: 33.3 },
          { fibre: 'polyester', percentage: 33.3 },
          { fibre: 'viscose', percentage: 33.4 },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('refuses a passport with no country of origin', () => {
    const { countryOfOrigin, ...identity } = minimal.identity;
    void countryOfOrigin;
    expect(validateForPublication({ ...minimal, identity }).success).toBe(false);
  });

  it('refuses a passport with no economic operator', () => {
    // Regulation (EU) 2019/1020 Art. 4 requires a contactable operator
    // established in the Union; a passport without one names nobody responsible.
    const { economicOperators, ...identity } = minimal.identity;
    void economicOperators;
    const result = validateForPublication({ ...minimal, identity });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('2019/1020');
  });

  it('refuses an economic operator with no country', () => {
    const result = validateForPublication({
      ...minimal,
      identity: {
        ...minimal.identity,
        economicOperators: [{ name: 'Nameless Ltd', role: 'manufacturer', address: {} }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('refuses a passport with no care information', () => {
    const { care, ...rest } = minimal;
    void care;
    expect(validateForPublication(rest).success).toBe(false);
  });

  it('refuses a claim whose evidence does not exist in the passport', () => {
    // Directive (EU) 2024/825 bans unsubstantiated environmental claims, so an
    // orphaned claim is a liability rather than an unfinished field.
    const result = validateForPublication({
      ...minimal,
      claims: [
        {
          id: 'c1',
          statement: { en: '100% organic' },
          kind: 'organic_content',
          scope: 'whole_product',
          evidence: ['cert-that-does-not-exist'],
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('2024/825');
  });

  it('accepts a claim whose evidence is present', () => {
    const result = validateForPublication({
      ...minimal,
      claims: [
        {
          id: 'c1',
          statement: { en: '100% organic' },
          kind: 'organic_content',
          scope: 'whole_product',
          evidence: ['cert-gots'],
        },
      ],
      certifications: [
        { id: 'cert-gots', scheme: 'GOTS', issuedBy: 'Control Union' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('completeness', () => {
  it('scores an empty passport at zero and a full one higher', () => {
    const empty = scoreCompleteness({});
    const partial = scoreCompleteness(minimal);
    expect(empty.score).toBe(0);
    expect(partial.score).toBeGreaterThan(0);
    expect(partial.score).toBeLessThan(100);
  });

  it('reports which required fields are missing', () => {
    const result = scoreCompleteness({});
    expect(result.missingRequired.length).toBeGreaterThan(0);
    expect(result.missingRequired.every((f) => f.label && f.path)).toBe(true);
  });

  it('does not reward a longer list over a shorter one', () => {
    // A passport with twelve fibres should not out-score one with two purely
    // for having more rows.
    const two = scoreCompleteness(minimal);
    const many = scoreCompleteness({
      ...minimal,
      composition: {
        components: [],
        overall: Array.from({ length: 12 }, () => ({ fibre: 'cotton' as const, percentage: 8.33 })),
      },
    });
    expect(many.score).toBe(two.score);
  });

  it('groups results by section', () => {
    const result = scoreCompleteness(minimal);
    expect(result.sections.map((s) => s.key)).toContain('identity');
    expect(result.sections.every((s) => s.total > 0)).toBe(true);
  });
});
