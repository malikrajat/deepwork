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

- **The widget is a rounded card.** The window is created transparent
  (`src-tauri/tauri.conf.json`) and the widget fills it edge to edge with an 18px
  radius, so its corners are empty desktop — the same shape as the floating panel
  the browser build already had. There is no border and no outer glow; the only
  edge is a 1px inset hairline that follows that radius.
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

## Success criteria

- `npm run lint`, `npm test`, `npm run build` and `npm run e2e` are clean.
- `tests/unit/visual-crispness.spec.ts` pins each rule above down as a source
  invariant: a new fractional font size, a new Gaussian blur, a new bare utility
  class name or a non-transparent window fails the suite.
- The widget, at 1x and at 2x, shows a rounded card with a crisp ring and no
  square outline; the Dashboard clock's ring reads at the start of a session.

## Assumptions and trade-offs

- **The full window loses its DWM drop shadow on Windows.** A transparent window
  is what makes the widget's corners possible, and Windows does not draw a frame
  shadow for one. The window keeps its rounded frame and border, and the widget
  gains real rounded corners; this was judged the better end of the trade. If the
  shadow matters more than the widget's corners, the alternative is to keep the
  window opaque and ask DWM for rounded corners only while the widget is up.
- **macOS and Linux keep the opaque widget.** Transparency there needs the macOS
  private API / a compositing window manager, so `widget-transparent` is claimed
  only on Windows; elsewhere the widget keeps the app's dark background and its
  rounded corners are drawn inside a still-square window.
- **Fonts still come from Google Fonts.** The desktop build therefore renders
  with the system UI font when it is offline. Self-hosting Inter would remove
  that difference and is worth its own change.
