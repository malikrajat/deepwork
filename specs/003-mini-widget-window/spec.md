# Feature Specification: Mini widget from the system minimise button

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-18

## Summary

Make the mini widget the answer to *every* way of shrinking the window — the
window's own minimise button, the taskbar, `Win`+`↓`, and the clock card — and make
the widget itself worth looking at: no title bar, a colourful countdown ring around
the running time, a play/pause button, and a login launch that opens it so DeepWork
is not forgotten at the start of the day.

## User Scenarios & Testing

### Primary stories

1. **Minimise the window.** The user presses the window's minimise button; instead
   of disappearing into the tray, DeepWork shrinks into the widget where it was.
2. **Minimise from any page.** The same happens on Tasks, Calendar, Analytics — the
   widget is app chrome, not a dashboard feature.
3. **See the session draining.** The widget shows the time inside a complete ring
   that empties as the session runs out and is gone when the session ends.
4. **Start or pause without expanding.** A play/pause button in the widget runs the
   timer.
5. **A chrome-free widget.** No title bar, and therefore no minimise, maximise or
   close buttons on the widget.
6. **Do not miss the day's start.** A copy launched by the OS at login opens the
   normal DeepWork window instead of waiting invisibly in the tray.
7. **Get back out.** The expand arrow, or `Esc`, restores the full window at its
   previous size, position and title bar.

### Acceptance criteria

- **AC-1** Pressing the window minimise button, in any route, produces the mini
  widget and not the tray.
- **AC-2** The widget has no native title bar and no minimise/maximise/close
  controls of its own.
- **AC-3** The countdown ring is complete the moment a session (focus, short break
  or long break) starts, drains as time passes, and is invisible when the time is
  up.
- **AC-4** The ring's colour identifies the session type and stays legible at the
  widget's 120×76 size.
- **AC-5** The widget can start and pause the timer without expanding.
- **AC-6** Leaving the widget restores the title bar, the window's own size and
  position, its minimum size, and the user's always-on-top preference.
- **AC-7** The widget fills the whole window while it is open; no app chrome,
  banners, toasts or dialogs are clipped into it.
- **AC-8** A login launch (`--autostart`) opens the full window at its normal size
  without stealing focus; the tray icon still appears.
- **AC-9** The browser/PWA build keeps working: mini mode stays a floating panel
  over the running app, and nothing Tauri-specific is imported eagerly.

### Out of scope

- Hiding the widget's taskbar entry (`skipTaskbar`).
- Remembering the widget's position between runs (the window has no state plugin
  configured).

## Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Rust forwards a minimise (`WindowEvent::Resized` 0x0) as the `deepwork:minimize` event instead of hiding the window. |
| FR-2 | Rust keeps the `--autostart` flag so a login launch is identifiable, and opens it with `restore_in_background`. |
| FR-3 | `UiService.init()` subscribes to `deepwork:minimize`; startup is not its business. |
| FR-4 | `UiService.enterMiniMode()` un-minimises, relaxes the minimum size, disables resizing, removes decorations, shrinks the window, pins it if asked, and forces always-on-top. |
| FR-5 | `UiService.exitMiniMode()` restores decorations, resizability, size, position, minimum size, the user's always-on-top preference and focus. |
| FR-6 | `TimerService.remainingProgress` exposes "how much of the session is left" (1 → 0) for the ring. |
| FR-7 | A new `MiniWidgetComponent` renders the ring, the time, play/pause and expand, and drags the window; it lives in the app shell so every route has it. |
| FR-8 | The app shell is hidden while the native widget is open, and Esc leaves mini mode from any page. |

## Key entities

- **Mini widget** — the shrunken always-on-top window; a first-class state of the
  window rather than a route.
- **Countdown ring** — `remainingProgress` rendered as an SVG dash offset with a
  per-session-type gradient.

## Success criteria

- All unit tests pass (400 tests / 33 files).
- `ng build` and `cargo check` are clean.
- Minimise from the clock card, the window button and the taskbar all land in the
  same widget; `Esc` and the expand arrow both come back.

## Assumptions

- The widget's taskbar entry is useful (it is how a user finds the app again) and is
  left in place.
- A login launch opens the full window without stealing focus: the user asked for the
  app to be visible at startup, and not taking focus keeps that from being rude.
- System minimise prefers the widget and falls back to the tray if the frontend does
  not answer within 2.5 s, so the tray behaviour that existed before is never lost.
