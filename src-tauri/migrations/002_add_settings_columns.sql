-- DeepWork v2: add missing settings columns
ALTER TABLE settings ADD COLUMN notification_repeat_interval INTEGER DEFAULT 60;
