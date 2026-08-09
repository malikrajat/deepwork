# Changelog

All notable changes to DeepWork are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.1] – 2026-06-01

### Added

- **Mini Mode (Picture-in-Picture timer)**
  - New `UiService` with `enterMiniMode()` / `exitMiniMode()` methods
  - In Tauri: shrinks native window to 220 × 60 px, enables always-on-top, restores original size on exit
  - Draggable mini window via `startDragging()` Tauri API
  - Browser fallback: floating overlay clock when running outside Tauri
  - Mini-mode restored from keyboard shortcut `M` on the dashboard

- **Theme system**
  - Added `light` and `auto` theme options (previously only `dark`)
  - Theme switcher UI in Settings → Appearance
  - `applyTheme()` persists selection to `localStorage` and `data-theme` attribute

- **Timer daily session reset**
  - New `last_active_date` column in `timer_state` (DB migration updated)
  - Session count automatically resets to 0 at the start of each new day

- **Timer `onComplete` callback**
  - Dashboard subscribes to timer completion and fires confetti on full-cycle completion (work → long-break)

- **Improved notification messages**
  - `fireTimerComplete` now receives `nextType` and distinguishes between:
    - Full cycle complete ("Cycle complete! Time for a long break.")
    - Session complete ("Focus session complete! Time for a short break.")
    - Long-break end / short-break end

- **PWA support**
  - Added `public/manifest.webmanifest` and `public/sw.js`
  - New `InstallService` and `install-banner` component for browser install prompt

- **Tauri window management capabilities**
  - Added permissions: `set-always-on-top`, `set-decorations`, `set-size`, `set-resizable`, `start-dragging`, `toggle-maximize`, `close`, `destroy`, `hide`, `show`

- **macOS bundle config**
  - `minimumSystemVersion: "10.15"` (Catalina+)
  - Bundle targets changed from `["nsis", "msi"]` → `"all"` (builds .msi/.nsis on Windows, .dmg/.app on macOS, .deb/.AppImage on Linux)
  - NSIS installer icon set to `icons/icon.ico`

- **Tray icon fix**
  - Tray now uses the app's default window icon (`app.default_window_icon()`)
  - `window.unminimize()` called when restoring from tray

- **Assets pipeline**
  - Tauri icons (`icons/*.png`) now copied into Angular build output for PWA use

- **Release guide**
  - `README.md` now documents which 3 files to update when bumping the version

### Changed

- **Version**: `0.1.0` → `1.0.0`
- **Dev server port**: `4200` → `4999` (both `angular.json` and `tauri.conf.json`)
- **Window decorations**: `decorations: true` → `false` (frameless native window)
- **Default route**: Root path `""` now loads `DashboardComponent` directly; `/dashboard` redirects to `""`

### Fixed

- `TimerState` model missing `lastActiveDate` field — added to interface and DB read/write
- Settings not applying theme on load — `applyTheme()` called during `loadSettings()`

---

## [1.0.0] – previous release

- Stable release prior to 1.0.1

---

## [0.1.0] – initial release

- Pomodoro timer with animated circular clock
- Eisenhower Matrix task management
- Daily planner (Today's View)
- Habit tracking & journaling
- Analytics dashboard
- SQLite local database via Tauri plugin
- OS-native notifications with repeat-until-dismissed
- Glassmorphism dark UI
