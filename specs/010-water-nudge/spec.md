# Feature Specification: The water nudge, and the choices around it

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-27

## Summary

The water reminder shipped in `009-water-reminders` announced itself and left.
On a busy desktop that is the wrong shape for a habit: the notification goes to
the corner of the screen and is gone, and the person it is for is looking
somewhere else. This feature turns the reminder into a **question**.

The nudge is a card — the glass, the day so far, and one short motivational line
— with **Yes, I drank …** and **Not now** on it. Nothing else closes it: no
timeout, no click anywhere else, no fade. It rings with the alert tone the user
chose, and it never borrows the Pomodoro's toast.

The list of choices grew at both ends at the same time. A half-hour cadence and
a 250 ml glass are reasonable defaults and poor limits: someone sipping from a
small glass wants a shorter interval and a smaller drink, and both were
unavailable rather than merely unusual.

## Relationship to `009-water-reminders`

Everything in `009` still holds — the fixed lists, the working hours, the
one-interval delay, the remembered last reminder, the clock that only counts while
the app is running, the tally
on the Dashboard — with these amendments:

| 009 criterion | Now                                                                     |
| ------------- | ----------------------------------------------------------------------- |
| AC-2          | The lists are 15/20/25/30/45/60/90/120/180 minutes and 30/50/70/90/100/150/200/250/300/400/500/750/1000 ml. Goals are unchanged. |
| AC-7          | The reminder is a card, plus the system notification and the alert tone.  |
| AC-12         | **Test** raises the same card rather than only sending the notification. |
| AC-4 / AC-7   | A reminder that arrives while the window is minimised counts the glass instead of asking (see AC-10); the cadence still restarts from the moment it counted. |

## User Scenarios & Testing

1. **Be asked, not told.** The reminder fires and a card appears with the glass,
   the day so far and a quote. The user presses **Yes, I drank 250 ml** and the
   glass is in the day's tally; the next reminder is a full interval later.
2. **Say not now.** The user presses **Not now**. Nothing is logged, the card
   closes, and the cadence starts again from that moment.
3. **Walk away.** The card is left alone for an hour. It is still on screen when
   the user comes back, and no second card has appeared underneath it.
4. **Be in the middle of something.** DeepWork is behind a maximized browser, or
   shrunk into the mini widget. The card still arrives where it can be seen: the
   full window is restored and raised, without taking typing focus.
5. **Be minimised and left alone.** The user has shrunk DeepWork into the mini
   widget and is working in another window. The reminder rings, counts the glass
   and says so in the notification; the widget does not move.

## Acceptance criteria

- **AC-1** A due reminder raises a `WaterNudge` — glass, amount, day so far and
  one quote from `WATER_QUOTES` — held in **one signal**. Nothing about it is a
  list, a queue or a subscription.
- **AC-2** The card is closed by exactly two things: `answerNudge('yes')`, which
  logs one drink **at the size stored in the settings**, and `answerNudge('no')`,
  which logs nothing. There is no timeout that closes it.
- **AC-3** While a nudge is on screen the loop arms no next reminder, and a
  second reminder is never raised on top of an unanswered one, however far past
  the interval the clock has moved.
- **AC-4** The cadence restarts from the **answer**, not from the question: the
  next reminder is one full interval after `answerNudge` was called.
- **AC-5** The reminder rings with the tone the user chose
  (`NotificationService.chime`, which obeys both the **Notification sound**
  setting and the tray mute switch), never uses the Pomodoro's toast or
  `fireTimerComplete`, and continues to call `NotificationService.announce`.
- **AC-6** Successive nudges walk `WATER_QUOTES` in order and wrap, so the same
  line does not come back every hour; `quoteFor` is pure and total (an
  unreadable index falls back to the first line).
- **AC-7** Turning the reminder off takes back a card that is still on screen.
- **AC-8** While the card is up, the window is restored from the mini widget and
  raised (`UiService.surfaceForNudge`), without taking focus; when it is
  answered the user's own always-on-top preference is reapplied.
- **AC-9** `WATER_INTERVAL_OPTIONS` offers cadences **below** 30 minutes (15, 20,
  25) and above 120 (180); `WATER_AMOUNT_OPTIONS` offers a 30 ml mouthful, a run
  of small steps a glass actually holds (50, 70, 90), and a 1000 ml bottle — a
  small drink counted as 100 ml is a day that reads several times fuller than it
  was, so the small end is offered rather than rounded. Both lists stay ascending,
  deduplicated, and still contain the default. Repair of out-of-list stored values
  is unchanged and now covers the wider lists.
- **AC-10** While the window is the mini widget **and**
  `waterAutoLogWhenMinimized` is on, a due reminder rings, logs one drink at the
  configured size, continues the cadence from that moment, and raises **no card**
  — the window is never pulled back. With the setting off, or with the full
  window up (however far behind another app it is), the card is raised as usual.
  A **Test** never logs a drink.

## Out of scope

- OS notification buttons. The card is the surface that asks; the notification
  stays a notification.
- A sound of its own. The reminder rings with the app's existing alert tone, and
  there is no separate water chime to configure: `none` in **Notification
  sound**, or the tray's mute switch, is how a silent reminder is asked for.
- Snoozing. **Not now** means not now; the next reminder is a full interval away.

## Where it lives

| Piece                                     | File                                                              |
| ----------------------------------------- | ----------------------------------------------------------------- |
| The choices, and the quotes               | `src/app/core/constants/water.constants.ts`                       |
| The line the card shows                   | `src/app/core/utils/water.util.ts` (`quoteFor`)                   |
| Raising and answering the question        | `src/app/core/services/water-reminder.service.ts`                 |
| Bringing the window forward               | `src/app/core/services/ui.service.ts` (`surfaceForNudge`)         |
| The card itself                           | `src/app/shared/components/water-nudge/`                          |
| The settings that ask the questions       | `src/app/pages/settings/settings.component.ts`                    |
| The minimised-window setting              | `src-tauri/migrations/007_add_water_autolog.sql`                  |

## Verification

```bash
npm run lint        # ESLint, 0 errors
npm test            # Vitest, incl. the water reminder, util, UI and nudge specs
npm run build       # Angular production build
```
