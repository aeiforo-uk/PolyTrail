import 'server-only';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  var __polytrailPool: Pool | undefined;
}

/**
 * The database handle.
 *
 * Connecting is deferred until the first query rather than done when this
 * module is imported. That is not a micro-optimisation — it is the difference
 * between a build that needs a database and one that does not.
 *
 * `export const pool = createPool()` ran at import time, so *importing* any
 * module that touches the database demanded a live `DATABASE_URL`. Next.js
 * imports every route module during "Collecting page data" purely to read its
 * exported config — `dynamic`, `revalidate` — so a production build failed
 * with "DATABASE_URL is not set" even for routes marked `force-dynamic` that
 * would never run at build time. Building an artefact and running it are
 * different environments and the build has no business holding a connection.
 *
 * The same side effect made the library untestable without a dummy connection
 * string, which is why one test file sets a fake `DATABASE_URL` just to import
 * a module whose assertions never reach the database.
 *
 * The error still fires, loudly and with the same message — just at the first
 * query, where a missing database is genuinely a problem, rather than at
 * import, where it is not.
 */

export type Db = NodePgDatabase<typeof schema>;

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres 16+ instance.',
    );
  }
  return new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: true } : undefined,
  });
}

/**
 * Process-wide pool, cached on `globalThis` so Next.js hot-reloads in
 * development reuse one instead of leaking a pool per module evaluation.
 */
function getPool(): Pool {
  const existing = globalThis.__polytrailPool;
  if (existing) return existing;

  const created = createPool();
  if (process.env.NODE_ENV !== 'production') globalThis.__polytrailPool = created;
  return created;
}

let instance: Db | undefined;

function getDb(): Db {
  instance ??= drizzle(getPool(), { schema, casing: 'snake_case' });
  return instance;
}

/**
 * A stand-in that builds the real handle on first use.
 *
 * A proxy rather than a `getDb()` call at all 53 call sites: the indirection
 * belongs in one file, not spread across every query in the product. Methods
 * are bound to the real instance so Drizzle's internal `this` still resolves.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const real = getDb();
    const value = Reflect.get(real, property, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

/** The underlying pool, for the rare caller that needs raw access. */
export function pool(): Pool {
  return getPool();
}

export { schema };
