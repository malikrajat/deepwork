# Feature Specification: A line on the card when a task is finished

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-10-01

## Summary

The two cards the timer raises — a finished focus session, a finished break —
have carried a line of encouragement since 2.0.14, drawn from `FOCUS_QUOTES` and
`BREAK_QUOTES` and set apart from the news rather than glued onto it. The card
raised when a **task** is finished ("Task completed", with the task's title under
it) never got one. It has one now, from a third list written for the job:
`TASK_QUOTES`.

The new list is about the _list_ rather than the session — one item closed, one
item shorter, the small quiet win a board is made of — because that is the thing
the user actually did.

## What this is not

The card is a receipt, not an alert. `NotificationService.fireTimerComplete` is
an _insistent_ thing: it plays the user's tone, posts a desktop notification, and
re-raises all of it on an interval until the user answers. Finishing a task
happens dozens of times a day, and that machinery is the fastest way to have the
sound switched off. So `announceTaskCompleted` calls `showToast` and nothing else
— no tone, no repeat loop, no OS notification, nothing added to `ringing` or
`alertPulse` — and the test asserts the absence by not stubbing a sound, so
wiring one in later fails loudly.

## Acceptance criteria

- **AC-1** `TASK_QUOTES` lives beside the other two lists in
  `alert.constants.ts`: at least twenty lines, trimmed, longer than ten
  characters, and no line shared with `FOCUS_QUOTES` or `BREAK_QUOTES`.
- **AC-2** `NotificationService.announceTaskCompleted(title)` raises the card
  with the title _Task completed_, the task's own title as the body, and one line
  from `TASK_QUOTES` as the quote.
- **AC-3** The list is walked one entry per finished task — not sampled at
  random — so two tasks in a row never read the same sentence.
- **AC-4** The count that walks the list is kept by the service, not by the page
  that raises the card, so a second surface raising the same card later joins the
  same sequence.
- **AC-5** The quote is a field of the toast (`ToastNotification.quote`) and is
  drawn as its own line; it is never appended to the body, which stays the task's
  title alone.
- **AC-6** The matrix's one-click status switch (the only place a completion card
  is raised today) calls `announceTaskCompleted`.

## Out of scope

- **Raising the card where there is none.** Dropping a card into Done on the
  Today or Tasks board still completes a task silently: the column the card lands
  in _is_ the feedback, and a card that appeared over it would be the app
  congratulating the user for dragging. If that changes, it becomes a second
  caller of `announceTaskCompleted` and AC-4 is what keeps the lines in order.
- **Changing the two session lists.** `FOCUS_QUOTES` and `BREAK_QUOTES` are
  untouched, and the session alert keeps its tone, its repeat and its desktop
  notification.

## Where it lives

| Piece                                    | File                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| The lines themselves                     | `src/app/core/constants/alert.constants.ts`                                     |
| The card, and the count that walks it    | `src/app/core/services/notification.service.ts`                                 |
| The one caller                           | `src/app/pages/matrix/matrix.component.ts`                                      |
| The card that draws news and quote apart | `src/app/shared/components/toast/toast.component.ts`                            |
| The rules, held down                     | `tests/unit/alert.constants.spec.ts`, `tests/unit/notification.service.spec.ts` |

## Verification

```bash
npm run lint
npm test            # incl. the quote list and the toast specs
npm run build
npm run version:check
```
