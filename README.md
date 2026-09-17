# DeepWork

A secure, lightweight, cross-platform Pomodoro & Task Management desktop app built with **Tauri 2 + Angular 21**.

## Features

- Pomodoro timer with animated circular clock
- Eisenhower Matrix for task prioritization
- Daily planner (Today's View)
- Bulk task import from Excel / CSV, with a downloadable template
- Task list export to CSV with quick date ranges and 24 report columns
- Habit tracking & journaling
- Analytics dashboard
- Glassmorphism dark UI
- SQLite local database (no cloud, no accounts)
- OS-native notifications with repeat until dismissed
- Desktop options: start with the system, always on top, and a draggable always-on-top mini widget

---

## Desktop behaviour: startup, always on top, and the mini widget

Two optional settings control how DeepWork sits on your desktop. Both are **off by
default** — nothing changes until you ask for it.

| Option | What it does |
|--------|--------------|
| **Start with system** | DeepWork launches when you sign in and waits quietly in the system tray, instead of opening a window over your desktop. |
| **Always on top** | Keeps the main window above every other window, so the timer stays visible while you work in other apps. |

### Where to change them

Every surface stays in sync, so you can flip either option from wherever you
happen to be:

1. **System tray menu** — *Start with system* / *Always on top* (tick marks mirror the real state)
2. **Settings → Desktop Behaviour**
3. **Dashboard → Desktop Behaviour** card at the bottom of the page

Both toggles carry an **ⓘ info button** that explains the option in plain language —
what "always on top" means, and what a startup entry will actually do.

### The mini widget

Minimising from the **clock card** shrinks DeepWork into a small floating widget.
It always stays above your other windows, you can drag it anywhere on your desktop
with the mouse, and clicking the expand arrow (or pressing `Esc`) restores the full
window to its original size and position.

> This is different from **system minimise**, which sends the app to the system tray
> as before. The tooltip on the clock card's minimise button, the footer of the
> Desktop Behaviour card and the first-run dialog all explain the difference.

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

| Platform | Mechanism |
|----------|-----------|
| Windows | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |
| Linux | `~/.config/autostart/com.deepwork.app.desktop` (XDG autostart) |
| macOS | `~/Library/LaunchAgents/com.deepwork.app.plist` (LaunchAgent) |

A login-launched copy starts hidden in the system tray rather than opening a window.

---

## Exporting tasks

**Tasks → Export** writes the task list to a CSV file (openable directly in Excel) using
[`rm-ng-export-to-csv`](https://www.npmjs.com/package/rm-ng-export-to-csv).

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

- **Template:** the panel's *Download template* button produces a dated workbook named after the
  current day (e.g. `2026-09-13.xlsx`) with the app's default values pre-selected on 25
  ready-to-type rows, a frozen header, and a second *Instructions* sheet documenting each column.
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

| Platform | Command | Output Format | Run On |
|----------|---------|---------------|--------|
| Windows | `npm run build:windows` | `.msi`, `.exe` | Windows |
| macOS (Intel) | `npm run build:mac` | `.app`, `.dmg` | macOS |
| macOS (ARM) | `npm run build:mac-arm` | `.app`, `.dmg` | macOS (Apple Silicon) |
| Linux | `npm run build:linux` | `.deb`, `.AppImage` | Linux |

> Tauri does **not** support cross-compilation. You must build on the target OS (or use CI like GitHub Actions with matrix runners).

---

## Releasing a New Version

Before building a release, update the version number in **all three** of these files (they must match):

| File | Key |
|------|-----|
| [`package.json`](package.json) | `"version": "x.y.z"` |
| [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) | `"version": "x.y.z"` |
| [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) | `version = "x.y.z"` |

> `tauri.conf.json` controls what appears in the installer and app About dialog.  
> `Cargo.toml` is used by the Rust build.  
> `package.json` is used by npm/Angular tooling.

---

## CI/CD (GitHub Actions)

To build for all platforms automatically, add a workflow with matrix strategy:

```yaml
# .github/workflows/build.yml
strategy:
  matrix:
    include:
      - os: windows-latest
      - os: macos-latest
      - os: ubuntu-latest
runs-on: ${{ matrix.os }}
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 20 }
  - uses: dtolnay/rust-toolchain@stable
  - run: npm install
  - run: npx tauri build
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

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | Tauri 2.x |
| Frontend | Angular 21 (Standalone Components, Signals) |
| Styling | Tailwind CSS + Glassmorphism custom tokens |
| Database | SQLite via tauri-plugin-sql |
| Notifications | tauri-plugin-notification + Web Audio API |
| State | Angular Signals + RxJS |
