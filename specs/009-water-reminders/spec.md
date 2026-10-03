# Feature Specification: Water reminder, and today's intake

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-26

## Summary

Sitting at a desk, it is easy to finish a day having drunk almost nothing. This
feature adds a **water reminder** — a system notification at a cadence the user
chooses, inside the working hours they choose — and a **water card on the
Dashboard** that counts the day as it goes, so the reminder and the tally are two
views of the same fact.

Everything the user is asked is a **fixed choice**, never a number to type: the
useful range for a cadence, a glass and a daily target is narrow, and a typo in a
typed field is a reminder nobody wants.

## User Scenarios & Testing

1. **Ask for reminders.** The user opens **Settings → Water Reminder**, turns the
   switch on, sets their working hours, and picks a cadence, a glass size and a
   daily target from the lists offered. **Test** sends one immediately so they
   know what they have asked for.
2. **Be reminded at work, and only at work.** A system notification arrives every
   interval inside the working hours, and nothing arrives outside them. It is a
   notification at OS level, not the in-app Pomodoro toast, and it carries no
   sound of the app's own.
3. **Log a glass.** The Dashboard card shows today's total against the target,
   the number of drinks and when the last one was. **+ 500 ml** logs a glass at
   the configured size; **Undo** removes the last one.
4. **Close the laptop.** On reopening, the reminder does not replay the day: the
   next nudge is due at the cadence the user already has, not immediately.

### Acceptance criteria

- **AC-1** The water reminder is **off by default**, and every preference —
  enabled, start, end, interval, amount, goal — is stored with the app's other
  settings (`settings` columns added by `006_add_water_intake.sql`).
- **AC-2** Every choice is a fixed list in
  `src/app/core/constants/water.constants.ts`: 30/45/60/90/120 minutes, 250/500/
  750/1000 ml, 1.5/2/2.5/3 L. Nothing about the reminder is a free-text field.
- **AC-3** A stored value outside those lists, or a time that cannot be read, is
  replaced by the default when settings are loaded — in the desktop database and
  in the browser's `localStorage` alike — so the reminder can never run on a
  cadence the UI does not offer.
- **AC-4** Reminders only fire inside the working hours, both ends included, and
  a window whose end is at or before its start wraps midnight (a night shift). A
  window with no length at all is closed.
- **AC-5** The first reminder is due one full interval after the switch is turned
  on, not immediately, and the moment of the last one is remembered across
  restarts so the cadence continues rather than restarting.
- **AC-6** The cadence counts only time **DeepWork was running**: closing the app
  (or shutting the machine down) pauses it, so the next launch folds the absence
  into the last reminder's instant and waits a full interval instead of firing
  the moment the window appears. Nobody gets a queue of the reminders they slept
  through, and nobody gets one on the doorstep either. A machine that slept with
  the app still open is the one case this does not cover — the process was there,
  so it still gets the single reminder it always got when it wakes.
- **AC-7** The reminder is delivered as a **system notification** through
  `NotificationService.announce` — OS level, no in-app toast and no app sound —
  naming the configured glass and the day so far.
- **AC-8** The reminder loop is a **single self-re-arming timeout**: `start()` is
  idempotent, an extra `tick()` (the Dashboard asking for a fresh evaluation)
  cannot create a second loop, and `stop()`/`ngOnDestroy` clear it. Between ticks
  it holds one timestamp and two overwritten signals — no list, no listener, no
  subscription and no DOM.
- **AC-9** Each drink is its own row in `water_intake` (amount + ISO instant), so
  the day's total is a sum and a mistaken entry can be removed. The browser
  build's `localStorage` log is pruned to the current local day on every read, so
  it cannot grow without bound.
- **AC-10** "Today" runs from local midnight, not UTC midnight, so the tally
  turns over when the user's day does.
- **AC-11** The Dashboard card shows today's total against the target, the
  percentage, the number of drinks, when the last drink was, what the reminder is
  doing next, a button that logs one glass at the configured size and an undo for
  the last entry. It reads the same `WaterService` the reminder quotes.
- **AC-12** Settings offers **Test**, which sends the reminder immediately and
  restarts the cadence from that moment, exactly as a real reminder would.

### Out of scope

- Medical advice: the options are common hydration habits, and the app says
  nothing about how much any particular person should drink.
- Notifications while DeepWork is not running. The reminder is a loop inside the
  app; nothing is scheduled with the operating system.
- History beyond today: the card, the reminder and the accent are all about the
  current day.
- Charts, streaks or analytics for water. This is a nudge and a tally.

## Where it lives

| Piece                                            | File                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| The fixed choices and defaults                   | `src/app/core/constants/water.constants.ts`                                            |
| The day's arithmetic (windows, targets, formats) | `src/app/core/utils/water.util.ts`                                                     |
| Today's tally: read, log, undo                   | `src/app/core/services/water.service.ts`                                               |
| The reminder loop and the notification           | `src/app/core/services/water-reminder.service.ts`                                      |
| The Dashboard card                               | `src/app/shared/components/water-card/`                                                |
| The settings group that asks the questions       | `src/app/pages/settings/settings.component.ts`                                         |
| Storage (table, columns, repair)                 | `src-tauri/migrations/006_add_water_intake.sql`, `src/app/core/services/db.service.ts` |

## Verification

```bash
npm run lint                                          # ESLint, 0 errors
npm test                                              # Vitest, incl. the four new water specs
npm run test:coverage && npm run coverage:summary     # the coverage gate + the 90% goal
npm run build                                         # Angular production build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```
