-- DeepWork v2: calendar reminders (5 minutes before a scheduled task starts and ends).

ALTER TABLE settings ADD COLUMN calendar_reminders INTEGER DEFAULT 1;
