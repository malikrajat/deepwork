# Dead code removed in 2.0.21 — complete revert reference

**What this is:** every line of dead CSS, unused TypeScript and unused markup that was removed from
this workspace, written out in full so any single change can be pasted back. Nothing here is
generated; every block below is the exact text that was deleted.

**Scope of the cleanup:** `src/**` (the shipped app) only. Build and test output
(`dist/`, `coverage/`, `playwright-report/`, `test-results/`, `.angular/`), `src-tauri/`, `specs/`
and `node_modules/` were not touched.

**Verification after removal:** `eslint` 0 errors · `tsc --noEmit -p tsconfig.app.json` clean ·
**1160/1160 unit tests pass** · `ng build` production build succeeds.

---

## 1. Summary

| # | Category | Removed | Where |
| --- | --- | --- | --- |
| A | Dead CSS rules / selectors | 6 selectors (5 whole rules + 1 selector inside a shared rule) | about, settings, install-banner |
| B | Dead CSS custom properties | 4 tokens, 7 declarations | `src/styles.css` |
| C | Unused exported symbols | 4 | app-info, update.model, form-validators |
| D | Unused class members | 13 | db, schedule, timer, dashboard, settings, timeline-bar |
| E | Unused markup hooks (class attributes) | 18 names, 20 attribute sites | 11 templates |
| F | Kept on purpose (reported, not removed) | 8 token names (12 declarations), 8 class names | see §8 |

Side effects worth knowing:

- `npm run lint` went from **134 warnings to 124** — the six deleted `DbService` query methods each
  used `any` for their SQLite rows, and those warnings went with them. No error-count change (0 before
  and after).
- Two now-unused imports and one now-unused signal write were removed as a consequence of D:
  `AppSettings` in `timer.service.ts`, `ThemePreference` in `settings.component.ts`, and
  `this.activeTheme.set(...)` in `SettingsComponent.initAsync()`.

---

## 2. What "dead" was measured against (and why the extension still shows a number)

Angular's default emulated encapsulation is what makes this measurable: a rule in a component's
`styles: [...]` can only match elements **in that component's own template**, while `src/styles.css`
is global. So the audit asked, for each stylesheet:

- **global CSS** (`src/styles.css`) → is the class/id used in *any* template, class binding,
  `classList.*` call, `className` assignment, `class~`/selector string, or test locator?
- **component CSS** (inline `styles: [...]`, `src/app/app.css`) → is it used in *that component's*
  template or code?

Usage evidence was collected from every non-CSS file (all 33 component templates, `index.html`,
`app.html`, 71 unit specs, the Playwright suites, `src-tauri` strings), with dynamic construction
handled (`[class]="'update-row state-' + status()"`, `class="p{{ task.priority }}"`,
`[class]="'l' + level"`, `host: { '[class.mobile-open]': ... }`, `classList.add(...)`).

**Totals:** 2,271 selectors and 115 custom properties were analysed. Of those, **6 selectors and 4
custom properties were genuinely dead**. 33 `@keyframes` were referenced, 0 empty rules, 0 dangling
`id`/`aria-*` references, 0 unused `<ng-template>`s, 0 unused ids, 0 dead type selectors.

| Candidate | Verdict | Why |
| --- | --- | --- |
| `.tick-major` / `.tick-minor` (in `styles.css`) | **used** | applied by `[class]="tick % 5 === 0 ? 'tick-major' : 'tick-minor'"` in `animated-clock` |
| `.update-row`, `.state-update-available`, `.state-up-to-date`, `.state-unavailable` | **used** | built as `'update-row state-' + updates.status()`; the statuses are exactly `update-available`/`up-to-date`/`unavailable` (`update.service.ts`) |
| `.cdk-drag-preview`, `.cdk-drag-placeholder`, `.cdk-drag-animating`, `.cdk-drop-list-dragging` | **used** | added at runtime by `@angular/cdk/drag-drop` (`cdkDrag`/`cdkDropList` are used by matrix and task-board); no source string can contain them |
| `.l0`–`.l4` (analytics heatmap) | **used** | `[class]="'l' + levelFor(date)"` |
| `.p1`–`.p4` (task-board badge) | **used** | `class="priority-badge p{{ task.priority }}"` |
| `.important`, `.urgent`, `.neither` (dashboard) | **used** | `[class]="selectedTaskQuadrant()"` |
| `.mobile-open` (sidebar) | **used** | `host: { '[class.mobile-open]': 'mobileOpen()' }` |
| `.current`, `.cycle-card`, `.delete`, `.edit-btn`, `.focus-btn` | **kept** | selected by e2e/unit specs (`about.component.spec.ts`, `full-cycle.spec.ts`, `today.spec.ts`, `task-crud.spec.ts`) |

### Where the "259 bad CSS selectors" most likely comes from

The problems panel almost certainly includes CSS that is not the app's source. This workspace contains
**563 selectors of generated CSS** outside `src/`:

| File | Selectors | Class tokens with no usage in the project |
| --- | --- | --- |
| `coverage/base.css` + `coverage/lcov-report/base.css` | 104 each | 36 each |
| `coverage/prettify.css` + `coverage/lcov-report/prettify.css` | 41 each | 15 each |
| `dist/deepwork/browser/styles-*.css` (minified bundle) | 273 | 0 |
| **total** | **563** | **102** |

`coverage/**/base.css` is the lcov HTML report's own stylesheet (`.pad1`, `.cline-any`,
`missing-if-branch`, `.sorter`, …) — none of it belongs to DeepWork. The file `.dead-css-report.md`
in the repo root is an **older export from such a tool**; it lists selectors in
`playwright-report/trace/*.css` (CodeMirror, xterm) and in a `.kilo/worktrees/axiomatic-piano`
copy of this repo, and **neither of those paths exists any more**, so it is stale and misleading.

Practical fix for the editor noise — either exclude generated folders from the tool, or delete the
generated output (all of it is regenerated by `npm test --coverage` / `npm run build`):

```jsonc
// .vscode/settings.json  (only affects editor tooling, not the build)
"search.exclude": {
  "**/coverage": true,
  "**/dist": true,
  "**/playwright-report": true,
  "**/test-results": true,
  "**/.angular": true
}
```

Removing the stale report, if you want it gone:

```bash
git rm .dead-css-report.md
# to restore:  git checkout HEAD -- .dead-css-report.md
```

> I did **not** delete it or change `.vscode/settings.json`, because neither is dead *code* — both are
> your call. Say the word and I will.

---

## 3. A — Dead CSS rules (paste these back)

### A1. `src/app/pages/about/about.component.ts` — `.work-list` (scroll to the `/* ── Lists ── */` block)

The rule is shared by four lists; only the dead selector line was dropped.

Removed line (selector list only):

```css
      .work-list,
```

Full original rule, if you prefer to restore it whole:

```css
      /* ── Lists ──────────────────────────────────────────────────────── */
      .option-list,
      .work-list,
      .contact-list,
      .link-list {
        list-style: none;
        display: flex;
        flex-direction: column;
      }
```

### A2. `src/app/pages/settings/settings.component.ts` — the removed theme switcher

Deleted between the monospace chip rule (ends `font-family: 'JetBrains Mono', monospace;`) and the
blank line before `/* ===== Phone layout =====`. The theme is now a `<select [formField]="settingsForm.theme">`,
so nothing renders these.

```css
      .theme-switcher {
        display: flex;
        gap: 4px;
        background: rgba(255, 255, 255, 0.04);
        padding: 3px;
        border-radius: 10px;
        border: 1px solid rgba(139, 92, 246, 0.12);
      }
      .theme-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        line-height: 1;
      }
      .theme-btn:hover {
        background: rgba(139, 92, 246, 0.1);
        color: var(--color-text-primary);
      }
      .theme-btn.active {
        background: rgba(139, 92, 246, 0.18);
        color: var(--color-accent-primary);
        box-shadow: 0 0 12px rgba(139, 92, 246, 0.15);
      }
```

### A3. `src/app/shared/components/install-banner/install-banner.component.ts` — `.inline-icon`

Deleted between `.banner-text strong { … }` and `.banner-actions {`. The banner's icon uses
`class="banner-icon"`, which has its own rule.

```css
      .inline-icon {
        display: inline-block;
        vertical-align: text-bottom;
        color: var(--color-accent-primary);
      }
```

---

## 4. B — Dead CSS custom properties in `src/styles.css`

Each of these was defined but never read by any `var(...)`, template style binding or script. (The
surviving `--clock-track`, `--control-bg`, `--sidebar-bg`, `--surface-float`, `--toast-bg` are all used.)

### B1. Dark `:root` — `--input-bg` (superseded by `--control-bg`)

Removed line, from the "Sidebar & input surface tokens" block:

```css
  --input-bg: rgba(255, 255, 255, 0.05);
```

### B2. Dark `:root` — `--surface-sidebar` (the live token is `--sidebar-bg`)

```css
  --surface-sidebar: rgba(15, 11, 31, 0.6);
```

### B3. Dark `:root` — the two clock tick tokens

The clock paints its ticks with literal `rgba()` values (`.tick-major { stroke: rgba(255,255,255,0.25) }`),
so these two were never read. The trailing sentence of the comment went with them.

```css
  --clock-tick-major: rgba(255, 255, 255, 0.32);
  --clock-tick-minor: rgba(255, 255, 255, 0.14);
```

And the comment sentence that referred to them (original wording):

```css
  /* Animated clock chart */
  /* The clock is the one chart on the Dashboard and its ring is the shape the
     whole session is drawn against: at 0.04 the track was invisible, so a fresh
     session looked like a floating pair of hands. The ticks carry the same
     reasoning a step further down. */
```

### B4. Light theme block (`html[data-theme='light']`) — three tokens

Removed lines (between `--sidebar-active-border` and `--clock-track`):

```css
  --surface-sidebar: rgba(255, 255, 255, 0.6);
```

```css
  --clock-tick-major: rgba(15, 23, 42, 0.34);
  --clock-tick-minor: rgba(15, 23, 42, 0.16);
```

---

## 5. C — Unused exported symbols

Each of these was referenced **nowhere** in the repository (not in `src`, not in the 71 specs, not in
the e2e suites, not in any template — templates live in the component files here, so a template use
would have been found).

### C1. `src/app/core/constants/app-info.constants.ts` — `APP_CHANGELOG_URL`

Deleted from the end of the file, after `APP_ISSUES_URL`:

```ts
/** The written history of the app, kept in the repository. */
export const APP_CHANGELOG_URL = `${APP_REPO_URL}/blob/main/CHANGELOG.md`;
```

### C2. `src/app/core/models/update.model.ts` — the `UpdateCheck` interface

Deleted after `ReleaseInfo` (line 47 in the old file):

```ts
/** The answer to "is there anything newer than what I am running?" */
export interface UpdateCheck {
  status: UpdateStatus;
  /** Version of the running build. */
  currentVersion: string;
  /** The newest published release, once one has been read. */
  latest: ReleaseInfo | null;
  /** When the answer was obtained, ISO timestamp. */
  checkedAt: string | null;
  /** Why the check could not answer, or extra context when it could. */
  message: string | null;
}
```

### C3. `src/app/shared/validators/form-validators.ts` — `sanitizeText` and `escapeHtml`

Deleted from the "Sanitization helpers" section. `stripHtml` (kept) is used elsewhere.

```ts
/** Sanitize string: trim, strip HTML, collapse multiple spaces */
export function sanitizeText(value: string): string {
  return stripHtml(value).trim().replace(/\s{2,}/g, ' ');
}

/** Sanitize for safe storage - escapes HTML entities */
export function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}
```

---

## 6. D — Unused class members

Found by searching every member name across the whole repository (templates included). Two
framework-invoked hooks were **deliberately kept** even though their names appear only once:
`AppErrorHandler.handleError()` (Angular calls it) and `TimelineBarComponent.ngAfterViewInit()`
(Angular lifecycle hook).

### D1. `src/app/core/services/db.service.ts` — six query methods

All six were public, async, and called from nowhere. Restore each at its original neighbour noted below.

**`getSessionsSince`** — deleted after `getSessions()` and before the `// ==== HABIT METHODS ====` banner:

```ts
  async getSessionsSince(dateStr: string): Promise<PomodoroSession[]> {
    if (this.isBrowser) {
      const all = this.lsGet<PomodoroSession[]>('sessions', []);
      return all.filter((s) => s.startedAt >= dateStr);
    }
    const rows = await this.query<any>(
      `SELECT * FROM sessions WHERE started_at >= $1 ORDER BY started_at ASC`,
      [dateStr],
    );
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      type: r.type,
      durationPlanned: r.duration_planned,
      durationActual: r.duration_actual,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      interrupted: !!r.interrupted,
    }));
  }
```

**`getHabitEntries`** — deleted between `deleteHabit()` and `getAllHabitEntries()`:

```ts
  async getHabitEntries(habitId: string): Promise<any[]> {
    if (this.isBrowser) {
      return this.lsGet<any[]>('habitEntries', []).filter((e) => e.habitId === habitId);
    }
    const rows = await this.query<any>(
      'SELECT * FROM habit_entries WHERE habit_id = $1 ORDER BY completed_at ASC',
      [habitId],
    );
    return rows.map((r) => ({ id: r.id, habitId: r.habit_id, completedAt: r.completed_at }));
  }
```

**`getJournalEntry`** — deleted between `getJournalEntries()` and `saveJournalEntry()`:

```ts
  async getJournalEntry(date: string): Promise<any> {
    if (this.isBrowser) {
      const entries = this.lsGet<any[]>('journal', []);
      return entries.find((e) => e.date === date) ?? null;
    }
    const rows = await this.query<any>('SELECT * FROM journal_entries WHERE date = $1', [date]);
    return rows.length
      ? {
          id: rows[0].id,
          date: rows[0].date,
          content: rows[0].content,
          createdAt: rows[0].created_at,
          updatedAt: rows[0].updated_at,
        }
      : null;
  }
```

**`getTaskById`** — deleted between `getTasks()` and `getTasksByQuadrant()`:

```ts
  async getTaskById(id: string): Promise<Task | null> {
    if (this.isBrowser) {
      const tasks = this.lsGet<Task[]>('tasks', []);
      return tasks.find((t) => t.id === id) ?? null;
    }
    const rows = await this.query<any>('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows.length ? this.mapTask(rows[0]) : null;
  }
```

**`getTasksByStatus` and `getTodayTasks`** — deleted between `getTasksByQuadrant()` and `createTask()`:

```ts
  async getTasksByStatus(status: string): Promise<Task[]> {
    if (this.isBrowser) {
      return this.lsGet<Task[]>('tasks', []).filter((t) => t.status === status);
    }
    const rows = await this.query<any>(
      'SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC',
      [status],
    );
    return rows.map((r) => this.mapTask(r));
  }

  async getTodayTasks(): Promise<Task[]> {
    if (this.isBrowser) {
      return this.lsGet<Task[]>('tasks', [])
        .filter((t) => t.todayOrder !== null)
        .sort((a, b) => (a.todayOrder ?? 0) - (b.todayOrder ?? 0));
    }
    const rows = await this.query<any>(
      'SELECT * FROM tasks WHERE today_order IS NOT NULL ORDER BY today_order ASC',
    );
    return rows.map((r) => this.mapTask(r));
  }
```

> `npm run lint` dropped from 134 to 124 warnings because of these six deletions (they were the bulk
> of the `no-explicit-any` warnings, reading SQLite rows).

### D2. `src/app/core/services/schedule.service.ts` — `todayQueue`

Deleted between `queue` and `schedule`:

```ts
  /** Queue for the real today — what the Eisenhower matrix reorders. */
  readonly todayQueue = computed(() => this.buildQueue(dayKey(), this.plans()));
```

### D3. `src/app/core/services/schedule.service.ts` — `scheduleFor()`

Deleted between the end of `buildScheduleForDate()`-style code and `weekDates()` (immediately before
the `// ──── Internal: queue building ────` banner):

```ts
  /**
   * Full layout for any day without touching the selected date — used by the
   * calendar reminders, which always follow the real today.
   */
  scheduleFor(date: string): DaySchedule {
    return this.buildSchedule(this.buildScheduleItems(date), this.prefs());
  }
```

### D4. `src/app/core/services/timer.service.ts` — `updateSettings()`

Deleted between `linkTask()` and `private tick()`. Settings are written through `SettingsService`
directly now.

```ts
  async updateSettings(newSettings: AppSettings): Promise<void> {
    await this.settingsService.saveSettings(newSettings);
    if (!this.isRunning()) {
      this.remainingSeconds.set(this.getDurationForType(this.timerType()));
    }
  }
```

Consequence, also reverted here — the import line at the top of the file:

```ts
// now
import { DEFAULT_SETTINGS } from '../models/settings.model';
// before
import { AppSettings, DEFAULT_SETTINGS } from '../models/settings.model';
```

### D5. `src/app/pages/dashboard/dashboard.component.ts` — `selectedTaskName`

Deleted between `taskSelectForm` and `selectedTaskQuadrant`:

```ts
  readonly selectedTaskName = computed(() => {
    const id = this.selectedTaskId();
    if (!id) return '';
    const task = this.taskService.todayTasks().find((t) => t.id === id);
    return task?.title ?? '';
  });
```

### D6. `src/app/pages/settings/settings.component.ts` — `setTheme()`, and the write-only `activeTheme` signal

`activeTheme` was written in two places and never read: the `<select>` binds to
`settingsForm.theme` and persists through `persist('theme')`.

`setTheme`, deleted between `toggleCarryForwardTasks()` and `persist()`:

```ts
  async setTheme(theme: ThemePreference): Promise<void> {
    this.activeTheme.set(theme);
    await this.settingsService.updateField('theme', theme);
  }
```

The signal declaration, deleted above `settingsModel` (the `/* The fixed choices … */` lines above it
belong to `alertShakeOptions` and stay):

```ts
  readonly activeTheme = signal<ThemePreference>('system');
```

The write, deleted from `initAsync()`:

```ts
    const s = this.settingsService.settings();
    this.activeTheme.set(s.theme ?? 'dark');
    this.settingsModel.set({
```

Import line, deleted between the `InstallService` and `NotificationService` imports:

```ts
import { ThemePreference } from '../../core/models/settings.model';
```

### D7. `src/app/shared/components/timeline-bar/timeline-bar.component.ts` — `nowTimeLabel`

Deleted between `nowOffsetPx` and the `/** Compute completed session blocks. … */` comment:

```ts
  readonly nowTimeLabel = computed(() => {
    const now = new Date(this.tick());
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
```

---

## 7. E — Unused markup: class attributes that no CSS rule and no code referenced

These classes had **no rule in any stylesheet** (global or component), no `querySelector`, and no test
selector. Removing a class with no rule cannot change layout or behaviour; each line below is the
original markup, so paste it back if the class is wanted as a future hook.

18 names across 20 attribute sites (`.preview-btn`, `.col-notes` and both label hooks each appear
twice). Kept deliberately (see §8): `.compact`, `.multi`, `.sidebar-collapsed`, and the e2e hooks.

| File | Original markup → now |
| --- | --- |
| `pages/calendar/calendar.component.ts` | `<span class="sep">·</span>` → `<span>·</span>` |
| `pages/calendar/calendar.component.ts` | `<span class="at">{{ item.atLabel }}</span>` → `<span>{{ item.atLabel }}</span>` |
| `pages/calendar/calendar.component.ts` | `<div class="panel-new">` → `<div>` |
| `pages/dashboard/dashboard.component.ts` | `<div class="header-content">` → `<div>` |
| `pages/dashboard/dashboard.component.ts` | `<article class="insight-card goal-card">` → `<article class="insight-card">` |
| `pages/dashboard/dashboard.component.ts` | `<article class="insight-card schedule-card">` → `<article class="insight-card">` |
| `pages/analytics/analytics.component.ts` | `<div class="bar-chart hours">` → `<div class="bar-chart">` |
| `pages/analytics/analytics.component.ts` | `<div class="bar-chart weekdays">` → `<div class="bar-chart">` |
| `pages/analytics/analytics.component.ts` | `<div class="bar-chart flow">` → `<div class="bar-chart">` |
| `pages/settings/settings.component.ts` | `class="action-btn preview-btn"` → `class="action-btn"` (sound Preview button) |
| `pages/settings/settings.component.ts` | `<button type="button" class="action-btn preview-btn" (click)="testWaterReminder()">` → `class="action-btn"` |
| `pages/matrix/matrix.component.ts` | `class="collapse-btn pane-toggle"` → `class="collapse-btn"` |
| `pages/about/about.component.ts` | `<section class="card hero">` → `<section class="card">` |
| `pages/about/about.component.ts` | `<section class="card update-card">` → `<section class="card">` |
| `pages/journal/journal.component.ts` | `<span class="shortcut-hint">Ctrl+S to save now</span>` → `<span>Ctrl+S to save now</span>` |
| `shared/components/task-import-panel/…` | `<th class="col-notes">Notes</th>` → `<th>Notes</th>` |
| `shared/components/task-import-panel/…` | `<td class="col-notes">` → `<td>` (the notes cell) |
| `shared/components/task-import-panel/…` | `<label class="option skip-duplicates">` → `<label class="option">` |
| `shared/components/task-import-panel/…` | `<label class="option include-warnings">` → `<label class="option">` |
| `shared/components/visitor-stats-dialog/…` | `<section class="stat-block facts">` → `<section class="stat-block">` |

(`.option`, `.action-btn`, `.collapse-btn`, `.card`, `.insight-card`, `.bar-chart`, `.stat-block`,
`.col-small`, `.title-note` etc. are all real rules and were left alone.)

No unused HTML beyond this existed: all 23 template `id`s (including the SVG gradient
`#mobile-brand-grad`, used by `stroke="url(#mobile-brand-grad)"`), all 18 template reference
variables, and all `<ng-template>` blocks are referenced; there are no dangling `for=`/`aria-*`
targets and no orphaned `.html` files (`index.html` and `app.html` are both in use).

---

## 8. F — Found dead, deliberately NOT removed (your call)

### F1. Design-token rungs that no component currently uses

These are unused today, but they are rungs of the documented type/radius ladders, and
`tests/unit/visual-crispness.spec.ts` ("publishes the scale and the radius ladder as design tokens")
pins the ladder's existence. Removing rungs from a published scale felt like fighting the design
system, so I left them and am reporting them instead.

In `src/styles.css`:

```css
  /* :root */
  --color-accent-tertiary: #ec4899;   /* line ~119; palette neighbour of primary/secondary */
  --space-xs: 4px;                    /* line ~214 */
  --text-3xl: 20px;                   /* line ~242 */
  --text-4xl: 22px;                   /* line ~243 */
  --text-7xl: 32px;                   /* line ~246 */
  --radius-xs: 6px;                   /* line ~252 */
  --radius-xl: 16px;                  /* line ~256 */
  --radius-pill: 999px;               /* line ~258 */

  /* html[data-theme='light'] */
  --color-accent-tertiary: #db2777;

  /* @media (min-width: 2560px) :root */
  --text-3xl: 24px;
  --text-4xl: 26px;
  --text-7xl: 38px;
```

Say the word and I will remove them (they are genuinely unreferenced), or leave them as the scale's
documented headroom.

### F2. Class attributes that are styling hooks but never styled

Left in place because each one *means* something (state or e2e identity) even though no rule uses it
today — worth a look, because their absence of CSS may itself be an oversight:

| Class | Where | Note |
| --- | --- | --- |
| `.sidebar-collapsed` | `app.html` — `[class.sidebar-collapsed]="sidebarCollapsed()"` | bound but styled nowhere; the drawer layout uses other rules |
| `.compact` | `calendar.component.ts` — `[class.compact]="item.height < 52"` | bound, unstyled |
| `.multi` | `calendar.component.ts` — `[class.multi]="item.block.taskIds.length > 1"` | bound, unstyled |
| `.current` | about — `[class.current]="row.current"` | asserted by `about.component.spec.ts` |
| `.cycle-card` | dashboard | e2e `full-cycle.spec.ts` |
| `.delete`, `.edit-btn`, `.focus-btn` | task-board | e2e `task-crud.spec.ts`, `today.spec.ts` |

---

## 9. How to undo the whole thing

There is no single clean `git` revert for this cleanup, because this working tree already contained
your uncommitted 2.0.21 work in the same files (for example `db.service.ts`, `app.html`, `app.ts`,
`settings.model.ts`, `CHANGELOG.md`, `package.json` were modified before I started — `git diff` mixes
both sets of changes, and `git checkout`/`git restore` would discard your work too).

So: use the blocks above with their anchors. Each block is complete and each anchor is a nearby line
that has not moved, so re-insertion does not depend on line numbers. If you would rather have it as a
patch, ask and I will produce a patch containing only these hunks (I have the exact before/after text
for every one).

## 10. What was verified, and two sandbox caveats

| Check | Result |
| --- | --- |
| `npm run lint` (eslint + angular-eslint) | **0 errors**, 124 warnings (all pre-existing `no-explicit-any`; was 134) |
| `npx tsc --noEmit -p tsconfig.app.json` | clean |
| `npm test` (vitest) | **71 files, 1160 tests, all pass** |
| `npm run build` (`ng build`, production) | succeeds, bundle emitted |
| prettier | *not* run — see below |

**Caveat 1 — a test that flaked, then passed.** The first full run had one failure:
`tests/unit/taskbar-pin.service.spec.ts > falls back to its own words when the backend sends no reason`
(`Test timed out in 5000ms`). That spec is one of your **untracked, in-progress 2.0.21 files** and the
service polls the backend up to `POLL_ATTEMPTS = 400 × 250 ms` while the spec's mock queue holds two
`invoke` results; under a 71-environment run it can outlive the 5 s budget. Re-run in isolation it
passes **21/21**, and the second full run passed everything, so this is pre-existing flakiness, not a
consequence of the removals. Worth giving that spec a larger timeout or a default mock implementation.

> Moot as of 2.0.22: pin to taskbar was removed — the feature, that spec and every
> other reference to it. Nothing polls that backend any more, so there is no
> flakiness left to fix.

**Caveat 2 — formatting drift is repo-wide and predates this cleanup.** `npm run format:check`
currently flags **155 files**, including `.prettierrc`, `.vscode/*.json`, `.github/workflows/ci.yml`
and **68 files under `src/` that this cleanup never touched** (e.g. `app.routes.ts`,
`log.service.ts`, `schedule.engine.ts`, `toast.component.ts`). I therefore did not run
`prettier --write`: it would have buried your in-progress work in unrelated reformatting. I did check
that each deletion leaves Prettier's decisions unchanged (deletions of whole rules/members cannot
introduce a wrap, and the one shortened `class` attribute is still far past the print width).
If you want, I can format just the files touched here as a separate, clearly-labelled commit.
