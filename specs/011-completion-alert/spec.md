# Feature Specification: The completion alert, and answering it from the widget

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-28

## Summary

A finished session has always been announced insistently, and that stays: the
alert rings on the user's chosen tone and re-raises the card until something
answers it, because a Pomodoro that ends while the user is reading somewhere else
should not be missed.

What did not hold up is **where it can be answered**. The only control that ever
answered the alert was the close button on the toast — and the toast is not on
screen while the window _is_ the mini widget. So the case that actually happens
went wrong: the session ends while DeepWork is shrunk, the tone rings every
interval, and the user has to bring the whole window back and close the card by
hand before it stops. Shrinking the window is how the user ended up in the widget
in the first place; it cannot be the thing that makes the alert unstoppable.

Two things change. The alert becomes answerable **in the widget** — start/pause,
skip, stop and a silence button all count as answers — and the alert's OS half
reaches the desktop on **every repeat**, the same as the tone does, because a
notification the user has stopped looking at is the exact state a repeating
reminder exists to interrupt.

Two more came after, both about being *lived with* rather than answered: the
alert's colour was the wrong one to sit in front of for a quarter of an hour (the
amber became a cool blue — see AC-11), and then the wrong *shape* of answer to "say
*again*": a colour already on screen cannot re-announce anything, and neither can a
motion happening inside a panel that is otherwise still. So the alert now walks a
palette, one entry per repeat, and it is the whole widget that moves on the beat of
every tone (AC-12, AC-13).

One surface was still asking the question with no way to answer it: the **system
notification**. It now carries the same four answers the card does — **Pause**,
**Skip current**, **Start** and **Silent** — so the clock can be driven from the
desktop, and the card draws them as well, which is what keeps the alert answerable
on the platforms whose toast cannot report a press (AC-14). The labels say what a
press does: **Skip current** moves past the session at the head of the queue and
leaves the next one waiting, while **Start** begins that waiting session (or
continues a paused one from its remaining time), so carrying on is one press and
skipping is a different one.

## Relationship to `001-create-deepwork` and `003-mini-widget-window`

| Criterion         | Now                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 SC-3 / FR-003 | The alert still repeats until the user acts, and everything it repeats with now happens on every interval: the **tone**, the **system notification** (re-posted under its own tag, so it re-raises itself rather than stacking), the **card**, the widget's **shake** and the **palette colour** both surfaces take for that repeat. |
| 003 AC-2          | The widget's own controls are start/pause, skip, stop and expand — plus the silence button the alert puts inside the ring.                                                                                                              |
| 003 AC-6          | Unchanged: leaving the widget restores the window, and the alert keeps ringing through it (see AC-4 below).                                                                                                                              |

## User Scenarios & Testing

1. **Finish a session in the widget.** DeepWork is shrunk to the widget and
   working elsewhere. The focus session ends: the tone rings, the desktop shows
   the completion as a notification, the whole widget shakes on it, its halo
   starts breathing, the countdown is replaced by a bell-off button, and the next
   session is already set up behind it.
2. **Ignore it for a minute.** The tone rings again; the widget shakes again and
   takes the next colour of the alert palette, so a glance from across the desk
   says "still waiting" without the user reading anything. The desktop
   notification is a **waiting toast**: it is still on screen, so it is not
   replaced while it waits. If the user crosses it instead — because they are in
   a demo or a call — the question comes back three minutes later, and keeps
   coming back every three minutes until it is answered.
3. **Answer it.** The user presses play. The tone stops, both surfaces go back to
   their own colours, and the next session runs — one press, no window to bring
   back.
4. **Go quiet without deciding.** The user presses the bell inside the ring. The
   tone stops and the timer is left exactly as it was: the next session still
   waiting, nothing started, nothing skipped.
5. **Enough for today.** The user presses stop. The session is recorded as
   interrupted, the timer resets to the current type, and the alert stops.
6. **Come back to the app.** The user presses the expand arrow. The full window
   returns **with the card still on it**, in the alert's current colour, because
   that is what they came to read.
7. **Answer it from the desktop.** The user is in another window when the toast
   appears. They press **Start**: the waiting session begins, the tone stops and
   the toast is taken back — no window to bring forward. **Skip current** moves
   past the session at the head of the queue and leaves the next one waiting
   instead, and **Pause** pauses whatever is running when it is pressed.
8. **Go quiet from the desktop without deciding.** The user presses **Silent**.
   The alert closes and the clock is left exactly as it was: nothing started,
   nothing skipped, nothing paused.

## Acceptance criteria

- **AC-1** `NotificationService.fireTimerComplete()` posts the system
  notification, rings the tone, raises the in-app card, and starts the repeat
  loop. `TimerService` calls it the moment a session runs out — every session
  type, on every page — so the alert never depends on the Dashboard being the page
  on screen (it did, and a break finishing anywhere else was silent).
- **AC-2** Each repeat rings the tone and re-raises the card, all off one pulse.
  On Windows the system notification is a **waiting toast** (`sticky`): it stays
  on screen until one of the four answers is pressed or the user crosses it, and
  it is not replaced on every tone, because replacing a question every minute
  turns it into a banner. A toast the user crosses is posted again after
  `UNANSWERED_NOTIFICATION_REMINDER_MS` (three minutes), under the alert's own
  handle, and again after every further crossing (AC-15). Where the platform
  cannot keep a toast, each repeat re-posts it — under the tagged Windows toast's
  handle, the plugin's `id`, or the browser's `tag` — so the desktop re-raises one
  notification instead of stacking a copy per interval, and the body carries the
  count (`Reminder 2 · …`) so the replacement is something new to read. On the
  desktop this needs the shell's own `alert_notify` command: the notification
  plugin's desktop path posts through `notify-rust`, which has no tag to post
  under.
- **AC-3** `NotificationService.ringing` is true from the moment the alert is
  raised until it is answered, and false after `dismiss()` — however `dismiss()`
  was reached.
- **AC-4** The repeat loop ends the moment the alert is answered, and nothing
  rings afterwards.
- **AC-5** `MiniWidgetComponent` reads `ringing` and, while it is true, pulses
  the ring's halo and shows a silence button **inside the ring** in place of the
  countdown. The ring's own colour still identifies the session type.
- **AC-6** Start/pause, skip, stop and silence in the widget each call
  `NotificationService.dismiss()`. The expand arrow deliberately does not: the
  card is waiting in the full window.
- **AC-7** The silence button leaves the timer untouched — no start, no pause, no
  skip, no stop.
- **AC-8** The widget is 136×76: padding (8), the 60px ring, the gap (8) and the
  2×2 grid of 24px controls with a 4px gutter (52). `UiService`'s `WIDGET_SIZE`
  and the browser build's floating panel agree, and
  `tests/unit/visual-crispness.spec.ts` holds them together.
- **AC-9** Every surface added here obeys the crispness rules already in force:
  whole-pixel type of at least 10px, no blur filters, and the alert's pulse is an
  opacity animation on a stroke rather than a glow.
- **AC-11** While the alert is unanswered the **whole widget takes one colour** —
  the surface, the ring, the bell and the buttons — and it settles back to the
  session's own colours the moment the alert is answered. The colour is **one entry
  of a twelve-entry palette** (`ALERT_COLOURS`, in
  `src/app/core/constants/alert.constants.ts`), 10–12 being the width the user
  asked for: enough that two consecutive repeats are never neighbouring shades,
  short enough that a cycle still reads as a sequence. Each entry is a pastel
  accent over a very dark surface of its own hue — nothing saturated, no neutral
  blacks — and the two are painted as `--alert-…` custom properties, with every
  hairline, button fill and focus ring derived from the accent rather than
  hand-copied. The entries are legible on their own surfaces (contrast ≥ 4.5:1) and
  the first is the blue the alert has always worn (`#7dd3fc` over `#0d1b2a`), so
  nothing changes until the second tone. The change is a transition, not a cut:
  450ms on the surface and the buttons, the stroke's own 0.4s crossfade on the
  ring.
- **AC-12** The alert **moves again on every tone it repeats**, so an unanswered
  alert re-announces itself instead of sitting still: `NotificationService` bumps a
  pulse on each raise (the completion and every repeat tick), and the **whole
  widget** — surface, ring, bell and all four buttons — shakes on it: a translate
  of up to 5px plus a rotation under 1.5°, over 0.7s, never a `scale`, because the
  ring is drawn at its own size so that nothing resamples it. Moving the widget
  rather than the ring inside it is the point: the alert has to be caught by
  someone looking at another window, and from there a 60px circle leaning 3px
  inside a still panel is invisible. The two shake animations are identical and
  alternate by name, because a CSS animation only restarts when its name changes.
  Under `prefers-reduced-motion: reduce` the shake is switched off and the colour
  change — the part that carries the meaning — is kept.
- **AC-13** The **full window's card is the alert too**, not merely a message about
  it: while `ringing` is true it wears the same palette entry (off the same pulse,
  so the two surfaces can never disagree about which repeat they are on) and shakes
  on the same beat, and `showToast` takes it down and raises it again on every
  repeat, which is what replays its entry animation. So the same three things —
  tone, notification, colour and motion — happen whether the user is looking at the
  app or at the widget.
- **AC-14** The alert offers four answers — **Pause**, **Skip current**,
  **Start**, **Silent**, in that order — on its Windows toast and on its card,
  from **one** list (`NotificationService.ALERT_ACTIONS`): the toast gets ids and
  labels, the card gets the same ids behind closures, so a button can never mean
  one thing on the desktop and another in the app. A press reports the button's
  **id**, never its label, so wording is free to change. **Pause** pauses the
  session that is running when it is pressed, **Skip current** moves past the
  session at the head of the queue and leaves the next one waiting
  (`TimerService.skip`), **Start** begins that waiting session or continues a
  paused one from its remaining time (`TimerService.start`), and **Silent**
  closes the alert and leaves the clock untouched.
  Every answer stops the ring, and every answer takes the alert's notification
  back (`toast_dismiss`) — a question that has been answered must not stay on
  screen asking. Every post — the raise, a re-ask after a crossing, and a repeat
  on a platform that cannot keep the toast — carries the buttons: Windows replaces
  the toast it is holding, so a post without them would silently strip the answers
  mid-question.
- **AC-15** The alert's toast is posted **sticky**, and the Windows shell reports
  a dismissal through `deepwork:toast-dismissed` when it is swiped away
  (`UserCanceled`), expires (`TimedOut`), or has its body clicked without a button
  (an empty activation). The app treating its own toast as hidden
  (`ApplicationHidden`, after an answer) is filtered out in the shell. A dismissal
  is **not** an answer: `NotificationService` re-posts the toast after
  `UNANSWERED_NOTIFICATION_REMINDER_MS` (three minutes), and again three minutes
  after every further dismissal, until one of the four buttons is pressed.
  `dismiss()` clears the pending reminder. `alertIsSticky` is true only when the
  tagged Windows toast accepted the post; where it did not, the repeat loop keeps
  re-posting the notification as before.

## Out of scope

- Action buttons on macOS and Linux. Neither platform's notification surface
  reports a press back to a desktop app without its own delegate or notification
  server, so the four answers live on the card there.
- Withdrawing the alert's notification on macOS and Linux: the OS owns it from the
  moment it is posted, and every other app leaves it to the notification centre. On
  Windows the app keeps the toast handle, so an answered alert is taken back there
  (`toast_dismiss`).
- Changing the cadence. The interval the user configured is still the interval
  the tone repeats at.
- Replacing the notification on platforms with no handle for it. macOS and Linux
  show each repeat as its own post; the count in the body is what the app can do
  about that from its side.

## Where it lives

| Piece                                            | File                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| The alert: ring, repeat, `ringing`, `dismiss()`  | `src/app/core/services/notification.service.ts`                                                                         |
| The four answers, and the clock behind them      | `NotificationService.ALERT_ACTIONS` / `onAlertAction`, and `TimerService`'s constructor                                 |
| The palette, and which entry a pulse is on       | `src/app/core/constants/alert.constants.ts`                                                                             |
| The tagged Windows toast, and the plugin fallback | `src-tauri/src/lib.rs` (`alert_notify`), `src-tauri/Cargo.toml`                                                         |
| Waiting, crossing and the three-minute re-ask     | `NotificationService.alertIsSticky` / `scheduleAlertReminder`, `UNANSWERED_NOTIFICATION_REMINDER_MS`, and `deepwork:toast-dismissed` in `lib.rs` |
| The trigger: a session finishing, on any page    | `src/app/core/services/timer.service.ts`                                                                                |
| The answer: start/pause, skip, stop, silence     | `src/app/shared/components/mini-widget/mini-widget.component.ts`                                                        |
| The card, which is the alert in the full window  | `src/app/shared/components/toast/toast.component.ts`                                                                    |
| The widget's shape, and the window it resizes to | `src/app/core/services/ui.service.ts`                                                                                   |
| The window permission the fit needs to maximise  | `src-tauri/capabilities/default.json`                                                                                   |
| The rules, held down                             | `tests/unit/alert.constants.spec.ts`, `tests/unit/notification.service.spec.ts`, `tests/unit/mini-widget.component.spec.ts`, `tests/unit/toast.component.spec.ts`, `tests/e2e/mini-widget.spec.ts` |

## Verification

```bash
npm run lint        # ESLint, 0 errors
npm test            # Vitest, incl. the alert and widget specs
npm run build       # Angular production build
cargo check         # in src-tauri: the tagged-toast command compiles
npx playwright test tests/e2e/mini-widget.spec.ts   # the real panel, in a browser
```
