// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * An upgrade is not a promise in a changelog: it is every migration applied to
 * the database that already holds the user's work.
 *
 * `migrations.spec.ts` checks the shape of the SQL (additive, registered). This
 * test runs it: an in-memory database is brought to the schema the previous
 * release shipped, the user's rows are written, and the remaining migrations
 * are applied the way sqlx would on first launch after an update. Every value
 * that existed before must still be there afterwards.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../src-tauri/migrations');

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({
    version: Number(/^(\d{3})_/.exec(name)?.[1]),
    name,
    sql: readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8'),
  }));

/** Applies the first `through` migrations, in the order Rust registers them. */
function migratedDatabase(through: number): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of migrations) {
    if (migration.version <= through) db.exec(migration.sql);
  }
  return db;
}

describe('database upgrade', () => {
  it('keeps every row an existing database already has', () => {
    // 12 is the schema an older install may still have; 13 and 14 are the
    // migrations that arrive with this release. Seeding before them is the
    // point: the backfill in 13 has rows to read, exactly as it did on a real
    // upgrade.
    const db = migratedDatabase(12);

    db.exec(`
      INSERT INTO tasks (id, title, description, priority, status, quadrant, deadline, tags, created_at)
      VALUES ('task-1', 'Quarterly report', 'The north region draft', 2, 'in-progress',
              'important', '2026-11-20', '["work","report"]', '2026-11-01T09:00:00.000Z');

      INSERT INTO sessions
        (id, task_id, type, duration_planned, duration_actual, started_at, completed_at, interrupted)
      VALUES ('session-1', 'task-1', 'work', 1500, 1500,
              '2026-11-12T09:00:00.000Z', '2026-11-12T09:25:00.000Z', 0);

      INSERT INTO habits (id, name, icon, target_frequency, created_at)
      VALUES ('habit-1', 'Read 20 pages', 'book', 'daily', '2026-10-01T08:00:00.000Z');

      INSERT INTO habit_entries (id, habit_id, completed_at)
      VALUES ('entry-1', 'habit-1', '2026-11-12T07:30:00.000Z');

      INSERT INTO journal_entries (id, date, content, created_at, updated_at)
      VALUES ('journal-1', '2026-11-12', 'A good day of deep work.',
              '2026-11-12T20:00:00.000Z', '2026-11-12T20:00:00.000Z');
    `);

    for (const migration of migrations) {
      if (migration.version > 12) db.exec(migration.sql);
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task-1') as Record<
      string,
      unknown
    >;
    expect(task.title).toBe('Quarterly report');
    expect(task.description).toBe('The north region draft');
    expect(task.priority).toBe(2);
    expect(task.status).toBe('in-progress');
    expect(task.quadrant).toBe('important');
    expect(task.deadline).toBe('2026-11-20');
    expect(task.tags).toBe('["work","report"]');

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session-1') as Record<
      string,
      unknown
    >;
    expect(session.task_id).toBe('task-1');
    expect(session.duration_actual).toBe(1500);
    expect(session.task_title).toBe('Quarterly report');

    expect(
      (db.prepare('SELECT COUNT(*) AS count FROM habits').get() as { count: number }).count,
    ).toBe(1);
    expect(
      (db.prepare('SELECT COUNT(*) AS count FROM habit_entries').get() as { count: number }).count,
    ).toBe(1);

    const journal = db
      .prepare('SELECT content FROM journal_entries WHERE id = ?')
      .get('journal-1') as { content: string };
    expect(journal.content).toBe('A good day of deep work.');

    // The new reminder's defaults are added without touching the rest of the
    // settings row.
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<
      string,
      unknown
    >;
    expect(settings.movement_reminders).toBe(1);
    expect(settings.movement_interval_minutes).toBe(45);
    expect(settings.sessions_before_long_break).toBe(4);

    db.close();
  });

  it('builds the current schema from an empty database', () => {
    const db = migratedDatabase(Number.POSITIVE_INFINITY);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    for (const table of [
      'tasks',
      'sessions',
      'habits',
      'habit_entries',
      'journal_entries',
      'settings',
      'timer_state',
      'water_intake',
    ]) {
      expect(tables, `${table} is missing from a fresh database`).toContain(table);
    }

    db.close();
  });
});
