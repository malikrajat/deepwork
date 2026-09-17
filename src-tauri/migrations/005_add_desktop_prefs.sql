-- DeepWork: desktop preferences (start with system / always on top)
-- and the one-time "desktop preferences" onboarding flag.
ALTER TABLE settings ADD COLUMN start_with_system INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN always_on_top INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN desktop_prefs_prompted INTEGER DEFAULT 0;
