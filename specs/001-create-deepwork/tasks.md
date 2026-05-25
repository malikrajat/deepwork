# Tasks: DeepWork — 001-create-deepwork

**Generated**: 2026-05-25
**Based on**: spec.md + plan.md

---

## Phase 1 — Foundation (User Story: Infrastructure)

### Task 1.1: Scaffold Tauri + Angular project
- [ ] Run `ng new deepwork --style=css --routing --standalone` in a temp directory
- [ ] Initialize Tauri in the project: `cargo install create-tauri-app` or `npm create tauri-app`
- [ ] Configure `angular.json` output path to match Tauri's `frontendDist`
- [ ] Verify `npm run tauri dev` opens a window with Angular's default page
- **Files**: `package.json`, `angular.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

### Task 1.2: Install and configure Tailwind CSS [P]
- [ ] `npm install -D tailwindcss @tailwindcss/postcss postcss`
- [ ] Create `tailwind.config.js` with glassmorphism color palette from plan
- [ ] Add Tailwind directives to `src/styles.css`
- [ ] Verify utility classes work in a test component
- **Files**: `tailwind.config.js`, `postcss.config.js`, `src/styles.css`

### Task 1.3: Set up SQLite database with migrations [P]
- [ ] Add `tauri-plugin-sql` to `src-tauri/Cargo.toml`
- [ ] Register the plugin in `src-tauri/src/main.rs`
- [ ] Create initial migration SQL file with all tables from plan (tasks, sessions, habits, habit_entries, journal_entries, settings, timer_state)
- [ ] Configure `tauri.conf.json` to preload the SQLite database
- [ ] Test: verify database is created on first launch with correct schema
- **Files**: `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/migrations/001_initial.sql`, `src-tauri/tauri.conf.json`

### Task 1.4: Create Angular routing structure with lazy loading
- [ ] Define routes in `src/app/app.routes.ts` for all 8 pages (dashboard, tasks, matrix, today, analytics, habits, journal, settings)
- [ ] Create placeholder components for each page (`ng generate component pages/dashboard`, etc.)
- [ ] Implement lazy loading via `loadComponent` for each route
- [ ] Verify navigation between all pages works
- **Files**: `src/app/app.routes.ts`, `src/app/pages/*/`

### Task 1.5: Build glassmorphism design system components
- [ ] Create `glass-card` component (frosted panel with configurable blur/opacity)
- [ ] Create `glass-button` component (primary, secondary, ghost variants)
- [ ] Create `glass-input` component (text input with glass styling)
- [ ] Define CSS custom properties (design tokens) in `src/app/shared/styles/glassmorphism.css`
- [ ] Add Inter font (bundled locally, not CDN) and JetBrains Mono for timer display
- **Files**: `src/app/shared/components/glass-card/`, `src/app/shared/components/glass-button/`, `src/app/shared/components/glass-input/`, `src/app/shared/styles/glassmorphism.css`

### Task 1.6: Build collapsible sidebar navigation
- [ ] Create `sidebar` component with icons for all 8 pages
- [ ] Implement collapse/expand toggle (hamburger icon)
- [ ] Collapsed state shows icons only; expanded shows icons + labels
- [ ] Active route highlighted with accent gradient
- [ ] Integrate with `app.component.ts` layout (sidebar + router-outlet)
- **Files**: `src/app/shared/components/sidebar/`, `src/app/app.component.ts`, `src/app/app.component.html`

### Task 1.7: Initialize Git repository
- [ ] `git init` in project root
- [ ] Create `.gitignore` (node_modules, dist, target, src-tauri/target, .specify cache files)
- [ ] Initial commit with all foundation files
- [ ] Create feature branch `001-create-deepwork`
- **Files**: `.gitignore`

**Checkpoint Phase 1**: App launches in Tauri window, shows sidebar navigation, all pages routable, glassmorphism styled, SQLite database initialized.

---

## Phase 2 — Timer Core (User Story 1: Start a Focus Session)

### Task 2.1: Create TimerService with Angular Signals
- [ ] Create `src/app/core/services/timer.service.ts`
- [ ] Implement signals: `isRunning`, `remainingSeconds`, `timerType`, `sessionCount`
- [ ] Timer logic: start/pause/resume/stop/skip using `Date.now()` diff for drift-free accuracy
- [ ] Auto-transition: work → short break → work → ... → long break (every N sessions)
- [ ] Persist timer state to SQLite every 30s and on pause/stop
- [ ] On init, check for interrupted session and expose `hasInterruptedSession` signal
- **Files**: `src/app/core/services/timer.service.ts`

### Task 2.2: Create DbService (Tauri IPC wrapper)
- [ ] Create `src/app/core/services/db.service.ts`
- [ ] Wrap Tauri's `@tauri-apps/plugin-sql` with typed methods
- [ ] Methods: `query<T>()`, `execute()`, `getSettings()`, `saveTimerState()`
- [ ] All queries use parameterized statements (security requirement)
- **Files**: `src/app/core/services/db.service.ts`

### Task 2.3: Build animated clock component
- [ ] Create `src/app/shared/components/animated-clock/`
- [ ] SVG-based circular progress ring that depletes as time passes
- [ ] Digital time display in center (MM:SS format, monospace font)
- [ ] Color shifts: purple during work, blue during break
- [ ] Smooth CSS animation for the ring (not re-rendering every second)
- [ ] Pulse animation when timer completes
- **Files**: `src/app/shared/components/animated-clock/`

### Task 2.4: Build Dashboard page layout
- [ ] Implement grid layout: timer (center-top), timeline bar (middle), today's summary (bottom)
- [ ] Wire animated clock to TimerService signals
- [ ] Add Start/Pause/Stop/Skip buttons below the clock
- [ ] Show current task name (if linked) above the timer
- [ ] Display "Sessions completed today: X" counter
- [ ] Quick stats cards: total focus time, current streak
- **Files**: `src/app/pages/dashboard/`

### Task 2.5: Implement notification system
- [ ] Create `src/app/core/services/notification.service.ts`
- [ ] On timer complete: fire OS notification via `@tauri-apps/plugin-notification`
- [ ] Play sound via Web Audio API (load bundled `.ogg` file)
- [ ] Start 60-second repeat interval until user interacts
- [ ] Bundle 3-5 notification sounds in `src/assets/sounds/`
- [ ] Respect system notification permissions (request on first use)
- **Files**: `src/app/core/services/notification.service.ts`, `src/assets/sounds/*.ogg`

### Task 2.6: Build timeline bar component
- [ ] Create `src/app/shared/components/timeline-bar/`
- [ ] Horizontal bar representing waking hours (6AM - midnight)
- [ ] Render colored blocks from completed sessions (purple = work, blue = break)
- [ ] Current time marker (thin white line) moves in real-time
- [ ] Tooltip on hover shows task name + duration
- [ ] Query sessions from today via DbService
- **Files**: `src/app/shared/components/timeline-bar/`

**Checkpoint Phase 2**: Timer runs accurately, notifications fire aggressively, animated clock works beautifully, timeline shows today's sessions.

---

## Phase 3 — Task Management (User Stories 2, 3, 4, 5)

### Task 3.1: Create TaskService
- [ ] Create `src/app/core/services/task.service.ts`
- [ ] CRUD methods: `createTask()`, `updateTask()`, `deleteTask()`, `getTasks()`, `getTaskById()`
- [ ] Filter methods: `getTasksByQuadrant()`, `getTasksByStatus()`, `getTodayTasks()`
- [ ] Search method: `searchTasks(query)`
- [ ] Recurring task methods: `generateRecurringInstances()`, `checkRecurrence()`
- [ ] All methods interact with DbService (parameterized SQL)
- **Files**: `src/app/core/services/task.service.ts`

### Task 3.2: Define data models
- [ ] Create TypeScript interfaces: `Task`, `PomodoroSession`, `Habit`, `HabitEntry`, `JournalEntry`, `AppSettings`, `TimerState`
- [ ] Create `RecurrenceConfig` type (frequency, interval, days[], end_date)
- [ ] Create enum types for `TaskStatus`, `TaskQuadrant`, `TimerType`
- **Files**: `src/app/core/models/*.model.ts`

### Task 3.3: Build Tasks page
- [ ] Full-page task list with search/filter bar at top
- [ ] Each task row shows: title, priority badge, quadrant indicator, deadline, status
- [ ] "Add Task" button opens a slide-in form panel (not a modal — less disruptive)
- [ ] Inline status toggle (click to cycle: todo → in-progress → done)
- [ ] Click task row to open detail/edit panel
- [ ] Delete with confirmation dialog
- [ ] Bulk actions: select multiple, delete, change status
- **Files**: `src/app/pages/tasks/`

### Task 3.4: Build Eisenhower Matrix page
- [ ] 2x2 grid layout with labeled quadrants
- [ ] Angular CDK DragDrop: tasks draggable between quadrants
- [ ] Unassigned tasks shown in a side panel (draggable into quadrants)
- [ ] Each task card shows title + priority color
- [ ] Drop event updates task's `quadrant` field via TaskService
- [ ] Link: clicking a task navigates to task detail (Tasks page)
- **Files**: `src/app/pages/matrix/`

### Task 3.5: Build Today's View page
- [ ] Ordered list of tasks selected for today
- [ ] Drag-to-reorder (Angular CDK sortable list)
- [ ] "Add to Today" action available from Tasks page and Matrix page
- [ ] "Focus on this" button: sets task as active for next timer session
- [ ] Completed tasks show strikethrough with completion timestamp
- [ ] Remove from Today (without deleting the task)
- **Files**: `src/app/pages/today/`

### Task 3.6: Implement recurring tasks engine
- [ ] Create recurrence config UI in task form (frequency picker, day selector, interval)
- [ ] On app startup: call `TaskService.generateRecurringInstances()`
- [ ] Logic: for each task with recurrence, check if today matches schedule and no instance exists
- [ ] Generate instance as a new task row linked to template task
- [ ] Handle edge cases: app not opened for days (only generate for today, not past)
- **Files**: `src/app/core/services/task.service.ts` (extended), task form component

### Task 3.7: Link tasks to timer sessions [P]
- [ ] On Dashboard: optional task selector dropdown (from Today's list or all tasks)
- [ ] When timer starts with a task linked, `session.task_id` is set
- [ ] Current task name displayed above the timer
- [ ] On task completion (all pomodoros done), offer to mark task as "done"
- **Files**: `src/app/pages/dashboard/` (extended)

**Checkpoint Phase 3**: Full task CRUD works, Eisenhower Matrix with drag-drop, Today's view ordered, recurring tasks auto-generate.

---

## Phase 4 — Productivity Features (User Stories 6, 7, 8)

### Task 4.1: Build Analytics page
- [ ] Install `chart.js` and `ng2-charts`
- [ ] Daily focus hours bar chart (last 7 days)
- [ ] Weekly trend line chart (last 4 weeks)
- [ ] Session history: scrollable list with task name, duration, timestamp
- [ ] Streak counter: consecutive days with at least 1 completed session
- [ ] "Most productive hour" insight based on session data
- [ ] All data queried from `sessions` table
- **Files**: `src/app/pages/analytics/`, `package.json`

### Task 4.2: Build Habits page
- [ ] Create `HabitService` with CRUD + daily check-off
- [ ] Grid display: each habit as a card with name, icon, today's status (done/not), current streak
- [ ] Check-off: click/tap to mark complete (with satisfying animation)
- [ ] Add habit form: name, icon picker, frequency
- [ ] Streak calculation: consecutive days of completion
- [ ] Weekly mini-calendar showing completion dots
- **Files**: `src/app/pages/habits/`, `src/app/core/services/habit.service.ts`

### Task 4.3: Build Journal page
- [ ] Create `JournalService` (save/load entries by date)
- [ ] Today's entry: full-width text area with markdown support
- [ ] Optional prompts shown as placeholder text: "What went well?", "What to improve?"
- [ ] Save button (auto-save on debounced input)
- [ ] Past entries: scrollable list with date headers, click to view/edit
- [ ] Simple markdown rendering for viewing past entries
- **Files**: `src/app/pages/journal/`, `src/app/core/services/journal.service.ts`

**Checkpoint Phase 4**: Analytics show real data in charts, habits trackable with streaks, journal entries persist.

---

## Phase 5 — Polish (User Stories 9, 10 + UX)

### Task 5.1: Implement Focus Mode
- [ ] Add `focusMode` signal to a `UiService`
- [ ] When active: hide sidebar, hide all page content except timer + current task
- [ ] Minimal control bar: pause/stop timer, exit focus mode button
- [ ] CSS transition: smooth fade in/out of hidden elements
- [ ] Keyboard shortcut: `Ctrl+Shift+F` toggles
- **Files**: `src/app/core/services/ui.service.ts`, `src/app/app.component.ts`

### Task 5.2: Implement keyboard shortcuts
- [ ] Global `@HostListener` in AppComponent for keyboard events
- [ ] `Space` → start/pause timer (only on Dashboard)
- [ ] `Ctrl+N` → open quick-add task dialog
- [ ] `Ctrl+1` through `Ctrl+8` → navigate to pages
- [ ] `Escape` → exit Focus Mode / close modals
- [ ] Display shortcut hints in tooltip on sidebar icons
- **Files**: `src/app/app.component.ts`, sidebar component

### Task 5.3: Implement system tray integration
- [ ] Configure Tauri tray icon with context menu (Show/Hide, Start Timer, Quit)
- [ ] Implement configurable close behavior (minimize-to-tray vs quit)
- [ ] Tray icon tooltip shows timer status ("Working: 12:34 remaining")
- [ ] Click tray icon brings window to front
- **Files**: `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`

### Task 5.4: Build Settings page
- [ ] Timer configuration: work/break/long-break durations (sliders)
- [ ] Sessions before long break (number input)
- [ ] Notification sound picker (play preview on select)
- [ ] Tray behavior toggle (minimize vs quit)
- [ ] Persist all settings to `settings` table via DbService
- [ ] Load settings on app startup, apply to TimerService
- **Files**: `src/app/pages/settings/`, `src/app/core/services/settings.service.ts`

### Task 5.5: Implement data export/import
- [ ] Export: query all tables, assemble into JSON with schema version header
- [ ] Use Tauri's file dialog to pick save location
- [ ] Import: open file dialog, parse JSON, validate schema version
- [ ] Show preview/confirmation before overwriting
- [ ] Auto-backup current data before import (save to app data directory)
- **Files**: `src/app/core/services/export.service.ts`, settings page (UI)

### Task 5.6: App startup flow
- [ ] No onboarding wizard — launch straight to Dashboard with smart defaults
- [ ] On first launch: insert default settings row, create empty database
- [ ] Check for interrupted timer session → show "Resume?" prompt
- [ ] Generate recurring task instances for today
- [ ] Initialize notification permissions if not granted
- **Files**: `src/app/app.component.ts`, `src/app/core/services/startup.service.ts`

**Checkpoint Phase 5**: Focus Mode works, shortcuts responsive, tray integration complete, settings persist, export/import functional.

---

## Phase 6 — Testing & Release (Quality Gates)

### Task 6.1: Unit tests for core services
- [ ] TimerService: test start/pause/resume/stop/auto-transition/drift-correction
- [ ] TaskService: test CRUD, filters, recurrence generation
- [ ] DbService: test query parameterization, error handling
- [ ] NotificationService: test fire/repeat/dismiss logic
- **Files**: `src/app/core/services/*.spec.ts`

### Task 6.2: Component tests for shared UI
- [ ] AnimatedClock: test render, countdown display, color changes
- [ ] Sidebar: test collapse/expand, active route highlight
- [ ] GlassCard/Button/Input: test variants render correctly
- **Files**: `src/app/shared/components/*.spec.ts`

### Task 6.3: E2E tests for critical flows
- [ ] Full Pomodoro cycle: start work → complete → start break → complete
- [ ] Task CRUD: create, edit, delete, search
- [ ] Matrix drag-drop: move task between quadrants
- [ ] Export/Import: export data, clear, import, verify data
- **Files**: `tests/e2e/`

### Task 6.4: Build optimization and installer
- [ ] Run `npm run tauri build` for release build
- [ ] Verify binary size < 15MB
- [ ] Test cold-start time < 2 seconds
- [ ] Generate Windows installer (.msi or .exe)
- [ ] Generate app icons (all required sizes)
- **Files**: `src-tauri/tauri.conf.json`, `src-tauri/icons/`

**Checkpoint Phase 6**: All tests pass, build succeeds, installer works, performance targets met.

---

## Task Legend

- `[P]` = Can be done in parallel with adjacent tasks
- Priority follows spec: P1 tasks (Timer, Tasks) before P2 (Matrix, Today, Recurring, Export) before P3 (Analytics, Habits, Journal, Focus)
- Each phase checkpoint is independently demonstrable
