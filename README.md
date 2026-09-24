# DeepWork

A secure, lightweight, cross-platform Pomodoro & Task Management desktop app built with **Tauri 2 + Angular 21**.

## Features

- Pomodoro timer with animated circular clock
- Eisenhower Matrix for task prioritization
- Add a task for today from any page — type a title, or say it in English
- Jira-style status board (To Do / In Progress / Done) with drag & drop, shared by Tasks and Today
- Add-task form with today's deadline pre-filled
- Daily planner (Today's View)
- Bulk task import from Excel / CSV, with a downloadable template
- Task list export to CSV with quick date ranges and 24 report columns, saved where you can find it
- Habit tracking & journaling
- Analytics dashboard
- Glassmorphism dark UI
- SQLite local database (no cloud, no accounts)
- OS-native notifications with repeat until dismissed
- Desktop options: start with the system, always on top, and a draggable always-on-top mini widget
- Five small log files — system, flow, crash, network — that roll over on their own, with a button in Settings that opens the folder
- About the developer, and a check for the latest release on GitHub

---

## Desktop behaviour: startup, always on top, and the mini widget

Two optional settings control how DeepWork sits on your desktop. Both are **off by
default** — nothing changes until you ask for it.

| Option                | What it does                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start with system** | DeepWork launches when you sign in and opens its normal window — without stealing focus from whatever you are doing — and is in the system tray as well. |
| **Always on top**     | Keeps the main window above every other window, so the timer stays visible while you work in other apps.                                                 |

### Where to change them

Every surface stays in sync, so you can flip either option from wherever you
happen to be:

1. **System tray menu** — _Start with system_ / _Always on top_ (tick marks mirror the real state)
2. **Settings → Desktop Behaviour**
3. **Dashboard → Desktop Behaviour** card at the bottom of the page

Both toggles carry an **ⓘ info button** that explains the option in plain language —
what "always on top" means, and what a startup entry will actually do.

### The mini widget

Minimising the window — with the window's own **minimise button** or from the
**clock card** — shrinks DeepWork into a small floating widget. It has no title bar
of its own (nothing to minimise, maximise or close), always stays above your other
windows, and can be dragged anywhere on your desktop with the mouse. The play
button runs the timer without expanding; the expand arrow (or `Esc`) restores the
full window at its original size and position.

The timer sits inside a colourful countdown ring: it is complete when a session —
focus, short break or long break — starts, drains second by second, and is gone
when the time is up.

### Asking at install time

The **Windows installer** asks whether DeepWork should start with Windows, right
after the files are copied (see `src-tauri/nsis/hooks.nsh`). If you accept, it
writes the same per-user entry the app manages itself:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Run\DeepWork
  = "<install dir>\deepwork.exe" --autostart
```

Tauri's uninstaller already deletes that value, so uninstalling never leaves a
startup entry behind. Silent (`/S`) and passive installs skip the prompt and leave
startup off.

macOS `.dmg`/`.app` and Linux `.deb`/`.AppImage` installers have no standard place
to show a checkbox, so on those platforms the same choice is offered by a
**one-time dialog on first launch** — and afterwards in Settings, the dashboard and
the tray. Where the entry lives per platform:

| Platform | Mechanism                                                      |
| -------- | -------------------------------------------------------------- |
| Windows  | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`           |
| Linux    | `~/.config/autostart/com.deepwork.app.desktop` (XDG autostart) |
| macOS    | `~/Library/LaunchAgents/com.deepwork.app.plist` (LaunchAgent)  |

A login-launched copy opens the normal DeepWork window, at its usual size. The
only difference from a manual launch is that it does not pull focus away from the
window you are working in.

---

## Exporting tasks

**Tasks → Export** writes the task list to a CSV file (openable directly in Excel).

- **Quick date ranges:** Today, Yesterday, Last 7 days, This week (Mon–Sun), This month,
  Last month, This year, All time, or a **custom** start/end date.
- **Date to count by:** Deadline, Created date or Completion date — the same date also drives the
  `Date`, `Day`, `Week` and `Month` columns, so exports read naturally date by date.
- **Filters:** status (To Do / In Progress / Done), priority (P1–P4), and an option to include
  tasks that have no date in the selected field.
- **24 columns per task:** Date, Day, Week, Month, Task, Status, Priority, Quadrant, Deadline,
  Deadline Day, Days To Deadline, Overdue, Tags, Repeat, Description, Created Date, Created Time,
  Completed Date, Completed Time, Age In Days, Focus Sessions, Focus Minutes (from your Pomodoro
  sessions), On Today List and Task ID.
- **Optional totals block** below the data: counts per status, overdue, focus sessions/minutes,
  the date range and the export timestamp.
- Rows are ordered chronologically (then by priority) and the file is named after the day it was
  generated — `export-2026-09-13.csv`. Files are written as UTF-8 with a BOM so accents, em dashes
  and CJK text display correctly in Excel.
- **The file is written by DeepWork itself into your Downloads folder**, and the app tells you
  where it landed (folder and full path) both in the export panel and in a toast — so an export is
  never "somewhere in the downloads". An existing name is never overwritten: the next export of the
  day becomes `export-2026-09-13 (2).csv`. In the browser build the browser performs the download
  and the app can only name the folder, not the path.

---

## Adding a task for today

The round **add button** floats in the bottom-right corner of every page
(Dashboard, Tasks, Today, Matrix, Calendar…), and `Ctrl+N` opens the same dialog. It
asks for one thing and says plainly what it will save:

|              |                                                                                    |
| ------------ | ---------------------------------------------------------------------------------- |
| **You give** | a **title**, plus a description if you want one                                    |
| **Limits**   | title 120 characters · description 2000 characters                                 |
| **Saved as** | priority P3 Medium · deadline today · no quadrant · no repeat · on your Today list |

- **Type** a title and press _Add to Today_. Everything else is already decided —
  **Advanced options** reveals the description, priority, deadline and quadrant only
  if you want to change them.
- The **Tasks → Add Task** form works the same way: only **Title** is asked for, with
  the defaults spelled out underneath, and everything else behind _Advanced options_
  (editing an existing task opens them automatically).

---

## The task board (Tasks and Today)

Tasks and Today both show the same board: **one column per status**, and cards that
are dragged between them to change their status.

| Column          | Card colour                   |
| --------------- | ----------------------------- |
| **To Do**       | grey                          |
| **In Progress** | amber                         |
| **Done**        | violet (title struck through) |

- **Drag a card into another column** to set its status. Dropping a card inside the
  column it already sits in changes nothing on Tasks (that list is sorted) and
  re-orders the day on Today.
- **No mouse needed:** with a card focused, `1` `2` `3` move it to To Do, In Progress
  or Done, the arrow keys walk it along the board, and `Enter` opens it for editing on
  the Tasks page.
- **The colour is the status**, decided in one place (`STATUS_CONFIG.cardClass` plus
  the tokens in `src/styles.css`), so a card that moves from To Do to Done recolours
  the same way on both pages, in both themes, and even while it is being dragged.
- **The columns are the filter.** There are no status pills to click, and the status
  checkbox is gone: search, the sort control (`Recently updated`, `Priority`,
  `Deadline`, `Newest`), Add, Edit, Delete, Export and Import all still work on the
  board, and every card keeps its priority, deadline, quadrant, repeat and Today star.
- **On Tasks the board is filed by date, and the dates fold away.** Sections run
  `Today`, `Tomorrow`, `Next week`, `Later this month`, then the months ahead, and
  behind them `Yesterday`, `Earlier this week`, `Last week`, `Earlier this month` and
  the months before that — read the way a mailbox is read. A task belongs to the
  section of **its own date**: its deadline, or the day it was written when it has no
  deadline, so dragging a card to Done never makes it jump into another day. Each
  section carries its task count and how many are done, opens and closes from its
  header, and `Expand all` / `Collapse all` does the whole page at once. Today starts
  open, a search opens every section it matched, and a task you just added or imported
  opens the section it landed in.
- **Today keeps its Done column**, so a card moved into it stays visible (greyed out
  and struck through) and can be dragged back — while the dashboard's "today" list
  still counts only open work.

---

## Eisenhower Matrix layout

- The task list beside the board is **resizable**: drag the divider between them, use the
  **arrow keys** while it is focused (`Shift` for larger steps, `Home`/`End` for the limits),
  or **double-click** to reset to the default width. The width is remembered between sessions.
- Each quadrant **scrolls on its own** when it holds more tasks than fit — the quadrant header, count
  and description stay pinned while the cards scroll, and drag-and-drop keeps auto-scrolling the
  list as you drag near its edges.
- Each quadrant and the task list can be **collapsed** from the chevron in its header — a collapsed
  quadrant still accepts dropped tasks, and the task list collapses to a slim rail with its count.
- Task titles wrap onto two lines and the drag preview shows the **full title**, so long titles stay
  readable while you are dragging or dropping.

---

## Importing tasks from Excel

**Tasks → Import** accepts `.xlsx`, `.xlsm` or `.csv` files, validates every row, and shows a
preview before anything is written to the database.

- **Template:** the panel's _Download template_ button produces a dated workbook named after the
  current day (e.g. `2026-09-13.xlsx`) with the app's default values pre-selected on 25
  ready-to-type rows, a frozen header, and a second _Instructions_ sheet documenting each column.
  - The panel confirms the download and **names the folder and path it was saved to**, so the
    template is easy to find again.
  - **Priority / Quadrant / Status / Repeat / Add to Today** are dropdowns; their default is already
    selected (`P3 — Medium`, `Unassigned`, `To Do`, `No repeat`, `Yes`).
  - **Deadline** and **Repeat End Date** default to **today**, stored as real Excel dates
    (`yyyy-mm-dd`), so they sort, filter and open the calendar picker.
  - **Tags** defaults to `task`.
  - Every column carries a header hint (`Deadline (YYYY-MM-DD)`, `Repeat Days (Mon,Wed)`,
    `Tags (comma separated)`) plus an in-cell message that appears when you click a cell, so it is
    always clear what to type and in which format.
- **Columns:** `Title` (required), `Description`, `Priority`, `Quadrant`, `Deadline`, `Status`,
  `Repeat`, `Repeat Days`, `Repeat End Date`, `Tags`, `Add to Today`. Column order is irrelevant,
  unknown columns are ignored, and common header aliases (`Task`, `Due Date`, `Prio`, `Labels`, …)
  are recognised so existing spreadsheets usually import as-is.
- **Values:** the template's dropdown labels, plain keywords (`high`, `done`, `weekly`, `Q1`, …),
  `1-4` priorities, ISO dates, Excel date cells and `Mon,Wed,Fri` repeat days all work.
- **Dates may be past or future.** Any date is accepted; a past deadline still imports and is
  reported as a warning ("Deadline 2026-01-05 is in the past") so you can confirm it.
- **Safety:** nothing is saved until you confirm the preview. Rows with errors are never imported;
  unusable values, duplicate titles (existing tasks or repeated rows in the file) and ambiguous
  `dd/mm` dates are flagged. Rows left without a Title are ignored and counted in the preview.
- **Repeated titles are kept, not dropped.** A row whose title already exists — the same task you
  imported yesterday, or the file uploaded twice — is labelled **Duplicate** in the preview and
  still imported as its own task, so today's list gets everything the sheet carries. Tick **Skip
  these N row(s) instead of importing them** in the preview when you do want them left out.

---

## Logs & diagnostics

DeepWork writes down what it was doing — every warning, error and crash, from the
window, the network, the app and Angular alike — so a problem on a machine nobody
can sit in front of is still something you can read afterwards. **Settings → Logs
& Diagnostics** has one button that opens the folder, and another that copies the
last 300 lines plus the environment they happened in.

### The five files

| File           | Holds                                                                    | Start here when…                           |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| `deepwork.log` | Everything, in order                                                     | you do not know where to look yet          |
| `system.log`   | App, window, tray and OS events, plus stray warnings                     | the window or the desktop shell misbehaved |
| `flow.log`     | What the user did: pages, timer, imports, exports                        | you need to know what they were doing      |
| `crash.log`    | Panics, unhandled errors and rejections, Angular errors, `console.error` | the app died, froze or came up blank       |
| `network.log`  | Failed requests, going offline and back online                           | something could not be reached             |

A file rolls over once it reaches **512 KB**: it is archived with the date in its
name (`deepwork_2026-09-21_14-30-05.log`) and the oldest copies are deleted once a
file has more than five, so the folder can never grow past roughly 15 MB.

### Where the folder is

| Platform | Path                                   |
| -------- | -------------------------------------- |
| Windows  | `%LOCALAPPDATA%\com.deepwork.app\logs` |
| macOS    | `~/Library/Logs/com.deepwork.app`      |
| Linux    | `~/.local/share/com.deepwork.app/logs` |

The same path is shown in Settings, next to the button that opens it. The browser
build has no folder to open: it keeps the same log in memory (and in
`localStorage`) and says so in the panel.

### What gets recorded

- **Window level** — uncaught script errors, unhandled promise rejections, and the
  page each one happened on.
- **Angular level** — everything `ErrorHandler` catches, tagged `Angular error`.
- **Application level** — startup, database and settings failures, downloads that
  could not be written, tray actions, and every `console.error` / `console.warn`.
- **Network level** — requests that failed or came back with an error status, and
  going offline and online again.
- **Flow level** — the page the user is on, timer starts/pauses/finishes, imports
  and exports, and the moment the log folder is opened.
- **Crash level** — Rust panics, written straight to `crash.log` even when the
  logger itself never started.

One repeating line cannot flood the file: identical lines inside a two-second
window are folded into the one already recorded, with a `(×N)` count in **Copy
diagnostics**.

---

## About, and checking for updates

DeepWork is built by **Rajat Malik**, and the app says so. **About** sits at the
foot of the sidebar (the version badge opens it too) and holds two tabs.

### About the developer

Who builds this, what they do, what kind of work they are open to — full-time,
contract or freelance, part-time and fractional, hourly consulting, speaking,
and end-to-end delivery — and every way to get in touch: email, portfolio,
LinkedIn, GitHub, WhatsApp and Medium.

All of that text lives in one file, `src/app/core/constants/about.constants.ts`,
so the wording can be changed without touching the layout.

### Check for updates

The second tab answers one question: **is there a newer DeepWork than the one
running?** New builds are published as GitHub releases, and the check reads that
release list (`malikrajat/deepwork`) and compares versions.

It answers honestly, in one of four ways:

| Answer                        | What it means                                                          |
| ----------------------------- | ---------------------------------------------------------------------- |
| A newer version is available  | It names the version, the date, the release notes and your installer   |
| You are on the latest release | The running version is the newest published one                        |
| You are ahead of the releases | This build is newer than anything published (a development build)      |
| Could not check               | Offline, rate-limited by GitHub, no releases yet, or an unreadable tag |

When a newer release exists the page offers the installer for the machine — a
Windows `.exe`, a macOS `.dmg` or a Linux `.deb`/`.AppImage` — by name and size,
with the rest of the release's files one click away.

A few details that matter in practice:

- **It does not spend requests.** The unauthenticated GitHub API allows 60
  requests an hour per machine, so an answer is kept for six hours
  (`localStorage`) and reused. _Check for updates_ always asks again.
- **It never blocks the app.** The check runs on startup in the background and
  is not awaited; a slow network cannot delay the window.
- **It never breaks anything.** No connection, a rate limit or a nonsense
  response is a sentence on the page, not an error the user has to interpret.
- **Nothing about you is sent.** The check reads a public release list and
  reports nothing back.

When a newer release exists, the sidebar shows an **Update** pill next to the
version until you look.

### Opening links in the real browser

A `target="_blank"` link inside the Tauri webview is swallowed — the new-window
request is denied — so "visit my website" would have been a button that does
nothing. Instead the Angular layer hands the URL to Rust (`open_external_url` in
`src-tauri/src/opener.rs`), which opens it with `explorer`, `open` or `xdg-open`.
Only `http`, `https` and `mailto` are accepted, and control characters are
refused. The browser build needs none of this: `ExternalLinkDirective` leaves the
anchor alone there, so `target="_blank"`, middle-click and "copy link address"
all behave the way a browser should.

---

## Prerequisites

See [SETUP.md](SETUP.md) for full platform-specific install instructions.

**Quick check:**

```bash
node --version   # v20+
cargo --version  # 1.77+
git --version    # 2.x+
```

Windows also requires **VS Build Tools** with C++ workload.

---

## Development

### Frontend only (Angular dev server)

```bash
npm run start
# Opens at http://localhost:4200
```

### Full desktop app (Tauri + Angular)

```bash
npx tauri dev
# Opens native window with hot-reload
```

---

## Building Desktop Apps

### Windows (.exe / .msi installer)

```powershell
npm run build:windows
```

Output: `src-tauri/target/release/bundle/msi/DeepWork_2.0.0_x64_en-US.msi`

Also produces a standalone `.exe` at: `src-tauri/target/release/deepwork.exe`

### macOS (.app / .dmg)

**Intel Mac:**

```bash
npm run build:mac
```

**Apple Silicon (M1/M2/M3/M4):**

```bash
rustup target add aarch64-apple-darwin
npm run build:mac-arm
```

Output:

- `src-tauri/target/release/bundle/macos/DeepWork.app`
- `src-tauri/target/release/bundle/dmg/DeepWork_2.0.0_x64.dmg`

> **Note:** Must be run on a Mac.

### Linux (.deb / .AppImage / .rpm)

```bash
npm run build:linux
```

Output:

- `src-tauri/target/release/bundle/deb/deep-work_2.0.0_amd64.deb`
- `src-tauri/target/release/bundle/appimage/deep-work_2.0.0_amd64.AppImage`

> **Note:** Must be run on Linux with system dependencies installed (see [SETUP.md](SETUP.md)).

---

## Cross-Platform Build Summary

| Platform      | Command                 | Output Format       | Run On                |
| ------------- | ----------------------- | ------------------- | --------------------- |
| Windows       | `npm run build:windows` | `.msi`, `.exe`      | Windows               |
| macOS (Intel) | `npm run build:mac`     | `.app`, `.dmg`      | macOS                 |
| macOS (ARM)   | `npm run build:mac-arm` | `.app`, `.dmg`      | macOS (Apple Silicon) |
| Linux         | `npm run build:linux`   | `.deb`, `.AppImage` | Linux                 |

> Tauri does **not** support cross-compilation. You must build on the target OS (or use CI like GitHub Actions with matrix runners).

---

## Releasing a New Version

Before building a release, update the version number in **all three** of these files (they must match):

| File                                                     | Key                  |
| -------------------------------------------------------- | -------------------- |
| [`package.json`](package.json)                           | `"version": "x.y.z"` |
| [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) | `"version": "x.y.z"` |
| [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml)           | `version = "x.y.z"`  |

> `tauri.conf.json` controls what appears in the installer and app About dialog.  
> `Cargo.toml` is used by the Rust build.  
> `package.json` is used by npm/Angular tooling.

---

## CI/CD (GitHub Actions)

Two workflows live in `.github/workflows/`:

| Workflow                                     | Runs on                                                 | What it does                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`ci.yml`](.github/workflows/ci.yml)         | every pull request, every push to `main`, and on demand | lint, format-check, unit tests with a coverage gate, `ng build`, the Playwright suite, `cargo fmt`, and the Windows/Linux/macOS installers |
| [`deploy.yml`](.github/workflows/deploy.yml) | every push to `main`                                    | builds the web app and publishes it to GitHub Pages                                                                                        |

### The stages in `ci.yml`

| Job                                 | Runs                                                              | Fails the run when                                                                                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lint (ESLint)**                   | `npm run lint`                                                    | there is a lint _error_ (warnings are reported, not fatal)                                                                                                                                                                                                     |
| **Format (Prettier)**               | `npx prettier --check` over the files the change touches          | a file that changed is not formatted                                                                                                                                                                                                                           |
| **Unit tests (Vitest)**             | `npm run test:coverage` + `npm run coverage:summary`              | any test fails, or coverage drops below the gate in `vitest.config.ts`; the report is uploaded either way                                                                                                                                                      |
| **Build (ng build)**                | `npm run build`                                                   | the app does not compile; the built site is uploaded as `deepwork-web-build`                                                                                                                                                                                   |
| **E2E (Playwright)** — _advisory_   | `npm run e2e`, which starts its own dev server on port 4202       | — it reports rather than blocks for now: 19 expectations still describe the pre-refactor pages (the removed dictation panel, the old analytics cards, the matrix panels, the habits calendar, the sidebar labels). Report and traces are uploaded on every run |
| **Installer (Windows/Linux/macOS)** | `npm run tauri:build`, one job per OS, after lint, test and build | that platform's bundle fails to build. Runs on pushes to `main`, tags and manually — not on pull requests, where each OS would add 15–25 minutes                                                                                                               |
| **Desktop format**                  | `cargo fmt --check`                                               | the Rust code is not `rustfmt`-formatted                                                                                                                                                                                                                       |

Formatting is checked only on the files a change touches, because the app predates
Prettier: a repo-wide gate would fail on code nobody edited. Run `npm run format`
when you want to format everything at once, and `npm run format:check` to see what
is left.

### Coverage

Unit coverage is measured over **every** file in `src/app` — whether or not a test
happens to load it — so the percentage cannot be raised by leaving files out. Two
rules are enforced in `vitest.config.ts`, and either one fails the run:

1. **Nothing goes backwards.** The plain thresholds are the floor the suite
   reaches today; raise them as tests are added.
2. **The logic layer stays at 90%.** `src/app/core/utils/**` — the analytics
   engine, the CSV/xlsx/zip helpers, the date and windowing maths — has to hold
   90% statements, 90% lines and 90% functions.

The app as a whole is at **50.12% statements** (51.13% lines, 624 tests today).
Every run prints the distance to the 90% goal in its summary: what remains is the
pages and the browser shell, which the Playwright suite exercises.

The same stages run locally:

```bash
npm run lint     # ESLint
npm run format   # Prettier, writes the files
npm test         # Vitest unit tests
npm run test:coverage && npm run coverage:summary   # coverage + the distance to 90%
npm run e2e      # Playwright (starts the app itself); e2e:headed to watch it
npm run build    # Angular production build
npm run verify   # lint + tests + build, in one go
```

CI builds the installers for all three platforms; by hand it still has to happen
on that target OS:

```bash
npm run build:windows   # on Windows
npm run build:mac       # on a Mac
npm run build:linux     # on Linux
```

---

## Project Structure

```
src/              → Angular frontend
src-tauri/        → Rust/Tauri backend
specs/            → Feature specifications (Spec Kit)
SETUP.md          → Developer setup guide
```

---

## Guides & Best Practices

- **Documentation index:** [docs/INDEX.md](docs/INDEX.md) — central map of all docs & config files
- Angular best practices: [docs/angular-best-practices.md](docs/angular-best-practices.md)

---

## Tech Stack

| Layer           | Technology                                  |
| --------------- | ------------------------------------------- |
| Desktop Runtime | Tauri 2.x                                   |
| Frontend        | Angular 21 (Standalone Components, Signals) |
| Styling         | Tailwind CSS + Glassmorphism custom tokens  |
| Database        | SQLite via tauri-plugin-sql                 |
| Notifications   | tauri-plugin-notification + Web Audio API   |
| State           | Angular Signals + RxJS                      |
