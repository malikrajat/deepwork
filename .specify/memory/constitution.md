# DeepWork Constitution

## Core Principles

### I. Security-First & Air-Gapped

- Zero network access — the application must NEVER make outbound connections
- All data stored locally in embedded SQLite — no cloud, no telemetry, no analytics
- Tauri's strict sandboxing model enforced: minimal IPC permissions, no shell access
- Export/import via local JSON files only — user owns 100% of their data
- No third-party CDNs, fonts, or assets loaded at runtime

### II. Local-First Data Integrity

- SQLite as single source of truth for all application state
- All data operations are transactional — no partial writes
- 1-click export to JSON with full schema (tasks, sessions, habits, journal entries)
- Import validates schema integrity before overwriting
- Data format is versioned for forward-compatible migrations

### III. Exceptional UX & Low-Click Workflow

- Every common action achievable in 2 clicks or fewer
- Keyboard shortcuts for essential operations (start/pause timer, quick-add task, navigate pages)
- Transitions are smooth, feedback is immediate, animations are purposeful (not decorative)
- Focus mode removes all chrome except the timer and current task
- System tray integration configurable (minimize-to-tray or close-to-quit)

### IV. Aggressive Notification System

- Timer completion triggers OS-level notification (bottom-right popup) with sound
- Notification repeats every 60 seconds until manually dismissed by user action
- Break reminders are equally persistent — the app enforces healthy work patterns
- Notifications respect OS Do Not Disturb settings

### V. Component-Based Angular Architecture

- Angular latest (v19+) with standalone components — no NgModules
- Signal-based reactivity for state management (Angular Signals)
- Each page is a lazy-loaded route for fast startup
- Shared UI components in a dedicated library (glassmorphism design system)
- Strict TypeScript — no `any`, full type coverage

### VI. Visual Consistency — Glassmorphism Design System

- Purple/Blue gradient palette with frosted glass panels
- All UI components follow a unified glassmorphism token system (blur, opacity, border-radius)
- Dark theme by default; all contrast ratios meet WCAG AA
- Animated clock and timeline as signature visual elements on Dashboard
- Responsive layout within desktop window constraints (min 800x600)

### VII. Performance & Lightweight Footprint

- Tauri binary must remain under 15MB installed
- App cold-start under 2 seconds
- Timer accuracy within ±100ms (no drift over long sessions)
- SQLite queries under 50ms for all common operations
- Memory footprint under 150MB during active use

## Security Requirements

- Tauri allowlist explicitly defines permitted IPC commands — deny by default
- No `eval()`, no dynamic script injection, no `innerHTML` with user content
- All user input sanitized before database operations (parameterized queries only)
- File system access limited to app data directory only
- No external dependencies that phone home — audit all npm packages

## Development Workflow

- Feature branches follow Spec Kit convention: `NNN-feature-name`
- All code must pass Angular strict mode compilation with zero warnings
- Unit tests required for all services and complex components (Jest or Vitest)
- E2E tests for critical user flows (timer lifecycle, task CRUD, data export)
- Commit messages follow Conventional Commits format

## Governance

- This constitution supersedes all implementation shortcuts or "quick fixes"
- Security principles (I, II) are NON-NEGOTIABLE — no exceptions
- UX principles (III, IV) can be relaxed only with explicit user approval
- Performance targets (VII) are goals, not hard blocks — but deviations must be documented
- Any amendment requires updating this document with rationale and date

**Version**: 1.0.0 | **Ratified**: 2026-05-25 | **Last Amended**: 2026-05-25
