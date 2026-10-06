# Changelog

All notable changes to DeepWork are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **The update card can be turned down for good — and closed.** It offered two
  answers, "Update" and "Remind me later", and both of them were about *when*:
  waving the card away snoozed it for twelve hours, so the same release came back
  the next morning whether or not the user wanted it to. It now carries three
  ways out. The corner **close** button is the deferral — the same twelve hours
  as **Remind me later**, which is what a close button on a notice usually means
  — and **Skip this version** is the answer that ends it: that release is never
  offered again, and is never announced by a system notification again either,
  while a *newer* release is still a new question and is asked at once. Skipping
  takes nothing else away — the sidebar's update pill and the About page's own
  update actions are untouched, so the deliberate route to a new version is
  still there.

### Fixed

- **A red check no longer costs the installers or a release.** The installer
  matrix waited on lint, the unit tests, the build and the browser suite, so a
  single failing Playwright expectation meant no `.exe`, no `.msi`, no `.dmg`,
  no `.AppImage` — and, on a tag, no release to download them from. The jobs are
  now independent: each one runs on its own evidence and reports its own result,
  and nothing waits on anything else. The one dependency left is the release job
  attaching the files the installers upload, which is a data dependency rather
  than a gate. `tauri build` runs the front-end build itself, so a compile that
  does not work still fails the installer on its own terms.
- **The end-to-end suite describes the app as it is.** The water-reminder card
  in Settings has been on by default since the reminder became a nudge, and the
  E2E test still asserted the removed default — a switch that started off with
  its working hours disabled — which is what failed CI. The test now checks both
  directions of the switch against what the app actually does.
- **There is no 32-bit Linux installer, and the matrix no longer pretends
  otherwise.** The `i686-unknown-linux-gnu` entry failed inside
  `apt-get install` on every run it ever had: DeepWork's tray is a required Cargo
  feature, and Ubuntu publishes no appindicator library for i386 at all
  (`libappindicator3-dev` and `libayatana-appindicator3-dev` are built for amd64,
  arm64, armhf, ppc64el, riscv64 and s390x — never i386, in jammy or in noble),
  so the link could not be satisfied on a GitHub runner. The entry, its i386
  package step and the i386 `pkg-config` override are gone, along with the
  `build:linux32` script: a 32-bit Linux build needs a Debian i386 environment,
  which is a different job rather than another line in this matrix.

---

## [2.0.19] – 2026-10-06

### Fixed

- **"Update now" no longer tries to run a `.zip`.** The app offers to install a
  newer release itself: it downloads the file GitHub published for this machine
  and hands it to the OS. On a release whose Windows build is a portable archive
  rather than a setup — v2.0.17 is one, and it has no `.exe` at all — the file it
  chose was `deepwork-windows-x64.zip`, and Windows answered `os error 193`, "not
  a valid Win32 application". What the user saw was a broken app. Two things were
  wrong and both are fixed. The file is now judged by **what it is**, not only by
  its extension: a release's three portable archives are all `.zip`, and only the
  word in the middle of the name (`deepwork-windows-x64.zip` beside
  `deepwork-macos-x64.zip` and `deepwork-linux-x64.zip`) tells them apart, so a
  name that says which platform it is for now decides before the extension does.
  And the updater only offers **Update** when the release carries something it can
  actually run — the Windows setup or `.msi`, a `.dmg` on macOS, a
  `.deb`/`.rpm`/`.AppImage` on Linux. A release of portable builds gets a
  **Download** button that goes to the file for this machine and says why, which
  is the honest version of the same offer. The desktop side refuses too, so a
  stale window cannot talk it into starting a file it cannot run; the refusal is
  a sentence naming the file and pointing at the release page.
- **Always on top now stays on top.** The switch was applied once, by asking the
  desktop layer to set the flag — and that layer only ever calls the OS when its
  *own* cached idea of the flag changes. So the one call that would put a window
  back on top after Windows had dropped it was the one call it skipped, and
  "is it on top?" was answered from the cache rather than from the window. A
  window that had fallen behind therefore reported itself as on top, which is why
  the switch looked right while the window went under everything. The flag is now
  written straight to the OS (`SetWindowPos`, with no move, no resize and no
  focus), read back from the window's real style rather than from a variable, and
  **kept** there: a watcher re-asserts it whenever it finds the window without it,
  so a top spot lost to another application, a display change or a fullscreen
  window is regained instead of being lost until the setting is toggled off and
  on again. Every repair is logged. The tray menu's own **Always on top** tick is
  read from the window for the same reason, so the menu and the Settings switch
  cannot disagree with what is on screen. On Linux and macOS nothing changed —
  the platforms where the call is not honoured (Wayland) still say so.
- **A failed update check is retried once.** The startup check is what puts the
  update pill on the sidebar and the prompt on screen, and a machine that opened
  DeepWork before its network was up spent the whole session with neither. A
  check that could not answer — and has no stored release to show instead — now
  asks once more after 90 seconds. A check the user asked for is never repeated.

### Added

- **32-bit installers for Windows and Linux.** The installer matrix built one
  Windows and one Linux binary, both 64-bit. It now builds `i686` as well: a
  `.exe`/`.msi` for 32-bit Windows and an `.AppImage`/`.deb`/`.rpm` for 32-bit
  Linux, each with its own artifact and its own release file, so a 32-bit machine
  gets an installer for itself rather than a 64-bit binary it cannot run. macOS
  has no 32-bit entry and cannot have one — Apple removed 32-bit application
  support in 10.15. The two 32-bit entries are marked `continue-on-error`: the
  32-bit Linux build needs the whole WebKitGTK stack for i386, which is not in
  every Ubuntu mirror, and a matrix job that cannot assemble it should not cost
  the other architectures their release. A first run is how we find out.
- **The release now refuses to publish two files with one name.** Every
  architecture's installers are collected into one folder before they are
  attached, so a name two of them shared would mean one silently replacing the
  other — and a release that looked complete while missing a platform. The names
  are expected to differ (`_x64` beside `_x86`, and `.AppImage`/`.deb`/`.rpm` per
  target); the release job now checks, fails loudly, and lists what it collected.

### Changed

- **"Later" is a snooze, not a goodbye.** Dismissing the update card stored the
  version and never mentioned it again — so one click on the wrong button, or a
  "not right now" during a busy morning, meant the update was never offered
  again while the sidebar went on showing a pill nothing explained. The card now
  comes back twelve hours later, and the button says **Remind me later** so that
  is what it means. The one system notification per version is unchanged: only
  the in-app card returns. A dismissal written by an older build — which has no
  time beside it — is read as long overdue rather than as forever, so the users
  who were silenced by it are the first to see the card again.
- **The About page's install button only appears when there is something to
  install.** It used to be paired with whichever file `pickAssetFor` chose, so a
  portable archive could be offered as "Update now". The primary download row
  still resolves to the best file for the machine — now with the right one for
  the platform rather than the first file that matched.

---

## [2.0.18] – 2026-10-04

### Added

- **The web build counts its own visitors, and Settings shows what the counter
  knows.** The app has no server of its own, so its visitor counter is somebody
  else's: [GoatCounter](https://www.goatcounter.com/), the same one that runs on
  [rajatmalik.dev](https://rajatmalik.dev/). GoatCounter records no domain — only
  a path — so the app files every page under its own `/deepwork` prefix, which is
  what keeps the two apart in a dashboard that cannot tell them apart by
  hostname. `Settings → Visitor Counter` shows the current figure and a
  **Details** button; the popup holds the visitors, pages, referrers, browsers,
  systems, countries, languages, screen sizes and campaigns GoatCounter has for a
  chosen range, and underneath them what this page can see about the person
  reading it — referrer, campaign, entry page, screen, language, time zone,
  connection — read from the browser and sent nowhere. Browser, OS and device
  identification is [rm-ng-device-detection](https://www.npmjs.com/package/rm-ng-device-detection)'s
  job rather than this app's: a device list goes stale quietly, and a library
  that is kept current detects the phone somebody is actually holding. The
  switch that turns counting off lives in the popup, next to the report it is
  about: off means the script is never fetched at all. The aggregate lists come
  from GoatCounter's JSON API, which needs an API token with **Read statistics**
  ticked; it is pasted into the popup, kept in that browser's `localStorage`, and
  never written to the database or into an export. Only the browser build is
  counted: the packaged desktop app has no web address to report, and its
  settings row says so rather than showing a figure that would never move. The
  counter script is pinned and integrity-checked rather than fetched fresh, and
  the API requests are paced to stay inside GoatCounter's four-a-second limit. The
  token can also be baked into the build — `GOATCOUNTER_API_TOKEN` in
  `visitor.constants.ts`, empty by default — which suits a build whose reader is
  the site's own owner; the constant's comment says plainly that a token written
  there is published with the bundle, and the popup's own field stays the way to
  keep one in a browser instead.

- **The installers a run builds are now downloadable — and a version tag turns
  them into a release.** The installer job used to compile a Windows, a Linux and
  a macOS bundle, print that it had, and let the runner take the files with it:
  the only way to get a `.dmg` out of CI was to build one locally. Each platform's
  installers are now uploaded as a named artifact, so a run can be downloaded
  from, and pushing a `v`-tag attaches all of them to the GitHub release — which
  is where the app's own "get DeepWork" links have always looked for them. The
  artifacts are kept for two days: long enough to fetch an installer from the run
  that built it, and then GitHub deletes them, which costs nothing because the
  release carries the same files for good.

- **macOS ships two installers, one per chip.** A Mac is either Intel or Apple
  Silicon, and a build compiled for one is not the build for the other. The
  matrix now has an entry for each: `aarch64-apple-darwin` on GitHub's
  Apple Silicon runner, and `x86_64-apple-darwin` on the explicitly-labelled
  Intel one (`macos-13` used to be that runner; GitHub retired it). Each has its
  own artifact, its own release file and its own Rust build cache, so the two
  never overwrite each other.

### Changed

- **The water reminder is on out of the box, and a drink counts as 30 ml.** The
  nudge was opt-in and counted 500 ml a drink, which asked the user to find a
  setting before the feature did anything and then recorded a bottle every time
  they took a mouthful. It is now on by default — it asks a question rather than
  announcing a fact, so "Not now" is one click — and a drink is 30 ml: the
  smallest thing anyone would call a drink, so a day of sipping adds up honestly
  instead of a handful of guesses at half a litre each. Both are still choices in
  Settings, and the day's target is unchanged at 2 L; only the number of drinks it
  takes to reach it.

- **Markdown is no longer formatted by Prettier.** Documentation, agent
  instructions and the skill packages under `.agents` are prose: Prettier reflows
  them to `printWidth`, which rewrites whole paragraphs and tables on files nobody
  meant to reformat — and the installed skills are checked against a hash, so any
  reformatting there is undone by the next install. The exclusion is by extension
  (`*.md`, `*.markdown`, `*.mdx`), so it also covers the files that arrive later.

- **The end-to-end suite blocks the build instead of reporting on it.** It ran
  with `continue-on-error`, because a third of its expectations still described
  the pages before the current refactor. Those have been rewritten against the
  pages as they are, so the suite is green and every job that builds something now
  waits for it — an installer is only worth packaging for a commit that passes.

### Fixed

- **The visitor counter's details popup can be read.** It was drawn on
  `--glass-bg`, which is 4.5% white — the token for a surface *inside* a card that
  is already there, and exactly wrong for the one panel that has nothing behind
  it. On that background the popup was a see-through sheet with the app's own
  text showing through it, so none of it could be read. It now uses
  `--surface-float`, the token meant for something floating above the app (0.9 in
  the dark theme, 0.92 in the light one), and the first-run desktop dialog — which
  had the same flaw — was fixed with it. The two explanatory rows that used to sit
  under the settings figure are gone: the counting switch moved into the popup,
  where a decision rather than a number belongs, and the token's state went
  entirely, because the popup already says what the token can and cannot do.

- **The dashboard no longer changes shape with the filter.** Narrowing the dates
  or switching scope used to redraw a different page: the chart disappeared when a
  range had no whole days in it, the pages card was missing until its answer
  arrived, a counter with nothing filed under it replaced the entire report with a
  sentence, and a card with no rows looked nothing like a card with rows. Every
  range and every scope now draws the same four tiles, the same chart frame and the
  same eight cards — what changes is the numbers in them. A card with nothing to
  report carries one `No visitors yet · 0` row, the chart frame stays put with
  `no visits yet` written in it, a figure with no answer shows `0` in the slot it
  always occupies, and an empty counter is a note above the report rather than
  instead of it.

- **The visitor dashboard was the width of a settings card, not of the window.**
  It rendered from inside the Settings row that opens it, and that row sits in a
  `.setting-group` carrying a `backdrop-filter` — and an element with one becomes
  the containing block for `position: fixed` descendants, so a panel asking for
  the whole window was measured against the card instead. It renders from the app
  shell now, which neither clips it nor re-bases it, and it starts where the
  sidebar ends rather than over it: the sidebar keeps its own width (240px open,
  68px collapsed, and absent in focus mode) and is measured when the panel opens.
  The shell defers it to idle, so a dashboard most visits never open arrives as
  its own 25 kB chunk instead of riding along in the first load.

- **The details popup now reads as a report rather than a wall.** It opens with
  four tiles across the top — everything GoatCounter has ever recorded, the
  selected range, today, and this month — and every number below them says what it
  counts ("unique visitors", not pageviews; "visitors each" over the page list).
  Every card carries a one-line footnote saying what its list is: search engines
  and referring sites, the country worked out from the request, the language the
  browser asked for. The referrer rows say what *kind* of referral each one is —
  referring site, search engine, campaign, or none at all — the way GoatCounter's
  own dashboard does. The app's own figure is given its denominator too: the same
  range for the whole GoatCounter site, because one site carries two apps and "12
  visitors" means something different depending on which of the two it is. Each
  list is twenty rows deep rather than ten, and a paragraph under the tiles says
  what a visitor is in GoatCounter's terms: one browser session, counted once per
  page, with crawlers ignored and ad blockers hiding a visit entirely.

- **The web app can be installed again — its manifest and service worker were
  404s on the deployed site.** GitHub Pages serves this app from a sub-path
  (`/deepwork/`), and the three files that make an app installable were written as
  root-absolute URLs: `/manifest.webmanifest`, `/icons/128x128.png` and `/sw.js`
  all resolved to the *domain* root, where they are somebody else's 404. With no
  manifest, Chrome and Edge have nothing to install, which is why no install icon
  ever appeared in the address bar; the service worker's pre-cache list (`/`,
  `/manifest.webmanifest`) failed on the same URLs, so the worker never finished
  installing and offline never worked either. Every one of those paths is relative
  now — resolved against the `<base href>` the build sets — so the same files work
  at a domain root (the desktop webview, `ng serve`) and under a sub-path. The
  manifest's `start_url`, `scope` and icon paths were absolute for the same reason
  and are relative too, and its `orientation` no longer demands portrait from a
  desktop-first app. The install instructions now say what each browser actually
  does, instead of describing a Chromium icon to everybody: Chromium has the
  address-bar icon, Safari installs from *File → Add to Dock*, and Firefox cannot
  install a web app at all.

- **The mini widget is always on top, and the always-on-top switch tells the
  truth.** Three things were wrong. The widget asked to be put on top *before*
  reshaping and showing itself, so the shape it ended up in was not the shape that
  was raised; that request is now the last thing done, after the window is on
  screen. The setting could also be turned *off* while the widget was up — from
  Settings or from the tray menu — which is the one state a widget cannot be in:
  the desktop layer now remembers that the window is the widget and will not take
  it off the top until it is a window again, and the tray's tick follows the
  window rather than the request. And the switch never checked anything: it
  reported what it had asked for rather than what the window did, so a desktop
  that cannot honour the request looked exactly like a switch that worked. The
  call is now followed by a read-back, and its answer is what the switch and the
  stored preference follow. That matters most on **Wayland**, where no application
  may raise its own window — the compositor decides the stacking order, `tao`
  records the same limitation
  ([tauri-apps/tao#1134](https://github.com/tauri-apps/tao/issues/1134)) — so the
  panel disables the switch there and says why, with the way round it:
  `WAYLAND_DISPLAY=` runs the app through X11/XWayland, where it works.

- **Four window permissions the app was already asking for were missing.** The
  capability list granted less than the code called: `scale-factor`,
  `is-maximized`, `current-monitor` and `monitor-from-point` were all refused, and
  every one of them was swallowed by a `.catch()` — so a maximised window came
  back from the mini widget un-maximised, and the "fit the restored window inside
  the monitor that owns it" rescue silently never ran, which is what keeps a
  window from being restored onto a screen that is no longer there. All four are
  granted now.

- **A task's Cancel and Create/Save buttons no longer fall below the window when
  the form is long.** The slide panel is exactly one window tall and the form
  inside it had no way to scroll, so with *Advanced options* open — which is how
  the edit panel always opens — the buttons ended up past the bottom of the
  screen with no way to reach them. The fields scroll inside the panel now, and
  the two buttons stay pinned to the bottom of it.

- **The install banner no longer covers the sidebar's collapse button.** The
  banner is fixed to the top of the window, and the app shell started underneath
  it: on a first visit, clicking the collapse chevron did nothing because the
  banner was on top of it. The shell now leaves the banner's height free, from one
  shared value, so the two cannot drift apart.

- **A habit can no longer be added without a name.** The Add button was bound to
  the form's validity, but the name field had no validator, so it was never
  invalid — the button stayed enabled and an empty one landed in the list as a
  blank card. The name is required (and must be more than whitespace), which is
  what the button was always reading.

---

## [2.0.17] – 2026-10-01

### Added

- **The card raised when a task is finished now says something worth reading.**
  Ticking a task off from the matrix has always raised a card — _Task completed_,
  with the task's title under it — while the two cards the timer raises have
  carried a line of their own since 2.0.14. The finished-task card now has one
  too, drawn from a third list of twenty-four lines written for this app
  (`TASK_QUOTES`), about the list rather than about the session: one item closed,
  one item shorter, and the small quiet win that a board is supposed to be made
  of. The list is walked one entry per finished task, so two tasks in a row never
  get the same sentence, and the count is kept by `NotificationService` rather
  than by the page that raises the card — so whichever surface raises it next
  draws from the same list in the same order.

  The card is deliberately **not** an alert: no tone, no repeat and no desktop
  notification. A task gets ticked off dozens of times a day, and the alert's
  machinery (a tone every minute until it is answered) is the fastest way to have
  the sound turned off. What it borrows is the shape — the news on one line, the
  encouragement on another, never glued into one sentence.

- **`docs/code-signing.md` now covers a scanner aggregator, not just Defender.**
  The 2.0.15 installer came back from VirusTotal at 1/71 — SecureAge's static ML
  engine alone, with the other seventy undetected. The page names what that is
  (one engine's opinion on the bytes of a small, freshly built, **unsigned**
  installer), what clears it (a false-positive report to the engine that flagged
  it, plus the certificate that settles every scanner at once), and what must not
  be done about it — renaming or repacking the file to move its hash, which is how
  a legitimate download starts looking like a dodgy one.

### Changed

- **The version is 2.0.17, in every place it is written down**, moved in one pass
  by `npm run version:bump -- 2.0.17`.

---

## [2.0.16] – 2026-10-01

### Added

- **A choice about what happens to work you did not finish.** DeepWork has
  always carried unfinished tasks forward: a task not ticked off stayed open, in
  the section for its own day, and the backlog only ever grew. It is now a
  setting — **Carry forward unfinished tasks**, under _Tasks_ in Settings. On,
  which is the default and the behaviour the app shipped with, nothing changes:
  work you did not get to keeps its place and stays open. Off, a task is closed
  automatically once its own day has passed — its deadline when it has one, the
  day it was written when it has not — so a Tuesday task left unfinished is
  marked done on Wednesday and the day it names means something again. Turning
  the switch off sweeps immediately rather than at tomorrow's start, because the
  switch is a statement about the backlog already in front of you; turning it
  back on stops the closing but does not reopen anything, which is the honest
  kind of undo (drag the cards back on the Tasks page).

- **The app now says what its analysis is, where the analysis is read.** The
  Analytics page has always done more than draw charts — every figure is paired
  with a plain-language reading of it, drawn from the sessions, tasks, habits and
  journal entries in the local database — and About → _DeepWork & updates_ now
  has an **Offline AI** card, plus a one-line _Analysis_ fact and an _Offline AI_
  pill on the Analytics header. All of it describes where the reading happens:
  on this machine, against your own records, with no account, no API key, no
  server of its own and nothing uploaded, pooled or used to train anything.
  The same sentence reaches the two places the app introduces itself outside its
  own window: the installer and the file properties of the built `deepwork.exe`
  (`shortDescription`/`longDescription` in `tauri.conf.json`), and the
  installable web app's description in `manifest.webmanifest`.

### Changed

- **The schema moves to version 10.** `010_carry_forward_tasks.sql` adds
  `carry_forward_tasks INTEGER NOT NULL DEFAULT 1`, so an existing database
  keeps the behaviour it had — carry forward — until someone asks for the other
  one. The value is repaired on read like the rest of the settings, so a
  hand-edited store cannot leave the choice holding anything but a yes or a no.

- **One door for the start-of-day housekeeping.** The four pages that could be
  opened first thing in the morning each ran their own `dailyReset()` and
  `generateRecurringInstances()`; the Tasks and Analytics pages ran neither. All
  six now call `TaskService.runDailyUpkeep()`, which closes what the calendar has
  closed, re-asks the day's quadrants and generates today's recurring instances,
  in that order — so a deep link opens the day the same way the boards do.

- **The version is 2.0.16, in every place it is written down**, moved in one pass
  by `npm run version:bump -- 2.0.16`.

---

## [2.0.15] – 2026-09-30

### Changed

- **The packaged app no longer carries a web inspector.** The `devtools` cargo
  feature is gone from `src-tauri/Cargo.toml`, which is the switch that carries
  the inspector into a _release_ build — `tauri-runtime-wry` only calls
  `with_devtools` behind `cfg(any(debug_assertions, feature = "devtools"))`, so
  what ships now has no inspect entry in the context menu, no `F12` and no
  `Ctrl+Shift+I`, on every platform. `npm run tauri:dev` is unchanged: debug
  builds get an inspector either way. The window's `"devtools": true` in
  `tauri.conf.json` is what a debug build reads and a release build ignores, and
  it is left there so the development loop keeps what the shipped app loses.

- **Inter and JetBrains Mono are shipped with the app instead of fetched from
  Google on every start.** `index.html` no longer links
  `fonts.googleapis.com`; the four subset files (two per family, variable
  weights, 172 kB) live in `src/fonts/` and are declared with `@font-face` in
  `styles.css`, hashed into the bundle by the build like any other asset. That
  removes two third-party requests from an app whose whole promise is that the
  user's machine is the only place anything happens, and it fixes the case the
  desktop build was quietly weak on: a machine that is offline, behind a proxy,
  or simply not allowed to reach Google used to draw its own UI in fallback
  fonts until — or unless — that request succeeded. Both families are SIL Open
  Font License 1.1, and the licences ship beside the app in `public/fonts/`.

- **The version is 2.0.15, in every place it is written down**, back on the 2.0
  line the releases are published under, written in one pass by
  `npm run version:bump -- 2.0.15`. The entries below this one describe changes
  that this build also carries.

### Added

- **`docs/memory-footprint.md` is current again** — the fonts and the inspector
  have moved out of its "levers not taken" table and into what the app does, and
  the measurement behind the numbers is reproducible from the script at the end
  of the page.

---

## [2.3.1] – 2026-09-30

### Changed

- **The webview lets go of its caches while DeepWork sits in the tray.** Asked
  why the app shows ~92 MB, the answer turned out to be mostly Chromium: measured
  on a running window, `deepwork.exe` holds 14 MB and the seven WebView2
  processes around it (browser, GPU, renderer, network/storage/audio utilities
  and the crash handler) hold the rest — a Tauri window _is_ a WebView2 window,
  and that is the floor it stands on. What could be improved is the state the app
  spends much of its life in: hidden next to the clock, where nothing is on
  screen but Chromium is still holding caches sized for a visible page. The
  window now asks WebView2 for `COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW` when
  it is hidden and `NORMAL` when it is restored
  (`set_webview_memory_target` in `src-tauri/src/lib.rs`, via
  `ICoreWebView2_19`). It is a **hint, not a suspension** — `TrySuspend` would
  stop the page's scripts too, and the timer that keeps counting in the tray is
  the whole point — and it is best-effort by construction: an older WebView2
  runtime, a window that has gone, or a refused call all do nothing.

- **The first suggestion — lazy routes — was already true**, and is now written
  down rather than re-checked every time it comes up: all eleven routes use
  `loadComponent`, the initial bundle is 68 kB, the matrix page's own strings are
  absent from it, and the 40-odd page chunks load as they are visited.

- **The version is 2.3.1, in every place it is written down**, written in one pass
  by `npm run version:bump -- 2.3.1`.

### Added

- **`docs/memory-footprint.md`** — the measurement above, what the app already
  does to stay lean (bounded log, no render loops, no service worker in the
  desktop build, no large assets), and the levers _not_ taken with their prices:
  `--enable-low-end-device-mode` (softens the crispness work), fewer blurred
  surfaces (the GPU process is the biggest single line), `TrySuspend` (stops the
  tray timer), quitting on close instead of parking in the tray, `devtools:
false` in the packaged build, self-hosting the two web fonts the desktop build
  currently fetches from Google at startup, and the rewrite a native toolkit
  would mean.

---

## [2.3.0] – 2026-09-30

### Changed

- **The alert's shake is fast now, whatever length it is set to.** Setting a
  _longer_ shake used to buy a _slower_ one: the animation spanned the whole
  configured time, so 2.2s was one lazy lean with four swings to fill, and 4s
  would have been the same lean dragged out twice as far. The length is the
  user's question — it has to outlast the tone — but the tempo was never the
  point, so the length is now _divided_ into swings of about 120ms (roughly eight
  a second, fast enough to read as "this, again" from across a desk and slow
  enough to see as motion rather than blur) and the stylesheet repeats one swing
  as many times as it takes: 0.7s is six quick swings, 2.2s eighteen, 4s
  thirty-three. The two numbers travel to the stylesheet as
  `--alert-shake-swings` and `--alert-shake-swing-ms`, re-spread so the total is
  still the chosen length to the millisecond, and `prefers-reduced-motion` still
  turns the whole animation off.

- **The version is 2.3.0, in every place it is written down**, written in one pass
  by `npm run version:bump -- 2.3.0`.

### Fixed

- **The same task no longer takes two cards on Today.** Reported from the app:
  "I added a task yesterday and added the same task today, and Today shows it
  twice." It did — and the cause was the rule, not the drawing. A task on today's
  list qualifies two ways: by its **own date** (dated today, or written today), or
  by the **star** ("Add to Today"), which is sticky by design because it is the
  user's own instruction — and which the quick-add dialog and the importer's
  _Add to Today_ column both set. So yesterday's copy was still on the list, and
  adding the same work again today put a second, identical card beside it. Today's
  list is now deduplicated by title, compared the way the importer compares them
  (trimmed, case-insensitive): the copy whose own date is today wins, because that
  is the one just written down and the one whose status is current, and the older
  copy is left untouched — it is still a task, still on the Tasks page under its
  own day. Nothing is deleted, and two different tasks are never merged. The rule
  lives in one place, `TaskService.todaysTasks()`, so the Today board, the
  dashboard's counter, the timer's task picker and the matrix rails cannot
  disagree about what the day holds.

---

## [2.2.0] – 2026-09-30

### Changed

- **How long the mini widget shakes for is a setting now.** The shake is the
  alert's repeat made visible, so its length is really a question about the
  _tone_ it is beating along with — the chosen ones run from 0.6s (ding) to 1.5s
  (bell) — and a fixed 2.2s was a guess at where that conversation ends.
  **Alert shake** in Settings offers 0.7s, 1.2s, 1.6s, 2.2s, 3s and 4s, from a
  fixed list like every other choice in that panel (migration
  `009_alert_shake.sql`, and `repairSettings` puts a hand-edited number back on
  the list). The widget reads it as the `--alert-shake-ms` custom property it
  takes with the alert's colours, and 2200ms stays the fallback, so nothing
  depends on the settings having loaded. The full window's card keeps its own
  short shake: it is in front of someone who is already looking at the screen,
  while the widget is out among other windows and is the one that has to outlast
  the sound to be seen at all.

- **The completion alert speaks its mind.** A finished session used to say only
  what happened ("Great work! Time for a short break."); it now also carries a
  line worth reading, from two lists of twenty-four written for this app —
  `FOCUS_QUOTES` for the end of a focus session and `BREAK_QUOTES` for the end of
  a break, because those are opposite instructions (step away, come back) and one
  list could not say both. The list is walked one entry per finished session
  rather than per repeat, so the sentence does not change under the user mid-read
  while the tone keeps coming back. The line is drawn **apart from the message**
  on every surface — a third `placement="attribution"` text line in the Windows
  toast, a paragraph after a blank line in the plugin and browser fallbacks, the
  indented rule and tint on the in-app card — which is the machinery the water
  reminder's quote already used. Nothing is copied from anywhere: the public
  quote APIs hand back random, largely off-topic lines, and a famous sentence is
  one misattribution away from being worse than none — every line here is written
  for this timer, this block and this desk, the same way `WATER_QUOTES` is.

- **The version is 2.2.0, in every place it is written down**, written in one pass
  by `npm run version:bump -- 2.2.0` rather than by hand.

---

## [2.1.0] – 2026-09-30

### Changed

- **The water reminder's system notification now waits to be dealt with.** On
  Windows it is posted as a **`reminder` toast with a long duration** — the one
  shape the shell has for "stay on screen until the user dismisses or answers
  this" — instead of the default toast that slides away after a few seconds and
  leaves the question in the notification centre for someone who has already
  moved on to something else. A nudge that disappears while the user is
  heads-down is a nudge that was never delivered, and the card behind it is
  already the one thing in the app that waits for an answer. The command tries
  the waiting toast first and falls back to a plain one, so a shell that refuses
  the scenario still gets told the glass is due; macOS, Linux and the browser
  build post the notification the way they always did, because their API has no
  duration to set.

- **Every notification now keeps its message and its motivational line apart.**
  The quote used to be a second sentence glued onto the message with a space, so
  a Windows toast, the notification plugin and the in-app card each rendered one
  run-on paragraph. `quote` is now a field of its own from
  `NotificationService.announce` all the way down: the Windows toast gives it a
  third `<text placement="attribution">` line — the toast's own smaller, muted
  style — the plugin and browser fallbacks get a blank line before it, and the
  in-app card draws it with the same indented rule and tint the water nudge card
  uses. The water reminder is the message that carries a quote today; anything
  else that gains one gets the separation for free.

- **The app's one-off notifications no longer share a handle with the completion
  alert.** A tagged post replaces the one before it, so a water reminder and an
  unheard completion alert were overwriting each other in the Action Center. Each
  message posts under its own handle now — `deepwork-water` and
  `deepwork-update` beside the alert's `deepwork-alert` — which is what the
  alert's repeats depend on and what the other two were taking away from it.

- **The mini widget's alert shake runs for 2.2 seconds, up from 1.2.** The shake
  is the alert's repeat made visible, so it has to last at least as long as the
  tone the user is hearing — and the longest of the chosen tones (the bell) runs
  for a second and a half, which the old shake stopped well short of. The extra
  time is spent on more swings at the tempo the shake already had rather than on
  stretching each one into a slow lean, so the widget stays on the tone's own
  beat for as long as the tone lasts.

- **The version is 2.1.0, in every place it is written down.** `package.json`,
  `package-lock.json`, `src-tauri/Cargo.toml` and its lock,
  `src-tauri/tauri.conf.json` and `APP_VERSION` all read **2.1.0**, written in one
  pass by `npm run version:bump -- 2.1.0` rather than by hand.

---

## [2.0.13] – 2026-09-30

### Changed

- **The Windows installer writes nothing outside its own folder — the startup
  prompt is gone, and with it the detection that quarantined 2.0.12.** Windows
  Defender blocked the 2.0.12 `-setup.exe` as
  **`Behavior:Win32/Persistence.A!ml`**, severity _Severe_, and quarantined the file
  before the install could finish. It was describing something real: the NSIS hook
  (`src-tauri/nsis/hooks.nsh`, wired up as `bundle.windows.nsis.installerHooks`)
  asked whether DeepWork should start with Windows and, on _Yes_, wrote
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\DeepWork` — and a freshly
  downloaded, unsigned installer writing a per-user `Run` value is the shape
  heuristics call persistence. A `Behavior:` detection is not a byte match that a
  submission can talk Microsoft out of: the code was doing the thing, so the hook
  and the file are gone. The **one-time first-run dialog** — which macOS `.dmg`,
  Linux `.deb` and `.AppImage` users have had all along, because no installer can
  show them a checkbox — is now the only place the desktop build offers "start with
  the system", next to "always on top" and "keep running in the tray", and the entry
  is written only when the user turns it on, by the app, after it is installed. A
  silent or passive install is no longer a special case, Tauri's uninstaller still
  deletes the `DeepWork` value, and `docs/code-signing.md` grew the section that
  tells a byte match from a behaviour match, plus what to do about a build that
  predates this change.

- **The version is now bumped by one command instead of by hand.**
  `scripts/bump-version.mjs` (`npm run version:bump -- x.y.z`, with
  `npm run version:check` to prove they agree) rewrites every file that spells the
  number out: `package.json` and its lock, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml` and its lock, `APP_VERSION`, and the artefact names in
  `README.md`, `SETUP.md` and `docs/code-signing.md`. CI runs the check from the
  lint job, so the next release cannot ship a README that names last month's file.
  `CHANGELOG.md` is deliberately left alone: it is the record of the versions of
  the past, and rewriting it would erase that.

- **The version the installers report is 2.0.13, in every place it is written
  down.** `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` and its lock,
  `src-tauri/tauri.conf.json` and `APP_VERSION` (what the About page shows and what
  the update check compares against GitHub) all read **2.0.13**, so the number on
  the installer, in Apps & Features, in the window's product metadata, on the About
  page and in the release comparison are the same number.

---

## [2.0.12] – 2026-09-29

### Changed

- **The version the installers report is 2.0.12, in every place it is written
  down.** `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` and its lock,
  `src-tauri/tauri.conf.json` and `APP_VERSION` (what the About page shows and what
  the update check compares against GitHub) now all read **2.0.12**, so the number
  on the installer, in Apps & Features, in the window title's product metadata, on
  the About page and in the release comparison are the same number. They are five
  separate build systems and they do not read each other; that is why the version
  is written down five times and why the list is spelled out here.

- **The native widget's frame is rounded now, like the browser build's — the
  rectangle was the last thing that made the desktop build look like the odd one
  out.** The shrunken window was designed to fill its own window edge to edge with
  no rounding, because rounding it left the desktop showing at the four corners
  _behind a hairline the OS was drawing around the window_ — a rounded card inside
  a square outline, which is worse than either. That hairline is gone
  (`window_paint_widget_frame` repaints and extends the frame away while the widget
  is up), and the window has been created transparent since, so the corners really
  are empty now: the widget surface takes the same 18px radius in every build, the
  desktop shows through the four corners exactly as it does in the browser, and the
  browser build's floating panel no longer needs a radius of its own. `overflow:
hidden` is what keeps this the _frame's_ rounding: the ring, the bell and the
  buttons are clipped by the rounded surface rather than being rounded one by one.
  Windows 11 is also asked for rounded window corners directly
  (`DWMWA_WINDOW_CORNER_PREFERENCE`), which is the belt to the CSS's braces on a
  platform that can round a window itself. Held down by
  `tests/unit/visual-crispness.spec.ts`, which now asserts the radius is on the
  widget itself and not only on the browser panel.

- **The installer no longer fetches the WebView2 bootstrapper while it runs.**
  Tauri's default (`downloadBootstrapper`) has the NSIS installer reach out to
  Microsoft, download an executable and run it — which is the shape of a dropper,
  and it is one of the things a heuristic scanner scores a small unsigned
  installer on. The bundle now carries Microsoft's signed bootstrapper inside it
  (`bundle.windows.webviewInstallMode` = `embedBootstrapper`), so the install also
  works offline. `docs/code-signing.md` grew the section this belongs to — what
  SmartScreen's "unrecognised app" dialog is versus a real Defender detection, how
  to tell them apart on the machine that blocked the install, the
  [submission portal](https://www.microsoft.com/en-us/wdsi/filesubmission) that
  gets a wrong detection removed from the definitions for everyone, and the local
  "Run anyway"/`Unblock-File` steps that get one machine moving in the meantime.
  None of it replaces a certificate: SmartScreen has no per-file appeal, and a
  signature is the only thing that removes the warning for the next person.

- **A completion alert now repeats in three ways at once, and the desktop is one
  of them.** The alert used to repeat the tone and the in-app card and leave the
  system notification where it was, on the reasoning that the OS keeps its copy
  until the user clears it. That reasoning holds for a message and fails for an
  alert: a notification sitting in the Action Center is one nobody is looking at,
  which is exactly the state a repeating reminder exists to interrupt. So every
  repeat posts the notification again — **under the alert's own tag**, so Windows
  replaces the notification it is already holding instead of stacking one copy per
  interval, and the body carries a count (`Reminder 3 · Great work! Time for a
short break.`) so the replacement is something new to read. The plugin's desktop
  path cannot do this at all: it posts through `notify-rust`, which has no tag to
  post under, so the shell grew a small `alert_notify` command that builds the
  toast directly (`tauri-winrt-notification`'s WinRT layer, `src-tauri/src/lib.rs`)
  — silent, because the alert's tone is the app's own Web Audio. Non-Windows
  desktops still go through the plugin, and the browser build uses the
  Notification API's own `tag`.

- **The alert stopped being one colour, and started moving the whole widget.** One
  fixed blue was the right answer to "make it comfortable to look at while it
  waits" and the wrong one to "make it say _again_": a colour already on screen
  cannot re-announce anything, and neither can a motion happening inside a 136x76
  panel that is otherwise still. The alert now walks a **twelve-entry palette**
  (`ALERT_COLOURS`), one entry per repeat — sky, aqua, mint, lime, butter, amber,
  apricot, coral, rose, orchid, violet, indigo — each a pastel accent over a very
  dark surface of its own hue, so nothing is a saturated primary and no surface is
  a neutral black. Every hairline, button fill and focus ring is that accent at a
  lower alpha, derived rather than hand-copied. Both surfaces the alert owns read
  the same entry off the same pulse: the **mini widget** (surface, ring, bell and
  all four buttons) and the **full window's card**, so the same repeat is the same
  colour in both places. The motion moved from the ring to the **whole widget** —
  translate plus a rotation under 1.5°, never a scale, because the ring is drawn at
  its own size so nothing resamples it — and the card shakes with it, on the entry
  animation it already replays every time the service raises it again. The first
  entry is the blue the alert has always worn, so nothing changes until the second
  tone; under `prefers-reduced-motion: reduce` the shake is still switched off and
  the colour, which is the part that carries the meaning, is kept. Held down by
  `tests/unit/alert.constants.spec.ts` (the palette's length, its legibility and
  the one-entry-per-tone mapping), `tests/unit/notification.service.spec.ts` (the
  repeats, the tagged desktop post and the plugin fallback),
  `tests/unit/mini-widget.component.spec.ts`, `tests/unit/toast.component.spec.ts`
  and the alert test in `tests/e2e/mini-widget.spec.ts`, which drives a session to
  completion in a real browser and checks the panel itself is the thing animating.

- **The installers now name their publisher, and the way to sign them is written
  down.** Windows shows _Unknown publisher_ on the installer because it is
  unsigned — checked directly: `Get-AuthenticodeSignature` reports `NotSigned` for
  both the NSIS and MSI bundles. That line comes from the Authenticode signature
  and nothing else, so it cannot be fixed from inside the app; what could be fixed
  is everything that reads _metadata_ instead. `bundle.publisher` was unset, and
  Tauri was falling back to the second part of the identifier — `deepwork` — so the
  installer, Add/Remove Programs and the file properties now carry **Rajat Malik**,
  along with a copyright, a homepage, the Productivity category and short and long
  descriptions. `docs/code-signing.md` is the runbook for the part that needs a
  certificate: what a self-signed, OV, EV or Azure Trusted Signing certificate
  shows the user, the exact `tauri.conf.json` for a local certificate store or a
  cloud signer (including the `TAURI_CONFIG` merge for CI runners), how to verify a
  build before publishing it, and the two things worth doing while unsigned — a
  SHA-256 checksum next to each asset and a release note pointing at the tag and
  the CI run behind it.

- **The mini widget now changes colour when a session ends, rocks while it
  waits, and settles back once you deal with it.** An alert that has to be
  answered is worth noticing from across the desk, not only by someone already
  looking at a 136x76 rectangle, so a finished session turns the whole widget
  blue — the surface goes to a deep `#0d1b2a`, and the ring, the bell and the
  four buttons all take the same cool `#7dd3fc`. It is one colour rather than the
  session's gradient over it, because a teal circle on a blue box is a clash; and
  a cool, low-saturation blue rather than the amber this started as, because the
  alert may sit on screen unanswered for a long time and a hot colour is the one
  that stops being easy on the eyes. A colour that is already on screen cannot
  say _again_, though, so the widget also **moves on every tone**: the ring leans
  3px off centre and back over 0.7s, on the exact beat of the sound the user is
  hearing (`NotificationService` publishes a pulse per raise, and the widget
  alternates two identical rock animations because alternating names are what
  restart a CSS animation) — and nothing at all for anyone whose system asks for
  reduced motion, who keeps the colour, which is the part that carries the
  meaning. The change is a transition and not a cut — 450ms on the surface and
  the buttons, the ring's own 0.4s stroke crossfade — and answering it (the bell,
  play, skip, stop, or the card in the full window) puts the widget's own colours
  back. Held down by `tests/unit/mini-widget.component.spec.ts`,
  `tests/unit/notification.service.spec.ts` and the alert test in
  `tests/e2e/mini-widget.spec.ts`, which drives a session to completion and checks
  the surface really does change colour, that the ring is really rocking, and that
  both go back.

- **The white line around the mini widget is gone.** The widget had no border of
  its own — but Windows draws a hairline border around _every_ top-level window,
  decoration-less and transparent ones included, and colours it from the system:
  on a light setup that is a white line, which around a 136x76 widget reads as a
  frame the app never drew. Entering the widget now repaints that border in the
  widget's own surface colour (`DWMWA_BORDER_COLOR`, via the new
  `window_paint_widget_frame` command and `windows-sys`), so it disappears into
  the surface, and leaving the widget hands Windows its default back. Windows 10
  does not know the attribute and keeps the frame it always had; everywhere but
  Windows the call is a no-op.

- **The mini widget's ring now fills the way the Dashboard clock does.** The two
  progress surfaces read the same session from opposite ends — the Dashboard
  clock's arc grew as the session ran, while the widget's ring started complete
  and drained — so side by side they looked like they were running in different
  directions. Both read the one value now (`TimerService.progress`, 0 at the
  start and 1 when the time is up; the second computed, `remainingProgress`, is
  gone), so the widget's ring starts empty, fills clockwise at the same speed as
  the full window, and closes into a whole circle when the session ends.

- **The water reminder only counts the time DeepWork is running.** The cadence
  followed the wall clock, so the interval kept "elapsing" while the app was
  closed: the moment you opened DeepWork again — or started the PC — the first
  pass saw an overdue cadence and asked for water immediately, which reads as the
  app having run without you. It now keeps a heartbeat (`deepwork.water.lastAlive.v1`,
  refreshed by every pass of the loop and once more when the loop stops) and, on
  the first pass of a run, folds the time it was away into the last reminder's
  instant: the cadence resumes exactly where it stopped, so a reminder that was
  due 20 minutes into the time you were away arrives 20 minutes after you come
  back rather than on the doorstep. A store with no heartbeat to go by (written
  before this rule) counts the whole gap as time away, which costs one interval
  and never a reminder on the doorstep. What is _not_ changed is a machine that
  merely slept with the app still open: that still gets one reminder when it
  wakes, as it always did. Held down by `tests/unit/water-reminder.service.spec.ts`.

- **The mini widget is now a solid rectangle instead of a rounded card.** The
  widget was drawn as a rounded card inside its (rectangular) window: the window
  is transparent, so the four corners of the card were the desktop showing
  through — which on a light desktop reads as a dark box wearing a white border,
  with the OS still drawing its own rectangle around it. Rounding the card can
  only ever produce that mismatch, because the shape outside it belongs to the
  window, not to the app. The surface now fills its window edge to edge and is
  fully opaque, so the widget's colour reaches its own edge and nothing behind it
  can tint a corner; the hairline inset edge is unchanged. The browser build's
  floating panel keeps its 18px radius, because that one really does float over
  the app rather than being a window. A genuinely rounded widget would mean
  asking Windows to round the _window_ (`DWMWA_WINDOW_CORNER_PREFERENCE`) and
  matching the card's radius to the system's — a Windows-only change, noted in
  `specs/008-visual-crispness` and not done here.

- **Closing the window now parks DeepWork next to the clock instead of quitting.**
  A click on the X used to end the whole app — mid-session, mid-cadence — which is
  the one thing that cannot be taken back: the window is easy to reopen, a focus
  session that was quit by accident is not. The close button now hides the window
  and leaves everything running — the timer keeps counting, the water reminder
  keeps reminding, and the Pomodoro alert rings as usual — with the tray icon (one
  click, or **Show** in its menu) bringing the window back. **Exit** in the tray
  menu is what quits completely, and it always does, whatever the setting says, so
  a window that hides is never a window that cannot be closed. Anyone who prefers
  the old behaviour gets it back with the new **Desktop Behaviour → Keep running in
  the tray** switch (on by default, stored as `tray_behavior` — a column that has
  been in the schema since the first build without anything ever reading it —
  flipped to its new default by migration `008_close_to_tray.sql`). The switch is
  in all three places the other desktop preferences live, carries its own ⓘ
  explainer, and is inert in the browser build, where there is no tray to hide
  into. Held down by `tests/unit/desktop-prefs.service.spec.ts`,
  `tests/unit/desktop-prefs-panel.component.spec.ts`, and `cargo check` for the
  window event handler.

- **A finished session can now be answered from the mini widget — and its system
  notification is posted once instead of every minute.** The alert that rings until
  it is answered is the behaviour the app is built on, and it stays; what was wrong
  was _where_ it could be answered. The only control that ever stopped it was the
  close button on the card, and the card is not on screen while the window **is**
  the widget — so the case that actually happens went wrong: the session ended
  while DeepWork was shrunk, the tone rang every interval, and the whole window had
  to be brought back and the card closed by hand before it stopped. Shrinking the
  window is how the user got to the widget in the first place; it cannot be the
  thing that makes the alert unstoppable. The widget grew a control cluster to
  answer it — **play/pause, skip, stop and expand** on a 2×2 grid, 136×76 instead
  of 120×76 so the buttons stay a comfortable 24px — and while an alert is ringing
  the ring's halo breathes, the countdown gives way to a **bell**, and one press on
  it silences the tone and leaves the timer exactly as it was. Play, skip and stop
  each answer the alert too, because starting the next session _is_ the answer most
  of the time; expanding deliberately does not, so the card is there to be read
  when the window comes back. The alert's OS half is now posted **once** per
  completion rather than once per interval: Windows and macOS keep it in the
  notification centre until the user clears it, so a second copy every 60 seconds
  was stacking duplicates of a message that was already on the desktop. What
  repeats is what insists — the tone and the card — and it repeats exactly as far
  as the user's configured interval. Held down by
  `tests/unit/notification.service.spec.ts`, `tests/unit/mini-widget.component.spec.ts`
  and `tests/e2e/mini-widget.spec.ts`, which drives the real panel in a browser and
  runs a session to completion with Playwright's clock to prove the alert is
  answered without the window ever expanding.

- **Restoring the full window from the mini widget can no longer leave it hanging
  off the screen.** The widget is dragged anywhere — across monitors, onto a
  second display of a different size or DPI scale, anywhere — and the geometry the
  window grew back to was measured in a different place and time: a maximised
  window's frame is wider and taller than the screen it was maximised on, and a
  display the window was last on may not even be plugged in. Growing back to those
  numbers unexamined is how the restored window ended up with its title bar above
  the top of the desktop, where it cannot be dragged or closed, and the maximise
  button had to be pressed to rescue it. The wanted geometry is now fitted inside
  the work area of the monitor that owns it first — capped to that desktop and
  slid in from whichever edge it overhangs — which is a no-op to the pixel for a
  window that already fits, and a window that was maximised when it shrank comes
  back maximised instead of merely screen-sized. The rule lives in
  `src/app/core/utils/window.util.ts` (`fitInsideWorkArea`) and is pinned down by
  `tests/unit/window.util.spec.ts`.

- **A drink can now be counted at 30, 50, 70 or 90 ml.** **Settings → Water
  Reminder → One drink counts as** started its list at 100 ml, which is a rounding
  error that grows: a mouthful from a small or stemmed glass counted as 100 ml
  makes the day read several times fuller than it was, and the reminder then
  nags about a day that never happened. The list now runs 30, 50, 70, 90, 100,
  150, 200, 250, 300, 400, 500, 750 or 1000 ml, so the small end is offered
  rather than rounded. Stored values, the repair of out-of-list values and the
  default (500 ml) are unchanged.

- **A water reminder that lands while DeepWork is minimised no longer drags the
  window back.** Shrinking DeepWork into the mini widget is the user saying "I am
  working elsewhere", and the full window jumping over what they are doing an
  hour later is not a reminder, it is an interruption. So the reminder reads the
  window before it speaks: **minimised**, it rings, counts the glass at the
  configured size and says so in the notification — "500 ml is in today — the
  window stayed out of the way" — leaving the widget exactly where it is;
  **a full window**, even one sitting behind another app, behaves as it did, with
  the card, the quote and the two answers. The new **Settings → Water Reminder →
  While minimised** switch (on by default, stored as `water_auto_log_when_minimized`
  by migration `007_add_water_autolog.sql`) turns the shortcut off for anyone who
  would rather be asked in both cases. A _Test_ never counts anything, whichever
  window is in front.

- **The clock card no longer grows a scrollbar.** Everything inside it was sized
  from the window while the card itself is a fixed shape, so three everyday
  things pushed the dial and the buttons past its height and the card scrolled to
  compensate, right down the middle of the timer face: linking a task to the
  timer (which adds the dropdown row), a window narrower than 1024px (where the
  timeline stacks underneath and takes a slice of the row), and a screen 1600px
  or wider (where the card's padding grows). The card clips instead of
  scrolling, and the dial now takes whatever height is left over by the task row
  and the controls — capped at its usual 340px, so it is the same size it always
  was; only a card that genuinely cannot hold it shrinks it. The row itself grew
  by the 120px the roomier large-screen padding needs, so the dial does not pay
  for that either. Verified in a browser at 800×600, 1024×768, 1200×800,
  1440×900, 1920×1080 and 600×800: no scrollbar in the card at any of them.
  `tests/unit/dashboard.component.spec.ts` holds the rule down.

- **The water reminder now asks, and waits for an answer — and offers glass sizes
  and cadences that fit a real day.** A silent system notification is easy to
  miss on a busy desktop, so the reminder is now a card that carries a
  motivational line, the glass and the day so far, and two answers: **Yes, I
  drank …** logs a drink at the configured size and **Not now** closes it. It
  rings with the alert tone the user chose — the same **Notification sound**
  setting and the same tray mute switch as the Pomodoro — never borrows the
  Pomodoro's toast, and nothing else closes it: no timeout, no stray click. That
  also means the cadence is honest — while a question is unanswered the loop
  arms nothing new, and the next reminder is a
  full interval after the answer rather than one that was already due. The window
  is brought forward while the card is up (out of the mini widget, and above
  other windows) and handed back to the user's own always-on-top preference
  afterwards; the system notification carries the same line, so the quote is not
  lost on someone who only sees the OS popup. The lists grew at both ends too:
  **every 15, 20, 25, 30, 45, 60, 90, 120 or 180 minutes** instead of a
  half-hour floor, and **100, 150, 200, 250, 300, 400, 500, 750 or 1000 ml** per
  drink instead of starting at 250 — a sip and a full bottle are both "a glass",
  and the app no longer rounds the user's to something else.

- **Everything is sharp now: whole-pixel type, blur-free shapes, and a widget
  that is a rounded card instead of a box.** The minimised widget's countdown
  circle had three separate problems, and all three were in the code. Its SVG
  carried the class name `ring`, which Tailwind — whose content detection scans
  the project for anything that looks like a utility class — answered by
  generating its own `ring` utility: one 1px `currentColor` box-shadow, drawn as
  a pale square exactly the size of the SVG box. That is the box that appeared
  around the circle. The ring and the Dashboard clock were also drawn through
  `feGaussianBlur` filters, which fuzzed the stroke, the gradients and the
  filter's rectangular region, and the countdown was set in fractional rem
  (0.72rem = 11.52px), which lands glyph stems on half pixels. The widget is now
  a transparent, round-cornered window (`tauri.conf.json` plus a
  `widget-transparent` class claimed only while the widget is open), the ring is
  drawn at its own size with a 6px stroke and a wide faint halo instead of a
  blur, and Tailwind is imported with `source(none)` so hand-written class names
  can never pick up a utility rule again. Across the rest of the app: every
  `font-size` is a whole pixel on one 10–32px ladder (no label under 10px),
  radii snap to a single ladder, card and panel borders carry enough alpha to
  read as edges, the muted text colours clear 4.5:1 against the background,
  `:focus-visible` draws one app-wide ring, glows on icons and text are gone
  (duplicate strokes and surface glows remain), and sliders and checkboxes take
  their colour from the theme. `tests/unit/visual-crispness.spec.ts` holds each
  rule down as a source invariant, so a new fractional font size, a new blur
  filter, a new bare utility class name or a non-transparent window fails the
  suite.

### Fixed

- **A finished session is announced wherever the user is, whatever kind of session
  it was.** The alert — tone, card and system notification — was raised by the
  _Dashboard component_, so it only ever happened while that page was the one on
  screen: a focus session that ran out while the user was on Tasks, Calendar or
  Settings, or in the mini widget (which can be opened from any page), finished in
  complete silence. Nor was it specific to one session type — focus, short break
  and long break all went through the same page-bound call, which is why a 5:00
  break "did not play any sound" while nothing about breaks looked wrong. The
  alert is now raised by `TimerService` where the session actually finishes, so
  it cannot depend on which page is open again, and the permission ask moved with
  it (to `App`, once at startup, instead of on the Dashboard's own init). Held down
  by `tests/unit/timer.service.spec.ts` (all three types, and silence for a
  session the user skipped or stopped) and by the new e2e case in
  `tests/e2e/full-cycle.spec.ts` that walks a whole cycle with the Tasks page
  open, checking the card for each of focus, short break and long break.

- **The white line around the mini widget is really gone.** The frame Windows
  keeps around every top-level window was previously only _recoloured_ — the
  widget's own surface colour, through `DWMWA_BORDER_COLOR` — which left the
  hairline visible wherever that attribute is not what the border is drawn from
  (reported on Windows 11 25H2, build 26200). The band itself is now taken away:
  `DwmExtendFrameIntoClientArea` with -1 margins pushes the client area over the
  whole window, and `DWMWA_BORDER_COLOR` = `DWMWA_COLOR_NONE` tells Windows 11 to
  draw no border at all. Nothing white is left along the top, bottom, left or
  right of the 136x76 rectangle, and leaving the widget hands the ordinary frame
  back. Both calls log their result (`widget frame: widget=true border=… frame=…`),
  because "the line is still there" and "the call never took" are otherwise
  impossible to tell apart.

- **A task imported for a future date stays on that date instead of arriving on
  today.** A sheet row dated tomorrow came in as a task for today: _any_ task
  written today counted as today's work, so the date the user typed was thrown
  away the moment the file was read. A task's date now decides the day it belongs
  to — today, tomorrow, or the month after — and the Tasks page opens the section
  the row landed in, so an import for the rest of the week fills the week instead
  of piling onto today (`TaskService.isOnToday`, read by `todayTasks`,
  `todayBoardTasks`, the dashboard and the matrix lists). Two rules go with it: an
  **overdue** task still shows on today, because it is still on the user's plate,
  and **Add to Today** always wins, because that is the user asking by hand. The
  template's `Add to Today` column now defaults to **No** for the same reason —
  the pre-filled deadline already puts a row typed today on today's list, so the
  old `Yes` default only ever dragged the later-dated rows back onto today. Held
  down by `tests/unit/task.service.spec.ts`, `tests/unit/task-import.service.spec.ts`,
  `tests/unit/task-import.mapper.spec.ts` and the template's own assertions.

### Added

- **A water reminder, and the day's tally on the Dashboard.** DeepWork can now
  nudge the user to drink water through their working hours, and count what they
  drink. **Settings → Water Reminder** asks three questions, and every answer is
  a fixed choice rather than a field to type: the **working hours** it may fire
  in (from/to, 09:00–18:00 by default), **how often** (30, 45, 60, 90 or 120
  minutes), **what one drink counts as** (250, 500, 750 or 1000 ml, 500 by
  default) and the **daily target** (1.5–3 L, 2 L by default) — a typo ("6
  minutes", "12 ml") is a reminder nobody wants, so there is nothing to type.
  The nudge is a **system notification** (`NotificationService.announce`), not
  the Pomodoro's in-app toast, and it respects the window: quiet outside the
  hours, one full interval to the first reminder rather than an immediate one,
  the last one remembered across restarts so it is never repeated, and exactly
  one nudge after a laptop has been asleep through half the day. The Dashboard
  gains a water card — today's total against the target, the number of drinks,
  when the last one was, what the reminder is doing next, a **+ 500 ml** button
  at the configured glass size and an **Undo** for the one logged by mistake —
  reading the same `WaterService` the reminder quotes, so the number on screen
  and the number in the notification cannot disagree. Each drink is a row in a
  new `water_intake` table (migration
  `006_add_water_intake.sql`), so the total is a sum and a mistake can be taken
  back, the browser build's `localStorage` log is pruned to today on every read
  so it cannot grow without bound, and the reminder loop is a **single
  self-re-arming timeout** — `start()` is idempotent, a manual tick cannot double
  it, and `stop()`/`ngOnDestroy` clear it — with no lists, listeners or DOM held
  between ticks. (`src/app/core/services/water.service.ts`,
  `src/app/core/services/water-reminder.service.ts`,
  `src/app/shared/components/water-card/`, `src/app/core/utils/water.util.ts`,
  `src/app/core/constants/water.constants.ts`)

- **Updates install themselves: the app checks on startup, tells you, and does it
  when you say yes.** The startup check used to end at a pill next to the version
  in the sidebar. Now, when a newer release exists, DeepWork sends one **system
  notification** ("DeepWork v2.1.0 is available") and shows a card in the corner
  with an **Update** button. Pressing it downloads this machine's installer —
  Windows `.exe`, macOS `.dmg`, Linux `.deb`/`.rpm`/`.AppImage`, preferring the
  package the system's own installer can replace — with a live progress bar, and
  then starts it: the Windows setup runs and DeepWork closes behind it so its
  files can be replaced, the macOS disk image is opened so DeepWork can be
  dragged into Applications, and on Linux the package manager or the AppImage
  itself is launched. The download is done by the Rust side
  (`src-tauri/src/updates.rs`) because a webview request to a release asset is
  blocked by CORS, and it is started with `curl`, which every desktop already
  has. Only `https` links to `github.com` are accepted, the file name is
  sanitised so it cannot leave the update folder, and only a file this app wrote
  there can be started. The notification is sent once per version and the card
  can be waved away with **Later** — remembering that version, not the feature —
  so the next launch is quiet until something newer is published. In the browser
  build there is nothing to install, so the same button hands the download to the
  browser. (`src-tauri/src/updates.rs`,
  `src/app/core/services/update-prompt.service.ts`,
  `src/app/shared/components/update-prompt/`)

- **About the developer, and a check for the latest release.** The app now says
  who builds it. A new **About** page — at the foot of the sidebar, with the
  version badge as a second way in — has two tabs. **About the developer**
  introduces Rajat Malik (senior lead software architect, 16+ years of building
  software across energy, mobility, parcel and other domains) and sets out the
  ways to work together: a full-time senior or lead role, contract or freelance,
  part-time and fractional, hourly consulting, speaking and workshops, or
  end-to-end delivery. It closes with every way to get in touch: email,
  portfolio, LinkedIn, GitHub, WhatsApp and Medium. All of that copy lives in
  `src/app/core/constants/about.constants.ts`, so the wording can change without
  touching the layout.

- **Check for updates, straight from GitHub releases.** The second tab answers
  whether a newer DeepWork exists and answers honestly: _a newer version is
  available_ (with its version, date, release notes and the installer for this
  machine — Windows `.exe`, macOS `.dmg`, Linux `.deb`/`.AppImage`), _you are on
  the latest release_, _you are running ahead of the releases_ (a development
  build) or _could not check_ with the reason (offline, rate-limited, no releases,
  unreadable tag). It reads the release list rather than `/releases/latest` and
  takes the highest version it can parse, so a pre-release or a release published
  out of order cannot hide a newer build. The answer is cached for six hours to
  stay inside GitHub's 60-requests-an-hour budget, the startup check is never
  awaited so a slow network cannot delay the window, and nothing about the machine
  is sent. When something newer exists, the sidebar shows an **Update** pill.
  (`src/app/core/services/update.service.ts`, `src/app/core/utils/version.util.ts`,
  `src/app/core/utils/release.util.ts`, `src/app/pages/about/about.component.ts`)

- **Where else to get it: the web app, and the installers for the other two
  platforms.** The same tab now lists every way to run DeepWork — the browser
  build at `malikrajat.github.io/deepwork`, and the Windows, macOS and Linux
  installers — so a user on one machine can see the app is available on the
  others and download it without leaving the page. Each installer row is
  resolved against the newest release the page has already fetched (no second
  request, no link that can go stale), the row for the machine you are on is
  marked **This device**, and a platform a release carries nothing for links to
  the releases page instead of to a file that does not exist. The platform list
  lives in `src/app/core/constants/downloads.constants.ts`, and the web app's
  address is derived from the repository in `app-info.constants.ts`.
  (`src/app/core/constants/downloads.constants.ts`,
  `src/app/core/services/update.service.ts`, `src/app/pages/about/about.component.ts`)

- **Outward links now open in the real browser.** Inside the desktop webview a
  `target="_blank"` link is swallowed — the new-window request is denied — so an
  "email me" or "visit my website" button would have done nothing at all. The
  Angular layer hands the URL to a new Rust command, `open_external_url`, which
  opens it with `explorer`, `open` or `xdg-open`; only `http`, `https` and
  `mailto` are accepted, and control characters are refused. In a browser build
  the anchor is left alone, so `target="_blank"`, middle-click and "copy link
  address" keep working exactly as the browser intends.
  (`src-tauri/src/opener.rs`, `src/app/core/services/external-link.service.ts`,
  `src/app/shared/directives/external-link.directive.ts`)

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

- **The calendar's "starts in 5 minutes" / "ends in 5 minutes" reminders.** DeepWork
  no longer nudges before a scheduled block begins or ends: `CalendarReminderService`,
  the `Calendar reminders` switch and its **Test** button in Settings, and
  `NotificationService.fireReminder()` are gone, along with the `calendarReminders`
  setting in the settings model. Everything else about the calendar is untouched —
  the day plan, the timer's own notifications and the tray are exactly as they were.
  The `calendar_reminders` column stays in the database (an upgraded database keeps
  it; nothing reads or writes it any more) so no migration is needed.

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
