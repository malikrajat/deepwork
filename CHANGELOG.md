# Changelog

All notable changes to DeepWork are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **Diagnostics: five small log files, and one button that opens them.** DeepWork
  now writes down what it was doing — every warning, error, crash and failed
  request, from the window, the network, the app and Angular alike — so a problem
  on a machine nobody can sit in front of is still something you can read
  afterwards. The log folder holds `deepwork.log` (everything, in order),
  `system.log` (app, window, tray and OS events, plus stray warnings), `flow.log`
  (pages, timer, imports, exports), `crash.log` (panics, unhandled errors,
  Angular errors, `console.error`) and `network.log` (failed requests, offline and
  online). Every file rolls over at 512 KB and keeps five archived generations, so
  the folder can never grow past roughly 15 MB. **Settings → Logs &
  Diagnostics** opens the folder in Explorer, Finder or the Linux file manager,
  shows the path it opened, lists what each file holds, and copies the last 300
  lines plus the environment they happened in. A Rust panic is written even when
  the logger never came up, and Angular's own errors now reach `crash.log` through
  a dedicated `ErrorHandler` instead of only the console.
  (`src-tauri/src/logging.rs`, `src/app/core/services/log.service.ts`,
  `src/app/shared/components/logs-panel/`)

- **CI: lint, format, unit tests and a build on every push and pull request.** A
  new workflow (`.github/workflows/ci.yml`) runs ESLint, Prettier over the files a
  change touches, the Vitest unit suite (with the coverage report uploaded as an
  artifact), the Angular production build (uploaded as a downloadable artifact)
  and `cargo fmt --check` for the desktop side. The same stages are available
  locally: `npm run lint`, `npm run format`, `npm run format:check`, `npm test`
  and `npm run verify` (lint, tests and build in one go).

- **CI: end-to-end tests, installers for all three platforms, and a coverage
  gate.** The pipeline now also runs the Playwright suite (`npm run e2e`, which
  starts the app on port 4202 itself) and, on pushes to `main`, tags and manual
  runs, builds the real installers in a Windows/Linux/macOS matrix —
  `.msi`/`.exe`, `.deb`/`.rpm`/`.AppImage` and `.dmg`/`.app`, each uploaded as an
  artifact with the Rust build cached. The e2e job reports rather than blocks
  while 19 of its expectations still describe the pre-refactor pages. Coverage is
  now measured over **every** file in `src/app` (nothing can hide by never being
  imported) and enforced in `vitest.config.ts`: nothing may drop below the level
  the suite reaches, and `src/app/core/utils/**` must hold 90%. Every run prints
  the distance to the 90% goal (`npm run coverage:summary`).

- **Unit tests for the logic layer: 471 → 556 tests, coverage 35.6% → 47.65% of
  the whole app.** The insights engine (analytics, streaks, heatmap levels, the
  plain-language takeaways) went from 0.3% to 98.8%, the CSV export helpers from
  7% to 95.5%, and `src/app/core/utils` as a whole now holds 90.7% statements /
  92.4% lines — the layer the 90% gate is set on. The day planner, the timeline
  helpers, the export ranges and the activity stamps are covered too. Writing
  those tests turned up one real defect: two tasks dropped on the same slot could
  come back in either order, because the block sort used a comparator that never
  returned "equal" for two focus blocks; the owner of a slot is now deterministic.

- **Add a task for today from anywhere.** A floating **Add task** button lives in the app
  shell, so it is on every page (Dashboard included), and `Ctrl+N` opens it from anywhere
  (`QuickAddComponent`). The dialog asks for the one thing that matters — a **title** — and
  states plainly what it will save (P3 Medium · deadline today · no quadrant · no repeat · on
  the Today list) and the limits (title 120 / description 2000 characters), with the
  description, priority, deadline and quadrant behind **Advanced options**.

- **The Tasks board is now filed by date, and the dates fold away.** The Jira-style
  board is unchanged — the same To Do / In Progress / Done columns, the same drag &
  drop, keyboard moves and card details — but it now sits inside Outlook-style
  collapsible sections: `Today`, `Tomorrow`, `Later this week`, `Next week`, `Later
this month` and the months ahead, then `Yesterday`, `Earlier this week`, `Last week`,
  `Earlier this month` and the months behind, with `Expand all` / `Collapse all` in the
  toolbar. A task is filed under **its own date** (its deadline, else the day it was
  written) rather than the day it was last touched, so dragging a card to Done leaves it
  in its section instead of firing it into Today. Each header carries the section's task
  count and a "done" count; Today opens first, the rest unfold on click, and a search
  opens every section it matched. A task you add or import opens its own section too, so
  a deadline in another month never looks like a task the app lost. The rules live in
  `src/app/pages/tasks/task-date-groups.view.ts`.

- **Mini widget: the window's own minimise button now shrinks into it, with a
  countdown ring and no title bar**
  - Pressing the **system minimise button** on the window (or `Win`+`↓`, or the
    taskbar's _Minimise_) now produces the mini widget instead of burying the app in
    the tray. Windows reports a minimise as a 0x0 resize; the Rust layer forwards it
    as `deepwork:minimize` and `UiService` un-minimises and reshapes the window, so
    the timer stays visible from any page — not just the dashboard.
  - The widget has **no title bar**: `setDecorations(false)` on the way in and back
    on the way out, so there are no minimise/maximise/close buttons on a 120×76
    frame. The expand arrow inside it (or `Esc`) is the way back to the full window,
    and the widget body is draggable wherever the user wants it.
  - The running time now sits inside a **colourful countdown ring**: complete when a
    session starts, draining second by second, gone when the time is up, and refilled
    for the next focus block or break. Each session type gets its own gradient
    (focus violet→cyan, short break cyan→emerald, long break emerald→violet).
  - A **play/pause button** in the widget starts or pauses the session without
    expanding back to the full window.
  - The widget moved from the dashboard template to the app shell
    (`app-mini-widget`), because the OS minimise button can fire from any route.

- **Starting with the system opens the normal DeepWork window**
  - "Start with system" no longer hides the app in the tray (and no longer opens the
    mini widget either): it opens the usual DeepWork window at its usual size, so the
    app is not forgotten at the start of the day.
  - A login launch only differs in _how_ it opens — no focus stealing, since the user
    is usually mid-something right after signing in (`restore_in_background` in
    `src-tauri/src/lib.rs`). The system-tray icon is unchanged.
  - System minimise still turns the window into the mini widget, with the tray as the
    fallback if the frontend ever fails to answer (2.5 s grace, then hide to tray).

- **Downloads now tell you where the file went**
  - The Excel import template and the CSV task export are written by the app itself
    into the real Downloads folder — respecting a Downloads folder moved off the
    system drive, and never overwriting an existing file (`export-2026-09-18 (2).csv`).
  - New Rust module `downloads.rs` plus the `save_download` command; a new
    `DownloadService` returns `{ fileName, folder, location }` and renders one shared
    sentence describing it.
  - After a template download or an export, the panel shows that sentence inline and
    the app-wide toast repeats it — including the full path in the desktop app. The
    browser build keeps doing a normal blob download and says "browser's download
    folder" instead of inventing a path it cannot know.
  - The CSV text is now built in `task-export.util.ts` (`buildCsvContent`), byte-for-byte
    what `rm-ng-export-to-csv` produced (verbatim header with the UTF-8 BOM, every cell
    quoted, CRLF rows), which is what allows the app to write the file and name the
    location. The dependency is no longer used.

- **The Add Task form pre-fills today's deadline**
  - Opening the add-task panel now shows today's date in **Deadline**, so the same date
    does not have to be picked for every task. It stays editable — move it to a later
    day, or clear it for a task with no deadline.
  - The date validator now accepts **today or later** (`futureDate`), and compares
    `YYYY-MM-DD` strings instead of `Date` objects — a UTC-computed "today" used to be
    yesterday for anyone east of Greenwich, which would have rejected the pre-filled
    value. Field hint updated to match.

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
    the completion/creation time) and the list sorts by it by default — _Recently updated_ is the
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
  - Two-way sync: moving a block re-times it _and_ re-sequences its quadrant, and reordering cards
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

- **Adding a task now asks for a title only.** The Tasks → Add Task panel shows the
  title, a line stating what will be saved (P3 Medium · due today · no quadrant · no
  repeat) and the field limits, and folds the description, priority, quadrant,
  deadline and repeat behind **Advanced options** — which opens automatically when
  editing an existing task, because then the values are the point.
- The Tasks page search box is more compact, and its placeholder now reads
  “Search all tasks…”, because the board shows every status rather than a date-grouped
  list.

- **Tasks and Today are now a Jira-style status board instead of a flat list.**
  - Both pages render the same `TaskBoardComponent`: **one column per status**
    (To Do → In Progress → Done) with the tasks inside them, and a card is **dragged
    into another column** to change its status — the drop _is_ the status write
    (`TaskService.setStatus`).
  - **The status checkbox is gone from both pages**, and so are the Tasks page's
    status filter pills: the columns are the filter. Search, sort, Add, Edit, Delete,
    Export, Import, the Today star and every task property (priority, deadline,
    quadrant, repeat) still sit on the board.
  - **A card's colour is its status** — grey, amber, violet — decided in one place
    (`STATUS_CONFIG.cardClass` plus `--status-*-card-*` tokens in `src/styles.css`), so
    the same status looks the same on Tasks, on Today, in both themes and in the drag
    preview. Each card has a status-coloured accent bar, tinted surface and a struck
    through title when done.
  - **Keyboard parity with dragging:** with a card focused, `1` `2` `3` move it to a
    status and the arrow keys walk it along the board; `Enter` opens the task on the
    Tasks page.
  - **Today keeps a Done column.** Today's board lists the day's tasks in every
    status (new `todayBoardTasks`), so a card dropped in Done stays visible and can be
    dragged back, while the dashboard's `todayTasks()` keeps counting open work only.
    The drop position is still written to `todayOrder`, so the day's sequence survives
    a reload; quadrant priority still lifts the day's most important work to the top.
  - The Tasks page's date grouping, its virtualised list and `task-list.view.ts` are
    gone with the flat list — the board's columns scroll instead. The relative
    "last changed" stamp moved to `core/utils/task-activity.util.ts`.

- The task status circle's tooltips now spell the click flow out: To Do → click = In Progress →
  click again = Done → click again = back to To Do.

- Export file name is now simply the day it was generated: `export-2026-09-13.csv`.
- Tauri window now sets `dragDropEnabled: false` so HTML5 drag & drop of spreadsheet files works
  in the packaged desktop app.

### Removed

- **All voice input, everywhere.** Dictation — speaking a task, the microphones in the task
  form and the journal, the settings panel, the engine picker, the system dictation shortcut
  and the transcription log — is gone from the app. Deleting the feature also deletes
  everything that existed only to serve it: the Angular services (`SpeechService`,
  `DictationService`, `speech-engine.ts`, `speech-log.ts`, `vosk-capture.ts`,
  `dictation.util.ts`, `spoken-task.util.ts`), the `MicButtonComponent` and
  `MicrophoneSettingsComponent`, the Rust bridge (`speech.rs`, `sapi.rs`, `vosk.rs` and their
  probe examples), the bundled Vosk library and model (~119 MB, no longer in the installer),
  the macOS `NSMicrophoneUsageDescription`, the `windows` crate features that existed for the
  speech APIs, and the dictation sections of the README, setup guide and specs. Everything the
  app does — tasks, the board, journal, habits, analytics, the timer, the mini widget, exports
  and imports — is typed, and works exactly as before.

### Fixed

- **An Excel/CSV import no longer swallows rows whose title already exists.** A task that came back
  the next day — or a file uploaded twice — was marked _Duplicate_ and then skipped, so the day's
  list looked like the upload had lost it. Duplicates are now written as their own tasks by default,
  exactly as the sheet supplies them, and the preview still labels the row _Duplicate_ with a
  **Skip these N row(s) instead of importing them** tick-box for when you do want them left out
  (`TaskImportService.importRows` defaults to `skipDuplicates: false`; `importableCount` counts
  duplicates too). Existing tasks are never touched or removed by an import — the sheet only adds.
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
  app header on _every_ page of the installed app (Windows, macOS and Linux), which looked like a
  duplicated header. `InstallService.isDesktopApp` now detects the Tauri runtime
  (`__TAURI_INTERNALS__`) and the banner plus the Settings → Appearance install row are browser-only.
- The service worker is no longer registered inside the packaged desktop app, so an update can no
  longer be masked by a stale cached app shell.
- `InstallService` no longer throws when `localStorage` is unavailable (private mode or a
  locked-down webview) — reading and writing the dismissed flag is now guarded.

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
