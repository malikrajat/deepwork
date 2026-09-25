# Feature Specification: Diagnostics (log files) and the CI pipeline

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-21

## Summary

When DeepWork misbehaves on somebody else's machine there is nothing to look at:
the app leaves no record, and the report is a sentence like "the timer vanished".
This feature gives the app a memory — **five small log files**, one per kind of
trouble, rotating on their own — and gives the user a button that opens the folder
they live in. It also adds the pipeline that stops a broken change before it
becomes a build: lint, format, unit tests and a compile, on every push and pull
request.

## User Scenarios & Testing

### Primary stories

1. **Find the logs.** The user opens **Settings → Logs & Diagnostics** and presses
   _Open log folder_. Explorer, Finder or the Linux file manager opens the folder,
   and the panel shows the path it opened.
2. **Send something useful.** The user presses _Copy diagnostics_ and pastes one
   block: the build, the platform, the page, the log folder and the last 300 lines.
3. **Read the right file.** An investigator opens `crash.log` for a crash,
   `network.log` for a request that never arrived, `flow.log` to see what the user
   was doing, `system.log` for window/tray/OS trouble, and `deepwork.log` when they
   do not know where to start.
4. **Leave it running.** Nobody has to prune anything: each file rolls over at
   512 KB and keeps five archived generations.
5. **Trust the pipeline.** A push or pull request runs lint, format-check, unit
   tests and the production build; the built site is downloadable from the run.

### Acceptance criteria

- **AC-1** The desktop app writes `deepwork.log`, `system.log`, `flow.log`,
  `crash.log` and `network.log` into the OS log folder
  (`%LOCALAPPDATA%\com.deepwork.app\logs` on Windows,
  `~/Library/Logs/com.deepwork.app` on macOS,
  `~/.local/share/com.deepwork.app/logs` on Linux).
- **AC-2** Each file rotates at 512 KB (`<name>_<date>_<time>.log`) and keeps at
  most five archived generations.
- **AC-3** _Open log folder_ opens the real folder in the platform's file manager
  and reports the path; a failure is shown in the panel rather than swallowed.
- **AC-4** Uncaught errors, unhandled rejections, Angular `ErrorHandler` errors,
  `console.error`, `console.warn`, failed/non-OK requests and offline/online
  transitions are all recorded, each with the page and the time.
- **AC-5** Page changes, timer transitions, imports/exports and opening the log
  folder are recorded as user flow.
- **AC-6** A Rust panic is written to `crash.log` even when the logger was never
  attached (a failure during startup), and a failure to bootstrap the webview
  reaches `crash.log` too.
- **AC-7** Identical lines that repeat within two seconds are folded into one
  entry, so a render loop cannot evict the history that matters.
- **AC-8** Every log write is best-effort: no logging call can throw, and a failed
  write never breaks the feature that was being logged.
- **AC-9** The browser build keeps the same log in memory and `localStorage`,
  reports that there is no folder to open, and still supports _Copy diagnostics_.
- **AC-10** `.github/workflows/ci.yml` runs ESLint, Prettier (changed files),
  Vitest with coverage, the Angular production build and `cargo fmt --check`, on
  pull requests, pushes to `main`, and on demand.
- **AC-11** The same workflow runs the Playwright suite against a server it starts
  itself, and uploads the report and traces; the job is advisory until the
  expectations that still describe the pre-refactor pages are updated.
- **AC-12** On pushes to `main`, tags and manual runs, a Windows/Linux/macOS
  matrix builds the real installers and uploads them as artifacts (`.msi`/`.exe`,
  `.deb`/`.rpm`/`.AppImage`, `.dmg`/`.app`), with the Rust build cached.
- **AC-13** Coverage counts every file in `src/app`, and the run fails if it drops
  below the recorded floor or if `src/app/core/utils/**` falls below 90%.
- **AC-14** Every run reports the distance to the 90% goal for the whole app.

### Out of scope

- Uploading logs anywhere: they stay on the machine they were written on.
- A log viewer inside the app (the folder and the clipboard are the interface).
- Log levels or retention being user-configurable.
- Building the Windows/macOS/Linux installers in CI (each still needs its own OS).

## Where it lives

| Piece                                                                                    | File                                                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Log files, rotation, panic hook, `log_folder` / `open_log_folder` / `log_write` commands | `src-tauri/src/logging.rs`                                                           |
| Frontend log, global capture, clipboard report, `ErrorHandler`                           | `src/app/core/services/log.service.ts`, `src/app/core/services/app-error-handler.ts` |
| Settings panel                                                                           | `src/app/shared/components/logs-panel/logs-panel.component.ts`                       |
| Pipeline                                                                                 | `.github/workflows/ci.yml`, `eslint.config.js`, `.prettierignore`                    |

## Verification

```bash
npm run lint          # ESLint, 0 errors
npm test              # Vitest
npm run test:coverage && npm run coverage:summary   # the coverage gate + the 90% goal
npm run e2e           # Playwright against a server it starts itself
npm run build         # Angular production build
cargo test --manifest-path src-tauri/Cargo.toml --lib   # logging.rs unit tests
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```
