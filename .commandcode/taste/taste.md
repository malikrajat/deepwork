# Taste

## Data safety & migrations
- Protects existing user data above all: version upgrades must never delete, reset, or silently alter existing records — only additive schema changes (ADD COLUMN + backfill UPDATE), no DROP/DELETE. Confidence: 0.75
- Expects claims about upgrade safety to be proven, not asserted — compare against the previously released version (byte-diff the old migrations, same bundle identifier / DB path / dependency versions) and actually rehearse the upgrade against a database built from real old data before saying it is safe. Confidence: 0.7
- Old records must remain *visible* in the new version, not merely present in the database — check the load/filter/upkeep path for anything that would hide or close them on first launch. Confidence: 0.6

## Workflow & scope
- Prefers minimal, non-invasive changes: if nothing is actually broken, leave the code alone; only repair real breakage rather than refactoring or "improving" working behavior. Confidence: 0.7
- When temporary verification scripts/databases are created, they should live outside or be cleaned up from the repo working tree afterwards. Confidence: 0.5
