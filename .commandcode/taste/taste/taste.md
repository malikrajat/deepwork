# Taste
- Protects existing user data above all: version upgrades must never delete, reset, or silently alter existing records — only additive schema changes (ADD COLUMN + backfill UPDATE), no DROP/DELETE. Confidence: 0.75
- Expects claims about upgrade safety to be proven, not asserted — compare against the previously released version (byte-diff the old migrations, same bundle identifier / DB path / dependency versions) and actually rehearse the upgrade against a database built from real old data before saying it is safe. Confidence: 0.7
- Old records must remain *visible* in the new version, not merely present in the database — check the load/filter/upkeep path for anything that would hide or close them on first launch. Confidence: 0.6
- Prefers minimal, non-invasive changes: if nothing is actually broken, leave the code alone; only repair real breakage rather than refactoring or "improving" working behavior. Confidence: 0.7
- When temporary verification scripts/databases are created, they should live outside or be cleaned up from the repo working tree afterwards. Confidence: 0.5
- Reports problems by pasting raw build/tool/CI output verbatim (e.g. a bundler budget warning, a failed `tauri build` log) with little or no instruction attached, expecting the agent to diagnose the underlying cause rather than ask for repro steps. Confidence: 0.6
- Build/bundle-size warnings should be fixed at the root (trim or lazy-load the offending dependency) rather than silenced by raising the configured budget threshold. Confidence: 0.5
