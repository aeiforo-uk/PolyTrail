import { beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, resetKeyCache } from './crypto';
import { fieldValue, flattenRecord, select, selectOne, selectRecords } from './selector';
import { assertFetchableUrl } from './rest';

/**
 * The record selector is what an operator types into a text box while reading
 * somebody else's API document, so the shapes tested here are the shapes those
 * documents actually describe.
 */
describe('record selector', () => {
  const body = {
    data: {
      items: [
        { id: '1', title: 'Merino crew', variants: [{ sku: 'A-1', barcode: '5901234123457' }] },
        { id: '2', title: 'Linen shirt', variants: [{ sku: 'B-1' }] },
      ],
      next: 'cursor-2',
    },
  };

  it('reads a dotted path', () => {
    expect(selectOne(body, 'data.next')).toBe('cursor-2');
  });

  it('reads a JSONPath-style root', () => {
    expect(select(body, '$.data.items[*]')).toHaveLength(2);
  });

  it('reads an index', () => {
    expect(selectOne(body, 'data.items[0].title')).toBe('Merino crew');
  });

  it('finds records under a selector', () => {
    expect(selectRecords(body, 'data.items').map((r) => r.id)).toEqual(['1', '2']);
  });

  it('treats a bare array body as the list', () => {
    expect(selectRecords([{ id: 'x' }, { id: 'y' }], '')).toHaveLength(2);
  });

  it('treats a single object as one record rather than none', () => {
    expect(selectRecords({ id: 'only' }, '')).toHaveLength(1);
  });

  it('returns nothing for a path that matches nothing, rather than throwing', () => {
    expect(selectRecords(body, 'data.nope[*]')).toEqual([]);
    expect(selectOne(body, 'a.b.c')).toBeUndefined();
  });
});

describe('flattening a record', () => {
  it('turns nesting into dotted column names', () => {
    expect(flattenRecord({ attributes: { style: 'A-1' }, title: 'Crew' })).toEqual({
      'attributes.style': 'A-1',
      title: 'Crew',
    });
  });

  it('joins an array of scalars into one cell', () => {
    expect(flattenRecord({ markets: ['DE', 'FR'] })).toEqual({ markets: 'DE; FR' });
  });

  it('numbers an array of objects so each field is addressable', () => {
    expect(flattenRecord({ variants: [{ sku: 'A' }, { sku: 'B' }] })).toEqual({
      'variants.0.sku': 'A',
      'variants.1.sku': 'B',
    });
  });

  it('renders null as an empty cell rather than the word null', () => {
    expect(flattenRecord({ gtin: null })).toEqual({ gtin: '' });
  });

  it('reads one mapped field out of a record', () => {
    expect(fieldValue({ variants: [{ barcode: '5901234123457' }] }, 'variants[0].barcode')).toBe(
      '5901234123457',
    );
  });
});

describe('credential encryption', () => {
  beforeEach(() => {
    process.env.CONNECTOR_SECRET = 'a'.repeat(48);
    resetKeyCache();
  });

  it('round-trips a token', () => {
    const envelope = encryptSecret('shpat_example_token');
    expect(decryptSecret(envelope)).toBe('shpat_example_token');
  });

  it('never stores the plaintext in the envelope', () => {
    expect(encryptSecret('shpat_example_token')).not.toContain('shpat');
  });

  it('uses a fresh nonce each time, so two encryptions differ', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  // The authentication tag is the point: an edited row must fail, not decrypt
  // to something that looks like a credential.
  it('refuses a tampered envelope', () => {
    const [version, iv, tag, ciphertext] = encryptSecret('token').split('.');
    /*
     * Tamper with the *first* base64 character, not the last.
     *
     * The final character of a base64url string carries only as many
     * significant bits as the payload length leaves it — for a five-byte
     * ciphertext, four — and the rest are discarded on decode. Flipping it
     * therefore changed nothing at all whenever it landed on one of the four
     * characters sharing the same significant bits, so this test failed for
     * about 6% of randomly generated IVs: an intermittent red build that
     * looked like a flaky crypto primitive rather than a flaky assertion.
     * Every bit of the first character survives the round trip.
     */
    const flipped = (ciphertext!.startsWith('A') ? 'B' : 'A') + ciphertext!.slice(1);
    expect(() => decryptSecret([version, iv, tag, flipped].join('.'))).toThrow();
  });

  it('refuses an envelope from an unknown format', () => {
    expect(() => decryptSecret('v9.a.b.c')).toThrow(/format/);
  });
});

describe('connector URL checks', () => {
  it('accepts an https endpoint', () => {
    expect(assertFetchableUrl('https://api.example.com/v1/products').hostname).toBe(
      'api.example.com',
    );
  });

  it('rejects something that is not a URL', () => {
    expect(() => assertFetchableUrl('not a url')).toThrow();
  });

  it('rejects credentials smuggled into the URL', () => {
    expect(() => assertFetchableUrl('https://user:pass@api.example.com/')).toThrow(/credentials/);
  });
});
