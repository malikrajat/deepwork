-- DeepWork v2: track when a task was last changed.
-- The Tasks list sorts by this so the most recently touched task is on top,
-- whatever its status. Existing rows are backfilled from their completion or
-- creation time so nothing sorts as "never".

ALTER TABLE tasks ADD COLUMN updated_at TEXT;

UPDATE tasks
SET updated_at = COALESCE(completed_at, created_at)
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
