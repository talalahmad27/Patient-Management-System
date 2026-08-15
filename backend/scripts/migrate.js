#!/usr/bin/env node

/**
 * Migration runner.
 *
 * Usage:
 *   npm run migrate            — apply all pending migrations
 *   npm run migrate:status     — show which migrations have run vs. are pending
 *   npm run migrate:baseline   — one-time: mark every existing file as applied
 *                                without running it (for a DB where migrations
 *                                were already applied by hand)
 *
 * Each migration is applied inside its own transaction. If a migration fails,
 * it rolls back and the runner exits non-zero — no partial state.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function readMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function appliedFilenames(client) {
  const { rows } = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(rows.map((r) => r.filename));
}

async function status(client) {
  const files = readMigrationFiles();
  const applied = await appliedFilenames(client);

  console.log('\nMigration status:');
  for (const file of files) {
    const mark = applied.has(file) ? '  applied' : '  pending';
    console.log(`${mark}  ${file}`);
  }
  console.log(`\n${files.length} files, ${applied.size} applied, ${files.length - applied.size} pending\n`);
}

async function apply(client) {
  const files = readMigrationFiles();
  const applied = await appliedFilenames(client);
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('No pending migrations. Database is up to date.');
    return;
  }

  console.log(`Applying ${pending.length} migration(s)...\n`);

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  ${file} ... `);

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log('ok');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      console.error(`\n${file} failed: ${err.message}\n`);
      throw err;
    }
  }

  console.log('\nAll migrations applied.');
}

async function baseline(client) {
  const files = readMigrationFiles();
  const applied = await appliedFilenames(client);
  const toMark = files.filter((f) => !applied.has(f));

  if (toMark.length === 0) {
    console.log('Every migration file is already recorded. Nothing to baseline.');
    return;
  }

  console.log(
    `\nBaseline mode: marking ${toMark.length} file(s) as applied WITHOUT running them.`
  );
  console.log('Only run this on a database whose schema already matches these files.\n');

  await client.query('BEGIN');
  try {
    for (const file of toMark) {
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      console.log(`  marked  ${file}`);
    }
    await client.query('COMMIT');
    console.log('\nBaseline complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  const cmd = process.argv[2] || 'apply';

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Refusing to run.');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await ensureTrackingTable(client);

    if (cmd === 'apply') await apply(client);
    else if (cmd === 'status') await status(client);
    else if (cmd === 'baseline') await baseline(client);
    else {
      console.error(`Unknown command: ${cmd}`);
      console.error('Usage: migrate.js [apply|status|baseline]');
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
