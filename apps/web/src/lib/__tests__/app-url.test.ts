import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * The regression this guards is a production build failure, not a style point.
 *
 * `NEXT_PUBLIC_APP_URL=""` — a defined-but-blank variable, which is what an
 * unfilled field in a hosting dashboard produces — slipped past every
 * `?? 'http://localhost:3000'` in the codebase, because `??` falls back on
 * nullish values and an empty string is neither. The root layout then called
 * `new URL('')`, which threw `ERR_INVALID_URL` and failed the build while
 * collecting `/_not-found`.
 */

const ENV_KEYS = ['NEXT_PUBLIC_APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** Imported fresh each time, since the module reads `process.env` when called. */
async function appUrl() {
  const mod = await import('@/lib/app-url');
  return mod.appUrl();
}

describe('appUrl', () => {
  it('falls back when the variable is blank, not merely absent', async () => {
    // The bug, exactly: these three were treated differently and must not be.
    process.env.NEXT_PUBLIC_APP_URL = '';
    expect(await appUrl()).toBe('http://localhost:3000');

    process.env.NEXT_PUBLIC_APP_URL = '   ';
    expect(await appUrl()).toBe('http://localhost:3000');

    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(await appUrl()).toBe('http://localhost:3000');
  });

  it('never returns a value that new URL() would reject', async () => {
    for (const value of ['', '   ', 'not a url', '///', 'https://']) {
      process.env.NEXT_PUBLIC_APP_URL = value;
      const resolved = await appUrl();
      expect(() => new URL(resolved)).not.toThrow();
    }
  });

  it('uses an explicit value and strips trailing slashes', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://passport.aeiforo.co.uk///';
    expect(await appUrl()).toBe('https://passport.aeiforo.co.uk');
  });

  it('assumes https for a bare domain, as a dashboard field usually holds', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'passport.aeiforo.co.uk';
    expect(await appUrl()).toBe('https://passport.aeiforo.co.uk');
  });

  it('prefers the production domain over the per-deployment URL', async () => {
    // A passport link is printed on a garment label and has to keep resolving
    // after the next deploy; VERCEL_URL changes every time.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'polytrail.vercel.app';
    process.env.VERCEL_URL = 'polytrail-git-abc123.vercel.app';
    expect(await appUrl()).toBe('https://polytrail.vercel.app');
  });

  it('prefers an explicit setting over anything the platform supplies', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://passport.aeiforo.co.uk';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'polytrail.vercel.app';
    expect(await appUrl()).toBe('https://passport.aeiforo.co.uk');
  });

  it('falls through a blank explicit value to the platform domain', async () => {
    process.env.NEXT_PUBLIC_APP_URL = '';
    process.env.VERCEL_URL = 'polytrail-git-abc123.vercel.app';
    expect(await appUrl()).toBe('https://polytrail-git-abc123.vercel.app');
  });
});
