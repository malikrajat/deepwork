## What's Changed

DeepWork **2.0.19** is the release that makes the download work.

The last published release, **2.0.17**, went out with portable archives instead of installers — no `.exe`, no
`.msi` at all — which is why pressing **Update now** inside the app answered with Windows' `os error 193`, "not a
valid Win32 application", and nothing ever installed itself. This release carries the real installers for every
platform it supports, and the updater now only offers a file it can actually run.

If you are coming from 2.0.17, everything since that release is in here: a visit counter for the web build that
you can switch off, an update card with a **Skip this version** button and a proper close, an always-on-top
switch that stays on top, a web app that installs again as a PWA, and a set of smaller fixes — from a task form
whose buttons no longer fall off the bottom of the window to a habit that can no longer be saved without a name.
The two 2.0.x versions in between were never published as releases; their work ships here.

## Get it

| Platform                    | File                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| **Windows 10+ (64-bit)**    | `DeepWork_2.0.19_x64-setup.exe` · `DeepWork_2.0.19_x64_en-US.msi` |
| **Windows (32-bit)**        | `DeepWork_2.0.19_x86-setup.exe` · `DeepWork_2.0.19_x86_en-US.msi` |
| **macOS — Apple Silicon**   | `DeepWork_2.0.19_aarch64.dmg`                                     |
| **macOS — Intel**           | `DeepWork_2.0.19_x64.dmg`                                         |
| **Linux (64-bit)**          | `.AppImage`, `.deb` or `.rpm`                                     |
| **Any modern browser**      | <https://malikrajat.github.io/deepwork/>                          |

The browser build runs the whole app and installs as a PWA from your browser's menu — Chromium has the
address-bar icon, Safari installs from _File → Add to Dock_, and Firefox cannot install a web app at all.

**32-bit Windows is new in this release.** **There is no 32-bit Linux build**, and there never was one to lose:
Ubuntu publishes no appindicator library for i386 at all, and DeepWork's tray is a required part of it, so the
32-bit Linux job could not link on any GitHub runner. It has been removed from the release matrix rather than
left as a job that always fails.

### Updating from an older build

From **2.0.19** onwards, the app's own **Update now** is the easy path. Coming from 2.0.17, download the file for
your machine from the table above: that build could not tell the two macOS installers apart, and could not tell a
portable archive from something it is able to run.

### The installers are not signed yet

The honest version of what happens on a fresh download:

- **Windows** — SmartScreen may interrupt with "Windows protected your PC", and the UAC prompt says _Unknown
  publisher_. That line is the Authenticode signature and nothing else; the publisher, copyright and category in
  the file's properties are correct. Choose _More info → Run anyway_ only if you trust the source.
- **macOS** — Gatekeeper refuses the first launch with _"DeepWork" Not Opened — Apple could not verify "DeepWork" is free of malware_. Nothing is broken: the app is
  not signed with an Apple Developer ID and not notarized. **On macOS 15 (Sequoia) and
  later the old Control-click → _Open_ trick does nothing**, so either open **System
  Settings → Privacy & Security → Security → Open Anyway** (try to open DeepWork once
  first, so the entry appears) or clear the download flag from Terminal:
  `xattr -dr com.apple.quarantine /Applications/DeepWork.app`. The browser build at
  <https://malikrajat.github.io/deepwork/> needs none of this. Full story:
  [docs/code-signing.md](https://github.com/malikrajat/deepwork/blob/main/docs/code-signing.md#macos-the-dialog-a-mac-user-is-hitting).
- **Linux** — `chmod +x DeepWork_*.AppImage` before running it.

If a release publishes a SHA-256 checksum, compare it before installing.
[`docs/code-signing.md`](https://github.com/malikrajat/deepwork/blob/main/docs/code-signing.md) covers what each
kind of certificate would change for you and how to verify a build yourself.

**On first launch** a one-time dialog offers _start with system_, _always on top_ and _keep running in the tray_.
No installer writes a startup entry, and nothing is enabled unless you ask for it.

## What is in this release

### Installers, and an updater that tells the truth

The updater downloads the file GitHub published for your machine and hands it to the OS. It used to pick that
file by extension alone — and on a release of portable archives, all of them `.zip`, it picked one and asked
Windows to run it (`os error 193`). A file is now judged by **what it is**, not only by what it ends in: a name
that says which platform it is for decides before the extension does, and **Update** only appears when the
release carries something the app can actually run. A release of portable builds gets a **Download** button that
goes to the right file and says why, which is the honest version of the same offer.

**Always on top now stays on top.** The switch used to ask once and then report its own request back, so a window
that Windows had quietly dropped from the top still claimed to be on top. The flag is written straight to the OS,
read back from the window's real style, and **kept** there — a watcher re-asserts it after another application, a
display change or a fullscreen window takes the spot. On Wayland, where no application may raise its own window,
the panel disables the switch and says so, with the way round it (`WAYLAND_DISPLAY=` runs the app through X11).

The release job also refuses to publish two files with one name, so a release cannot look complete while a
platform is silently missing.

### A visit counter, in the web build only

The web app now counts its own visits with [GoatCounter](https://www.goatcounter.com/) — the same counter that
runs on [rajatmalik.dev](https://rajatmalik.dev/) — so "is anybody actually using this?" has an answer without
DeepWork having a server of its own. It is the one thing in the app that talks to a third party, and it is
bounded:

- **It is the web build only.** The packaged desktop app has no web address to report, and its settings row says
  so rather than showing a figure that would never move.
- **You can switch it off.** _Count my visits_ lives in `Settings → Visitor Counter → Details`, on by default.
  With it off the script is never fetched at all, so nothing leaves the machine.
- **It sends the page, not your work.** The path (`/deepwork/tasks`), the page title, the referrer, and the
  browser's own screen width, language and time zone — never a task, a journal entry, a habit or any identifier.
  GoatCounter stores no IP address and sets no cookie of its own for this, which is why it needs no consent
  banner.

The **Details** popup shows what GoatCounter holds — visitors over a chosen range, pages, referrers, browsers,
systems, countries, languages, screen sizes and campaigns — and, underneath, what the page can see about the
person reading it, read from the browser and sent nowhere. The aggregate lists come from GoatCounter's JSON API,
which needs an API token with **Read statistics** ticked; it is pasted into the popup and stays in that browser's
`localStorage`, not in the source, not in the database and not in an export.

### An update card you can answer three ways

The card that says a newer DeepWork exists had two answers and both were about _when_: **Update**, and **Remind
me later**, which snoozed it for twelve hours. It now has three, and they mean three different things:

- the **primary button** acts on the release — **Update** when there is an installer for this machine,
  **Download** when the release carries only a portable build;
- **Skip this version** is the answer that ends it: that release is never offered or announced again, while a
  newer release is still a new question;
- **Remind me later**, and the **close** button in the card's corner, both put it away until the snooze runs out.

Skipping the card takes nothing else away — the sidebar's update pill and the About page's own update actions are
untouched, so the deliberate route to a new version is still there. A failed update check is also retried once,
90 seconds later, so a machine that opened DeepWork before its network was up no longer spends the whole session
without an update pill or a prompt.

### The web app installs again

The deployed site could not be installed as a web app, and the cause was one word: absolute. GitHub Pages serves
this app from a sub-path (`/deepwork/`), and `manifest.webmanifest`, its icons and `sw.js` were written as
root-absolute URLs — so they resolved to the domain root, where they are somebody else's 404. With no manifest,
Chrome and Edge had nothing to install, which is why no install icon ever appeared; the service worker's
pre-cache list failed on the same URLs, so offline never worked either. Every one of those paths is relative now,
resolved against the `<base href>` the build sets, so the same files work at a domain root and under a sub-path.
The install instructions also say what each browser actually does instead of describing a Chromium icon to
everybody.

### The water reminder is on by default

The nudge was opt-in and counted 500 ml a drink, which asked you to find a setting before the feature did
anything and then recorded a bottle every time you took a mouthful. It is now **on by default** — it asks a
question rather than announcing a fact, so "Not now" is one click — and a drink is **30 ml**: the smallest thing
anyone would call a drink, so a day of sipping adds up honestly instead of a handful of guesses at half a litre
each. Both are still choices in Settings, and the day's target is unchanged at 2 L; only the number of drinks it
takes to reach it.

### Smaller fixes

- **A task's Cancel and Create/Save buttons no longer fall below the window.** The slide panel is exactly one
  window tall and the form inside it could not scroll, so with _Advanced options_ open — which is how the edit
  panel always opens — the buttons were past the bottom of the screen with no way to reach them. The fields
  scroll inside the panel now, and the two buttons stay pinned to its bottom.
- **The install banner no longer covers the sidebar's collapse button.** On a first visit, clicking the collapse
  chevron did nothing because a fixed banner was sitting on top of it.
- **A habit can no longer be added without a name.** The Add button read the form's validity, but the name field
  had no validator, so it was never invalid — an empty habit landed in the list as a blank card.
- **The dashboard no longer changes shape with the filter.** Every range and every scope now draws the same four
  tiles, the same chart frame and the same eight cards; only the numbers change. A card with nothing to report
  says so in one row rather than replacing the report with a sentence.
- **The visitor dashboard is the width of the window, not of a settings card**, it starts where the sidebar ends
  rather than over it, and the shell defers it to idle — so a dashboard most visits never open arrives as its own
  25 kB chunk instead of riding along in the first load.
- **Four window permissions the app was already asking for were missing** (`scale-factor`, `is-maximized`,
  `current-monitor`, `monitor-from-point`), each one swallowed by a `.catch()`. A maximised window came back from
  the mini widget un-maximised, and the "fit the restored window inside the monitor that owns it" rescue silently
  never ran. All four are granted now.
- **The mini widget is always on top when it appears**, and the setting cannot be turned off while the widget is
  up — the one state a widget cannot be in.
- **A failure is never silence.** Every repair the desktop layer makes to a window's state is written to the log
  files, and _Copy diagnostics_ in Settings hands you the last 300 lines plus your environment.

## Changed since v2.0.17

- **The water reminder is on by default**, and a drink counts as 30 ml rather than 500 ml (target unchanged).
- **"Later" is a snooze, not a goodbye** — the update card returns after twelve hours instead of never.
- **The end-to-end suite blocks the build** instead of reporting on it, and the build jobs no longer wait on each
  other: a red check reports itself and nothing else, so it can no longer cost you the installers or a release.
- **32-bit Windows installers were added**; the 32-bit Linux entry was removed as impossible (see above).
- **macOS ships two installers**, one per chip, each built on its own runner.
- **Markdown is no longer formatted by Prettier** — documentation and skills are prose, and reflowing them
  rewrote files nobody meant to touch.

## Known limitations

Honest, because each of these has been implied otherwise by this project's own copy at some point:

- **The installers are unsigned**, so Windows and macOS will warn you. There is no way around that except a
  certificate.
- **Not a cloud app, and not a syncing one.** One person, one database per machine, no account and no sharing.
  Moving your work means exporting a backup on one machine and importing it on the other.
- **The visitor counter is the only thing that talks to a third party**, it is the web build only, and it can be
  switched off from the popup that reports it.
- **The unit suite covers the logic layer well and the pages thinly**; the Playwright suite covers the main flows
  end to end and now gates the build, but it is not exhaustive.

## Licence and credits

**MIT** — use it, fork it, ship it, at your own risk and with no warranty
([LICENSE](https://github.com/malikrajat/deepwork/blob/main/LICENSE)).

Built by **Rajat Malik** — [rajatmalik.dev](https://rajatmalik.dev/) ·
[github.com/malikrajat](https://github.com/malikrajat). Bundled typefaces are **Inter** and **JetBrains Mono**,
both under the SIL Open Font License 1.1, with their licence files in `public/fonts/`.
