-- DeepWork: the stand-and-walk reminder.
--
-- A desk job is a seated job, and the hours pass without a reason to stand up.
-- This reminder supplies one: a quote and a question during working hours,
-- answered from the card or from the desktop notification, with the bell
-- repeating until the user deals with it.
--
-- The four columns mirror the water reminder's shape on purpose. `movement_reminders`
-- starts at 1 because the reminder asks rather than announces — "Not now" and
-- "Snooze 10 min" are one click — and the cadence starts at 45 minutes, which is
-- long enough for a real block of work and short enough to interrupt a morning
-- spent in one position. An existing database gets the same defaults; nothing is
-- read from or written to any other row.
ALTER TABLE settings ADD COLUMN movement_reminders INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN movement_start TEXT DEFAULT '09:00';
ALTER TABLE settings ADD COLUMN movement_end TEXT DEFAULT '18:00';
ALTER TABLE settings ADD COLUMN movement_interval_minutes INTEGER DEFAULT 45;
