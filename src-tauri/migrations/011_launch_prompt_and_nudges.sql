-- DeepWork: the first-run "start with Windows" question, and the two reminders
-- that follow it.
--
-- `launch_prompted` is the dialog: 0 until it has been shown, and never reset.
-- The two nudge flags are the reminders that replace it once it has been
-- answered with "not now"; they can be turned off from Settings, which is the
-- only way a reminder like this should ever be able to end for good.
ALTER TABLE settings ADD COLUMN launch_prompted INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN startup_nudge INTEGER DEFAULT 1;
ALTER TABLE settings ADD COLUMN taskbar_pin_nudge INTEGER DEFAULT 1;
