import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';

/**
 * The regression this guards is a production build failure.
 *
 * `export const pool = createPool()` ran when this module was imported, so
 * importing anything that touches the database required a live
 * `DATABASE_URL`. Next.js imports every route module during "Collecting page
 * data" just to read its exported config, so the build died with
 * "DATABASE_URL is not set" on `/.well-known/did.json` — a route marked
 * `force-dynamic` that would never have run at build time.
 *
 * Both halves matter: importing must not connect, and a genuinely missing
 * database must still fail loudly rather than be swallowed.
 */
const saved = process.env.DATABASE_URL;

beforeEach(() => {
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  if (saved === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
});

describe('db client', () => {
  it('imports with no DATABASE_URL set', () => {
    // Reaching this line at all is the assertion: a throwing import would
    // have failed the file before any test ran.
    expect(db).toBeDefined();
  });

  it('still fails loudly, with the actionable message, on first use', () => {
    // Synchronously, from the proxy's get trap. Every call site is inside an
    // async function or a wrapped route handler, so it surfaces as a rejected
    // promise there rather than escaping.
    expect(() => db.execute('select 1' as never)).toThrow(/DATABASE_URL is not set/);
    expect(() => db.execute('select 1' as never)).toThrow(/\.env\.example/);
  });
});
