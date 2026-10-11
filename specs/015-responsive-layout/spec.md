# Feature Specification: DeepWork on any screen

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-10-10

## Summary

DeepWork is shipped twice from this repository: as a desktop window (Tauri) and
as a website (Netlify). The layout was designed for the first of those — a 240px
sidebar standing beside the content, 32/48px of page padding, four-across stat
rows and three-across boards — and the second one is opened on everything.

At 360px the sidebar alone took two thirds of the screen, the page could be
dragged sideways, and text fields below 16px made iOS Safari zoom the page in and
leave it zoomed. At 3840px the opposite happened: the same layout stretched until
a task card was a letterbox and a paragraph was a single two-foot line, while a
page that caps its own prose (About, Settings) became a narrow strip pinned to the
left of a three-thousand-pixel void.

The app is now laid out from the window it is given rather than from the
assumption of a desktop window. Nothing about what the app does changed: no
feature was added, removed or reordered, no service call or piece of state was
touched, and every desktop declaration between the breakpoints is byte-identical.
This spec records the breakpoints that decision turned on, because they are the
thing a future change is most likely to break.

## The four breakpoints

There were already page-level media queries at 1600px, 1360px, 1100px, 1024px,
960px, 900px, 700px, 640px and 560px, written one page at a time. Four of those
became app-wide and are now the ones that matter:

| Breakpoint  | Name        | What it means                                                                                        |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `≤ 900px`   | compact     | The sidebar leaves the row and becomes an off-canvas drawer. A 52px top bar with the menu appears.    |
| `≤ 640px`   | phone       | Page padding collapses to 16px, multi-column grids and toolbars stack, tap targets grow to 44px.      |
| `≥ 1920px`  | large       | The page column stops growing at `--content-max-width` (2200px) and centres itself in what is left.   |
| `≥ 2560px`  | very large  | The `--text-*` ladder and the form controls step up, for a screen read from across a room.            |

900px is where a 240px sidebar stops being a side panel. The desktop app can be
dragged down to its 800x600 minimum and it enters the compact layout there — at
that size the user needs the width more than a permanently visible menu.

2200px is where a page column stops being a page and starts being a billboard. It
holds a three-column board at a comfortable column width on a 3840px screen.

2560px is the point at which "further away" is a safe assumption: a 4K panel at
desk distance is fine at the laptop size, and a television is not.

A custom property cannot be read from a media query condition, so the 900px is
written in three places that have to agree: `app.css`, `sidebar.component.ts`, and
`COMPACT_LAYOUT_QUERY` in `app.ts`. Each one says so in a comment.

## The centring, and why it is free

The large-screen rule caps `.main-content` and adds `margin-inline: auto`. It has
no `min-width` guard, because it does not need one: a maximum the available space
never reaches does nothing, and on a flex item `auto` margins only absorb space
that is actually spare. So the same rule is a no-op at 1440px and the whole fix at
3840px, and there is no width at which it half-applies.

Capping the *column* rather than the page inside it is deliberate. The pages keep
their own widths — About caps its prose at 780px, the board wants all the room it
can get — and centring the column is what puts those narrower pages in the middle
of the window instead of against its edge.

## What this is not

- **Not a second layout.** The same templates render every shape. The mobile top
  bar is always in the DOM and is `display: none` above the breakpoint; the
  sidebar is the same `<nav>` with the same items, positioned differently. There
  is no `isMobile` branch that could drift away from the desktop one.
- **Not a change to what any page does.** Every page change in this pass is CSS
  inside an existing `styles:` literal — additive, with 0 deleted lines except
  where an existing `≤640px` declaration was itself the bug (the dashboard's 28px
  action buttons and its 11px task selector, which was the iOS focus-zoom case).
- **Not `overflow: hidden` used to hide the problem.** The column does clip its
  horizontal overflow as a last resort, but the pages were fixed at the source:
  fixed `min-width` floors released, grids collapsed, tables given their own
  scroll box. Clipping is the seatbelt, not the mechanism.
- **Not a ten-foot television UI.** The very-large step raises the type ladder and
  the controls, and it is honest about its reach: a rule written against the
  `--text-*` tokens grows with the screen, and one written against literal pixels
  does not. A television interface with its own larger, simpler, focus-driven
  design is a separate piece of work; this makes the existing one legible from
  further away, and a browser's own zoom remains the blunt instrument for a screen
  that needs more than that.
- **Not a container-query rewrite.** The guidance for component-level
  responsiveness is container queries, and they would be the right tool for a
  component that lives at several widths. Here the widths are decided by the
  window, the codebase is already written in media queries, and consistency beat
  novelty.

## Acceptance criteria

- **AC-1** Below 900px the sidebar is an off-canvas drawer: shut by default, out
  of the layout flow (so the page column gets the whole width), opened by the
  shell's own menu button, and closed by choosing a page, tapping the backdrop,
  or pressing Escape.
- **AC-2** A shut drawer is not reachable: it is not in the tab order and not in
  the accessibility tree (`inert` on the host, plus `visibility: hidden`).
- **AC-3** The drawer always renders the full labels, whatever the persisted
  desktop collapse state is — an icon rail inside a drawer is unusable — and its
  nav list scrolls, because ten destinations do not fit a 568px phone.
- **AC-4** No page overflows its column sideways at 320, 360, 768, 1024, 1600,
  1920, 2560, 3440 or 3840px, and the page column itself reports no horizontal
  overflow at any of them.
- **AC-5** The shell is measured in `dvh`, not `vh`, so the bottom of a page is
  not hidden under a phone's URL bar; `100vh` stays as the fallback line above
  it. Nothing uses `100vw` for a full-width box.
- **AC-6** Notch and home-indicator insets are honoured once (`viewport-fit=cover`
  in `index.html`), through the `--safe-*` tokens, and are `0px` on a desktop —
  so the desktop layout is unchanged by their presence.
- **AC-7** Text controls are at least 16px below 640px, so focusing a field does
  not zoom the page on iOS. This needed out-ranking the per-component
  `font-size: 13px`, which is why the rule is `html body input:not(...)`.
- **AC-8** Interactive controls reach a 44px tap target below 640px, with three
  documented exceptions: a card's row of action buttons (32×44px), the calendar's
  seven-column week strip, and links inline in a sentence.
- **AC-9** Above 1920px the page column stops growing at `--content-max-width` and
  is centred in the space beside the sidebar; the pages themselves cap and centre
  the rows, boards and prose that should not stretch.
- **AC-10** Above 2560px the type ladder and form controls step up, every size a
  whole pixel and none below the 10px floor the scale stops at.
- **AC-11** Above 900px the app is unchanged from before this work: the sidebar is
  a 240px column, the collapse toggle still works, and none of the mobile
  furniture is laid out. Between 900 and 1920px nothing moved at all.
- **AC-12** About states that the app fits any screen — phone, tablet, laptop and
  any size of monitor or TV — and that claim is the one AC-4 verifies.

## Out of scope

- **The mini widget.** It is a deliberately fixed 136×76 floating window whose
  size is tied to `UiService.WIDGET_SIZE` and held there by
  `visual-crispness.spec.ts`. It is left alone.
- **The packaged desktop window's behaviour.** `UiService`, the Tauri layer and
  the window geometry are untouched. The desktop build only inherits the CSS.
- **`:hover` states on touch.** A `:hover` rule can stick after a tap, which is a
  real (if cosmetic) touch annoyance. Wrapping every hover rule in
  `@media (hover: hover)` is a separate, much larger change.
- **Long-press context menus.** The matrix's context menu is opened by the
  browser's own `contextmenu` event on a long press, which iOS and Android do
  fire for text-bearing elements — but the card's always-visible status switch,
  the pencil button and drag all remain as fallbacks.

## The one build setting that moved

`angular.json`'s `anyComponentStyle` warning budget went from 16 kB to 20 kB. The
error budget is untouched at 24 kB, and no other component comes close to either.

This is the one number this feature had to change, and it changed because it was
already spent: the Calendar page's stylesheet was 15.96 kB — 97% of the old 16 kB
warning — before any of this work. A page that needs three new media blocks
(900px, 640px and 380px) was never going to fit in the last 400 bytes. The
additions were checked for waste first and have none: two declarations in the
whole component repeat a value the desktop rule already sets.

## Where it lives

| Piece                                          | File                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| The breakpoints, `dvh`, safe areas, tap sizes   | `src/styles.css`, `src/app/app.css`                              |
| `viewport-fit=cover`                            | `src/index.html`                                                 |
| Drawer state, inert, Escape, resize watcher     | `src/app/app.ts`, `src/app/app.html`                             |
| The drawer itself                               | `src/app/shared/components/sidebar/sidebar.component.ts`         |
| Page-level layout, at both ends of the range    | every `*.component.ts` under `src/app/pages/` and `src/app/shared/components/` |
| The claim on About                              | `src/app/pages/about/about.component.ts`                         |
| The rules, held down                            | `tests/e2e/responsive.spec.ts`                                   |

## Verification

```bash
npm run lint
npm test            # incl. the static CSS invariants in visual-crispness.spec.ts
npm run build
npx playwright test responsive.spec.ts
npx playwright test dashboard-layout.spec.ts navigation.spec.ts
```

`responsive.spec.ts` drives the real app across nine widths from 320px to 3840px
and all ten routes, and fails on the first element that reaches past the window or
a page column that reports horizontal overflow. It asserts which side of the 900px
breakpoint each size lands on, measures the page column at 1440px (uncapped) and
3840px (capped at the token, and centred in what the sidebar left), drives the
drawer — open, navigate, backdrop, Escape — reads the "Fits any screen" row on
About at 320px and at 3840px, and re-asserts the 1400px desktop shape, because
"responsive" must not mean "different on a big screen". It writes a screenshot of
every page at every width under `playwright-report/`, because an assertion can say
nothing overflowed and only a person can say whether it looks right.
