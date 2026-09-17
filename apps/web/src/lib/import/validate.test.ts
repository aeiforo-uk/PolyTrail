import { describe, expect, it } from 'vitest';
import { inferMapping, toMapping, type Mapping } from './infer';
import { collectFailures, failuresToCsv, passportsToCsv } from './export';
import { parseCsv } from './csv';
import { ROW_KEY, validateRows, type SourceRow } from './validate';

/**
 * `validateRows` is the part of the importer that decides what a brand is
 * allowed to believe about its own data, so it is tested against the real
 * payload schema rather than a fixture of one.
 */

const MAPPING: Mapping = {
  Style: 'identity.styleNumber',
  Product: 'identity.productName',
  Category: 'identity.category',
  GTIN: 'identity.gtin',
  Origin: 'identity.countryOfOrigin',
  Weight: 'identity.netWeightGrams',
  'Fibre 1': 'composition.overall.0.fibre',
  'Fibre 1 %': 'composition.overall.0.percentage',
  'Fibre 2': 'composition.overall.1.fibre',
  'Fibre 2 %': 'composition.overall.1.percentage',
  'Take back': 'circularity.takeBack.available',
};

const BASE = {
  Style: 'A-100',
  Product: 'Merino crew',
  Category: 'Knitwear',
  GTIN: '5901234123457',
  Origin: 'PT',
  Weight: '320',
  'Fibre 1': 'Wool',
  'Fibre 1 %': '80',
  'Fibre 2': 'Polyamide',
  'Fibre 2 %': '20',
  'Take back': 'Yes',
};

function rows(...overrides: Array<Partial<Record<string, string>>>): SourceRow[] {
  return overrides.map((override, index) => ({
    line: index + 2,
    cells: { ...BASE, ...override } as Record<string, string>,
  }));
}

const OPTIONS = { defaultBrandName: 'Marklytics Textiles', headers: Object.keys(BASE) };

describe('validateRows', () => {
  it('builds a payload that the real schema accepts', () => {
    const summary = validateRows(rows({}), MAPPING, OPTIONS);
    const row = summary.rows[0]!;

    expect(row.ok).toBe(true);
    expect(summary.readyCount).toBe(1);
    expect(row.payload).toMatchObject({
      schemaVersion: '1.0',
      identity: {
        productName: { en: 'Merino crew' },
        brandName: 'Marklytics Textiles',
        category: 'apparel.tops.knitwear',
        gtin: '5901234123457',
        countryOfOrigin: 'PT',
        netWeightGrams: 320,
      },
      composition: {
        overall: [
          { fibre: 'wool', percentage: 80 },
          { fibre: 'polyamide', percentage: 20 },
        ],
      },
      circularity: { takeBack: { available: true } },
    });
  });

  it('is pure — the same rows produce the same verdict twice', () => {
    const first = validateRows(rows({}), MAPPING, OPTIONS);
    const second = validateRows(rows({}), MAPPING, OPTIONS);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('reports a bad GTIN with the check digit it should have had', () => {
    const summary = validateRows(rows({ GTIN: '5901234123456' }), MAPPING, OPTIONS);
    expect(summary.rows[0]!.ok).toBe(false);
    expect(summary.rows[0]!.errors.GTIN?.[0]).toContain('should be 7');
  });

  it('attributes each error to the column that caused it', () => {
    const summary = validateRows(
      rows({ 'Fibre 1 %': 'about eighty', Origin: 'Narnia' }),
      MAPPING,
      OPTIONS,
    );
    const row = summary.rows[0]!;
    expect(Object.keys(row.errors).sort()).toEqual(['Fibre 1 %', 'Origin']);
    expect(row.errors['Fibre 1 %']![0]).toContain('not a number');
  });

  it('fails the row rather than the run — row 2 still imports', () => {
    const summary = validateRows(rows({ GTIN: 'not-a-gtin' }, {}), MAPPING, OPTIONS);
    expect(summary.rows[0]!.ok).toBe(false);
    expect(summary.rows[1]!.ok).toBe(true);
    expect(summary.readyCount).toBe(1);
    expect(summary.errorCount).toBe(1);
  });

  it('names the values it could not match instead of dropping them', () => {
    const summary = validateRows(rows({ 'Fibre 1': 'Unobtanium' }), MAPPING, OPTIONS);
    expect(summary.rows[0]!.errors['Fibre 1']![0]).toContain('Unobtanium');
    expect(summary.rows[0]!.payload).toBeNull();
  });

  it('takes a typo, but says what it read it as', () => {
    const summary = validateRows(rows({ 'Fibre 1': 'polyestr' }), MAPPING, OPTIONS);
    const row = summary.rows[0]!;
    expect(row.ok).toBe(true);
    expect(row.payload!.composition!.overall![0]!.fibre).toBe('polyester');
    expect(row.warnings['Fibre 1']![0]).toContain('Polyester');
  });

  it('matches the free text a PLM actually produces, and says what it decided', () => {
    const summary = validateRows(
      rows({ 'Fibre 1': '100% Cotton', 'Fibre 2': 'SPANDEX', Category: 'T-Shirt' }),
      MAPPING,
      OPTIONS,
    );
    const row = summary.rows[0]!;
    expect(row.ok).toBe(true);
    expect(row.payload!.composition!.overall![0]!.fibre).toBe('cotton');
    expect(row.payload!.composition!.overall![1]!.fibre).toBe('elastane');
    expect(row.payload!.identity.category).toBe('apparel.tops.tshirt');
    // An inferred read is reported; an exact one is not worth the noise.
    expect(row.warnings['Fibre 1']![0]).toContain('Cotton');
    expect(row.warnings['Fibre 2']).toBeUndefined();
  });

  it('strips a parenthetical qualifier before matching', () => {
    const summary = validateRows(rows({ 'Fibre 1': 'cotton (organic)' }), MAPPING, OPTIONS);
    expect(summary.rows[0]!.payload!.composition!.overall![0]!.fibre).toBe('cotton');
  });

  it('reads a country name and a percentage sign', () => {
    const summary = validateRows(
      rows({ Origin: 'Portugal', 'Fibre 1 %': '80 %' }),
      MAPPING,
      OPTIONS,
    );
    const row = summary.rows[0]!;
    expect(row.payload!.identity.countryOfOrigin).toBe('PT');
    expect(row.payload!.composition!.overall![0]!.percentage).toBe(80);
    expect(row.warnings.Origin![0]).toContain('Portugal');
  });

  it('refuses a percentage above 100 because the schema does', () => {
    const summary = validateRows(rows({ 'Fibre 1 %': '180' }), MAPPING, OPTIONS);
    expect(summary.rows[0]!.ok).toBe(false);
    expect(summary.rows[0]!.errors['Fibre 1 %']).toBeDefined();
  });

  it('treats a row of blanks as nothing to import rather than as an error', () => {
    const blank = Object.fromEntries(Object.keys(BASE).map((key) => [key, '']));
    const summary = validateRows([{ line: 2, cells: blank }], MAPPING, OPTIONS);
    expect(summary.rows[0]!.empty).toBe(true);
    expect(summary.emptyCount).toBe(1);
    expect(summary.errorCount).toBe(0);
  });

  it('blames the empty cell, not the row, when the column exists', () => {
    const summary = validateRows(rows({ Product: '' }), MAPPING, OPTIONS);
    const row = summary.rows[0]!;
    expect(row.ok).toBe(false);
    expect(row.errors.Product?.length).toBeGreaterThan(0);
    expect(row.errors[ROW_KEY]).toBeUndefined();
  });

  it('puts a required field nobody mapped on the row, where it can be seen', () => {
    const { Category: _omitted, ...withoutCategory } = MAPPING;
    const summary = validateRows(rows({}), withoutCategory, OPTIONS);
    const row = summary.rows[0]!;
    expect(row.ok).toBe(false);
    expect(row.errors[ROW_KEY]?.length).toBeGreaterThan(0);
  });

  it('picks the strongest identifier available for matching', () => {
    expect(validateRows(rows({}), MAPPING, OPTIONS).rows[0]!.matchKey).toEqual({
      kind: 'gtin',
      value: '5901234123457',
    });
    expect(validateRows(rows({ GTIN: '' }), MAPPING, OPTIONS).rows[0]!.matchKey).toEqual({
      kind: 'styleNumber',
      value: 'A-100',
    });
  });

  it('counts rows that carry no identifier, because a re-import would duplicate them', () => {
    const summary = validateRows(rows({ GTIN: '', Style: '' }), MAPPING, OPTIONS);
    expect(summary.rows[0]!.ok).toBe(true);
    expect(summary.unkeyedCount).toBe(1);
  });

  it('lists the columns nobody mapped', () => {
    const summary = validateRows(rows({}), MAPPING, {
      ...OPTIONS,
      headers: [...OPTIONS.headers, 'Internal note'],
    });
    expect(summary.unmappedColumns).toEqual(['Internal note']);
  });

  it('ignores an unmapped column entirely, however bad its contents', () => {
    const source: SourceRow[] = [{ line: 2, cells: { ...BASE, Junk: '=cmd|calc' } }];
    expect(validateRows(source, MAPPING, OPTIONS).rows[0]!.ok).toBe(true);
  });
});

describe('round trip', () => {
  it('exports a passport and reads it back to the same values', () => {
    const summary = validateRows(rows({}), MAPPING, OPTIONS);
    const csv = passportsToCsv([{ payload: summary.rows[0]!.payload! }], Object.values(MAPPING));

    const parsed = parseCsv(csv);
    const mapping = toMapping(inferMapping(parsed.headers));
    const reimported = validateRows(parsed.rows, mapping, OPTIONS);

    expect(reimported.rows[0]!.ok).toBe(true);
    expect(reimported.rows[0]!.payload).toEqual(summary.rows[0]!.payload);
  });

  it('writes the failures, with their reasons, as a file to fix and re-upload', () => {
    const source = rows({ GTIN: '5901234123456' }, {});
    const summary = validateRows(source, MAPPING, OPTIONS);
    const results = summary.rows.map((row) =>
      row.ok ? { ok: true, dppId: 'DPP-1' } : { ok: false, errors: row.errors },
    );

    const failures = collectFailures(
      source.map((row) => row.cells),
      results,
    );
    expect(failures).toHaveLength(1);

    const csv = failuresToCsv(Object.keys(BASE), failures);
    expect(csv).toContain('Import errors');
    expect(csv).toContain('should be 7');

    // The failures file re-imports: the operator fixes the cell and uploads it.
    const reparsed = parseCsv(csv);
    expect(reparsed.rows).toHaveLength(1);
    expect(reparsed.rows[0]!.cells.Style).toBe('A-100');
  });
});
