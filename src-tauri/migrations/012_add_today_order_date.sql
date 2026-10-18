-- DeepWork: "Add to Today" is a one-day instruction.
--
-- `today_order` alone said a task belonged on the day's list, and it was
-- written once and never expired: a row imported with "Add to Today" = Yes on
-- the 1st was still on the board on the 18th. `today_order_date` is the local
-- day the star applies to, and a star from any other day is not today's.
--
-- The column is deliberately left NULL for existing rows. Those stars were set
-- under a rule that had no day to carry, so there is no honest date to backfill
-- them with; treating them as expired (and clearing them during the next daily
-- upkeep) is what puts Today back to today. No task is deleted or changed
-- beyond the expired star.

ALTER TABLE tasks ADD COLUMN today_order_date TEXT;
