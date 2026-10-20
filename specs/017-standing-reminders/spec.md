# Feature Specification: Standing Reminders — the ones that do not give up

**Feature branch**: `3.0.0`
**Status**: Implemented
**Created**: 2026-10-19

## Summary

DeepWork already had reminders that ask: the water nudge asks a question you
answer, and a finished session rings until you deal with it. Both are built for
a person at their desk. Neither is built for the moment this feature exists for
— the presentation, the class, the dose, the train — when the user is standing
in front of a room, cannot touch the machine, and is exactly the person a
reminder must not give up on.

A **standing reminder** is a sentence with a moment attached that keeps asking
until it is answered. It is stored rather than scheduled, so closing the laptop
does not cancel it; it escalates rather than repeating on a stopwatch, so it
stays noticeable without becoming noise; it arrives as a sticky desktop
notification carrying the same answers as the in-app card; and it never steals
focus, because interrupting a presentation to remind someone about it would be
the opposite of help.

The page is also a promise the user can read before trusting it: *Done* keeps
the promise, *Stop* ends it honestly, and nothing in between decides on the
user's behalf that they probably saw it.

## The questions the feature answers

| Question | Where it is answered |
| -------- | -------------------- |
| Will I be reminded even if I cannot answer right now? | The reminder keeps asking, on a lengthening ladder, until one of its three answers is pressed. |
| What happens if the app is closed when it is due? | The stored moment is compared with the wall clock on startup; the reminder is raised, with the time it was due. |
| Can I write one down for something that is not a task? | The page is separate from Tasks: a title, a line of context, a moment and a rhythm. |
| How do I stop it? | *Done* (kept), *Snooze 10 min* (later), *Stop reminding* (ended). |
| Will it interrupt a presentation? | No. It posts a sticky notification and an in-app card; it never brings the window forward. |
| How insistently will it ask? | The rhythm chosen at creation: gentle, steady or insistent, each with its own ladder. |
| What if I am paused? | The pause holds the asking, not the reminder. It stands again the moment the pause ends. |

## User scenarios & testing

1. **The presentation.** The user writes *Presentation — Room 4, slides on the
   desktop* for 15:00 and chooses **Insistent**. At 15:00 the card and the
   sticky notification appear. They are on stage and cannot answer. It asks
   again three minutes later, then five, ten, fifteen, twenty — each time with
   the same three answers and a louder count. They answer **Done** from the
   desktop notification afterwards, and the card and toast both go.
2. **The closed laptop.** A reminder was set for 09:00. The machine was asleep
   until 10:15. On launch the reminder is standing, and the notification says
   *"It was due at 09:00. We kept it for you."* — the feature does not pretend
   it arrived on time.
3. **The crossed notification.** The user swipes the toast away mid-sentence.
   That is not an answer: three minutes later the question is posted again,
   without advancing the ladder, and keeps coming back until a real answer.
4. **The queue.** Two reminders come due in the same minute. One asks; the other
   waits its turn and is raised the moment the first is answered. The card says
   how many are behind it.
5. **The deliberate pause.** The user pauses the app from the tray before a
   meeting. The reminder does not speak, and it does not disappear either: it is
   still standing when the pause ends, and speaks then.
6. **The change of mind.** A reminder is no longer relevant. **Stop reminding**
   ends it as *stopped*, kept in the history and kept apart from *done*, because
   an honest stop is not an achievement.
7. **The real moment.** The user picks **Snooze 10 min** because now is not the
   time. It returns ten minutes later as a fresh ask, with its ring count reset.
8. **The corrupt store.** A hand-edited or half-written storage value is read on
   startup. Unreadable rows are dropped, the rest of the list loads, and the
   page still works.

## Acceptance criteria

- **AC-1** A standing reminder is stored (not scheduled in a timer) with `id`,
  `title`, `note`, `dueAt`, `rhythm`, `status`, `createdAt`, `fireCount`,
  `lastRangAt`, `snoozes` and `finishedAt`. The list survives a restart, and a
  row this build cannot read is dropped rather than allowed to break startup.
- **AC-2** It has exactly two endings: **done** and **stopped**. Neither can be
  reached by a timeout, a click-away, an unattended notification or the app
  closing; only the user's own answer ends it.
- **AC-3** The first ask is at `dueAt`. Repeats follow the rhythm's ladder —
  insistent 3, 5, 10, 15, 20, 30 minutes; steady 10, 20, 30, 45, 60; gentle 30,
  45, 60, 90, 120 — and the last rung repeats for as long as it stands. A repeat
  is measured from the last actual ring, not from the original appointment.
- **AC-4** A moment that passed while the app was not running is raised on the
  first tick after startup, and its copy says when it was due. No queue of
  missed repeats is delivered.
- **AC-5** A pause holds the asking and does not erase the reminder: while paused
  nothing is raised, and the first tick after the pause ends raises what is
  overdue. A snooze moves it ten minutes on, clears its ring count and counts the
  snooze for the record.
- **AC-6** The same three answers — **Done**, **Snooze 10 min**, **Stop
  reminding** — are offered on the desktop notification and on the card, and
  either surface answers both. A crossed notification is re-posted after three
  minutes without being counted as a ring.
- **AC-7** Only one reminder asks at a time. The queue is ordered by due moment;
  answering the first raises the next due reminder immediately. The card states
  how many are waiting behind it.
- **AC-8** The card is a persistent `alertdialog` with no close cross: the only
  ways past it are the three answers. It is reachable, labelled and usable from
  the keyboard.
- **AC-9** A reminder never brings the window forward and never steals focus. The
  sticky OS notification is the surface that reaches a user who is elsewhere.
- **AC-10** The page lives at `/reminders`, in the sidebar as **Reminders** after
  Time by Task. It has no number shortcut: `Ctrl+1`–`Ctrl+0` keep the
  destinations they have always had.
- **AC-11** The page distinguishes what is standing, what is coming, and what has
  ended; it reads the list in plain language; and it explains the three rules
  that make the feature trustworthy (escalation, persistence, no focus theft)
  before asking the user to rely on them.
- **AC-12** Empty states are honest: no reminders at all invites the first one;
  a list with nothing standing says so and points at what is next.
- **AC-13** The reading and the copy never claim more than the code does. A
  reminder that was missed says it was missed; a stopped reminder is not counted
  as kept.

## Out of scope

- **Recurring appointments.** A standing reminder is one moment that will not
  stop asking, not a calendar series. A weekly class is written again, or a
  routine is kept as a task.
- **Editing a reminder after it is created.** *Stop* and write a new one; the
  record is short enough that editing would be more machinery than the feature
  needs.
- **Syncing between machines.** Like everything else in DeepWork, the list is
  local. There is no account and no server.
- **Calendar notifications.** The five-minute calendar reminder is a different
  feature with a different promise; this page does not change it.
- **Bypassing a pause or the OS's quiet hours.** The pause is the user's own
  "not now", and this feature does not override it.
- **Posting while DeepWork is not running at all.** The reminder is stored, and
  the first launch after the missed moment raises it — but there is no daemon or
  OS scheduler to speak for an app that is not running.
- **Including reminders in the JSON backup.** The list is local to the install
  and is not added to `exportAll` in this change; it survives restarts, not a
  move to another machine.
- **A mini-widget card.** The widget is 136×76; the sticky notification carries
  the question there instead, and the widget is deliberately left where it is.

## Where it lives

| Piece | File |
| ----- | ---- |
| The record and the two endings | `src/app/core/models/reminder.model.ts` |
| The ladders, labels and quotes | `src/app/core/constants/reminder.constants.ts` |
| Ring maths, labels, readings and the stored-record reader | `src/app/core/utils/reminder.util.ts` |
| The loop, storage, escalation, queue and notifications | `src/app/core/services/reminder.service.ts` |
| The card that does not go away | `src/app/shared/components/reminder-card/reminder-card.component.ts` |
| The page, its form and its three lists | `src/app/pages/reminders/reminders.component.ts` |
| Route, sidebar and startup | `src/app/app.routes.ts`, `sidebar.component.ts`, `app.html`, `app.config.ts` |
| The rules, held down | `tests/unit/reminder.util.spec.ts`, `tests/unit/reminder.service.spec.ts` |

## Verification

```bash
npm run lint        # ESLint, 0 errors
npm test            # Vitest, including the reminder suites
npm run build       # Angular production build
```
