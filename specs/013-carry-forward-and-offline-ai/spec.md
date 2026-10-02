# Feature Specification: Carry unfinished work forward, or close it — and say what the analysis is

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-10-01

## Summary

Two things were asked for together, and they are unrelated except that both are
about what the app tells the user.

The first is a **policy for unfinished work**. DeepWork never closed anything by
itself: a task that was not ticked off stayed open for as long as the user left it
alone, and the backlog only ever grew. What was asked for is a choice — carry
that work forward (as it does now), or let it close itself once its day has
passed. It is now **Carry forward unfinished tasks**, under _Tasks_ in Settings,
**on** by default so nothing changes for anyone who does not go looking.

The second is **copy, not capability**: the user wants the app to say out loud
that its analysis runs as offline AI, on the machine, over the user's own data.
Nothing was implemented to make that true — it was already true of where the
analysis happens — so all that was added is the claim, in the three places it is
read: an _Offline AI_ card on About, an _Analysis_ fact beside the build details,
and an _Offline AI_ pill on the Analytics header.

## What was actually happening, before this change

This was asked as a question ("check whether it is true"), so it is worth writing
the answer down, because it is not what it looked like.

| What the user reported                                   | What the code did                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An unfinished task "comes to the next day automatically" | **No.** Nothing moves a task onto today. Yesterday's task stayed open and the Tasks page filed it under _Yesterday_; the Today board only holds work **dated today**, work **written today**, or work **starred _Add to Today_** (`TaskService.isOnToday`). Pinned by `tests/unit/task.service.spec.ts`. |
| The same task imported the next day "counts duplicate"   | **Yes**, and this is the real one. The importer labels a row whose title already exists `duplicate` and writes it anyway unless _Skip_ is ticked (`task-import.service.ts`, `shouldImport`). Re-importing a sheet that still holds last time's rows therefore adds rows and reports them as duplicates.  |

Two smaller findings fell out of the check and are deliberately **left alone**,
because both are product decisions rather than bugs:

1. `TaskService.datedToday` excludes a past deadline, so an overdue task only
   reaches today through its `createdAt`. The comment above the function and
   `specs/012-task-dates-and-today` **AC-4** both say overdue work _stays_ on
   today; that is true only of a task written today. The rule was not changed,
   because pulling every overdue card onto today would change the Today board,
   the dashboard's counter and the matrix rails for everyone.
2. A re-import of a row that matches an _open_ task writes a second row instead
   of carrying the existing one forward. Also unchanged — the importer's preview,
   its _Skip_ option and its wording are all built around that, and it is a
   separate decision from what this setting does.

## User Scenarios & Testing

1. **Nothing changes for the default user.** Someone who never opens Settings
   keeps the app exactly as it was: unfinished work stays open, and the switch
   reads _on_.
2. **The deadline means something.** The user turns _Carry forward unfinished
   tasks_ off. A Tuesday task they did not finish is marked Done when they next
   open the app on Wednesday, with `completedAt` recording when that happened.
3. **The backlog in front of them, not tomorrow's.** The same user has three
   weeks of unfinished work when they flip the switch, and expects the switch to
   be about _that_. It is: turning it off sweeps immediately rather than at the
   next day's start.
4. **A change of mind.** They turn it back on. Nothing is reopened — a task
   closed by the calendar stays closed, and reopening one is a drag on the Tasks
   page.
5. **They ask what the app is doing with their data.** About → _DeepWork &
   updates_ answers with the _Offline AI_ card, and the Analytics header carries
   the same claim where the analysis is actually read.

## Acceptance criteria

- **AC-1** `AppSettings.carryForwardTasks` exists, defaults to `true`, is stored
  as `carry_forward_tasks` (migration 010), round-trips through `DbService`, and
  is repaired to a boolean on read like the rest of the settings.
- **AC-2** With it **on**, `TaskService.closeExpiredTasks()` writes nothing and
  returns `0` — no task is closed by the calendar.
- **AC-3** With it **off**, every task that is not Done and whose _own day_ is
  before today is set to Done with `completedAt` stamped. A task's own day is its
  deadline when it has one and the day it was written when it has not.
- **AC-4** The closing write is quiet: `updatedAt` is not stamped, so a backlog
  closing at once does not read as a backlog of "just touched" tasks.
- **AC-5** Toggling the switch off in Settings sweeps immediately and persists
  the choice; toggling it back on stops the closing without reopening anything.
- **AC-6** Settings → _Tasks_ carries the switch, bound to the stored value and
  labelled with what each side does.
- **AC-7** Every page that can be opened first thing in the morning runs
  `TaskService.runDailyUpkeep()`: close what the calendar closed, re-ask the day's
  quadrants, generate today's recurring instances — in that order. This includes
  the Tasks and Analytics pages, which previously ran no housekeeping at all.
- **AC-8** The _Offline AI_ claim says where the analysis happens (on this
  machine, over the user's own records, with nothing uploaded, pooled or used to
  train anything) and claims no capability the app does not have.

## Out of scope

- **Implementing a model.** No AI inference, no bundled weights, no provider.
  This is the label on work the app already does, and it is written as a
  statement about _where_ that work happens.
- **Changing which tasks are on today** — see the two findings above. The
  carry-forward switch decides whether unfinished work is _closed_; it does not
  decide whether it is _moved_.
- **Changing the importer's duplicate handling.** It still labels a repeated
  title and still writes it unless _Skip_ is ticked.

## Where it lives

| Piece                                            | File                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| The choice, and what it defaults to              | `src/app/core/models/settings.model.ts`                                                                                                       |
| Storage: column, read, write, repair             | `src-tauri/migrations/010_carry_forward_tasks.sql`, `src/app/core/services/db.service.ts`                                                     |
| Closing expired work, and the day's housekeeping | `src/app/core/services/task.service.ts`                                                                                                       |
| The switch, and the sweep it triggers            | `src/app/pages/settings/settings.component.ts`                                                                                                |
| The copy about the analysis                      | `src/app/core/constants/about.constants.ts`, `src/app/pages/about/about.component.ts`, `src/app/pages/analytics/analytics.component.ts`       |
| The copy outside the window                      | `src-tauri/tauri.conf.json` (the installer and `deepwork.exe`'s file properties), `public/manifest.webmanifest`                               |
| The rules, held down                             | `tests/unit/task.service.spec.ts`, `tests/unit/db.service.spec.ts`, `tests/unit/settings.component.spec.ts`, `tests/unit/form.models.spec.ts` |

## Verification

```bash
npm run lint        # ESLint, 0 errors
npm test            # Vitest
npm run build       # Angular production build
npm run version:check
```

`tests/unit/task.service.spec.ts` carries the behaviour probe from the summary:
the case that pins what "carry forward" does _not_ mean (nothing moves onto
today), next to the case that pins what it does.
