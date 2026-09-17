import { describe, expect, it } from 'vitest';
import { FIELD_REGISTRY } from '@/lib/tier/field-registry';
import { expandWildcards, findUnregisteredPaths, projectForTier } from '@/lib/tier/project';
import { ACCESS_TIERS, regulatedTierOf, tierAllows, type FieldEntry } from '@/lib/tier/types';

const registry: FieldEntry[] = [
  { path: 'a.open', audiences: ['public'], label: 'Open', basis: 'test' },
  { path: 'a.trade', audiences: ['retailer'], label: 'Trade', basis: 'test' },
  { path: 'a.waste', audiences: ['recycler'], label: 'Waste', basis: 'test' },
  { path: 'a.secret', audiences: ['authority'], label: 'Secret', basis: 'test' },
  { path: 'list.*.value', audiences: ['public'], label: 'Listed', basis: 'test' },
];

const payload = {
  a: { open: 1, trade: 2, waste: 3, secret: 4 },
  list: [{ value: 'x' }, { value: 'y' }],
  unregistered: 'should never be projected',
};

describe('tierAllows', () => {
  it('lets an authority read everything', () => {
    for (const tier of ACCESS_TIERS) {
      expect(tierAllows('authority', [tier])).toBe(true);
    }
  });

  it('lets everyone read anything marked public', () => {
    for (const tier of ACCESS_TIERS) {
      expect(tierAllows(tier, ['public'])).toBe(true);
    }
  });

  it('does not treat audiences as a ladder', () => {
    // The whole point of the set model: a repairer is not "above" a retailer,
    // so neither inherits the other's fields.
    expect(tierAllows('repairer', ['retailer'])).toBe(false);
    expect(tierAllows('retailer', ['repairer'])).toBe(false);
  });
});

describe('projectForTier', () => {
  it('drops fields the caller may not read', () => {
    const { data } = projectForTier(payload, 'public', registry);
    expect(data).toEqual({ a: { open: 1 }, list: [{ value: 'x' }, { value: 'y' }] });
  });

  it('never projects a field missing from the registry', () => {
    const { data } = projectForTier(payload, 'authority', registry);
    expect(JSON.stringify(data)).not.toContain('should never be projected');
  });

  it('reports what it withheld rather than hiding the gap', () => {
    const { withheld } = projectForTier(payload, 'public', registry);
    expect(withheld.map((w) => w.path).sort()).toEqual(['a.secret', 'a.trade', 'a.waste']);
  });

  it('gives a recycler and a repairer genuinely different views', () => {
    const recycler = projectForTier(payload, 'recycler', registry).data;
    const repairer = projectForTier(payload, 'repairer', registry).data;
    expect(recycler).not.toEqual(repairer);
    expect(JSON.stringify(recycler)).toContain('3');
    expect(JSON.stringify(repairer)).not.toContain('"waste"');
  });

  it('does not mutate the source', () => {
    const snapshot = JSON.stringify(payload);
    projectForTier(payload, 'public', registry);
    expect(JSON.stringify(payload)).toBe(snapshot);
  });

  it('rebuilds arrays as arrays so consumers can still map over them', () => {
    const { data } = projectForTier(payload, 'public', registry) as { data: typeof payload };
    expect(Array.isArray(data.list)).toBe(true);
  });
});

describe('expandWildcards', () => {
  it('yields nothing when the collection is absent, rather than an empty shell', () => {
    expect(expandWildcards({}, 'missing.*.value')).toEqual([]);
  });

  it('expands over array indices', () => {
    expect(expandWildcards(payload, 'list.*.value')).toEqual(['list.0.value', 'list.1.value']);
  });
});

describe('the shipped registry', () => {
  it('has no duplicate paths', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of FIELD_REGISTRY) {
      if (seen.has(entry.path)) duplicates.push(entry.path);
      seen.add(entry.path);
    }
    expect(duplicates).toEqual([]);
  });

  it('cites a regulatory basis for every field', () => {
    const missing = FIELD_REGISTRY.filter((e) => !e.basis?.trim()).map((e) => e.path);
    expect(missing).toEqual([]);
  });

  it('gives every field at least one audience', () => {
    const orphans = FIELD_REGISTRY.filter((e) => e.audiences.length === 0).map((e) => e.path);
    expect(orphans).toEqual([]);
  });

  it('only uses * as a whole path segment', () => {
    const bad = FIELD_REGISTRY.filter((e) =>
      e.path.split('.').some((seg) => seg.includes('*') && seg !== '*'),
    );
    expect(bad).toEqual([]);
  });

  it('maps every entry to a regulated tier', () => {
    for (const entry of FIELD_REGISTRY) {
      expect(['public', 'legitimate_interest', 'authority']).toContain(regulatedTierOf(entry));
    }
  });

  it('never classifies an authority-only field as publicly readable', () => {
    for (const entry of FIELD_REGISTRY) {
      if (regulatedTierOf(entry) === 'public') {
        expect(tierAllows('public', entry.audiences)).toBe(true);
      }
    }
  });
});

describe('findUnregisteredPaths', () => {
  it('finds payload content the registry does not describe', () => {
    expect(findUnregisteredPaths(payload, registry)).toContain('unregistered');
  });
});
