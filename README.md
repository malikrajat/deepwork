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
- Unfinished-work policy: carry yesterday's tasks forward (default), or let them close themselves when their day passes
- Habit tracking & journaling
- Analytics dashboard, with every figure paired with an offline reading of it
- Glassmorphism dark UI
- SQLite local database (no cloud, no accounts)
- OS-native notifications that repeat until you answer them — from the app, or
  from the mini widget itself
- Water reminders that ask a question you answer, and today's intake on the dashboard
- Desktop options: start with the system, always on top, and a draggable always-on-top mini widget
- Five small log files — system, flow, crash, network — that roll over on their own, with a button in Settings that opens the folder
- About the developer, and a check for the latest release on GitHub

---

## Desktop behaviour: startup, always on top, and the mini widget

Three settings control how DeepWork sits on your desktop. The first two are **off by
default** — nothing changes until you ask for it. The third is **on**, because it is
what stops a stray click on the window's X from ending a focus session.

| Option                       | What it does                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start with system**        | DeepWork launches when you sign in and opens its normal window — without stealing focus from whatever you are doing — and is in the system tray as well. |
| **Always on top**            | Keeps the main window above every other window, so the timer stays visible while you work in other apps.                                                 |
| **Keep running in the tray** | Closing the window puts DeepWork next to the clock instead of ending it. Right-click the tray icon and choose **Exit** to quit completely.               |

### Where to change them

Every surface stays in sync, so you can flip either option from wherever you
happen to be:

1. **System tray menu** — _Start with system_ / _Always on top_ (tick marks mirror the real state), plus **Exit**, which is how a window that hides is closed for good
2. **Settings → Desktop Behaviour**
3. **Dashboard → Desktop Behaviour** card at the bottom of the page

Each switch carries an **ⓘ info button** that explains the option in plain language —
what "always on top" means, what a startup entry will actually do, and where a
window that was closed to the tray went.

### Closing the window

The X in the window's corner does not end DeepWork: it hides the window next to the
clock, and everything keeps running while it is hidden — a focus session can finish
and ring, and the water reminder keeps to its cadence. One click on the tray icon
brings the window back; **Exit** in the tray menu (or turning **Keep running in the
tray** off) is what quits for good.

### The mini widget

Minimising the window — with the window's own **minimise button** or from the
**clock card** — shrinks DeepWork into a small floating widget. It has no title bar
of its own (nothing to minimise, maximise or close), no frame around its edges —
the hairline Windows keeps around every window is taken away while the widget is up,
so nothing white is drawn along its top, bottom, left or right — and **rounded
corners**, the same 18px the browser build's floating panel has, with the desktop
showing through the four of them. The browser and the installed app are meant to be
the same object seen in two places, so they are drawn the same way. It always stays
above your other windows, and can be dragged anywhere on your desktop with the
mouse. The play button runs the timer without expanding, the two buttons beside it
skip to the next session and stop the cycle, and the expand arrow (or `Esc`)
restores the full window at its original size and position — fitted to the screen it
lands on, so a window that was dragged elsewhere as a widget never comes back with
its title bar off the top of the display or its buttons behind an edge.

The timer sits inside a colourful countdown ring: it starts empty when a session —
focus, short break or long break — begins, fills second by second, and closes into
a whole circle when the time is up. It fills the same way, in the same direction
and at the same speed as the big clock on the Dashboard, so the widget and the
full window always agree about how far through a session you are.

When a session **finishes**, the alert rings on your chosen tone and keeps ringing
until you answer it — and the widget can answer it, which is the difference between
a reminder and a nuisance: the countdown gives way to a **bell**, and one press on it
silences the tone and leaves the timer exactly where it was. Start, skip and stop
answer it too — starting the next session is the answer most of the time.

Every repeat arrives three ways at once, because a tone on its own is easy to hear
and then stop hearing. The **system notification** goes back to the desktop under the
alert's own tag, so Windows re-raises the notification already in the notification
centre instead of stacking a copy per interval. The **whole widget shakes** on the
beat of the tone — surface, ring and all four buttons moving together, which is what
makes the nudge visible to someone working in another window. How long it shakes for
is yours to set — **Alert shake** in Settings, from 0.7 s to 4 s — because the length
that matters is the length of the tone: it should outlast the sound, and past that it
is taste. The **tempo** is not yours to set, because a slow shake is not the thing the
setting is about: the length is divided into swings of about an eighth of a second, so
0.7 s is six quick swings and 4 s is thirty-three of the same, rather than one slow
lean with the time to fill. And both surfaces the
alert owns — the widget and the full window's card — move to the **next colour of a
twelve-entry palette**: a pastel accent over a very dark surface of the same hue,
easy to look at for however long the alert waits and still unmistakable when it
happens _again_. The card is raised again on every repeat too, so the same three
things happen whether you are looking at the app or at the widget. A finished focus
session, short break or long break is announced from the timer itself, so it reaches
you wherever you are — any page, the widget, or the tray — rather than only while the
Dashboard happens to be open.

The alert also **says something worth reading**. A finished focus session and a
finished break each draw from their own list of twenty-four lines written for this
app — step-away lines for one, come-back lines for the other — walked one line per
session so the same sentence does not come back twice in a row. The line is set
**apart from the message** rather than run into it: its own smaller line in the
Windows toast, its own paragraph in the browser and plugin fallbacks, its own
indented rule and tint on the card. It is the same treatment the water reminder's
quote gets.

### Asking on first run, never at install time

No installer writes a startup entry. The **one-time dialog on first launch** offers
"start with the system" next to "always on top" and "keep running in the tray", and
afterwards the same three switches live in Settings, the dashboard and the tray
menu — on every platform, since a `.dmg`, a `.deb` and an `.AppImage` have nowhere
to put a checkbox either. Where the entry lives once it is turned on:

| Platform | Mechanism                                                      |
| -------- | -------------------------------------------------------------- |
| Windows  | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`           |
| Linux    | `~/.config/autostart/com.deepwork.app.desktop` (XDG autostart) |
| macOS    | `~/Library/LaunchAgents/com.deepwork.app.plist` (LaunchAgent)  |

The Windows installer used to ask this question itself, right after the files were
copied, and write the entry when the answer was yes. It no longer does, because a
per-user `Run` value written by a freshly downloaded, unsigned installer is the
shape antivirus heuristics score as _persistence_ — and Windows Defender said so
in as many words, quarantining the 2.0.12 `-setup.exe` as
`Behavior:Win32/Persistence.A!ml` before the install could finish
([`docs/code-signing.md`](docs/code-signing.md) has the whole story, and what to do
when a build is flagged anyway). Tauri's uninstaller still deletes the `DeepWork`
value, so uninstalling never leaves a startup entry behind. Silent (`/S`) and
passive installs, which used to skip the prompt, are now indistinguishable from
every other install.

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
- **Today holds the day's own work**: a task dated today, an overdue task that is
  still open, or one written today with no deadline. A task dated for _tomorrow_ is
  tomorrow's — it waits in that section until its day comes, which is how a task list
  imported for the rest of the week stays out of the way. Starring a card (**Add to
  Today**, or `Yes` in the importer's column) is the one thing that pulls it onto
  today anyway.
- **The same task gets one card, not two.** A title can qualify for today twice over —
  today's copy, and an older copy that is still starred, or was imported again (which
  the importer writes on purpose and labels _Duplicate_) — and the board used to show
  both, as two identical cards with nothing to tell them apart. Today's own copy now
  wins and the older one is left alone: it is still a task, filed on the Tasks page
  under its own day, and Today shows one card for it. Titles are compared the way the
  importer compares them, so spacing and capitalisation do not smuggle a second copy
  through, and two genuinely different tasks are never merged.

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
    selected (`P3 — Medium`, `Unassigned`, `To Do`, `No repeat`, `No`).
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
- **The deadline decides the day.** Any date is accepted, past or future: a row dated for
  tomorrow arrives as tomorrow's task (the Tasks page opens the section it landed in, and
  today's board stays today's), and a past deadline still imports with a warning
  ("Deadline 2026-01-05 is in the past") so you can confirm it. Set **Add to Today** to
  `Yes` on a row when you want it on today's list _as well_ — that is the only answer that
  overrules the date.
- **Safety:** nothing is saved until you confirm the preview. Rows with errors are never imported;
  unusable values, duplicate titles (existing tasks or repeated rows in the file) and ambiguous
  `dd/mm` dates are flagged. Rows left without a Title are ignored and counted in the preview.
- **Repeated titles are kept, not dropped.** A row whose title already exists — the same task you
  imported yesterday, or the file uploaded twice — is labelled **Duplicate** in the preview and
  still imported as its own task, so nothing the sheet carries is quietly dropped. Tick **Skip
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

## Water reminder, and today's intake

DeepWork can nudge you to drink water through your working day, and keeps count
of the day as it goes.

### Setting it up

**Settings → Water Reminder** asks a few questions, and every answer is a fixed
choice rather than something to type:

| Question            | What it offers                                                                     |
| ------------------- | ---------------------------------------------------------------------------------- |
| Working hours       | a **from** and a **to** time — reminders only fire between them                    |
| Remind me every     | 15, 20, 25, 30, 45, 60, 90, 120 or 180 minutes (60 by default)                     |
| One drink counts as | 30, 50, 70, 90, 100, 150, 200, 250, 300, 400, 500, 750 or 1000 ml (500 by default) |
| Daily target        | 1.5 L, 2 L, 2.5 L or 3 L (2 L by default)                                          |
| While minimised     | ring and count the drink instead of asking (on by default)                         |

**Test** sends the reminder straight away so you can see what it looks like. The
reminder is **off until you turn it on** — it is a habit you ask for.

### How the reminder behaves

- It **asks** rather than announces. A card appears with the glass, the day so
  far and a short line about the next glass, and two answers: **Yes, I drank …**
  logs the glass at the size you chose, and **Not now** closes the card without
  logging anything. Nothing else closes it — no timer, no click anywhere else —
  so a reminder cannot be missed by being away from the desk for a minute.
- It **rings**, using the same **Notification sound** choice and the same tray
  mute switch as everything else (pick `none` for a silent reminder). It never
  borrows the Pomodoro's in-app toast — that one is someone else's message.
- With the full window up, it **comes forward while the card is up** — raised
  above other windows, because a question behind a maximized browser is a
  question nobody answers — and your own always-on-top preference is restored the
  moment you answer.
- **A minimised window is left alone.** Shrinking DeepWork into the mini widget
  is you saying "I am working elsewhere", so a reminder that lands then never
  pulls the full window back over your work: it rings, counts the glass — at the
  size you chose above — and says so in the notification. Turn **While minimised**
  off if you would rather be asked there too.
- It waits a full interval after you switch it on, so the first nudge comes when
  you asked for it rather than the moment you pressed the switch.
- Its clock counts only the time DeepWork is **running**. Closing the app — or
  shutting the computer down — pauses the cadence rather than the wall clock
  charging you for it, so opening DeepWork again waits a full interval instead of
  asking for water the moment the window appears. A machine that only slept, with
  DeepWork still open, still gets a single reminder when it wakes — never a queue
  of the ones it slept through.
- It never stacks a second question on top of an unanswered one: the cadence is
  held until you answer, and it starts again from the answer — so "Yes" at 14:00
  means the next one is a full interval later, not one that was already due.
- Outside your hours it stays quiet, and the Dashboard says when it resumes.
- A **system notification** goes with the card, carrying the same two lines — the
  message, and the motivational line set apart underneath it rather than run on
  as one sentence. On Windows it is posted as a **reminder** toast, which waits
  on screen until you dismiss or answer it instead of sliding away after a few
  seconds: a nudge that disappears while you are heads-down is a nudge that was
  never delivered. It is kept out of the completion alert's own notification, so
  neither can take the other's place in the notification centre.

### On the Dashboard

The water card reads out today's total against the target ("1.5 L of 2 L today"),
how many drinks that is, when the last one was, and what the reminder is doing
next. **+ 500 ml** logs a glass at the size you chose; **Undo** takes the last one
back if you pressed it twice.

Each drink is a row of its own in the database, so the day's total is a sum
rather than a counter that can only go up — and the tally starts again at local
midnight, not at UTC midnight.

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

### Updating

When a newer release exists, three things say so: an **Update** pill next to the
version in the sidebar, one **system notification** ("DeepWork v2.0.17 is
available"), and a card in the corner of the window with an **Update** button.
The notification is sent once per version — a version you have waved away with
**Later** is not announced again, and the next release is announced as normal.

Pressing **Update** downloads and installs it, without sending you to GitHub:

| Platform | What happens                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Windows  | The setup is downloaded with a progress bar, then started; DeepWork closes behind it so the installer can replace its files |
| macOS    | The `.dmg` is downloaded and opened — drag DeepWork into Applications, then open it again                                   |
| Linux    | A `.deb`/`.rpm` is handed to the desktop's own installer, or an AppImage is made runnable and started                       |
| Browser  | There is nothing to install, so the button downloads the file instead                                                       |

The download belongs to the desktop app rather than the webview (a release asset
refuses a browser request), so it is done by Rust
([`src-tauri/src/updates.rs`](src-tauri/src/updates.rs)) with the `curl` every
desktop already has. Only `https` links to `github.com` are accepted, the file is
written into a folder of its own under the system temp directory, and only a file
this app wrote there can be started.

### Get it on another device

The same tab also says where else DeepWork runs, because the copy already open is
not the only way to get it:

| Where   | What the row offers                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Web app | [malikrajat.github.io/deepwork](https://malikrajat.github.io/deepwork/) — the same app in any modern browser, nothing to install |
| Windows | the `.exe` installer for 64-bit Windows 10 and later                                                                             |
| macOS   | the `.dmg` for recent versions of macOS                                                                                          |
| Linux   | an AppImage, `.deb` or `.rpm` for most distributions                                                                             |

Each installer row links straight to the file in the newest release the page has
already fetched — no second lookup, and no link that can go stale. The row for
the machine you are reading this on is marked **This device**. A release that
carries nothing for a platform sends that row to the releases page rather than
to a file that is not there; before the first check has answered, every
installer row does the same. The wording and the platform list live in
`src/app/core/constants/downloads.constants.ts`; only the web app has an address
in a constants file (`APP_WEB_APP_URL`), and it is derived from the repository
that GitHub Pages serves.

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

Two things are true of every build, on every platform:

- **The fonts travel with the app.** Inter and JetBrains Mono are in `src/fonts`
  (SIL Open Font License 1.1, licences in `public/fonts`), declared with
  `@font-face` in `src/styles.css`. Nothing is fetched from Google at runtime, so
  the app looks like itself offline, behind a proxy, or on a machine that cannot
  reach a font CDN.
- **The packaged app has no web inspector.** The `devtools` cargo feature is
  deliberately absent from `src-tauri/Cargo.toml`: it is the flag that carries
  the inspector into a _release_ build, and the shipped app has no inspect entry,
  no `F12` and no `Ctrl+Shift+I`. `npm run tauri:dev` is unaffected — debug builds
  get one either way — so put the feature back only if a release build ever has
  to be inspected in the field.

### Windows (.exe / .msi installer)

```powershell
npm run build:windows
```

Output: `src-tauri/target/release/bundle/msi/DeepWork_2.0.17_x64_en-US.msi`

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
- `src-tauri/target/release/bundle/dmg/DeepWork_2.0.17_x64.dmg`

> **Note:** Must be run on a Mac.

### Linux (.deb / .AppImage / .rpm)

```bash
npm run build:linux
```

Output:

- `src-tauri/target/release/bundle/deb/deep-work_2.0.17_amd64.deb`
- `src-tauri/target/release/bundle/appimage/deep-work_2.0.17_amd64.AppImage`

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

The version is written down in more places than one build system can see, and
nothing reads any of the others, so one command writes them all:

```powershell
npm run version:bump -- x.y.z    # package.json, both lock files, tauri.conf.json,
                                 # Cargo.toml, Cargo.lock, APP_VERSION, the docs
npm run version:check            # or fail if they have drifted apart
```

| File                                                     | What carries the number                    |
| -------------------------------------------------------- | ------------------------------------------ |
| [`package.json`](package.json)                           | `"version"`                                |
| [`package-lock.json`](package-lock.json)                 | `"version"`, in two places                 |
| [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) | `"version"` — the installer and About page |
| [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml)           | `version`                                  |
| [`src-tauri/Cargo.lock`](src-tauri/Cargo.lock)           | the `deepwork` crate's own block           |
| `src/app/core/constants/app-info.constants.ts`           | `APP_VERSION` — the update check           |
| `README.md`, `SETUP.md`, `docs/code-signing.md`          | the artefact names in the examples         |

> `tauri.conf.json` controls what appears in the installer and the app's About
> dialog, `Cargo.toml`/`Cargo.lock` are the Rust build's, `package.json` is
> npm/Angular tooling's, and `APP_VERSION` is what the About page shows and what
> the update check compares against GitHub. CI runs `npm run version:check`, so a
> release that updated five of the six fails the lint job instead of shipping two
> versions. `CHANGELOG.md` is deliberately left alone — a changelog records the
> versions of the past.

### Signing the installers

The installers are **not signed yet**, so Windows says _Unknown publisher_ in the
UAC prompt and SmartScreen can interrupt with "Windows protected your PC". That
line is the Authenticode signature and nothing else — no setting in the app can
change it, and the certificate has to be issued in the name you want shown.
Everything that reads metadata instead of a signature is already right: the
publisher, copyright, category and descriptions are set in `tauri.conf.json`, so
Add/Remove Programs and the installer's file properties name the developer.

[`docs/code-signing.md`](docs/code-signing.md) has the whole picture: what each kind
of certificate shows the user (self-signed, OV, EV, Azure Trusted Signing), the
exact `tauri.conf.json` for a certificate store or a cloud signer, how to verify a
build (`signtool verify /pa /v`, `Get-AuthenticodeSignature`) before publishing it,
and the two things worth doing for an unsigned download in the meantime — a
SHA-256 checksum beside each asset, and a release note that points at the tag and
the CI run that produced it.

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

The app as a whole is at **50.10% statements** (51.11% lines, 632 tests today).
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

| Layer           | Technology                                                           |
| --------------- | -------------------------------------------------------------------- |
| Desktop Runtime | Tauri 2.x                                                            |
| Frontend        | Angular 21 (Standalone Components, Signals)                          |
| Styling         | Tailwind CSS + Glassmorphism custom tokens                           |
| Database        | SQLite via tauri-plugin-sql                                          |
| Notifications   | Tagged WinRT toasts + tauri-plugin-notification, Web Audio API tones |
| State           | Angular Signals + RxJS                                               |
