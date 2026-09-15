# Changelog

All notable changes to DeepWork are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **Calendar reminders: 5 minutes before a scheduled task starts and before it ends**
  - The app now watches today's timeline and fires an OS notification plus an in-app toast at
    `start − 5 min` and `end − 5 min` for every placed task, so a block neither starts late nor
    overruns into the break.
  - Each reminder fires once per day; the fired log is persisted, so restarting the app does not
    replay the morning. Reminders always follow the real today, not the day being browsed.
  - New `calendarReminders` setting (migration `004_add_calendar_reminders.sql`) with a switch and a
    **Test** button in Settings → Notifications.
  - `CalendarReminderService` plus `NotificationService.fireReminder()`; the lead time lives in
    `CALENDAR_REMINDER_LEAD_MINUTES`.

- **Analytics rebuilt around decisions, not decoration**
  - New pure `insights.util.ts` engine; everything on the page is derived from stored records and
    every figure comes with a plain-language reading ("Your sharpest window is 09:00–11:00 — 67% of
    all your focus time lands there", "Gym is slipping at 17%", "On days you journal you focus
    34 min longer on average").
  - Six KPI cards with sparklines and period-over-period deltas: focus last 7 days, tasks closed,
    focus streak, 30-day completion rate, habit consistency, journalling.
  - 12-week focus heatmap on absolute levels (so a square means "how many pomodoros"), peak-hour
    chart with the two-hour window highlighted, average focus by weekday, created-vs-closed task
    flow per week, quadrant balance with completion rates, per-habit consistency with streaks, and
    12-week journalling rhythm with the focus/journal correlation.
  - A "What the numbers say" list states only what the data supports — with guards so weak signals
    are never presented as facts.

- **Habits page: measurable consistency**
  - Header numbers (30-day consistency, best active streak, check-ins) plus a one-line reading.
  - Each habit card now shows a colour-coded 30-day consistency badge, current streak, personal
    best, a 30-day check-in strip (so misses are visible), and all-time check-ins. Check-ins use
    local days, matching the strip and the Analytics page.

- **Journal page: writing numbers and a safe long list**
  - Stats strip: days written, total words, average words per entry, current and best streak, and
    30-day consistency, plus a 12-week writing-rhythm chart and a reading line.
  - The past-entries list is now virtualised through a new reusable `appWindow` directive: only the
    rows in view are created (verified at 17 rendered rows for 10 000 entries), so a long journal
    stays smooth.

- **Tasks list: newest activity first, grouped by date, virtualised**
  - Tasks now carry an `updated_at` stamp (migration `003_add_task_updated_at.sql`, backfilled from
    the completion/creation time) and the list sorts by it by default — *Recently updated* is the
    first sort option, so the task you just touched is always on top, whatever its status.
  - The list is grouped by the day each task was last touched (`Today`, `Yesterday`, then
    weekday + date), newest group first, with a per-group count and a “n done” badge.
  - Groups are collapsible with an **accordion**: opening a date closes the previous one, and there
    are `Expand all` / `Collapse all` actions. The newest group opens automatically on load, and
    after a search or filter change the newest matching group opens so results are never hidden.
  - The list is **virtualised**: only the rows that can be seen (plus a small overscan) exist in the
    DOM — measured at 15 rendered rows for a 5 000-task group — and the rest are created as you
    scroll. Rows are fixed-height (76px, two-line title clamp) with a 40px date header, positioned
    absolutely inside a sized canvas so the scrollbar stays accurate.
  - The **To Do** filter is active by default, and search runs across every date; the results come
    back grouped the same way.
  - The list logic lives in a pure `task-list.view.ts` (grouping + windowing), so the maths can be
    exercised without a browser.
  - Housekeeping writes (the automatic daily quadrant reset) do **not** stamp a task, so a reset can
    never push yesterday's work into today's group.

- **Journal dictation (speech to text)**
  - New **Dictate** button on the Journal page with a live interim transcript; finished phrases are
    inserted at the caret and autosaved just like typed text.
  - Default language is English, with every English variant (US, UK, India, Australia, Canada, …)
    selectable — the variant is the biggest accuracy lever when speakers sound different. The choice
    is remembered.
  - **Vocabulary**: teach dictation the words it keeps mis-hearing (`deep work` → `DeepWork`); the
    correction is applied to every phrase, and the app's own vocabulary ships as sensible defaults.
  - Spoken punctuation (`comma`, `period`, `question mark`, `new line`, …), filler-word removal
    (`um`, `uh`, …) and sentence capitalisation are applied to each phrase.
  - Listening is delegated to the runtime's own engine (Web Speech API): the app never records,
    stores or uploads audio and calls no third-party service. Where a runtime has no engine the UI
    says so and points at the operating system's dictation shortcut, and `SETUP.md` documents how to
    add a fully bundled offline (WebAssembly) engine.
  - New `DictationService` plus a pure `dictation.util.ts` transcript pipeline.

- **Calendar: the Eisenhower matrix mapped onto a pomodoro timeline**
  - New `Calendar` page (sidebar entry, `Ctrl+9`) that lays the day out as focus blocks with the
    short and long breaks reserved between them, using the timer's own durations
    (`Focus`, `Short Break`, `Long Break`, `Sessions Until Long Break`).
  - Automatic scheduling follows the matrix: quadrants run in order (Q1 → Q2 → Q3 → Q4) and each
    task keeps its position inside its quadrant, so the first card of the first quadrant is the
    first block of the day.
  - Breaks are never filled with work: the automatic flow skips past the reserved rest slots and
    past anything placed by hand.
  - Manual freedom: drag a task from the priority queue onto the timeline to place it, click any
    free slot to add an existing task or create a new one, and drop several tasks into the same
    slot (the first is the automatic owner, the rest were added by hand).
  - Two-way sync: moving a block re-times it *and* re-sequences its quadrant, and reordering cards
    in the matrix re-runs the timeline.
  - A task can reserve several pomodoros; its blocks are rendered as consecutive focus slots with
    the in-between breaks kept visible, and the block's bottom edge can be dragged to add or
    remove pomodoros.
  - Day window (start/end) with a `Fit day` action, a `Clear pins` action that returns every task
    to the automatic flow, a week strip with per-day load, an "unscheduled — does not fit" warning,
    and a live now-line.
  - New `ScheduleService` (queue, pomodoro scheduler, plan persistence) and `schedule.model.ts`.
    Day plans are stored as non-relational app state through `DbService.getAppState/setAppState`,
    so no database migration is required, and they are included in the JSON backup.
  - The matrix now renders quadrants in plan order and drag & drop re-sequences the queue, so both
    pages always describe the same plan.

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

- The task status circle's tooltips now spell the click flow out: To Do → click = In Progress →
  click again = Done → click again = back to To Do.

- Export file name is now simply the day it was generated: `export-2026-09-13.csv`.
- Tauri window now sets `dragDropEnabled: false` so HTML5 drag & drop of spreadsheet files works
  in the packaged desktop app.

### Fixed

- **Task titles now have a real input limit (120 characters)** instead of the old 200, enforced at
  every entry point so long titles never reach a listing: the Tasks form (Angular's `maxLength`
  schema caps typing and shows a live `n/120` counter), the calendar's new-task field, and the
  Excel/CSV importer (rows over the limit are reported instead of imported). `TaskService` also
  trims and clamps the title before writing, so no code path — quick add, calendar, recurring
  instances, importer — can store an over-long title. The limits live in
  `TASK_TITLE_MAX_LENGTH` / `TASK_DESCRIPTION_MAX_LENGTH` in `task.model.ts`.
- **Long task titles can no longer break a layout.** Every listing now clamps the title (two lines in
  the roomy rows — Tasks, Today, Matrix quadrants, calendar slot panel — and one line where space is
  tight: calendar queue rail, timeline blocks, slot candidates, dashboard picker, analytics sessions)
  and shows the complete title in a tooltip on hover. The Tasks and Today rows had no truncation at
  all before, and the flex children that held them (`ev-title`, `cand-title`, matrix/panel titles)
  were missing `min-width: 0`, so long or unbroken words pushed past their card. Tooltips are wider
  (320px) and wrap unbroken words.
- The dashboard no longer shows the “Session 0/3” readout or its dots: the timer card drops the
  session indicator and the session-cycle card now just reports the next long break, so the
  `cyclePosition` / `sessionDots` bindings behind them are gone (including the fullscreen dots).
- The dashboard's task picker no longer grows with the longest task title — the select is bounded and
  long titles are elided, so a large task list keeps the timer card tidy.
- The calendar queue rail folds per quadrant: every group has a chevron and a `Collapse all` /
  `Expand all` toggle, remembers its state, and the rail scrolls on its own — a quadrant with many
  tasks no longer forces a long scroll. A collapsed group still shows its task count and focus time.
- The quadrant dropdown that appeared over every matrix card on hover is gone. A card already
  belongs to a quadrant, so tasks are re-prioritised by dragging them, or by focusing a card and
  pressing `1` (Do First), `2` (Schedule), `3` (Delegate), `4` (Eliminate) or `0` (Unassigned);
  `Enter` completes it. The calendar's slot panel shows the quadrant as a read-only colour chip
  instead of a second dropdown.
- The calendar's slot panel no longer squeezes its contents: task rows stack (title, quadrant chip,
  action row), the list and the add-form scroll independently, and on windows narrower than 1360px
  the panel slides over the timeline as a drawer instead of wrapping or overlapping the queue rail.
- The browser **"Install DeepWork as an app" banner is no longer rendered inside the packaged
  desktop app**. The install prompt never fires in a Tauri webview and `(display-mode: standalone)`
  never matches there, so the banner used to appear as an extra full-width bar with a ✕ above the
  app header on *every* page of the installed app (Windows, macOS and Linux), which looked like a
  duplicated header. `InstallService.isDesktopApp` now detects the Tauri runtime
  (`__TAURI_INTERNALS__`) and the banner plus the Settings → Appearance install row are browser-only.
- The service worker is no longer registered inside the packaged desktop app, so an update can no
  longer be masked by a stale cached app shell.
- `InstallService` no longer throws when `localStorage` is unavailable (private mode or a
  locked-down webview) — reading and writing the dismissed flag is now guarded.

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
