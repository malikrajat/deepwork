# Feature Specification: Crisp visuals everywhere, and a widget without a box

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-25

## Summary

Feedback from the people using DeepWork: the app "looks fine", but

1. the minimised widget does not look like a Mac widget — its corners are square,
2. the colourful countdown circle looks blurry,
3. that circle sits inside a square box with a visible border, and
4. text, borders and corners generally read as soft rather than sharp.

All four turned out to be real, and all four had a cause you can point at in the
sources rather than a matter of taste:

| Symptom                      | Cause                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Square box around the circle | Tailwind's automatic content detection read the widget's own `class="ring"` and generated its `ring` utility — one 1px `currentColor` box-shadow — so a pale rectangle was drawn exactly the size of the SVG box. |
| Blurry circle and colours    | The ring (and the Dashboard clock's arc and needle) were drawn through `feGaussianBlur` filters, which fuzz the stroke, the gradient and the filter's rectangular region.                                         |
| Soft, hard-to-read text      | Sizes were written in fractional rem (`0.72rem` = 11.52px, `0.62rem` = 9.92px), which puts glyph stems on half pixels; the smallest labels were under 10px.                                                       |
| Square widget                | The desktop window was opaque, so a round-cornered surface had nowhere to show: the corners of the window were painted app colour, not desktop.                                                                   |

## What the user sees now

- **The widget is a rounded card, in every build.** The surface fills its window
  edge to edge *and* carries the same 18px radius the browser build's floating
  panel has, so the desktop shows through the four corners in both. That is only
  honest because the window's own rectangle has been dealt with first: the window
  is transparent (FR-5), the page behind it is cleared while the widget is up
  (FR-6), and the hairline Windows draws around every top-level window is dropped
  for as long as the widget is open (FR-11) — otherwise the radius would leave a
  rounded card inside a square outline, which is the shape the user complained
  about in the first place. The radius is on the surface, never on the content:
  `overflow: hidden` clips the ring, the bell and the four buttons to the rounded
  frame instead of rounding each of them. There is no border and no outer glow;
  the only edge is a 1px inset hairline.
- **The ring is sharp.** It is drawn at its own size (a 60-unit viewBox in a 60px
  SVG, so nothing is resampled), with an even 6px stroke and a wide, faint halo
  stroke instead of a Gaussian blur. The countdown is a whole 12px with tabular
  figures.
- **Everything is on a whole-pixel type scale.** Every `font-size` and `font`
  shorthand in `src/` is an integer number of pixels on one ladder (10, 11, 12,
  13, 14, 15, 16, 18, 20, 22, 24, 28, 32px), and no label is smaller than 10px.
- **Edges read as edges.** Card, panel and input borders moved up to a 0.09–0.10
  alpha hairline, and the muted/secondary text colours were raised to 5.5:1 and
  9:1 against the background so even the quietest label is crisp.
- **One radius ladder, one focus ring.** Radii snap to 0–24px on a single ladder,
  and `:focus-visible` draws a 2px ring the eye can find on any surface.
- **Platform controls match the app.** Sliders and checkboxes take their colour
  from the theme instead of rendering as bright system grey.

## Requirements

| ID    | Requirement                                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | `styles.css` imports Tailwind with `source(none)`: the preflight reset is kept, utility generation from hand-written class names is not.                                                                  |
| FR-2  | No element in `src/` carries a class name that is also a bare Tailwind utility (`block`, `ring`, `grid`, `hidden`, `flex`, `border`, `shadow`, …).                                                        |
| FR-3  | No SVG in the app draws with `feGaussianBlur`; glows are wide, faint duplicate strokes with hard edges.                                                                                                   |
| FR-4  | The mini widget's ring is drawn in a viewBox that matches its rendered size, with an even stroke width.                                                                                                   |
| FR-5  | `tauri.conf.json` asks for a transparent window, and `UiService` puts `widget-transparent` on `<html>` while (and only while) the widget is open, on the platform where the window really is transparent. |
| FR-6  | The mesh-gradient background layers are switched off inside the widget, so nothing paints into the empty corners.                                                                                         |
| FR-7  | Every `font-size` in `src/` is a whole number of pixels, at least 10px, with the ladder published as `--text-*` tokens.                                                                                   |
| FR-8  | Radii come from one ladder, published as `--radius-*` tokens.                                                                                                                                             |
| FR-9  | `:focus-visible` has one app-wide ring; the task card and widget buttons keep their own, stronger ones.                                                                                                   |
| FR-10 | Range inputs and checkboxes are themed rather than left at the platform default.                                                                                                                          |
| FR-11 | While the widget is open the window's own border is taken away (`window_paint_widget_frame` → `DWMWA_BORDER_COLOR` + `DwmExtendFrameIntoClientArea`) and handed back to the system on the way out, and Windows 11 is asked for rounded window corners (`DWMWA_WINDOW_CORNER_PREFERENCE` = `DWMWCP_ROUND`, `DWMWCP_DEFAULT` on the way out); it is a no-op outside Windows and on Windows versions without those attributes. |
| FR-12 | The widget's rounded frame belongs to every build, not to the browser one: `.mini-widget` carries the 18px radius itself, with `overflow: hidden` so the rounding is the frame's rather than the ring's, the bell's or the buttons'. |

## Success criteria

- `npm run lint`, `npm test`, `npm run build` and `npm run e2e` are clean.
- `tests/unit/visual-crispness.spec.ts` pins each rule above down as a source
  invariant: a new fractional font size, a new Gaussian blur, a new bare utility
  class name or a non-transparent window fails the suite.
- The widget, at 1x and at 2x, fills its window — a crisp ring, a hairline edge
  and no white corner or stray outline anywhere along that edge — and the
  Dashboard clock's ring reads at the start of a session.

## Assumptions and trade-offs

- **The widget's rounded silhouette is two changes, not one.** Rounding it means
  rounding the *window*, because a window is a rectangle and everything outside
  the card's corners is the desktop showing through the OS's own frame. The first
  half was the transparent window (FR-5) and the cleared page behind it (FR-6);
  the second is the border going away (FR-11) and the radius moving onto the
  widget itself (FR-12). Doing the radius without the first half is what produced
  the original complaint — a rounded card inside a square outline — so the order
  the two are described in here is also the order they have to be applied in.
  `DWMWA_WINDOW_CORNER_PREFERENCE` is asked for as well, which makes the *window*
  round where Windows 11 can do it; the CSS radius is what actually draws the
  shape, since the corners of the surface are the only thing painted there.
- **macOS and Linux keep the opaque widget.** Transparency there needs the macOS
  private API / a compositing window manager, so `widget-transparent` is claimed
  only on Windows; elsewhere the widget keeps the app's dark background, so the
  rounded corners are drawn inside a window whose own background is the same dark
  colour — the radius reads as a rounded card on Windows and as a square window
  everywhere the desktop cannot show through. The same CSS is what runs in both
  cases; only what is *behind* the corners differs.
- **Fonts still come from Google Fonts.** The desktop build therefore renders
  with the system UI font when it is offline. Self-hosting Inter would remove
  that difference and is worth its own change.
