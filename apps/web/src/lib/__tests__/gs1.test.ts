import { describe, expect, it } from 'vitest';
import {
  buildDigitalLinkUri,
  buildLinkset,
  computeGtinCheckDigit,
  granularityOf,
  padGtin,
  parseDigitalLinkPath,
  validateGtin,
} from '@/lib/gs1/digital-link';

describe('GTIN check digits', () => {
  it.each([
    ['0871234567890', 6],
    ['0952012345678', 8],
    ['0000000000000', 0],
  ])('computes the check digit for %s', (body, expected) => {
    expect(computeGtinCheckDigit(body)).toBe(expected);
  });

  it('accepts a valid GTIN', () => {
    expect(validateGtin('08712345678906')).toMatchObject({ valid: true });
  });

  it('rejects a transposed digit and says why', () => {
    const result = validateGtin('08712345678905');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('mistyped');
  });

  it('rejects non-digits and over-length input', () => {
    expect(validateGtin('ABC').valid).toBe(false);
    expect(validateGtin('123456789012345').valid).toBe(false);
  });

  it('zero-pads shorter GTINs to 14', () => {
    expect(padGtin('12345678')).toHaveLength(14);
    expect(padGtin('12345678')).toBe('00000012345678');
  });
});

describe('granularity', () => {
  it('reads item from a serial, batch from a lot, model from neither', () => {
    expect(granularityOf({ gtin: '08712345678906', serialNumber: 'S1' })).toBe('item');
    expect(granularityOf({ gtin: '08712345678906', batchNumber: 'B1' })).toBe('batch');
    expect(granularityOf({ gtin: '08712345678906' })).toBe('model');
  });

  it('prefers item over batch when both are present', () => {
    expect(granularityOf({ gtin: '08712345678906', batchNumber: 'B1', serialNumber: 'S1' })).toBe(
      'item',
    );
  });
});

describe('Digital Link URIs', () => {
  const config = { resolverDomain: 'id.polytrail.eu' };

  it('builds a model-level URI', () => {
    expect(buildDigitalLinkUri({ gtin: '08712345678906' }, config)).toBe(
      'https://id.polytrail.eu/01/08712345678906',
    );
  });

  it('emits key qualifiers in AI order — batch before serial', () => {
    // GS1 requires this order; any other sequence produces a URI conformant
    // resolvers reject.
    const uri = buildDigitalLinkUri(
      { gtin: '08712345678906', serialNumber: 'S1', batchNumber: 'B1' },
      config,
    );
    expect(uri).toBe('https://id.polytrail.eu/01/08712345678906/10/B1/21/S1');
  });

  it('refuses an invalid GTIN rather than minting a bad link', () => {
    expect(() => buildDigitalLinkUri({ gtin: '08712345678905' }, config)).toThrow();
  });

  it('rejects a production date that is not YYMMDD', () => {
    expect(() =>
      buildDigitalLinkUri({ gtin: '08712345678906', productionDate: '2026-01-01' }, config),
    ).toThrow(/six digits/);
  });

  it('percent-encodes qualifier values', () => {
    const uri = buildDigitalLinkUri({ gtin: '08712345678906', batchNumber: 'A/B' }, config);
    expect(uri).toContain('/10/A%2FB');
  });

  it('strips a protocol and trailing slash from the resolver domain', () => {
    expect(
      buildDigitalLinkUri({ gtin: '08712345678906' }, { resolverDomain: 'https://id.example.com/' }),
    ).toBe('https://id.example.com/01/08712345678906');
  });
});

describe('parsing Digital Link paths', () => {
  it('round-trips a built URI', () => {
    const parsed = parseDigitalLinkPath('01/08712345678906/10/B1/21/S1');
    expect(parsed).toMatchObject({
      gtin: '08712345678906',
      batchNumber: 'B1',
      serialNumber: 'S1',
      granularity: 'item',
    });
  });

  it('returns null for anything not GTIN-keyed, so callers can fall through', () => {
    expect(parseDigitalLinkPath('8004/12345')).toBeNull();
    expect(parseDigitalLinkPath('')).toBeNull();
  });

  it('returns null for a bad check digit rather than resolving it', () => {
    expect(parseDigitalLinkPath('01/08712345678905')).toBeNull();
  });

  it('tolerates leading and trailing slashes', () => {
    expect(parseDigitalLinkPath('/01/08712345678906/')).toMatchObject({ granularity: 'model' });
  });
});

describe('linkset', () => {
  it('advertises the passport under GS1 link types', () => {
    const linkset = buildLinkset('https://example.com/p/ABC') as {
      linkset: Array<Record<string, unknown>>;
    };
    expect(linkset.linkset[0]!['https://gs1.org/voc/defaultLink']).toBeDefined();
  });
});
