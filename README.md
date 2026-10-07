# DeepWork

**A focus timer and task manager for Windows, macOS, Linux and the browser, built with Tauri 2 and Angular 22 — with its database, and its analysis of it, staying on the machine you are sitting at.**

[![CI](https://github.com/malikrajat/deepwork/actions/workflows/ci.yml/badge.svg)](https://github.com/malikrajat/deepwork/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/malikrajat/deepwork/actions/workflows/deploy.yml/badge.svg)](https://github.com/malikrajat/deepwork/actions/workflows/deploy.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

---

## Honest notes about this README

Three things in this file used to be wrong, and this version corrects them rather than repeating them. They are listed here first, because a README that is wrong once is worth checking twice.

| It used to say                     | What is actually true                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "built with Angular 21"            | The app is on **Angular 22.2** — the dependency in [`package.json`](package.json), the installed framework and the About page's "Built with" line, which said 21 as well.                                                                                                                         |
| "offline AI analysis"              | There is **no AI and no model** anywhere in DeepWork. The analysis is arithmetic and rules the app carries inside itself ([`insights.util.ts`](src/app/core/utils/insights.util.ts)). That wording is now gone from the PWA manifest, the installer metadata and the Analytics and About screens. |
| Nothing about licensing or signing | The repository now ships a [**LICENSE**](LICENSE) (MIT), and this README states plainly that **the installers are not code-signed** and what Windows and macOS will do about that.                                                                                                                |

One more thing was removed: a coverage percentage. This file claimed 50.10% while the configured gate said 47% and the last coverage report said 53.46% — three numbers from three different eras. The gate is now described where it lives ([`vitest.config.ts`](vitest.config.ts)), with the command to print today's real number instead of quoting a stale one.

---

## Contents

- [What DeepWork is](#what-deepwork-is)
- [What DeepWork is not](#what-deepwork-is-not)
- [Get it](#get-it)
- [What it does, page by page](#what-it-does-page-by-page)
- [Your data, and what leaves your machine](#your-data-and-what-leaves-your-machine)
- [Behaviour worth knowing](#behaviour-worth-knowing)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Install, build and develop](#install-build-and-develop)
- [Tests, coverage and CI](#tests-coverage-and-ci)
- [Project structure, and where to change what](#project-structure-and-where-to-change-what)
- [Releasing a new version](#releasing-a-new-version)
- [Troubleshooting](#troubleshooting)
- [Licence, credits and security posture](#licence-credits-and-security-posture)

---

## What DeepWork is

A desktop-first productivity app with a Pomodoro timer at its centre. Everything it knows lives in a SQLite database on your computer — no account, no sign-in, no server of its own.

- **Focus timer** with an animated ring, work/short-break/long-break cycle and configurable lengths.
- **Tasks** in an Eisenhower matrix, a Jira-style status board, dated sections, and a daily **Today** view.
- **Habits**, a **journal** and an **analytics** page that pairs every figure with a plain-language reading of it.
- **Reminders that ask**: a finished session rings until you answer it, and the water nudge asks a question you reply to rather than announcing a fact.
- **Desktop manners**: system tray, start-with-system, always-on-top, and a draggable always-on-top mini widget. A stray click on the window's X does not end your session.
- **The same app in a browser**: the web build at [malikrajat.github.io/deepwork](https://malikrajat.github.io/deepwork/) runs the whole thing and can be installed as a PWA.

## What DeepWork is not

Worth saying before you spend your time, because each of these has been implied by this project's own marketing copy at some point:

| Not this                                      | Why it matters to you                                                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Not AI, and not "AI-assisted"**             | The readings on the Analytics page are deterministic rules and totals written into the app. Same records, same reading, every time. If you want a model in the loop, DeepWork does not have one.                                                    |
| **Not a cloud app, and not a syncing one**    | There is no backend, no account and no sync. Each machine has its own database. Moving your work between machines means exporting a JSON backup and importing it on the other side.                                                                 |
| **Not signed, so not trusted by your OS yet** | The installers carry no Authenticode or notarisation signature. Windows shows _Unknown publisher_ and may raise SmartScreen; macOS may refuse the first open. See [Get it](#get-it) for what to expect and how to verify a download.                |
| **Not a team product**                        | One person, one database. No sharing, assignment, comments or multi-user anything.                                                                                                                                                                  |
| **Not finished everywhere**                   | The unit suite covers the logic layer well and the pages thinly, and the Playwright suite is **advisory** — some of its expectations still describe screens from before the current refactor. See [Tests, coverage and CI](#tests-coverage-and-ci). |

## Get it

| Where       | What you get                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Web app** | [malikrajat.github.io/deepwork](https://malikrajat.github.io/deepwork/) — nothing to install; add it to your desktop from the browser. |
| **Windows** | The `.exe` setup (NSIS) or `.msi` from the [releases page](https://github.com/malikrajat/deepwork/releases), for 64-bit Windows 10+.   |
| **macOS**   | The `.dmg` for recent macOS versions (Intel and Apple Silicon builds are published separately).                                        |
| **Linux**   | An AppImage, `.deb` or `.rpm` for most distributions. AppImages need `chmod +x` before they will run.                                  |

Inside the app, **About → Get it on another device** resolves each of those links against the newest release it has already fetched, so the row for your machine points at a file that exists.

### Because the installers are unsigned

This is the honest version of what happens on a fresh, unsigned download:

- **Windows** — SmartScreen may interrupt with "Windows protected your PC"; the UAC prompt says _Unknown publisher_. The publisher, copyright and category are set correctly in [`tauri.conf.json`](src-tauri/tauri.conf.json), so Add/Remove Programs and the file's properties name the developer even though the signature is absent. Choose _More info → Run anyway_ only if you trust the source.
- **macOS** — Gatekeeper refuses the first launch, with _"DeepWork" Not Opened — Apple could not verify "DeepWork" is free of malware_. That is the unsigned, un-notarized app, not a broken download. **The Control-click → _Open_ trick no longer works on macOS 15 (Sequoia) or later**, so on a current Mac open **System Settings → Privacy & Security → Security → Open Anyway** (after trying to open it once), or clear the flag from Terminal: `xattr -dr com.apple.quarantine /Applications/DeepWork.app`. The [full macOS story](docs/code-signing.md#macos-the-dialog-a-mac-user-is-hitting) — including the browser build that needs no signature — is in [`docs/code-signing.md`](docs/code-signing.md).
- **Linux** — `chmod +x DeepWork_*.AppImage` before running it.

If a release publishes a SHA-256 checksum, compare it before installing — `Get-FileHash <file> -Algorithm SHA256` on Windows, `sha256sum <file>` elsewhere. [`docs/code-signing.md`](docs/code-signing.md) has the full picture: what each kind of certificate or notarization ticket would change for the user, the exact configuration for a certificate store or a cloud signer, how to get past Gatekeeper on a Mac in the meantime, and how to verify a build before publishing it.

**On first launch**, a one-time dialog offers _start with system_, _always on top_ and _keep running in the tray_. No installer writes a startup entry, and nothing is enabled unless you ask for it.

## What it does, page by page

| Page          | What is there                                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard** | The focus timer and its ring, sessions done against your daily goal, the next long break, the day's schedule headline, today's tasks, the water card and the desktop-behaviour card.                                                                     |
| **Today**     | The day's own work on the same status board as Tasks: a task dated today, an overdue task still open, or one written today with no deadline. Starring a task is what pulls it onto today regardless of its date.                                         |
| **Matrix**    | The Eisenhower view: four quadrants, a resizable task list beside them, drag-and-drop between quadrants, collapsible panels.                                                                                                                             |
| **Calendar**  | Your quadrants scheduled into focus blocks — the day planned as pomodoros, at the block length and long-break cadence your timer settings define.                                                                                                        |
| **Tasks**     | The status board (To Do / In Progress / Done) filed into date sections — Today, Tomorrow, Next week, later months, and behind them Yesterday, Last week and the months before. Add, edit, delete, search, sort, import from Excel/CSV and export to CSV. |
| **Analytics** | Focus, task, habit and journal figures with trends and streaks, plus a plain-language reading of each one. The "what should I change?" half, not only the charts.                                                                                        |
| **Habits**    | Daily habits with the current streak, the personal best and a check-in strip per habit.                                                                                                                                                                  |
| **Journal**   | Dated entries with word counts, a weekly words chart — and the writing-versus-focus correlation, surfaced on Analytics.                                                                                                                                  |
| **Settings**  | Timer lengths, notification sound and repeat interval, alert shake length, water reminder, desktop behaviour, logs and diagnostics, JSON backup export/import, and the web build's visitor counter with its details popup.                                                                                                                                                  |
| **About**     | Who builds this, how to get in touch, the update check, and the download rows for other devices.                                                                                                                                                         |

Two things this app does that are worth calling out because they are unusual:

- **Excel/CSV import with a real preview.** `Tasks → Import` accepts `.xlsx`, `.xlsm` and `.csv`, recognises common header aliases (`Task`, `Due Date`, `Prio`, `Labels`, …), validates every row, and writes nothing until you confirm the preview. Duplicate titles are labelled _Duplicate_ and still imported — with a checkbox to skip them if that is what you wanted. _Download template_ produces a dated workbook with dropdowns, header hints and an instructions sheet.
- **CSV export that tells you where the file went.** 24 columns per task, quick date ranges (Today, Last 7 days, This week, This month, …), an optional totals block, UTF-8 with a BOM so accents and CJK text survive Excel, written into your Downloads folder with the full path reported in the panel and in a toast. An existing name is never overwritten: the second export of the day becomes `export-2026-09-13 (2).csv`.

## Your data, and what leaves your machine

**Where things are kept:**

| Build           | Storage                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop (Tauri) | SQLite file `deepwork.db` in the app's data directory (`com.deepwork.app`): `%APPDATA%` on Windows, `~/Library/Application Support` on macOS, `~/.local/share` on Linux. |
| Browser         | `localStorage` for that origin — clearing site data erases it, so export a backup before you do.                                                                         |
| Logs (desktop)  | `%LOCALAPPDATA%\com.deepwork.app\logs` · `~/Library/Logs/com.deepwork.app` · `~/.local/share/com.deepwork.app/logs`. Settings opens the folder for you.                  |

**Backup and restore:** `Settings → backup` writes a single `deepwork-export-YYYY-MM-DD.json` containing your sessions, tasks, habits, journal and water records. Importing one **overwrites your current data** after a confirmation prompt — it is a restore, not a merge, so export first if you are unsure.

**What leaves your machine, completely:**

1. **The update check** — one unauthenticated `GET` to the GitHub releases API for this repository, on startup and when you press _Check for updates_, cached for six hours so it does not burn the 60-requests-per-hour allowance. It sends nothing about you and reports nothing back.
2. **An installer download**, only when you press **Update**. The request is made by Rust with `curl` ([`updates.rs`](src-tauri/src/updates.rs)), only `https` links to `github.com` are accepted, and only a file the app itself wrote to its own temp folder can be started.
3. **Links you click**, opened in your real browser ([`opener.rs`](src-tauri/src/opener.rs)) — `http`, `https` and `mailto` only, control characters refused.

**In the browser build only, a visitor counter.** The web app counts visits with [GoatCounter](https://www.goatcounter.com/) — the same counter that runs on [rajatmalik.dev](https://rajatmalik.dev/) — so "is anybody actually using this?" has an answer without DeepWork having a server of its own. It is the one thing in this app that talks to a third party, and it is bounded:

- **The desktop app is never counted.** It is served from your own disk and has no web address to report; the settings row says exactly that rather than showing a figure.
- **You can switch it off.** **Count my visits**, under the report in `Settings → Visitor Counter → Details`, on by default. With it off the script is never fetched at all, so nothing leaves the machine.
- **It sends the page, not your work.** The path (`/deepwork/tasks`), the page title, the referrer, and the browser's own screen width, language and time zone — never a task, a journal entry, a habit or any identifier. GoatCounter stores no IP address and sets no cookie of its own for this: a visitor is a derived session rather than a person being followed, which is why it needs no consent banner ([its GDPR note](https://www.goatcounter.com/gdpr) explains that).

`Settings → Visitor Counter → Details` opens what GoatCounter holds (visitors over a chosen range, pages, referrers, browsers, systems, countries, languages, screen sizes and campaigns) and, underneath, what the page can see about the person reading it. The aggregate lists come from GoatCounter's JSON API, which needs an API token: make one at `rajatmalik.goatcounter.com/user/api` with only **Read statistics** ticked, and paste it into the popup. It stays in that browser's `localStorage` — not in the source, not in `deepwork.db`, and not in an export.

Beyond that counter there is no telemetry, no analytics service, no crash reporting service and no font CDN. Inter and JetBrains Mono travel inside the app (`src/fonts`, SIL OFL 1.1, licences in `public/fonts`), so it looks like itself offline or behind a proxy.

## Behaviour worth knowing

Short versions of the things that surprise people. Each is real behaviour, not a plan.

**The window.** The X hides DeepWork to the tray rather than quitting, and everything keeps running while it is hidden — a session can finish and ring. Tray → **Exit** (or turning off _keep running in the tray_) is what quits. Minimising shrinks the app into the **mini widget**: frameless, rounded, always on top, draggable, with play/skip/stop and an expand arrow (`Esc` also restores it, fitted back onto the visible screen).

**The completion alert.** A finished session rings on your chosen tone and repeats until answered, from the app or from the widget. Every repeat arrives three ways: a **tagged system notification** (so Windows re-raises the one in the notification centre instead of stacking copies), a **shake** of the widget and card whose length you choose in Settings, and a walk to the **next colour of a twelve-entry palette**. Each alert also carries a line of its own — twenty-four step-away lines for a finished focus session, twenty-four come-back lines for a break — walked one per session so the same sentence does not return twice in a row. Start, skip and stop all answer the alert.

**Ticking a task off** raises a card with a third list of twenty-four lines. It deliberately makes no sound and does not repeat: a task gets ticked off dozens of times a day.

**The water reminder** asks rather than announces, and is **on by default** — a nudge is the whole point of the feature, and it asks a question rather than announcing a fact, so saying no is one click. It only fires inside your working hours, waits a full interval after you switch it on, holds the cadence while a question is unanswered, and starts again from your answer. Its clock counts only time the app is running, so a closed laptop does not owe you a queue of missed reminders. One drink counts as **30 ml** unless you pick another size — the smallest thing anyone would call a drink, so a day of sipping adds up honestly. **While minimised** it rings and logs the drink instead of pulling the full window over your work — that is a setting, on by default.

**Unfinished work** is handled by a policy you choose: carry yesterday's open tasks forward (the default), or let them close themselves when their day passes.

**A task's own date decides the day it belongs to** — deadline, or the day it was written when it has no deadline. Dragging a card to Done never makes it jump into another date section, and an import for the rest of the week waits in its own sections instead of crowding today. Where a title would qualify for today twice over, Today shows one card, not two.

**Editing a task from wherever it is read.** The app has exactly one task form, on the Tasks page, and every card that shows a task now carries the way into it — a pencil on a board card and on an Eisenhower Matrix card, a **✎** on a Calendar rail card, **Edit** in the Calendar's slot panel, **Edit task** on the dashboard's current-focus card, and **Edit task** at the top of the Matrix's right-click menu. Each one opens that same panel with the task already in its fields, so a title or a date can be corrected the moment it is noticed, without hunting for the page that owns it. Adding works the same way: a **+** in a date section's header (Today, Tomorrow, or a month ahead) opens the form already dated for that section, every Matrix quadrant has a **+** that adds straight into it, and Today's header carries **Add task** for a task that also lands on today's list.

## Keyboard shortcuts

| Keys                 | What they do                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Ctrl+N`             | Add a task for today from any page (the browser takes this key for a new window; the desktop app does not). |
| `Ctrl+1` … `Ctrl+0`  | Jump to Dashboard, Today, Matrix, Calendar, Tasks, Analytics, Habits, Journal, Settings, About.             |
| `Ctrl+Shift+F`       | Toggle focus mode.                                                                                          |
| `Space`              | Start or pause the timer (Dashboard, when you are not typing in a field).                                   |
| `Esc`                | Leave the mini widget, leave focus mode, or close a dialog.                                                 |
| `1` `2` `3`          | With a task card focused: move it to To Do, In Progress or Done.                                            |
| `←` `→`              | With a task card focused: walk it along the board.                                                          |
| `Enter`              | With a task card focused on the Tasks page: open it for editing.                                            |
| `←` `→` `Home` `End` | With the matrix divider focused: resize the task list (`Shift` for larger steps).                           |

## Install, build and develop

### Prerequisites

| Tool        | Needed                                                                                    | Check             |
| ----------- | ----------------------------------------------------------------------------------------- | ----------------- |
| **Node.js** | `^22.22.3`, `^24.15.0` or `>=26` (see `engines` in `package.json`; `.nvmrc` pins 24.15.0) | `node --version`  |
| **npm**     | 11.x (`packageManager` in `package.json`)                                                 | `npm --version`   |
| **Rust**    | 1.77.2 or newer (Tauri builds only)                                                       | `rustc --version` |
| **Git**     | any recent version                                                                        | `git --version`   |

Windows also needs **VS Build Tools** with the C++ workload; Linux needs the webkit2gtk/AppIndicator development packages. [SETUP.md](SETUP.md) has the exact commands per platform, including the Rust toolchain and the Linux build dependencies.

### Run it

```bash
git clone https://github.com/malikrajat/deepwork.git
cd deepwork
npm install

npm run start     # Angular dev server on http://localhost:4999 (browser build)
npm run tauri:dev # the real desktop window, hot-reload, 15–25 min on a first Rust build
```

The dev server runs on **4999**, not 4200 — that is the port [`tauri.conf.json`](src-tauri/tauri.conf.json) points its `devUrl` at, and `npm run e2e` starts its own server on 4202 so the two never collide.

### Build an installer

Tauri does **not** cross-compile: build each platform on that platform, or let CI do it.

| Platform         | Command                   | Where the artefacts land                                                                                                                                                                                                         |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows (64-bit) | `npm run build:windows`   | `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/DeepWork_2.0.20_x64_en-US.msi` and `bundle/nsis/DeepWork_2.0.20_x64-setup.exe`; the bare binary is at `src-tauri/target/x86_64-pc-windows-msvc/release/deepwork.exe` |
| Windows (32-bit) | `npm run build:windows32` | `src-tauri/target/i686-pc-windows-msvc/release/bundle/` — the same two installers, named `…_x86` (run `rustup target add i686-pc-windows-msvc` once)                                                                               |
| macOS (Intel)    | `npm run build:mac`       | `src-tauri/target/x86_64-apple-darwin/release/bundle/` — `macos/DeepWork.app` and a `.dmg` whose name carries the version                                                                                                        |
| macOS (ARM)      | `npm run build:mac-arm`   | `src-tauri/target/aarch64-apple-darwin/release/bundle/` (run `rustup target add aarch64-apple-darwin` once)                                                                                                                      |
| Linux (64-bit)   | `npm run build:linux`     | `src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/` — `.deb`, `.rpm` and `.AppImage`                                                                                                                                     |

There is no 32-bit macOS build: Apple removed 32-bit application support in macOS 10.15. There is no 32-bit Linux build either, and it is not a missing package: DeepWork's tray is a **required** Cargo feature (`tray-icon`), and Ubuntu builds no appindicator library for i386 at all — `libappindicator3-dev` and `libayatana-appindicator3-dev` are published for amd64, arm64, armhf, ppc64el, riscv64 and s390x, and never for i386, in jammy or in noble. The build cannot link, so CI publishes five installers: Windows x64 and x86, Linux x64, and macOS arm64 and x64. A 32-bit Linux build would take a Debian i386 environment.

Because the build names the target triple, artefacts sit under `target/<triple>/release/bundle/`, not directly under `target/release/`. The exact file names carry the current version.

Two things are true of every build: **the fonts ship inside it**, and **the packaged app has no web inspector** — the `devtools` cargo feature is deliberately absent from [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml), so a release build has no `F12`, no `Ctrl+Shift+I` and no inspect entry in the context menu. Debug builds get one either way.

## Tests, coverage and CI

```bash
npm run lint            # ESLint
npm run format:check    # Prettier, check only (npm run format writes)
npm test                # Vitest unit suite
npm run test:coverage   # + coverage; fails if the gate in vitest.config.ts is not met
npm run coverage:summary # prints today's percentages and the distance to the 90% goal
npm run e2e             # Playwright, starts its own dev server on 4202 (e2e:headed to watch)
npm run build           # Angular production build
npm run verify          # lint + tests + build in one go
```

**The coverage gate** is two rules, both in [`vitest.config.ts`](vitest.config.ts), and either one fails the run:

1. **Nothing goes backwards.** A floor per metric (statements, branches, functions, lines) that the suite has already reached, to be raised as tests are added.
2. **The logic layer stays at 90%.** `src/app/core/utils/**` — the analytics engine, the CSV/xlsx/zip helpers, the date and windowing maths — must hold 90% statements, 90% lines and 90% functions.

Coverage is measured over **every** file in `src/app`, whether or not a test imports it, so the percentage cannot be raised by leaving files out. What is left below 90% is the pages and the browser shell, which the Playwright suite is meant to cover instead. Run `npm run coverage:summary` for the current numbers rather than trusting a figure written in a document.

**CI** (`.github/workflows/`) runs for `main` only — a push to any other branch starts no run, and a pull request shows no checks. The one exception is a `v*` tag, which is not a branch and is what publishes a release:

| Job                                     | Runs                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lint (ESLint)**                       | `npm run lint`, plus `npm run version:check` so a release that updated eight files of nine fails here                                                                                                                           |
| **Format (Prettier)**                   | `prettier --check` over the files the change touches only — the app predates Prettier, and a repo-wide gate would fail on code nobody edited                                                                                    |
| **Unit tests (Vitest)**                 | `npm run test:coverage` + `npm run coverage:summary`                                                                                                                                                                            |
| **Build (ng build)**                    | `npm run build`                                                                                                                                                                                                                 |
| **E2E (Playwright)**                    | `npm run e2e` against a dev server it starts itself; a failing test fails this job and nothing else — the run's other jobs carry on and report separately                                                  |
| **Installer (Windows / Linux / macOS)** | `npm run tauri:build` per OS, on its own: no job waits on another, so a red check cannot cost you the installers — on every push to main and on a `v*` tag                                                                      |
| **Desktop format**                      | `cargo fmt --check`                                                                                                                                                                                                             |

**The jobs run independently.** None of them waits for another, and each one reports its own pass or fail, so a red browser suite says the browser suite is red — it does not cancel the unit tests, the compile, the installers, or a tagged release. The one thing that does wait is `release`, and only because it attaches the files the installer jobs upload: on a `v*` tag it publishes whatever they built.

`deploy.yml` builds the web app with `npm run build:github` and publishes `dist/deepwork/browser` to GitHub Pages on every push to `main`.

## Project structure, and where to change what

```
src/                 Angular frontend
  app/core/          services, constants, pure utilities (the measured logic layer)
  app/pages/         Dashboard, Today, Matrix, Calendar, Tasks, Analytics, Habits, Journal, Settings, About
  app/shared/        components, directives, pipes used by more than one page
src-tauri/           Rust side: tray, autostart, window/db/logging, downloads, update fetch, opener
public/              PWA manifest, service worker, favicons, font licences
tests/unit/          Vitest specs      tests/e2e/   Playwright specs
specs/               Feature specifications (Spec Kit), 001 → 014
docs/                Developer documentation — start at docs/INDEX.md
scripts/             version bump + coverage summary
```

A short map for the changes people actually want to make:

| To change…                                        | Edit                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| What the app says about itself (tagline, version) | [`app-info.constants.ts`](src/app/core/constants/app-info.constants.ts)                                            |
| The About page's wording and contact links        | [`about.constants.ts`](src/app/core/constants/about.constants.ts)                                                  |
| Which platforms the download rows offer           | [`downloads.constants.ts`](src/app/core/constants/downloads.constants.ts)                                          |
| What the analysis computes                        | [`insights.util.ts`](src/app/core/utils/insights.util.ts) — pure functions, all taking `now`, so they are testable |
| The five log files and what goes in them          | `src/app/core/services/log.service.ts` and `src-tauri/src/logging.rs`                                              |
| Installer metadata, window size, bundle targets   | [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json)                                                           |
| The version number, everywhere it is written down | `npm run version:bump -- x.y.z` (see below) — never by hand                                                        |
| Where the visitor counter sends its data          | [`visitor.constants.ts`](src/app/core/constants/visitor.constants.ts) — the GoatCounter site, the path prefix, the pinned script |

Documentation index: [`docs/INDEX.md`](docs/INDEX.md) — every guidance file in the repository, including [`docs/angular-best-practices.md`](docs/angular-best-practices.md) and [`docs/memory-footprint.md`](docs/memory-footprint.md).

## Releasing a new version

The version is written down in more places than one build system can see, and nothing reads any of the others, so one command writes them all:

```bash
npm run version:bump -- x.y.z    # package.json, both lock files, tauri.conf.json,
                                 # Cargo.toml, Cargo.lock, APP_VERSION, the docs
npm run version:check            # or fail if they have drifted apart
```

| File                                                                      | What carries the number                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`package.json`](package.json) / [`package-lock.json`](package-lock.json) | `"version"`                                                                        |
| [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json)                  | `"version"` — the installer's                                                      |
| [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) / `Cargo.lock`             | the crate's `version`                                                              |
| [`app-info.constants.ts`](src/app/core/constants/app-info.constants.ts)   | `APP_VERSION` — what About shows and what the update check compares against GitHub |
| `README.md`, `SETUP.md`, [`docs/code-signing.md`](docs/code-signing.md)   | the artefact names in the examples                                                 |

`CHANGELOG.md` is deliberately left alone: a changelog records the versions of the past. Tags and releases live on GitHub — the app's update check reads that release list, so a version published without a tag is a version nobody is offered.

## Troubleshooting

| Symptom                                               | What to do                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Windows protected your PC" / _Unknown publisher_     | Expected while the installers are unsigned. That line is the Authenticode signature and nothing else — no setting in the app changes it.                          |
| The window disappeared and the app is "still running" | It is in the tray: closing the window hides it. Tray → **Exit**, or turn off _keep running in the tray_.                                                          |
| No notification appeared                              | Check the OS notification permission for DeepWork, and the tray mute switch. On Windows, a **reminder** toast waits on screen; a normal one can slide away.       |
| Nothing rings when a session ends                     | `Settings → Notification sound` is probably `none`; the alert respects that choice.                                                                               |
| The browser build "lost" my data                      | Clearing site data clears `localStorage`. Export a JSON backup before clearing anything, and use the desktop build for the real database.                         |
| `npm run tauri:dev` fails on Windows                  | Almost always the MSVC build tools or the WebView2 runtime. [SETUP.md](SETUP.md) lists both.                                                                      |
| `cargo` is not found in Git Bash                      | `export PATH="$HOME/.cargo/bin:$PATH"`.                                                                                                                           |
| An export or a log file cannot be opened              | The app reports the full path it wrote to. Logs: `Settings → Logs & Diagnostics`, which also copies the last 300 lines plus your environment.                     |
| Something is wrong and you want to hand over evidence | `Settings → Logs & Diagnostics → Copy diagnostics`. One repeating line cannot flood the files: identical lines within two seconds are folded with a `(×N)` count. |

## Licence, credits and security posture

**Licence: MIT** — see [LICENSE](LICENSE). Previously the repository declared `license = "MIT"` in [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) without shipping the licence text, and said nothing in `package.json`; both now carry it, so the declaration and the file agree. Use it, fork it, ship it, at your own risk and with no warranty.

**Credits.** Built by **Rajat Malik** ([rajatmalik.dev](https://rajatmalik.dev/)). Bundled typefaces: **Inter** and **JetBrains Mono**, both under the SIL Open Font License 1.1, with their licence files in `public/fonts/`.

**Security posture, stated rather than implied.** DeepWork's defence is that it has almost no attack surface: local assets, a local database, no backend and no remote content. What that means concretely, including the parts that are not reassuring:

- **No Content Security Policy is set** (`"csp": null` in `tauri.conf.json`). The app cannot reach remote content by design, but a CSP would be the belt to that braces, and it is not there.
- **Downloaded installers are not signature-verified** before being started — because they are unsigned, so there is nothing to verify. The download is restricted to `https` links to this project's own GitHub releases and to a file the app wrote itself, and that is the whole of the guarantee.
- **Only `http`, `https` and `mailto` links are opened**, with control characters refused, and they open in your real browser rather than inside the webview.
- **Release builds have no web inspector** (see [Install, build and develop](#install-build-and-develop)), and a second instance is refused so two copies cannot fight over the database.
- **Every port and permission the desktop shell needs** is declared in `src-tauri/capabilities/`, rather than the frontend being given blanket access.

Found a security problem? Open an issue at [github.com/malikrajat/deepwork/issues](https://github.com/malikrajat/deepwork/issues) with as much detail as you can share — or use the contact details on the About page if the report should not be public.
