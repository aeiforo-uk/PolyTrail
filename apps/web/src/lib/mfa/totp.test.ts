import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateTotpSecret,
  hotp,
  totp,
  verifyTotp,
} from './totp';
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './recovery';

/**
 * RFC 6238 Appendix B.
 *
 * The published vectors use the ASCII seed "12345678901234567890" and eight
 * digits. Passing them is the difference between an implementation that works
 * and one that merely produces six plausible digits — the truncation offset and
 * the 64-bit counter are both easy to get subtly wrong in a way no smoke test
 * would catch.
 */
const SHA1_SEED = Buffer.from('12345678901234567890', 'ascii');

describe('RFC 6238 test vectors', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('produces the published code at T=%i', (now, expected) => {
    expect(totp(SHA1_SEED, { now, digits: 8, algorithm: 'SHA1' })).toBe(expected);
  });
});

describe('RFC 4226 HOTP vectors', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [4, '338314'],
    [5, '254676'],
    [6, '287922'],
    [7, '162583'],
    [8, '399871'],
    [9, '520489'],
  ])('produces the published code at counter %i', (counter, expected) => {
    expect(hotp(SHA1_SEED, counter)).toBe(expected);
  });
});

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0x7f, 0x80, 0x01, 0x42]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('matches RFC 4648 vectors', () => {
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ');
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('tolerates the spacing and case an authenticator app displays', () => {
    expect(base32Decode('mzxw 6ytb-oi')).toEqual(Buffer.from('foobar'));
  });

  it('rejects a character outside the alphabet', () => {
    expect(() => base32Decode('MZXW6YT1')).toThrow(/not a base32 character/);
  });

  it('generates a 160-bit secret', () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });
});

describe('verification window', () => {
  const now = 1_700_000_000;

  it('accepts the current code', () => {
    const code = totp(SHA1_SEED, { now });
    expect(verifyTotp(SHA1_SEED, code, { now })).toMatchObject({ valid: true, offset: 0 });
  });

  it('accepts one step either side, for clock drift', () => {
    expect(verifyTotp(SHA1_SEED, totp(SHA1_SEED, { now: now - 30 }), { now })).toMatchObject({
      valid: true,
      offset: -1,
    });
    expect(verifyTotp(SHA1_SEED, totp(SHA1_SEED, { now: now + 30 }), { now })).toMatchObject({
      valid: true,
      offset: 1,
    });
  });

  it('refuses two steps away', () => {
    expect(verifyTotp(SHA1_SEED, totp(SHA1_SEED, { now: now - 90 }), { now }).valid).toBe(false);
  });

  it('ignores the spacing people paste', () => {
    const code = totp(SHA1_SEED, { now });
    expect(verifyTotp(SHA1_SEED, `${code.slice(0, 3)} ${code.slice(3)}`, { now }).valid).toBe(true);
  });

  it('refuses anything that is not the right number of digits', () => {
    expect(verifyTotp(SHA1_SEED, '12345', { now }).valid).toBe(false);
    expect(verifyTotp(SHA1_SEED, 'abcdef', { now }).valid).toBe(false);
    expect(verifyTotp(SHA1_SEED, '', { now }).valid).toBe(false);
  });
});

describe('otpauth URI', () => {
  it('names the issuer in both places apps look', () => {
    const uri = buildOtpAuthUri({
      secret: 'JBSWY3DPEHPK3PXP',
      account: 'ada@example.com',
      issuer: 'Polytrail',
    });
    expect(uri).toContain('otpauth://totp/Polytrail:ada%40example.com?');
    expect(uri).toContain('issuer=Polytrail');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

describe('recovery codes', () => {
  it('issues ten codes and stores only their digests', () => {
    const { plaintext, stored } = generateRecoveryCodes();
    expect(plaintext).toHaveLength(10);
    expect(stored).toHaveLength(10);
    for (const code of plaintext) {
      expect(stored.some((entry) => entry.h === hashRecoveryCode(code))).toBe(true);
      // The point of the design: nothing recoverable is written down.
      expect(stored.some((entry) => entry.h.includes(code.replace(/-/g, '')))).toBe(false);
    }
  });

  it('spends a code once and refuses it afterwards', () => {
    const { plaintext, stored } = generateRecoveryCodes();
    const first = plaintext[0]!;

    const attempt = consumeRecoveryCode(stored, first);
    expect(attempt.matched).toBe(true);
    expect(attempt.remaining).toBe(9);

    const replay = consumeRecoveryCode(attempt.next, first);
    expect(replay.matched).toBe(false);
  });

  it('refuses a code that was never issued', () => {
    const { stored } = generateRecoveryCodes();
    expect(consumeRecoveryCode(stored, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ').matched).toBe(false);
  });

  it('forgives the characters people mistype off paper', () => {
    // I and L read as 1, O as 0, U as V — the four characters the alphabet
    // deliberately does not contain.
    expect(normalizeRecoveryCode('ilo u-1234')).toBe('110V1234');
  });
});
