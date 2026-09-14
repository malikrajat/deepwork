# Changelog

All notable changes to DeepWork are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **Task list export to CSV** using [`rm-ng-export-to-csv`](https://www.npmjs.com/package/rm-ng-export-to-csv)
  - `Tasks → Export` opens a panel with quick date ranges (Today, Yesterday, Last 7 days,
    This week, This month, Last month, This year, All time) plus a custom start/end date.
  - Choose which date the range applies to — Deadline, Created date or Completion date — and filter
    by status and priority, with an option to include tasks that have no date in that field.
  - 24 columns per task: Date, Day, Week, Month, Task, Status, Priority, Quadrant, Deadline,
    Deadline Day, Days To Deadline, Overdue, Tags, Repeat, Description, Created/Completed date and
    time, Age In Days, Focus Sessions, Focus Minutes, On Today List and Task ID. Rows are ordered
    chronologically, so the sheet reads date by date.
  - Optional totals block (status counts, overdue, focus sessions/minutes, range, timestamp) and a
    live preview showing how many tasks and which columns will be written.
  - The file is named after the day it was generated (`export-2026-09-13.csv`) and written as UTF-8
    with a BOM so Excel shows accents and em dashes correctly.
  - New `TaskExportService`, `TaskExportPanelComponent` and `task-export` model/utility modules.

- **Eisenhower Matrix: resizable task list and collapsible panes**
  - Draggable divider between the quadrant board and the task list, with keyboard support
    (arrow keys, `Shift` for larger steps, `Home`/`End` for the limits) and double-click reset.
    The chosen width is persisted, clamped so the board always keeps usable space, and disabled on
    narrow screens where the layout stacks.
  - Collapse/expand chevrons for every quadrant and for the task list; collapsed quadrants remain
    valid drop targets and the collapsed list becomes a slim rail showing the unassigned count.
  - Every quadrant scrolls independently when it holds more tasks than fit: the grid rows are now
    height-constrained (`min-height: 0`) so a long list scrolls inside its quadrant instead of
    pushing the board past the window, with a thin themed scrollbar and contained overscroll.
  - Task cards now wrap titles onto two lines (with the full text on hover) and the CDK drag preview
    is wider and untruncated, so what you drag is readable.

- **Bulk task import from Excel (`.xlsx` / `.xlsm`) and CSV**
  - `Tasks → Import` opens a review panel: drag & drop or browse, validated preview table with
    per-row status (ready / warning / duplicate / skipped), column mapping, problem filter, and
    import progress.
  - Downloadable template named after the current day (`2026-09-13.xlsx`) with real Excel dropdowns
    for every enumerated option, the app's default values pre-selected on 25 blank rows, a frozen
    header, auto-filter, and an instructions sheet.
  - Template guidance: header hints (`Deadline (YYYY-MM-DD)`, `Repeat Days (Mon,Wed)`,
    `Tags (comma separated)`) plus an in-cell message on all 11 columns, and per-column validation
    (dropdowns, any-date rules, length caps) so Excel itself explains what to enter.
  - Template defaults: Priority `P3 — Medium`, Quadrant `Unassigned`, Status `To Do`,
    Repeat `No repeat`, Tags `task`, Add to Today `Yes`, and Deadline / Repeat End Date set to
    **today** as real Excel dates (`yyyy-mm-dd`).
  - Past deadlines are accepted and imported, flagged as warnings in the preview.
  - Flexible matching: header aliases (`Task`, `Due Date`, `Prio`, `Labels`, …), priority keywords
    and `1-4`, quadrant names / `Q1-Q4`, status and repeat keywords, ISO dates, Excel date serials
    and `Mon,Wed,Fri` repeat days.
  - Guard rails: rows with errors are never imported, duplicate titles, past deadlines and
    ambiguous dates are flagged, and nothing is written until the preview is confirmed.
  - New `TaskImportService`, `TaskImportPanelComponent`, and dependency-free `xlsx` / `zip` /
    `inflate` / `csv` utilities under `src/app/core/utils`, plus unit tests for each.

### Changed

- Export file name is now simply the day it was generated: `export-2026-09-13.csv`.
- Tauri window now sets `dragDropEnabled: false` so HTML5 drag & drop of spreadsheet files works
  in the packaged desktop app.

---

## [2.0.0] – 2026-08-29

### Changed

- Session-cycle indicators, long-break scheduling, and the cycle-complete celebration now use the configured **Sessions Until Long Break** value.

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
