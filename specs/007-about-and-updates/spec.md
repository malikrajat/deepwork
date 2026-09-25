# Feature Specification: About the developer, and checking for updates

**Feature branch**: `version3.0`
**Status**: Implemented
**Created**: 2026-09-22

## Summary

DeepWork is published as an open-source desktop app, and the person who builds it
is available for work. Neither fact had anywhere to live inside the app: a user
could not tell who wrote it, how to reach them, or whether the copy they were
running was the newest one. This feature adds an **About** page with two tabs —
one introducing the developer and how to hire them, one describing the app and
**checking GitHub for a newer release** — plus the plumbing that lets a link
inside the webview actually open a browser.

## User Scenarios & Testing

### Primary stories

1. **Find out who made this.** The user opens **About → About the developer** and
   reads who builds DeepWork, what they are good at, what kind of work they are
   open to, and how to reach them.
2. **Get in touch about work.** From the same tab the user can email, open the
   portfolio, or open LinkedIn, GitHub or WhatsApp — every one of those in their
   real browser, not inside the app window.
3. **Check for a newer release.** The user opens **About → DeepWork & updates**
   and presses _Check for updates_. The page says whether a newer release exists,
   which version it is, when it was published and what changed.
4. **Get the right download.** When a newer release exists, the page offers the
   installer for the machine the app is running on (Windows, macOS or Linux) and
   links to the release page for everything else.
5. **Know without asking.** DeepWork checks GitHub once in the background as it
   starts, and shows an **Update** pill next to the version at the foot of the
   sidebar when something newer is published. The version badge itself opens the
   About page.

### Acceptance criteria

- **AC-1** **About** is a page of its own, reachable from the sidebar
  (`/about`), with two tabs: the developer and the app.
- **AC-2** Every name, claim, link and paragraph on the developer tab comes from
  `src/app/core/constants/about.constants.ts`, so the text can be changed without
  touching the layout.
- **AC-3** The developer tab offers full-time, contract/freelance, part-time and
  fractional, hourly consulting, speaking and end-to-end delivery as ways of
  working together, in plain professional language, and no résumé download, no
  skills grid, no statistics and no work list.
- **AC-4** Contact is offered as email, portfolio, LinkedIn, GitHub, WhatsApp and
  Medium, each opening outside the app.
- **AC-5** The update check reads the project's own GitHub releases
  (`/repos/malikrajat/deepwork/releases`), takes the **highest parseable
  version** rather than the first or last entry, and ignores drafts.
- **AC-6** The result is one of four honest answers: _a newer release exists_,
  _this build is the latest release_, _this build is newer than anything
  published_ (a development build), or _the check could not answer_ — with the
  reason shown (offline, rate-limited, no releases yet, unreadable tag).
- **AC-7** A check never runs twice at once, never throws, and never blocks the
  window: the startup check is fired and not awaited.
- **AC-8** The last answer is cached (`localStorage`, `deepwork.update.v1`) and
  reused for six hours — the unauthenticated GitHub API allows 60 requests an
  hour per machine — while _Check for updates_ always asks again.
- **AC-9** When a newer release exists, the installer for the current platform is
  offered by name and size, with the release notes (trimmed to a readable
  length), the release date, the full release page and any other attached files.
- **AC-10** Version comparison follows semantic versioning: `1.2.0` is newer than
  `1.10.0` is false (numeric, not string, comparison) and a release outranks its
  own pre-releases.
- **AC-11** An outward link opens in the user's real browser from the desktop
  app, where a `target="_blank"` link is otherwise swallowed by the webview.
  In a browser build the anchor is left completely alone.
- **AC-12** The app refuses to hand the OS anything but `http`, `https` and
  `mailto` links, and refuses URLs containing control characters
  (`src-tauri/src/opener.rs`).
- **AC-13** Assets a release does not carry are not invented: with no installer
  for this platform, the page offers the release page instead.
- **AC-14** The page does not name the developer's employer anywhere.

### Out of scope

- Downloading and installing an update from inside the app (the Tauri updater
  plugin would need signing keys and a release manifest; a link to the release is
  what this version ships).
- Automatic notifications, tray balloons or dialogs for a new release — the
  sidebar pill and the About page are the whole surface.
- Telemetry of any kind: the check reads a public release list and nothing about
  the machine is sent.
- A form that posts a message: contact is by email and the listed channels.

## Where it lives

| Piece                                        | File                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Developer, availability, work, contact copy  | `src/app/core/constants/about.constants.ts`                                                                                         |
| App name, version, repository, releases API  | `src/app/core/constants/app-info.constants.ts`                                                                                      |
| About page and its two tabs                  | `src/app/pages/about/about.component.ts`                                                                                            |
| Update check, cache, release mapping         | `src/app/core/services/update.service.ts`                                                                                           |
| Version comparison and release formatting    | `src/app/core/utils/version.util.ts`, `src/app/core/utils/release.util.ts`                                                          |
| Opening outward links in the real browser    | `src-tauri/src/opener.rs`, `src/app/core/services/external-link.service.ts`, `src/app/shared/directives/external-link.directive.ts` |
| Sidebar entry, version badge and update pill | `src/app/shared/components/sidebar/sidebar.component.ts`                                                                            |

## Verification

```bash
npm run lint                                          # ESLint, 0 errors
npm test                                              # Vitest, includes the six new specs
npm run test:coverage && npm run coverage:summary     # the coverage gate + the 90% goal
npm run build                                         # Angular production build
cargo test --manifest-path src-tauri/Cargo.toml --lib # opener.rs unit tests
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```
