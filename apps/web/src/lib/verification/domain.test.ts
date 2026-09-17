import { describe, expect, it } from 'vitest';
import {
  challengeRecordName,
  checkDomainChallenge,
  generateDomainChallenge,
  isValidDomain,
  normalizeDomain,
} from './domain';
import { LEVEL_DEFINITIONS, atLeast, rankOf } from './types';

describe('domain normalisation', () => {
  it.each([
    ['https://www.Example.com/passports', 'example.com'],
    ['EXAMPLE.CO.UK.', 'example.co.uk'],
    ['  sub.example.com  ', 'sub.example.com'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(['example.com', 'sub.example.co.uk', 'a-b.example.org'])('accepts %s', (domain) => {
    expect(isValidDomain(domain)).toBe(true);
  });

  it.each(['example', 'exa mple.com', '-example.com', 'example.c'])('rejects %s', (domain) => {
    expect(isValidDomain(domain)).toBe(false);
  });
});

describe('challenge', () => {
  it('is scoped so it cannot collide with SPF or DKIM', () => {
    expect(challengeRecordName('example.com')).toBe('_polytrail.example.com');
  });

  it('is prefixed so a DNS administrator can tell what it is', () => {
    expect(generateDomainChallenge()).toMatch(/^polytrail-site-verification=[\w-]{20,}$/);
  });

  it('is different every time', () => {
    expect(generateDomainChallenge()).not.toBe(generateDomainChallenge());
  });
});

describe('DNS check', () => {
  const expected = 'polytrail-site-verification=abc123';

  it('verifies when the record is present', async () => {
    const result = await checkDomainChallenge('example.com', expected, async () => [[expected]]);
    expect(result.outcome).toBe('verified');
  });

  it('joins a TXT record that the resolver split into chunks', async () => {
    // A value over 255 bytes arrives in pieces, and this is the classic reason
    // a correct record "does not verify".
    const result = await checkDomainChallenge('example.com', expected, async () => [
      [expected.slice(0, 10), expected.slice(10)],
    ]);
    expect(result.outcome).toBe('verified');
  });

  it('reports a mismatch separately from a missing record', async () => {
    const result = await checkDomainChallenge('example.com', expected, async () => [
      ['polytrail-site-verification=something-else'],
    ]);
    expect(result.outcome).toBe('mismatch');
    expect(result.found).toHaveLength(1);
  });

  it('tells the operator to wait when nothing is there yet', async () => {
    const result = await checkDomainChallenge('example.com', expected, async () => {
      const error: NodeJS.ErrnoException = new Error('queryTxt ENOTFOUND');
      error.code = 'ENOTFOUND';
      throw error;
    });
    expect(result.outcome).toBe('not_found');
    expect(result.detail).toContain('propagate');
  });

  it('distinguishes our problem from theirs', async () => {
    const result = await checkDomainChallenge('example.com', expected, async () => {
      const error: NodeJS.ErrnoException = new Error('SERVFAIL');
      error.code = 'SERVFAIL';
      throw error;
    });
    expect(result.outcome).toBe('lookup_failed');
    expect(result.detail).toContain('not with your record');
  });

  it('treats an empty answer as not found', async () => {
    const result = await checkDomainChallenge('example.com', expected, async () => []);
    expect(result.outcome).toBe('not_found');
  });
});

describe('the ladder', () => {
  it('is ordered', () => {
    expect(rankOf('unverified')).toBeLessThan(rankOf('email_confirmed'));
    expect(rankOf('document_verified')).toBeLessThan(rankOf('qualified_seal'));
    expect(atLeast('domain_verified', 'email_confirmed')).toBe(true);
    expect(atLeast('email_confirmed', 'domain_verified')).toBe(false);
  });

  it('caps the qualified seal at the three years eIDAS permits', () => {
    expect(LEVEL_DEFINITIONS.qualified_seal.validForDays).toBe(1095);
  });

  it('says out loud that the qualified seal is not implemented', () => {
    // The one assertion in this file that is about honesty rather than logic.
    // If somebody flips this flag without obtaining a certificate, this fails.
    expect(LEVEL_DEFINITIONS.qualified_seal.implemented).toBe(false);
    expect(LEVEL_DEFINITIONS.domain_verified.implemented).toBe(true);
  });
});
