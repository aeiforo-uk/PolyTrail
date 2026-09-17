import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Apply every SQL file in drizzle/ in filename order, recording what ran.
 *
 * Deliberately not drizzle-kit's own migrator: this runs in production against
 * a pooled connection, needs to be idempotent, and has to be readable by a
 * customer's DBA before they let it touch their database.
 */
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'drizzle');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    filename  text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const { rows } = await client.query('SELECT filename FROM _migrations');
const applied = new Set(rows.map((r) => r.filename));

const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith('.sql'))
  .sort();

let count = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(join(migrationsDir, file), 'utf8');
  process.stdout.write(`  applying ${file} ... `);
  try {
    await client.query('BEGIN');
    // drizzle-kit separates statements with this marker; splitting on it keeps
    // multi-statement DDL (functions, DO blocks) intact.
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await client.query(trimmed);
    }
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log('ok');
    count++;
  } catch (error) {
    await client.query('ROLLBACK');
    console.log('FAILED');
    console.error(`\n${file}:\n${error.message}\n`);
    await client.end();
    process.exit(1);
  }
}

console.log(count === 0 ? 'Database is up to date.' : `Applied ${count} migration(s).`);
await client.end();
