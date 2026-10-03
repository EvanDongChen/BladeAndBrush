// Minimal migration runner: applies db/migrations/*.sql in order, once each.
// Usage: DATABASE_URL=postgres://... node db/migrate.mjs
// Never prints DATABASE_URL.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// Timescale cloud presents a certificate chain Node cannot verify against
// the system CA store, so verification is only enforced on verify-full.
// (pg >= 8.23 forces verify-full semantics for sslmode=require, hence the
// explicit ssl object and the stripped sslmode below.)
const verify = /(?:[?&])sslmode=verify-full(?:&|$)/.test(DATABASE_URL);
const sanitized = DATABASE_URL.replace(/[?&]sslmode=[^&]*/u, '').replace(/[?&]$/u, '');
const client = new pg.Client({
  connectionString: sanitized,
  ssl: { rejectUnauthorized: verify },
});
await client.connect();
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  const applied = new Set(
    (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );
  const files = (await readdir(root)).filter((f) => f.endsWith('.sql')).sort();
  let ran = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = await readFile(join(root, f), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    console.log(`applied ${f}`);
    ran += 1;
  }
  console.log(ran === 0 ? 'already up to date' : `done (${ran} migration${ran === 1 ? '' : 's'})`);
} finally {
  await client.end();
}
