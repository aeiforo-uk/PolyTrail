import { describe, expect, it } from 'vitest';
import { bytesHash, canonicalHash, canonicalJson, timingSafeEqual } from '@/lib/crypto/canonical';

describe('canonical JSON', () => {
  it('is independent of key order', () => {
    // This is the whole reason for canonicalisation: two systems that disagree
    // about key order must still agree about the hash.
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalHash({ b: 1, a: 2 })).toBe(canonicalHash({ a: 2, b: 1 }));
  });

  it('is sensitive to values and to nesting', () => {
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }));
    expect(canonicalHash({ a: { b: 1 } })).not.toBe(canonicalHash({ a: { b: '1' } }));
  });

  it('preserves array order, which is meaningful', () => {
    expect(canonicalHash([1, 2])).not.toBe(canonicalHash([2, 1]));
  });

  it('produces a 0x-prefixed 64-character hex digest', () => {
    expect(canonicalHash({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('refuses values JSON cannot represent', () => {
    expect(() => canonicalJson(undefined)).toThrow();
  });
});

describe('bytesHash', () => {
  it('hashes raw bytes', () => {
    expect(bytesHash(Buffer.from('hello'))).toMatch(/^0x[0-9a-f]{64}$/);
    expect(bytesHash(Buffer.from('a'))).not.toBe(bytesHash(Buffer.from('b')));
  });
});

describe('timingSafeEqual', () => {
  it('compares equal strings as equal', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
  });

  it('rejects different strings and different lengths', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
