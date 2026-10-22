-- A focus session remembers the work it paid for, even after that task is gone.
--
-- `sessions.task_id` is a foreign key with ON DELETE SET NULL, so deleting a
-- task used to erase the only link between a session and the task it was for:
-- the Time page would report those hours as untasked and the work's history
-- would lose them. The title is a snapshot written when the session is
-- recorded; the backfill attaches the sessions already in the database to the
-- name they were worked under. No session, duration or date is changed.

ALTER TABLE sessions ADD COLUMN task_title TEXT;

UPDATE sessions
SET task_title = (SELECT tasks.title FROM tasks WHERE tasks.id = sessions.task_id)
WHERE task_title IS NULL AND task_id IS NOT NULL;
