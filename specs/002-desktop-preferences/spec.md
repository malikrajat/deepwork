# Feature Specification: Desktop Preferences (start with system, always on top, mini widget)

**Feature branch**: `002-desktop-preferences`
**Status**: Implemented
**Created**: 2026-09-17

## Summary

Give the user control over how DeepWork sits on their desktop — whether it starts
with the computer, whether its window floats above other windows, and what happens
when it shrinks into the mini widget — and make the whole thing discoverable and
explainable, because "always on top" and "start with system" are not concepts most
people can be expected to already understand.

## User Scenarios & Testing

### Primary stories

1. **Choose at install time (Windows).** While installing, the user is asked
   whether DeepWork should start with Windows. Accepting creates the startup entry.
2. **Choose on first launch (all platforms).** The first time the desktop app runs,
   a dialog offers both options and explains the mini widget before the user
   discovers it by surprise.
3. **Change it later, from anywhere.** The two options are available in three
   places — the system tray menu, Settings, and the dashboard — and always agree
   with each other and with the real OS state.
4. **Understand what a setting does.** An ⓘ button next to each option explains it
   in plain language.
5. **Use the mini widget.** Minimising from the clock card produces a small,
   draggable, always-on-top widget; restoring returns the window to its original
   size and position and to the user's own always-on-top choice.

### Acceptance criteria

- **AC-1** Both preferences default to **off**; nothing changes without consent.
- **AC-2** Enabling *Start with system* creates a per-user autostart entry on
  Windows, Linux and macOS; disabling it removes it.
- **AC-3** The real OS state is authoritative. If the installer enabled startup, or
  the user removed the entry by hand, the in-app switch reflects reality on launch.
- **AC-4** A failed change never leaves a switch claiming a state that was not
  applied — the toggle rolls back and surfaces the error.
- **AC-5** Enabling *Always on top* keeps the main window above other windows and
  persists across restarts.
- **AC-6** The mini widget is always on top while open; leaving it restores the
  user's own *Always on top* preference rather than assuming "off".
- **AC-7** Leaving the mini widget restores the pre-widget window size, position and
  minimum size.
- **AC-8** The tray menu, Settings and the dashboard show the same state within one
  interaction; a tray change is persisted.
- **AC-9** Each option has an ⓘ explanation; the mini widget is explained in the
  first-run dialog, the dashboard panel and the clock card's minimise tooltip.
- **AC-10** Uninstalling on Windows removes the startup entry.
- **AC-11** Silent/passive installs never block on a prompt.
- **AC-12** The browser/PWA build renders the panel inert with an explanation,
  never shows the desktop onboarding dialog, and never throws.

### Out of scope

- A per-platform custom installer page (NSIS `template`) — the stock Tauri template
  plus `installerHooks` covers the requirement without forking the installer.
- Populating the OS "Open at login" list on macOS via `launchctl` — the LaunchAgent
  is picked up at next sign-in.

## Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | `AppSettings` gains `startWithSystem`, `alwaysOnTop`, `desktopPrefsPrompted` (migration `005_add_desktop_prefs.sql`). |
| FR-2 | Rust `autostart` module writes/removes the per-user startup entry. Value name `DeepWork` matches the NSIS `${PRODUCTNAME}` the uninstaller deletes. |
| FR-3 | Rust commands: `autostart_is_enabled`, `autostart_set_enabled`, `window_set_always_on_top`, `window_is_always_on_top`. |
| FR-4 | The tray menu gains checkable *Start with system* and *Always on top*; Rust flips the real state, then emits `autostart:on/off` / `aot:on/off` so the app can persist it. |
| FR-5 | A login-launched copy (`--autostart`) starts hidden in the system tray. |
| FR-6 | `DesktopPrefsService` is the single source of truth for both signals; every UI surface reads and writes through it. |
| FR-7 | The mini widget is always on top while open and hands the window back with the user's preference re-applied. |
| FR-8 | The widget relaxes and then restores the window minimum size (the configured 800×600 would otherwise clamp it). |
| FR-9 | `nsis/hooks.nsh` asks the startup question in `NSIS_HOOK_POSTINSTALL` for GUI installs only. |

## Key entities

- **AppSettings** — persisted preferences (SQLite `settings` row, id = 1).
- **Autostart entry** — an OS-level, per-user registration; the OS is the system of
  record.

## Success criteria

- All existing and new unit tests pass (386 tests / 32 files).
- `cargo check` is clean with no warnings.
- `tauri.conf.json` validates against the Tauri CLI schema.
- The NSIS hook compiles with `makensis`.
- The Windows installer builds and installs the startup prompt.

## Assumptions

- Both preferences are opt-in and reversible at any time.
- The app keeps its existing "system minimise goes to the tray" behaviour; the mini
  widget remains an explicit action from the clock card.
- Per-user (not machine-wide) startup is the correct scope, matching
  `installMode: currentUser`.

## Implementation notes

- **No new runtime dependency for autostart.** crates.io was unreachable, and
  `tauri-plugin-autostart` was not cached, so the feature is implemented natively
  with `winreg` (already in `Cargo.lock` as a transitive dependency), XDG files and
  a LaunchAgent plist.
- **Signal inputs are not resolvable under Vitest's JIT.** The project mandates
  `input()` (`docs/angular-best-practices.md`), so component templates that bind
  signal inputs cannot be rendered in unit tests — the same limitation already
  documented in `timeline-bar.component.spec.ts`. Component behaviour is covered by
  constructing components inside an injection context, with template affordances
  asserted against the source.
