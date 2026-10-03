-- DeepWork: the water log, and the preferences for the water reminder.
--
-- One row per drink rather than a running total: the total can be summed, and a
-- mistyped entry can be removed again, which a single counter column could not
-- undo. `logged_at` is an ISO 8601 UTC instant like every other timestamp here.

CREATE TABLE IF NOT EXISTS water_intake (
    id TEXT PRIMARY KEY,
    amount_ml INTEGER NOT NULL CHECK (amount_ml > 0),
    logged_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_water_intake_logged_at ON water_intake(logged_at);

-- Off by default: nothing starts reminding the user until they ask for it.
ALTER TABLE settings ADD COLUMN water_reminders INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN water_start TEXT DEFAULT '09:00';
ALTER TABLE settings ADD COLUMN water_end TEXT DEFAULT '18:00';
ALTER TABLE settings ADD COLUMN water_interval_minutes INTEGER DEFAULT 60;
ALTER TABLE settings ADD COLUMN water_amount_ml INTEGER DEFAULT 500;
ALTER TABLE settings ADD COLUMN water_goal_ml INTEGER DEFAULT 2000;
