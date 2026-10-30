import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The database's upgrade path, pinned down.
 *
 * A user's tasks, sessions and settings exist only in `deepwork.db`, and every
 * release has to carry them forward. That is a property of the migrations, not of
 * a promise in a changelog: the list below is checked for the two ways a patch
 * release can lose data — a migration that deletes rather than adds, and a SQL
 * file the Rust registration forgets to include (which would silently skip it on
 * an upgrade and apply it only on a fresh install).
 */
const MIGRATIONS_DIR = resolve(__dirname, '../../src-tauri/migrations');
const REGISTRATION = resolve(__dirname, '../../src-tauri/src/db_migrations.rs');

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const registration = readFileSync(REGISTRATION, 'utf8');

/** The version each file declares in its name, as a number. */
function versionOf(file: string): number {
  const match = /^(\d{3})_.+\.sql$/.exec(file);
  expect(match, `${file} is not named <version>_<description>.sql`).not.toBeNull();
  return Number(match![1]);
}

describe('database migrations', () => {
  it('are numbered in one unbroken run from 1', () => {
    const versions = files.map(versionOf);
    expect(versions).toEqual(versions.map((_, index) => index + 1));
  });

  it('are all registered in the Rust migration list', () => {
    // A file nobody includes is a migration that never runs on an existing
    // database — the one failure that looks fine in development (a fresh
    // database gets every migration from sqlx) and breaks an upgrade.
    for (const file of files) {
      expect(registration, `${file} is missing from MIGRATIONS`).toContain(`../migrations/${file}`);
    }
  });

  it('only add to the schema — nothing a patch release can lose data with', () => {
    for (const file of files) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');

      // `DROP TABLE`, `DROP COLUMN`, `DELETE FROM` and `TRUNCATE` are the
      // statements that remove what a user already has. `ON DELETE SET NULL`
      // and `ON DELETE CASCADE` are foreign-key actions, not migrations, so the
      // pattern is anchored to a statement rather than to the words.
      expect(sql, `${file} drops or deletes data`).not.toMatch(
        /^\s*(?:DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE)\b/im,
      );
    }
  });

  it('change rows only to fill a new column, never to replace a value', () => {
    // The `UPDATE`s this app has shipped backfill a column they just added
    // (`updated_at`, `task_title`, the day stamp), and one rewrites the old
    // `tray_behavior` default. What must not appear is an unconditional update
    // that overwrites the user's own data.
    for (const file of files) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
      const updates = sql.match(/^\s*UPDATE\s+[^;]+;/gim) ?? [];
      for (const update of updates) {
        expect(update, `${file} has an UPDATE with no WHERE clause`).toMatch(/\bWHERE\b/i);
      }
    }
  });
});
