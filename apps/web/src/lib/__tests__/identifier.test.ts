import { describe, expect, it } from 'vitest';
import {
  formatDppId,
  generateDppId,
  isValidDppId,
  normalizeDppId,
  passportUrl,
} from '@/lib/passport/identifier';

describe('passport identifiers', () => {
  it('generates sixteen characters from the Crockford alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateDppId();
      expect(id).toHaveLength(16);
      // I, L, O and U are excluded: the first three are confusable with 1 and
      // 0 when read off a care label, and dropping U removes the only letter
      // set that reliably spells something offensive.
      expect(id).not.toMatch(/[ILOU]/);
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    }
  });

  it('does not collide across a large sample', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => generateDppId()));
    expect(ids.size).toBe(5000);
  });

  it('is not sequential — two consecutive ids share no long prefix', () => {
    const a = generateDppId();
    const b = generateDppId();
    let shared = 0;
    while (shared < 16 && a[shared] === b[shared]) shared++;
    expect(shared).toBeLessThan(6);
  });

  it('repairs the mistypes a human actually makes', () => {
    expect(normalizeDppId('abcd-efgh-jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
    // 0, O→0, 1, I→1, l→1, U→V
    expect(normalizeDppId('  0O1IlU  ')).toBe('00111V');
    expect(normalizeDppId('1234 5678 9ABC DEFG')).toBe('123456789ABCDEFG');
  });

  it('validates normalised ids', () => {
    const id = generateDppId();
    expect(isValidDppId(id)).toBe(true);
    expect(isValidDppId(formatDppId(id))).toBe(true);
    expect(isValidDppId('too-short')).toBe(false);
  });

  it('formats in groups of four so it can be read aloud', () => {
    expect(formatDppId('ABCDEFGH12345678')).toBe('ABCD-EFGH-1234-5678');
  });

  it('builds a passport URL without a double slash', () => {
    expect(passportUrl('ABCD', 'https://example.com/')).toBe('https://example.com/p/ABCD');
    expect(passportUrl('ABCD', 'https://example.com')).toBe('https://example.com/p/ABCD');
  });
});
