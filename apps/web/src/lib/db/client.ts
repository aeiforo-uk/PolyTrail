import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  var __polytrailPool: Pool | undefined;
}

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
 * Process-wide connection pool.
 *
 * Cached on `globalThis` so Next.js hot-reloads in development reuse a single
 * pool instead of leaking one per module evaluation.
 */
export const pool: Pool = globalThis.__polytrailPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalThis.__polytrailPool = pool;

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Db = typeof db;
export { schema };
