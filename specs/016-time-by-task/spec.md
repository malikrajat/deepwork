# Feature Specification: Time by Task — the work your focus actually goes to

**Feature branch**: `3.0.0`
**Status**: Implemented
**Created**: 2026-10-18

## Summary

DeepWork has always recorded every focus session against a task, but it could
only answer "what did I do today?". It could not answer the question that
matters over months: *how much of my life has code review taken?*

The obstacle is that repeating work arrives as a new task row each day. A daily
**Code review** is one row on Monday and another on Tuesday, carrying the same
title but a different id, and the task list is the wrong shape for the question:
it shows the rows, not the work. The new **Time by Task** page groups sessions by
work's title, so every daily copy adds to one all-time total, and shows the
picture behind the number: first and last session, the days it was worked, the
rhythm it follows, and a breakdown by day, week, month or year.

It is a page rather than another card on Analytics because it is about one
question with a list-shaped answer, and because the answer is read over time,
not only today. A **Today** filter covers the day in hand, and **Custom** takes
two dates for an arbitrary day or span. The list itself is virtualised: only
the rows inside its scroll viewport exist in the DOM, and the breakdown for a
row opens in a detail sheet rather than making the row variable-height.

## The questions the page answers

| Question | Where it is answered |
| -------- | -------------------- |
| How much time have I spent on this work, ever? | The row's all-time total, sessions and days. |
| How many times have I done it? | Session count, plus the number of task rows the work arrived as. |
| When did it start and when did I last touch it? | First and last session, and the inclusive span with a consistency figure. |
| Does it repeat — and how often? | A badge: repeats daily / weekly / monthly / occasionally, multi-day, one-off, or untasked. |
| What does this month/year look like? | Week / month / year / all-time windows, each with a day/week/month/year bar chart and a breakdown table. |
| What should I do with this? | The **What this says** card: biggest share, repeating share, steadiness, average block length. |

## User scenarios & testing

1. **The daily routine.** The user works on *Code review* every day, each day as
   a fresh task. The Time by Task page shows one *Code review* row, marked
   **Repeats daily**, with the sum of every session, the first and last day, and a
   bar per day/week/month for the selected window. Opening it lists the sessions
   and their durations.
2. **The first-and-last one-off.** A single task worked on once shows **One-off**,
   equal first and last dates, one session, and the same total in every window
   that contains its day.
3. **The multi-day project.** One task worked on across several days is
   **Multi-day** when only two days are involved, or classified by the rhythm
   between the days once there are three or more — a daily habit kept on one task
   still reads as repeating.
4. **The deleted task.** The task is deleted after the session. The session's
   `task_id` is cleared by the foreign key, but its recorded title keeps the
   hours attached to *Code review* on the Time by Task page.
5. **The untasked session.** The timer was started without a task. The page shows
   **Untasked focus** rather than dropping the time, and says to link a task next
   time.
6. **The particular day.** The user wants to know what one unusual day held, or
   compare two arbitrary dates. **Today** is one click; **Custom** offers two date
   fields, and the same day in both gives a single-day window.
7. **The long history.** A user with hundreds of tasks scrolls the list. Only the
   rows in view exist in the page; opening one raises its detail sheet, and the
   list stays cheap because its rows are a fixed height.
8. **The empty app.** With no sessions the page explains what will appear and
   links to the Dashboard. With sessions but none in the selected window, it says
   so and offers **Show all time**.

## Acceptance criteria

- **AC-1** A session records `task_title` when it is saved
  (`013_add_session_task_title.sql`), and existing sessions are backfilled from
  the task they point at. Deleting a task does not lose the title of its past
  sessions.
- **AC-2** Time by Task groups work sessions by normalised task title (trimmed,
  whitespace-collapsed, case-insensitive). Task rows that share a title are one
  group; a renamed task's history follows the current title.
- **AC-3** Breaks, zero-duration sessions and unreadable start timestamps are not
  time on a task and never appear in a group or a total.
- **AC-4** Each group carries all-time seconds, session count, active days, first
  and last session, inclusive span, average session, consistency, and the
  distinct task-row count — none of which changes when the period selector moves.
- **AC-5** The period selector offers **Today** (one day, divided into four-hour
  blocks so the shape of the day is readable), **This week** (last seven days, by
  day), **This month** (calendar month to date, by week), **This year** (calendar
  year to date, by month), **All time** (first session to today, with a grain
  chosen from the span: day/week/month/year) and **Custom** (two inclusive date
  bounds, normalised, not in the future, with the same grain rule as All time; a
  single chosen day is read by time of day).
- **AC-6** Every group's chart and breakdown table cover the whole selected
  window, including empty buckets, and their seconds add up to the group's period
  total.
- **AC-7** A configured recurrence on any task sharing the title wins over the
  session gaps. Otherwise three or more worked days are classified by the median
  gap (daily ≤ 2.5 days, weekly ≤ 10, monthly ≤ 40, otherwise occasional); two
  days are multi-day for one row and routine for more than one; one day is one-off.
- **AC-8** **What this says** produces at most three plain sentences: the period's
  biggest work, the repeating/one-off split, consistency when it is notable, and
  average block length when there is room. It is honest when the period is empty.
- **AC-9** The page is reachable at `/time`, in the sidebar after Analytics as
  **Time by Task**, and as `Ctrl+7`; `Ctrl+1`–`Ctrl+0` continue to map to the
  first ten pages and About keeps its version-badge route.
- **AC-10** Empty states distinguish no history from no history in this window,
  and a search with no matches; each offers the action that resolves it.
- **AC-11** A bar carries one solid colour, chosen by the work's cadence: violet
  for repeating work, amber for one-off, blue for multi-day and slate for untasked.
  The current bucket is marked with a ring, never a second fill colour, and a
  legend above the list names every colour and the ring.
- **AC-12** The task list is virtualised: only the rows inside its scroll viewport
  (plus a small overscan) are in the DOM, every row is a fixed height, and the
  breakdown/sessions for a row live in a detail sheet rather than in the row. The
  list therefore does not grow with the number of tasks, however far the user
  scrolls.

## Out of scope

- **Editing a task from the Time by Task page.** The page is a reading; the pencil on the
  Tasks page remains the one editor.
- **Manual time logging.** Time still comes only from focus sessions, which is
  what "spending time" means to the timer.
- **Splitting a session across tasks.** A session belongs to the task linked when
  it ran; the page does not guess.
- **Merging same-titled tasks that are genuinely different work.** Grouping is by
  title, because a repeating task arrives as new rows; the page states this in its
  method note rather than pretending otherwise.
- **Changing the existing session schema's task link.** `task_id` still points at
  the current task row and is still cleared on delete; the title snapshot is
  added beside it.

## Where it lives

| Piece | File |
| ----- | ---- |
| Grouping, periods, buckets, cadence, totals and readings | `src/app/core/utils/time-report.util.ts` |
| The page's types | `src/app/core/models/time-report.model.ts` |
| The page itself, its fixed rows and detail sheet | `src/app/pages/time/time.component.ts` |
| Virtual window maths and scroll directive | `src/app/core/utils/virtual-list.util.ts`, `src/app/shared/directives/virtual-window.directive.ts` |
| Route, sidebar and shortcut | `src/app/app.routes.ts`, `sidebar.component.ts`, `app.ts` |
| Session title snapshot | `src-tauri/migrations/013_add_session_task_title.sql`, `db.service.ts`, `timer.service.ts`, `session.model.ts` |
| The rules, held down | `tests/unit/time-report.util.spec.ts`, `tests/unit/timer.service.spec.ts`, `tests/unit/db.service.spec.ts`, `tests/e2e/time.spec.ts` |

## Verification

```bash
npm run lint        # ESLint, 0 errors
npm test            # Vitest, including the time-report suite
npm run build       # Angular production build
npx playwright test tests/e2e/time.spec.ts
```
