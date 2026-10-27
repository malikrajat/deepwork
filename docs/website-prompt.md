# Website prompt — the DeepWork product site

A copy-paste brief for building the public site that shows what this repository
actually does. It is written for an AI website builder (Claude, Cursor, v0,
Lovable, Bolt) or a designer-developer pair, and it assumes the site is a
**separate, static marketing site** — not the app itself.

Two versions are at the end: the **full prompt** (use this) and a **short
prompt** for a quick first draft. Everything in the full prompt is grounded in
this repository: the copy, the numbers, the sections and the limits are all
things DeepWork really has. Nothing here asks the site to invent a feature, a
testimonial, a customer count or an AI capability.

---

## The full prompt

> **How to use it:** copy everything from *“You are designing and building…”*
> down to the end of the acceptance checklist (before *“The short prompt”*) into
> your website builder. Attach 2–4 real app screenshots if you have them; the
> brief tells the builder what to do when you do not.

You are designing and building the public product website for **DeepWork**, a
desktop-first focus timer and task manager built with Tauri 2 and Angular. The
app keeps its database and its analysis on the user's own machine: there is no
account, no sign-in, no backend and no sync.

Your job is not to make a generic SaaS landing page. It is to make a site that
makes two unusual ideas immediately legible:

1. **The work your focus actually goes to.** DeepWork's **Time by Task** page
   groups every focus session by the work it paid for, not by the task row. A
   daily *Code review* is a new row every day; Time by Task shows one line with
   one all-time total, one first session, one last session and one rhythm.
2. **The reminder that does not give up.** DeepWork's **Standing Reminders**
   keep asking about a presentation, a class, a dose or a train until the user
   answers — across a closed laptop, a crossed notification and a restart — and
   never steal focus while they do it.

Those two ideas are the spine of the page. Everything else supports them.

### 1. Audience and job

- **Primary audience:** people who already use a focus timer or a task manager
  and are tired of reminders that disappear, apps that need an account, and
  analytics that count rows instead of work.
- **Secondary audience:** developers and privacy-minded users who will read the
  "no cloud, no account, MIT" claims and check them.
- **The page's job:** get the right person to install the app (Windows, macOS,
  Linux or the web app) with a clear understanding of what it is and what it is
  not.
- **Tone:** calm, concrete, a little dry. Short sentences. Specific numbers.
  No hype, no urgency timers, no "supercharge", no "AI-powered", no fake social
  proof. The app's own voice is the voice of the site: it explains rather than
  sells.

### 2. Design direction

The site should look like the app, not like a template that happens to be dark.

**Palette (use these exact values):**

| Token | Value | Use |
| ----- | ----- | --- |
| Background | `#080613` | Page base |
| Surface | `#0f0b1f` / `#160f2d` | Cards, raised sections |
| Primary accent | `#8b5cf6` | Violet — focus, repetition, primary CTA |
| Secondary accent | `#06b6d4` | Cyan — water, timer, secondary highlights |
| Tertiary accent | `#ec4899` | Pink — sparingly, for one callout only |
| Reminder accent | `#fbbf24` | Amber — standing reminders, "still standing" states |
| Primary text | `#f4f1ff` | Headlines and body |
| Secondary text | `#a9a3c2` | Body copy |
| Muted text | `#6f6a86` | Labels, captions |

**Type:**

- **Inter** for everything (300–800), loaded locally with `next/font` or
  `@fontsource`, not from a third-party CDN.
- **JetBrains Mono** for times, durations, counts and the small "demo" labels.
- Headlines: 700–800, tight tracking (`-0.03em`), 2–4 words per line.
- Body: 16–18px, line-height 1.6, max 68 characters per line.

**Surfaces:**

- Frosted-glass cards: `background: rgba(255,255,255,0.04)`,
  `border: 1px solid rgba(255,255,255,0.08)`, `backdrop-filter: blur(18px)`,
  radius 14–18px.
- A very soft radial glow behind the hero (violet → transparent) and behind the
  Time by Task section (cyan → transparent). No neon outlines, no 3D blobs, no
  floating gradient orbs.
- One hairline gradient rule may separate major sections; use it at most twice.

**Motion:**

- Scroll reveals: 12–20px rise + fade, 400–550ms, `cubic-bezier(.22,.61,.36,1)`,
  staggered 60–90ms, once per element.
- Demo interactions: 150–250ms; the reminder card's bell may pulse slowly; the
  Time by Task bars grow from 0 on first view.
- Respect `prefers-reduced-motion`: no transforms, no autoplay, no bar growth
  animation — show the final state.
- No parallax, no scroll-jacking, no cursor followers.

**Layout:**

- Max width 1180px, 24px gutters, 12-column grid.
- Sections alternate: full-bleed tinted band → contained content → plain
  background. Never more than two tinted bands in a row.
- On mobile (≤640px) everything is one column, 20px gutters, 44px minimum
  touch targets.

### 3. Page structure, in order

Build exactly these sections. Each one has a job, and the order is the argument.

#### 3.1 Navigation

- Left: DeepWork mark (the app's ring + clock glyph) and wordmark.
- Centre/right: **Features**, **Privacy**, **Download**, **FAQ**.
- Right CTA: **Get DeepWork** (primary), which scrolls to the download section.
- Sticky, translucent, hides on scroll down and returns on scroll up. On mobile:
  logo + menu button + Get button; menu is a full-width sheet.
- No "Sign in" and no "Pricing" — there is no account and the app is free/MIT.

#### 3.2 Hero

**Eyebrow:** `Focus timer · Tasks · Reminders — all on your machine`

**H1:** `Focus on the work. We'll hold the rest.`

**Subhead (max 2 lines):**
`DeepWork is a focus timer, a task manager and a reminder that keeps its
promises. No account, no cloud, and no reminder that quietly gives up.`

**CTAs:**

- Primary: `Download for Windows` (detect the OS: Windows / macOS / Linux; on
  mobile, `Open the web app`).
- Secondary: `See how it works` → scrolls to the Standing Reminders section.
- Under the CTAs: `Free · MIT · Windows, macOS and Linux · Your data stays in a
  file on your disk`.

**Hero visual:** a composed product still, not a generic dashboard screenshot:

- Centre: a dark app window mock with the focus ring at `24:18`, the current
  task *Write the launch note*, and a small **Time by Task** strip showing
  `Code review · 42 h 20 m` and `Deep work · 31 h 05 m`.
- Bottom-right, overlapping: the amber **standing reminder** card:
  - eyebrow `Standing reminder · 3rd ask`
  - title `Presentation — Room 4`
  - body `Still standing — reminder 3. Slides on the desktop.`
  - meta `Today · 15:00 · Insistent`
  - buttons `Done` `Snooze 10 min` `Stop`
- Top-left, small: a sticky OS toast with the same three buttons, to show the
  two surfaces are one question.
- Add a subtle annotation line pointing at the card: `It asked again while you
  were on stage.`

If real screenshots exist, use them inside the window mock. If not, build the
mock in HTML/CSS with the real type and spacing — do not use a stock dashboard
image.

#### 3.3 The problem

**Eyebrow:** `Why another reminder app?`

**H2:** `Reminders are announcements. The things that matter are not.`

Two short columns (or a 3-up on desktop):

1. **They disappear.** `A toast slides away in four seconds. If you were
   presenting, teaching or in a call, you never saw it.`
2. **They give up.** `Most reminders fire once and assume you were there. The
   one moment you could not answer is the moment they stop asking.`
3. **They interrupt.** `The other failure is the opposite: an app that pulls
   itself in front of the room to remind you about the room.`

Close with the line, set large:
`A reminder for a presentation has one job: still be there when the
presentation is over.`

#### 3.4 Feature 01 — Standing Reminders (the centrepiece)

**Eyebrow:** `Standing Reminders`

**H2:** `The reminder that does not give up.`

**Subhead:** `Write down the one thing you cannot afford to forget. When its
moment arrives, it keeps asking — on the desktop, in the app, and after a
restart — until you answer it.`

**Two-column layout:** demo left, explanation right (reverse on mobile).

**The demo (must be interactive, keyboard-accessible, and honest):**

A vertical timeline of one reminder, `Presentation — Room 4`, due `15:00`,
rhythm `Insistent`:

| Time | State | Copy |
| ---- | ----- | ---- |
| 15:00 | first ask | `It is time.` |
| 15:03 | still standing | `Still standing — reminder 2.` |
| 15:08 | still standing | `Still standing — reminder 3.` |
| 15:18 | still standing | `Still standing — reminder 4.` |
| 15:33 | still standing | `Still standing — reminder 5.` |

Above the timeline, a card in the app's style. Below it, three buttons that
actually change the state:

- **Done** → card becomes a quiet check: `Kept. 15:33 · 5 asks.` and the
  timeline stops.
- **Snooze 10 min** → adds a row at `15:43` labelled `Snoozed. It will ask
  again in 10 minutes.` and resets the counter in the card.
- **Stop** → card becomes `Stopped. Not every reminder is a promise.` and the
  timeline stops.

Add a small toggle above the demo: **`Close the laptop`**. When on, the timeline
gains a dashed gap and a row: `09:00 next morning — It was due at 15:00. We
kept it for you.` This is the whole persistence argument in one interaction.

**The explanation (right column) — four numbered rules, each one sentence:**

1. **It escalates, not repeats.** `Three, five, ten, fifteen, twenty minutes —
   then every thirty. Long enough to notice, never a stopwatch.`
2. **It is stored, not scheduled.** `A closed laptop is not an answer. The
   reminder is still there when you open it.`
3. **It asks one at a time.** `Two things due together are a queue, not a stack
   of cards to dismiss. The card says how many are behind it.`
4. **It never steals the stage.** `No window jumps forward. The sticky desktop
   notification is the surface that reaches you while you are elsewhere.`

**Under the demo, one honesty line:**
`A pause still pauses it. Crossing a notification is not an answer — the
question comes back in three minutes.`

**Small print / "what it is not":**
`Not a recurring calendar event, not a task, and not a way to bypass your own
pause or your OS's quiet hours.`

#### 3.5 Feature 02 — Time by Task

**Eyebrow:** `Time by Task`

**H2:** `The work your hours actually went to.`

**Subhead:** `Every focus session is already recorded against a task. Time by
Task groups those sessions by the work's title, so a routine that arrives as a
new row every day adds up under one line.`

**Layout:** a full-width interactive panel; copy above, demo below.

**Demo — a range switcher and a list:**

Tabs: `Today` · `This week` · `This month` · `This year` · `All time` · `Custom`

For each range, animate a small bar chart and a list. Use this data (it is
representative, not a claim about a real user):

| Work | All-time | Sessions | Days | Rhythm | Share of this month |
| ---- | -------- | -------- | ---- | ------ | ------------------- |
| Code review | 42 h 20 m | 128 | 96 | Repeats daily | 46% |
| Deep work writing | 31 h 05 m | 54 | 38 | Repeats weekly | 34% |
| Sprint planning | 12 h 40 m | 18 | 18 | Repeats weekly | 12% |
| Design review | 6 h 15 m | 9 | 6 | Multi-day | 5% |
| Untasked focus | 2 h 10 m | 7 | 5 | — | 3% |

- The **Code review** row is the hero: select it and show the detail strip:
  `First 2 Jun · Last 19 Oct · 96 days worked · avg 19 min · consistency 71%`.
- The bar colours mean the cadence, exactly as in the app: **violet** for
  repeating, **amber** for one-off, **blue** for multi-day, **slate** for
  untasked. A ring marks the current day/week/month.
- Show a tiny legend and the sentence: `One solid colour per bar. The ring is
  "now", not a second colour.`
- On `Custom`, reveal two date fields and a note: `The same day twice gives you
  a single day.`
- The **Untasked focus** row must be visible, with the line `Time recorded
  without a task is shown, not hidden.`

**Copy under the demo — three short claims:**

- `It groups the work, not the row.` — `A daily task is one line, not thirty.`
- `It answers over months, not only today.` — `First and last session, repeat
  rhythm, active days, consistency.`
- `It reads the numbers back to you.` — `One card says what the period was
  mostly spent on and whether it repeats.`

**A "What this says" card** in the demo, in the app's style:
`Code review took 46% of this month — your steadiest work, on 18 of 22 working
days. Blocks average 19 minutes, so it is a habit rather than a project.`

#### 3.6 Feature 03 — The focus timer

**H2:** `A timer that respects the day.`

**Subhead:** `Work and break cycles with an animated ring, a daily goal, and a
next-long-break line that is honest about the clock.`

Show a large ring at `24:18` with the labels `Focus`, `Short break`, `Long
break`, and three small cards: `Today 6 sessions`, `Next long break in 2`, `Goal
8`. Keep this section shorter than the other two — it is the familiar part.

#### 3.7 Feature 04 — Tasks, Matrix, Today

**H2:** `The work, arranged the way you think.`

Three-column feature strip (stack on mobile):

- **Today** — `Only what belongs to today: dated for it, overdue and still open,
  or written today and starred onto it.`
- **Matrix** — `Eisenhower quadrants with drag-and-drop, a resizable task list,
  and a calendar that pours the same queue into pomodoro blocks.`
- **Tasks** — `A status board filed into date sections — Today, Tomorrow, next
  week, later — with search, sort, Excel/CSV import with a real preview, and CSV
  export that tells you where the file went.`

A small board mock: three columns `To Do` / `In Progress` / `Done` with 2–3 cards
each; one card *Write the launch note* in `In Progress`.

#### 3.8 Feature 05 — Habits, journal, analytics

**H2:** `Numbers that come with a reading.`

**Subhead:** `DeepWork does not hand you a chart and leave. Every figure is
paired with a plain-language sentence about what it means.`

Three small cards:

- **Habits** — `30-day consistency, current streak, personal best, and the strip
  that shows exactly which days were missed.`
- **Journal** — `Dated entries, word counts, a weekly chart, and the
  writing-versus-focus correlation.`
- **Analytics** — `Focus, task, habit and journal figures with trends and
  streaks — and a reading of each one.`

Add one honest note: `The readings are deterministic rules and totals written
into the app. Same records, same reading, every time. No model in the loop.`

#### 3.9 Privacy and ownership

**Eyebrow:** `Your data`

**H2:** `Your work stays in a file on your disk.`

**Subhead:** `No account. No sync. No server of DeepWork's own.`

A 2×2 grid:

- **SQLite on your machine.** `Desktop keeps everything in deepwork.db in the
  app's data directory. The browser build keeps it in localStorage for that
  origin.`
- **Export is a real backup.** `One JSON file with sessions, tasks, habits,
  journal and water records. Importing overwrites after a confirmation — it is a
  restore, not a merge.`
- **Three things leave, and you can name them.** `The update check (one
  unauthenticated GET to GitHub releases), an installer download you press, and
  links you open in your own browser.`
- **The web build's visitor counter is the one exception.** `A GoatCounter visit
  count on the hosted web app, off with one switch, never on the desktop, and it
  sends the page — never a task, a journal entry or an identifier.`

Add a link-style line: `Read the full story in the repository's README.`

#### 3.10 Desktop manners

**H2:** `Small app. Good manners.`

A four-item strip:

- **It starts when you do** — `Optional start-with-system, plus always-on-top
  and keep-running-in-the-tray, asked once on first launch.`
- **The X does not end your session** — `It hides to the tray; the timer keeps
  going.`
- **The mini widget** — `Minimise into a 136×76 frameless, always-on-top timer
  with play, skip, stop and an expand arrow.`
- **One quiet panel everywhere** — `Pause, mute and focus from the sidebar, the
  phone's top bar, Settings or Ctrl+Shift+Q. A pause holds every reminder; a
  mute is sound only and always ends by itself.`

#### 3.11 What it is not

This section is a trust-builder, not a disclaimer. Use the repository's own
honesty, lightly edited.

**H2:** `What DeepWork is not.`

A table or definition list with four rows:

| Not this | Why it matters |
| -------- | -------------- |
| **Not AI, and not AI-assisted** | The readings are deterministic rules and totals. Same records, same reading, every time. |
| **Not a cloud app** | No backend, no account, no sync. Each machine has its own database. |
| **Not a team product** | One person, one database. No sharing, assignment or comments. |
| **Not signed yet** | The installers carry no code-signing certificate, so Windows may say *Unknown publisher* and macOS may refuse the first open. The site must say so before the download, not after. |

#### 3.12 Download

**H2:** `Get DeepWork.`

**Subhead:** `Free, MIT-licensed, and yours to keep.`

Three OS cards, each with the current release link and a one-line note:

- **Windows** — `.exe` (NSIS) or `.msi`, 64-bit Windows 10+.
- **macOS** — `.dmg`; Intel and Apple Silicon builds are separate.
- **Linux** — AppImage, `.deb` or `.rpm`; AppImage needs `chmod +x`.
- **Web app** — `Open in the browser` (works in a tab; installable as a PWA
  where supported).

Below the cards, the unsigned-build warning with the two real escape hatches:

- Windows: *More info → Run anyway* only if you trust the source.
- macOS 15+: **System Settings → Privacy & Security → Security → Open Anyway**,
  or `xattr -dr com.apple.quarantine /Applications/DeepWork.app`.
- Add: `If a release publishes a SHA-256 checksum, compare it before installing.`

Do not hide this in a footnote. It is the most common support question, and
saying it up front is part of the product's voice.

#### 3.13 FAQ

Use an accessible accordion (`<details>` is fine). Questions:

1. **Is there really no account?** `No account, no sign-in, no server. The app
   opens a local SQLite database.`
2. **Does it work offline?** `Yes. The app ships its fonts and its logic; the
   only network calls are the update check and links you choose to open.`
3. **What happens to a standing reminder if my laptop is closed?** `It is stored,
   so it is still standing on the next launch, with the time it was due.`
4. **Will it interrupt a presentation?** `No. It posts a sticky notification and
   an in-app card; it does not bring the window forward.`
5. **Can I stop a standing reminder for good?** `Yes — Stop ends it honestly and
   keeps it in the history, separate from Done.`
6. **Does Time by Task count breaks?** `No. Breaks, zero-duration sessions and
   unreadable timestamps are not time on a task.`
7. **Can I import my tasks?** `Yes: .xlsx, .xlsm and .csv, with a validating
   preview before anything is written.`
8. **Why is the installer unsigned?** `Code-signing certificates cost money and
   this is a solo, MIT-licensed project. The site tells you exactly what your OS
   will say.`
9. **Is the web app the same app?** `The whole app runs in the browser and can be
   installed as a PWA; the desktop build adds the tray, the mini widget and the
   native notifications.`

#### 3.14 Footer

- Mark + `DeepWork — focus, tasks and reminders that keep their promises.`
- Columns: **Product** (Features, Download, Changelog), **Project** (GitHub,
  README, Licence MIT, Report an issue), **More** (About the developer, Contact,
  Privacy).
- Small print: `Built with Tauri 2 and Angular. No analytics on this site unless
  you add a privacy-respecting counter — if you do, say so here and make it
  opt-out.`
- Version: `v3.0.2` from `package.json`.

### 4. Copy bank

Use these lines where they fit; do not pad the page with new slogans.

**Hero alternatives (pick one, do not stack):**

- `Focus on the work. We'll hold the rest.`
- `A focus timer for people who are sometimes on stage.`
- `The reminder that does not give up.`

**Section bridges:**

- `Most productivity apps count rows. DeepWork counts the work.`
- `A reminder that gives up is a reminder you learn to ignore.`
- `The moments you cannot answer are the ones a reminder usually abandons.`
- `Your health and your promises share one day.`

**Microcopy:**

- Under the reminder demo: `It keeps asking until you answer. No need to rush,
  no chance to forget.`
- Under the Time by Task demo: `Grouped by the work's title, so a daily task is
  one line — not thirty.`
- Near the download: `No account. No trial. No card.`

**Words to avoid:** supercharge, unleash, 10x, game-changer, seamless,
revolutionary, AI-powered, "take control of your life", fake urgency.

### 5. Interaction and accessibility requirements

- Every demo must work with keyboard only: the reminder's three buttons, the
  range tabs, the custom date fields and the FAQ accordion.
- The reminder card in the demo is `role="alertdialog"` with a label and
  description; the live region announces state changes politely, not on every
  animation frame.
- Colour is never the only signal: the Time by Task legend pairs each colour with
  a word, and the "now" ring has a text label.
- Contrast: body text ≥ 4.5:1, large headlines ≥ 3:1. Test the muted text on the
  dark background; `#6f6a86` is for labels only, never body.
- Focus rings: 2px solid `#8b5cf6` with a 2px offset, never `outline: none`.
- `prefers-reduced-motion`: switch off reveals and bar growth, keep state
  changes instant.
- No autoplay video, no sound, no scroll-jacking.

### 6. Technical requirements

- **Stack:** Next.js (App Router) or Astro with Tailwind CSS. Static output, no
  server, no database, no CMS. If the site must live in this Angular repository,
  a standalone Angular marketing route is acceptable — but keep it a separate
  bundle from the app.
- **Performance:** LCP < 2.0s on a mid-range mobile connection, CLS < 0.05, no
  layout shift from fonts. Inline critical CSS; self-host Inter and JetBrains
  Mono (the app's licences are in `public/fonts`).
- **Images:** real screenshots in AVIF/WebP with width/height set. If screenshots
  are missing, the CSS mocks in this brief are the fallback — never a stock
  dashboard.
- **SEO:** unique title and description, canonical URL, Open Graph and Twitter
  cards with a 1200×630 image, `SoftwareApplication` JSON-LD with
  `operatingSystem: Windows, macOS, Linux`, `applicationCategory:
  ProductivityApplication`, `offers.price: 0`, `license: MIT`.
- **Links:** the download CTAs point at
  `https://github.com/malikrajat/deepwork/releases`; the web app CTA points at
  `https://app.deepwork.rajatmalik.dev/`; the footer links to
  `https://github.com/malikrajat/deepwork`.
- **Analytics:** none by default. If one is added, it must be cookie-free,
  disclosed in the footer, and off for the desktop app (which never loads the
  site anyway).
- **Deploy:** static hosting (GitHub Pages, Cloudflare Pages, Netlify). Include a
  `404.html` that returns to the home page.

### 7. Responsive behaviour

- **≥1200px:** hero is 2 columns (copy 5/12, visual 7/12); feature demos are
  2 columns.
- **900–1199px:** hero visual scales down; demos keep 2 columns but tighten.
- **640–899px:** hero stacks, visual below the copy; feature sections stack;
  navigation becomes a sheet.
- **<640px:** one column, 20px gutters, 44px touch targets, demo timelines
  become vertically scrollable cards, the reminder card spans the width.

### 8. Deliverables

1. A working static site with every section above.
2. A `README` for the site: how to run it, where the download URLs live, how to
   swap screenshots, and how to update the version.
3. The real copy in the components, not lorem ipsum.
4. A Lighthouse run (mobile) with Performance ≥ 90, Accessibility ≥ 95, Best
   Practices ≥ 95, SEO ≥ 95.
5. A short list of every placeholder that needs a real asset (screenshot,
   OG image, favicon) before launch.

### 9. Acceptance checklist

- [ ] A first-time visitor can explain both **Standing Reminders** and **Time by
      Task** after scrolling once.
- [ ] The reminder demo can be driven to *Done*, *Snoozed* and *Stopped*, and the
      laptop-closed toggle shows the catch-up line.
- [ ] The Time by Task demo changes with the range tabs and names its colours.
- [ ] The site never claims AI, cloud sync, a team plan, or a customer it does
      not have.
- [ ] The unsigned-installer warning appears before the download buttons, not in
      a footnote.
- [ ] Everything works with the keyboard and with reduced motion.
- [ ] No layout shift, no console errors, no third-party font request.

### 10. Do not

- Do not build a generic "all-in-one productivity" page that buries the two
  unusual ideas in a feature grid.
- Do not invent numbers, testimonials, logos, user counts or "trusted by" rows.
- Do not use a light theme "for contrast" — the product is a dark, quiet app.
- Do not add a pricing page, a sign-up form, a newsletter popup or a chat widget.
- Do not make the reminder card dismissible in the demo: its whole argument is
  that it is not.
- Do not promise notifications the platform does not have (the app's own README
  is the source of truth).

---

## The short prompt

> Build a static marketing site for **DeepWork**, a local-first focus timer,
> task manager and reminder app (Tauri 2 + Angular, MIT, no account, no cloud).
> Dark glass aesthetic: `#080613` background, violet `#8b5cf6`, cyan `#06b6d4`,
> amber `#fbbf24` for reminders, Inter + JetBrains Mono. Sections: hero (*Focus
> on the work. We'll hold the rest.*) with an app-window mock; the problem (toasts
> disappear, reminders give up, apps interrupt); **Standing Reminders** — an
> interactive timeline where one reminder keeps asking at 15:00, 15:03, 15:08,
> 15:18 and 15:33 until *Done*, *Snooze* or *Stop*, with a "close the laptop"
> toggle that shows it still standing the next morning; **Time by Task** — range
> tabs and a list where *Code review* is 42 h 20 m across 128 sessions and 96
> days, with a note that it groups by work title and shows untasked time; the
> focus timer, tasks/matrix/today, habits/journal/analytics; privacy (SQLite
> locally, three network calls, no telemetry); what it is not (no AI, no cloud,
> no team, unsigned installers); download cards with the real unsigned-installer
> warnings; FAQ; footer. Requirements: real copy, no fake social proof, keyboard
> accessible, `prefers-reduced-motion`, static Next.js/Astro + Tailwind, LCP <
> 2s, OG image and `SoftwareApplication` JSON-LD. Make the two unusual features
> the spine of the page, not two cards in a grid.
