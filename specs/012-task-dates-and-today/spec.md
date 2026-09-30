# Feature Specification: A task's own date decides the day it belongs to

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-28

## Summary

A spreadsheet imported for the rest of the week arrived as a pile of today's work.
The rows carried their dates — tomorrow, next Monday, the end of the month — and
every one of them still landed on today's board, because a task written today
counted as today's task no matter what date it carried. The date the user typed was
the one thing the import threw away.

What decides the day now is the task's own date: its deadline when it has one, the
day it was written when it has not. A row dated for tomorrow is tomorrow's work —
it waits in the Tasks page's *Tomorrow* section, which the importer opens for it,
and today's board stays today's. The importer's **Add to Today** column is the one
answer that overrules the date, so the template stops pre-answering `Yes` on the
user's behalf: a row typed today is already on today's list by its deadline.

## Relationship to `004-downloads-and-task-defaults` and the Tasks page

| Criterion | Now |
| --------- | --- |
| 004 AC-7 / FR-6 | Unchanged: the add-task form still opens with today's deadline, and the import template still pre-fills today's date — which is exactly why a default of `Yes` in **Add to Today** was redundant, and why dropping it costs nothing for a list typed today. |
| The Tasks page's date sections | Unchanged in behaviour, and now the same rule: a task is filed under its deadline, or under the day it was written when it has none (`task-date-groups.view.ts`). The two surfaces agree; before, the Tasks page filed tomorrow's work under *Tomorrow* while the Today board also showed it. |
| `005-task-status-board` | Unchanged: Today is still the same board with a Done column. Which cards are on it is all that moved. |

## User Scenarios & Testing

1. **Import the week.** The user's sheet has rows dated today, tomorrow and next
   Monday. They import it, and the Tasks page opens each section the rows landed in:
   today's row is on today's board, tomorrow's is under *Tomorrow*, and next
   Monday's is in that month's section. Nothing is duplicated onto today, and
   nothing is lost.
2. **Import a row that really is for today as well.** A row for a Friday deadline
   that has to be started now carries **Add to Today** = `Yes`, and it appears on
   today's list *and* keeps its Friday date.
3. **Write a task today, for today.** The template's deadline is pre-filled with
   today and **Add to Today** is `No`, so the row lands on today by its date — the
   same as before, with one less column deciding it.
4. **A task that slipped.** Yesterday's task, still open, is still on today's
   board: it is not finished, and today's board is where that should be visible.
5. **Star it by hand.** A task dated for next week with the star set (**Add to
   Today** from a card) is on today's list, because that is the user asking for it
   in the one place where the app can be told.

## Acceptance criteria

- **AC-1** `TaskService.isOnToday(task, today)` is the single rule, and every
  "today" surface reads it: `todayTasks`, `todayBoardTasks`, `getTasksByQuadrant`
  and `getUnassignedTasks`.
- **AC-2** A task whose deadline is **after** today is not on today, however it was
  created — including a task written today by the importer, the quick-add dialog or
  the add-task form.
- **AC-3** A task whose deadline is **today**, or that has **no deadline and was
  written today**, is on today.
- **AC-4** A task whose deadline is **in the past** and is still open stays on
  today: overdue work is still on the user's plate.
- **AC-5** `todayOrder !== null` (**Add to Today**) puts a task on today whatever
  its deadline says, because it is the user's own instruction.
- **AC-6** The import template's **Add to Today** default is `No`, and its column
  hint, the *Deadline* hint and the *Instructions* sheet each say that the deadline
  decides the day and that `Yes` is what pulls a later-dated row onto today.
- **AC-7** Importer rows keep their parsed deadline and are written with
  `todayOrder: null` unless the row asks for today — so the database records the
  date the user typed, and the Tasks page files the card under that date and opens
  its section after the import.
- **AC-8** Rows without an **Add to Today** column, and rows whose `Add to Today`
  cell is empty, are treated as `No`.

## Out of scope

- Re-dating past-dated rows on import: a deadline in the past is the user's data,
  and it is reported as a warning rather than changed.
- Moving a task automatically as its deadline passes (no "roll over to today"):
  the Tasks page's date sections already keep old work visible, and a board that
  moved cards by itself would be worse than one that shows where they are.
- The `todayOrder` sequence itself: the day's order is still the user's, and the
  quadrant-first then `todayOrder` sort is unchanged.

## Where it lives

| Piece | File |
| ----- | ---- |
| The rule: which tasks are today's | `src/app/core/services/task.service.ts` |
| The template's `Add to Today` default and its wording | `src/app/core/utils/task-import.mapper.ts`, `src/app/core/services/task-import.service.ts` |
| The date section a card lands in, and the one the importer opens | `src/app/pages/tasks/task-date-groups.view.ts`, `src/app/pages/tasks/tasks.component.ts` |
| The rules, held down | `tests/unit/task.service.spec.ts`, `tests/unit/task-import.service.spec.ts`, `tests/unit/task-import.mapper.spec.ts` |

## Verification

```bash
npm run lint        # ESLint, 0 errors
npm test            # Vitest, incl. the task and import specs
npm run build       # Angular production build
npx playwright test tests/e2e/task-import.spec.ts tests/e2e/today.spec.ts
```
