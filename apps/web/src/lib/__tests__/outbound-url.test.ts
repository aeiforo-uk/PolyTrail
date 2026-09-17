import { describe, expect, it } from 'vitest';
import { assertOutboundUrl, isPrivateHost } from '@/lib/security/outbound-url';

describe('isPrivateHost', () => {
  it.each([
    ['localhost'],
    ['app.localhost'],
    ['db.internal'],
    ['127.0.0.1'],
    ['10.0.0.5'],
    ['172.16.4.1'],
    ['172.31.255.254'],
    ['192.168.1.1'],
    ['0.0.0.0'],
    ['100.64.0.1'],
    ['[::1]'],
    ['[fd00::1]'],
    ['[fe80::1]'],
  ])('rejects %s', (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it('rejects the cloud metadata address specifically', () => {
    // This is the address SSRF is nearly always aimed at — it serves instance
    // credentials to anything on the box that asks.
    expect(isPrivateHost('169.254.169.254')).toBe(true);
  });

  it.each([['example.com'], ['8.8.8.8'], ['172.32.0.1'], ['192.169.0.1'], ['11.0.0.1']])(
    'allows %s',
    (host) => {
      expect(isPrivateHost(host)).toBe(false);
    },
  );

  it('is case-insensitive', () => {
    expect(isPrivateHost('LOCALHOST')).toBe(true);
  });
});

describe('assertOutboundUrl', () => {
  const strict = { allowInsecure: false };

  it('accepts a plain HTTPS URL and normalises it', () => {
    expect(assertOutboundUrl('https://example.com/hook', strict)).toBe('https://example.com/hook');
  });

  it('refuses plain HTTP in production mode', () => {
    expect(() => assertOutboundUrl('http://example.com', strict)).toThrow(/HTTPS/);
  });

  it('refuses credentials embedded in the URL', () => {
    // They leak into logs and referrer headers, and a secret in a URL is a
    // secret in somebody's analytics.
    expect(() => assertOutboundUrl('https://user:pw@example.com', strict)).toThrow(/credentials/);
  });

  it('refuses a private host', () => {
    expect(() => assertOutboundUrl('https://169.254.169.254/latest/meta-data', strict)).toThrow(
      /public internet/,
    );
  });

  it('refuses something that is not a URL at all', () => {
    expect(() => assertOutboundUrl('not a url', strict)).toThrow(/valid URL/);
    expect(() => assertOutboundUrl('', strict)).toThrow(/valid URL/);
  });

  it('allows localhost when insecure mode is explicitly on', () => {
    // Development only — an operator testing a connector against their laptop.
    expect(assertOutboundUrl('http://localhost:3000/hook', { allowInsecure: true })).toContain(
      'localhost',
    );
  });

  it('lets the caller supply its own scheme message', () => {
    expect(() =>
      assertOutboundUrl('http://example.com', { ...strict, httpsMessage: 'Webhooks must be HTTPS.' }),
    ).toThrow('Webhooks must be HTTPS.');
  });
});
