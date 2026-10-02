-- DeepWork: whether a water reminder that arrives while the window is minimised
-- counts the glass by itself.
--
-- Minimising DeepWork is the user saying "leave me alone" — they are working in
-- another window. On (the default) the reminder rings, counts the glass at the
-- configured size and stays out of the way; off restores the older behaviour,
-- where the full window comes back with the question.

ALTER TABLE settings ADD COLUMN water_auto_log_when_minimized INTEGER DEFAULT 1;
