## What's Changed

DeepWork **2.0.20** is the release that lets you edit a task from wherever you happen to be reading it.

Until now a task could be moved, re-ordered, finished or deleted from the pages that show it, but changing what it
_says_ — its title, its date, its priority, its repeat — was possible only on the Tasks page, where the app's one
form lives. A card in the Eisenhower Matrix carried no pencil at all. Today's cards carried none. The Calendar could
re-time a task and take it off the timeline, but not correct it. The dashboard could hand a task to the timer without
ever letting you fix it.

Every one of those places now carries an **Edit** control, and all of them open that same form with the task already
in its fields. Adding is the same idea in reverse: a day that has its own section can be added to, each quadrant of
the Matrix can be added to, and Today has its own **Add task** button.

## Get it

| Platform                  | File                                                              |
| ------------------------- | ----------------------------------------------------------------- |
| **Windows 10+ (64-bit)**  | `DeepWork_2.0.20_x64-setup.exe` · `DeepWork_2.0.20_x64_en-US.msi` |
| **Windows (32-bit)**      | `DeepWork_2.0.20_x86-setup.exe` · `DeepWork_2.0.20_x86_en-US.msi` |
| **macOS — Apple Silicon** | `DeepWork_2.0.20_aarch64.dmg`                                     |
| **macOS — Intel**         | `DeepWork_2.0.20_x64.dmg`                                         |
| **Linux (64-bit)**        | `.AppImage`, `.deb` or `.rpm`                                     |
| **Any modern browser**    | <https://malikrajat.github.io/deepwork/>                          |

The browser build runs the whole app and installs as a PWA from your browser's menu — Chromium has the
address-bar icon, Safari installs from _File → Add to Dock_, and Firefox cannot install a web app at all.

**Already on 2.0.19?** **Update now** inside the app is the easy path, and it is the only change you need.

### The installers are not signed yet

The honest version of what happens on a fresh download:

- **Windows** — SmartScreen may interrupt with "Windows protected your PC", and the UAC prompt says _Unknown
  publisher_. That line is the Authenticode signature and nothing else; the publisher, copyright and category in
  the file's properties are correct. Choose _More info → Run anyway_ only if you trust the source.
- **macOS** — Gatekeeper refuses the first launch with _"DeepWork" Not Opened — Apple could not verify "DeepWork" is free of malware_. Nothing is broken: the app is
  not signed with an Apple Developer ID and not notarized, and this release has no way
  around that. **On macOS 15 (Sequoia) and later the old Control-click → _Open_ trick
  does nothing**, so either open **System Settings → Privacy & Security → Security →
  Open Anyway** (try to open DeepWork once first, so the entry appears) or clear the
  download flag from Terminal:

  ```bash
  xattr -dr com.apple.quarantine /Applications/DeepWork.app
  ```

  Not comfortable with that? <https://malikrajat.github.io/deepwork/> runs the same app
  in a browser and installs as a PWA — no download, no Gatekeeper. The whole story,
  including what a Developer ID certificate would fix, is in
  [docs/code-signing.md](https://github.com/malikrajat/deepwork/blob/main/docs/code-signing.md#macos-the-dialog-a-mac-user-is-hitting).
- **Linux** — `chmod +x DeepWork_*.AppImage` before running it.

If a release publishes a SHA-256 checksum, compare it before installing.
[`docs/code-signing.md`](https://github.com/malikrajat/deepwork/blob/main/docs/code-signing.md) covers what each
kind of certificate would change for you and how to verify a build yourself.

**On first launch** a one-time dialog offers _start with system_, _always on top_ and _keep running in the tray_.
No installer writes a startup entry, and nothing is enabled unless you ask for it.

## What is in this release

### One editor, reached from everywhere

The app keeps exactly one task form — the slide panel on the Tasks page — and the other pages now hand their cards
to it instead of leaving you to find it:

- **Board cards** (Tasks and Today) carry a pencil beside their other buttons.
- **Eisenhower Matrix cards** carry a pencil next to the status switch, and the right-click menu opens with
  **Edit task**.
- **Calendar rail cards** carry a **✎**, and the slot panel's actions include **Edit** for each task in the slot.
- The **dashboard's current-focus card** has an **Edit task** button beside _Focus next task_.

Each one opens the Tasks page with that task already in the form, and the address bar is cleaned up immediately
afterwards — the request travels as `/tasks?edit=<id>`, which is an instruction rather than a state, so reloading
the page never re-opens a panel you have since closed. A link whose task no longer exists leaves the page as it is.

### Adding to a day, a quadrant, or today

- **A date section's "+".** The Tasks page files work into date sections, and the form always started on today —
  so adding to Tomorrow meant correcting the deadline by hand before saving. Sections that _are_ a single day
  (Today, Tomorrow, and each month ahead) now carry a **+** in their header, and the form opens with that day
  already in the deadline and the advanced fields showing, so the task lands in the section whose button was
  pressed. Sections that span several days — later this week, next week, later this month — offer no button rather
  than a guessed date, and neither does a section in the past, which the deadline field would refuse.
- **A quadrant's "+".** Each of the Matrix's four quadrants has a **+** in its header, and the unassigned list has
  one of its own. The form opens dated today and already sorted into that quadrant, so the task appears in the
  column the button sat on.
- **Today's "Add task".** Today shows the day's list and nothing else, so its header now carries **Add task** —
  and the empty state offers the same — which opens the form dated today and puts the result on today's list.

Nothing else about the boards, the scheduling or the data changed: a task is still the same task, and everything
these buttons write is the same write the form has always made.

## Changed since v2.0.19

- **Every card that shows a task now carries the way into the app's one task form** — Tasks, Today, Matrix,
  Calendar and the dashboard (see above).
- **A day or a quadrant can be added to directly**, with the new date section **+**, quadrant **+** and Today
  **Add task** buttons.
- Everything from **2.0.19** — the signed-out installers, the updater that only offers a file it can run, the
  always-on-top watcher, the visitor counter and the water nudge's defaults — is unchanged in this release.

## Known limitations

Honest, because each of these has been implied otherwise by this project's own copy at some point:

- **The installers are unsigned**, so Windows and macOS will warn you. There is no way around that except a
  certificate.
- **Not a cloud app, and not a syncing one.** One person, one database per machine, no account and no sharing.
  Moving your work means exporting a backup on one machine and importing it on the other.
- **The visitor counter is the only thing that talks to a third party**, it is the web build only, and it can be
  switched off from the popup that reports it.
- **The unit suite covers the logic layer well and the pages thinly**; the Playwright suite covers the main flows
  end to end and gates the build, but it is not exhaustive.

## Licence and credits

**MIT** — use it, fork it, ship it, at your own risk and with no warranty
([LICENSE](https://github.com/malikrajat/deepwork/blob/main/LICENSE)).

Built by **Rajat Malik** — [rajatmalik.dev](https://rajatmalik.dev/) ·
[github.com/malikrajat](https://github.com/malikrajat). Bundled typefaces are **Inter** and **JetBrains Mono**,
both under the SIL Open Font License 1.1, with their licence files in `public/fonts`.
