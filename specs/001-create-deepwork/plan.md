# Implementation Plan: DeepWork

**Feature**: 001-create-deepwork
**Created**: 2026-05-25
**Status**: Draft

## Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Desktop Runtime | Tauri | 2.x (latest) | Lightweight (~3MB overhead), Rust-based security sandbox, cross-platform |
| Frontend Framework | Angular | 19.x (latest) | Standalone components, Signals-based reactivity, excellent TypeScript support |
| CSS Framework | Tailwind CSS | 4.x | Utility-first, perfect for custom glassmorphism tokens, tree-shakes unused styles |
| State Management | Angular Signals + RxJS | Built-in | Signals for synchronous UI state, RxJS for async streams (timer ticks) |
| Database | SQLite via `tauri-plugin-sql` | - | Tauri's official SQL plugin, async Rust-based queries, zero-config |
| Drag & Drop | Angular CDK DnD | 19.x | Official Angular library, accessibility built-in, works with standalone components |
| Charts | Chart.js + ng2-charts | 4.x / 6.x | Lightweight canvas-based charts, Angular wrapper available |
| Animations | Angular Animations + CSS | Built-in | Timer clock animation in CSS (GPU-accelerated), page transitions via Angular animations |
| Icons | Lucide Icons | latest | Open source, consistent style, tree-shakeable SVG icons |
| Notifications | Tauri Notification Plugin | 2.x | OS-native notifications with sound support, permission management |
| Sound | Web Audio API | native | No extra dependency, play built-in audio files bundled in app |
| Build Tool | Vite (via Angular CLI) | latest | Angular 19 uses Vite by default, fast HMR during development |
| Testing | Vitest + Angular Testing Library | latest | Fast unit tests, component testing with real DOM |
| E2E Testing | Playwright | latest | Cross-platform browser testing, works with Tauri webview |

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Tauri Shell (Rust)                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   Angular Frontend                       │ │
│  │                                                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │ │
│  │  │Dashboard │  │  Tasks   │  │  Matrix  │  ...pages   │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘             │ │
│  │       │              │              │                    │ │
│  │  ┌────┴──────────────┴──────────────┴─────────────────┐ │ │
│  │  │              Shared Services Layer                  │ │ │
│  │  │  TimerService │ TaskService │ DbService │ etc.     │ │ │
│  │  └──────────────────────┬─────────────────────────────┘ │ │
│  │                         │ Tauri IPC (invoke)             │ │
│  └─────────────────────────┼───────────────────────────────┘ │
│                            │                                  │
│  ┌─────────────────────────┴───────────────────────────────┐ │
│  │              Tauri Backend (Rust)                        │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │ │
│  │  │  SQLite  │  │ Notification │  │  File System     │  │ │
│  │  │  Plugin  │  │   Plugin     │  │  (Export/Import) │  │ │
│  │  └──────────┘  └──────────────┘  └──────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Project Structure

```
pomodoro/
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs             # Tauri app entry, plugin registration
│   │   ├── lib.rs              # Command handlers (IPC)
│   │   └── migrations/         # SQLite schema migrations
│   ├── Cargo.toml
│   ├── tauri.conf.json         # Tauri config (permissions, window, tray)
│   └── icons/                  # App icons (all sizes)
├── src/                         # Angular frontend
│   ├── app/
│   │   ├── app.component.ts    # Root component (sidebar + router-outlet)
│   │   ├── app.routes.ts       # Lazy-loaded route definitions
│   │   ├── core/               # Singleton services, guards, interceptors
│   │   │   ├── services/
│   │   │   │   ├── timer.service.ts
│   │   │   │   ├── task.service.ts
│   │   │   │   ├── db.service.ts
│   │   │   │   ├── notification.service.ts
│   │   │   │   ├── settings.service.ts
│   │   │   │   └── export.service.ts
│   │   │   └── models/
│   │   │       ├── task.model.ts
│   │   │       ├── session.model.ts
│   │   │       ├── habit.model.ts
│   │   │       └── journal.model.ts
│   │   ├── shared/             # Reusable UI components (design system)
│   │   │   ├── components/
│   │   │   │   ├── glass-card/
│   │   │   │   ├── glass-button/
│   │   │   │   ├── glass-input/
│   │   │   │   ├── sidebar/
│   │   │   │   ├── animated-clock/
│   │   │   │   └── timeline-bar/
│   │   │   └── styles/
│   │   │       ├── glassmorphism.css    # Design tokens
│   │   │       └── animations.css
│   │   ├── pages/
│   │   │   ├── dashboard/      # Main timer + timeline + summary
│   │   │   ├── tasks/          # Full task CRUD
│   │   │   ├── matrix/         # Eisenhower quadrants
│   │   │   ├── today/          # Daily plan view
│   │   │   ├── analytics/      # Charts & history
│   │   │   ├── habits/         # Habit tracking
│   │   │   ├── journal/        # Daily reflections
│   │   │   └── settings/       # Configuration
│   │   └── app.config.ts       # Application config (providers)
│   ├── assets/
│   │   ├── sounds/             # Notification sound files (.ogg)
│   │   └── icons/              # UI icons (Lucide SVGs)
│   ├── styles.css              # Global styles + Tailwind imports
│   ├── index.html
│   └── main.ts                 # Bootstrap Angular
├── specs/                       # Spec Kit specifications
├── .specify/                    # Spec Kit internals
├── .github/                     # Copilot agents & prompts
├── angular.json                 # Angular workspace config
├── tailwind.config.js           # Tailwind customization (glassmorphism palette)
├── tsconfig.json
├── package.json
└── README.md
```

## Database Schema

```sql
-- Core task table
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'done')),
    quadrant TEXT CHECK (quadrant IN ('urgent-important', 'important', 'urgent', 'neither')),
    deadline TEXT,  -- ISO 8601 date
    tags TEXT DEFAULT '[]',  -- JSON array
    recurrence TEXT,  -- JSON object or NULL
    today_order INTEGER,  -- position in Today's view, NULL if not in Today
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

-- Pomodoro sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('work', 'short-break', 'long-break')),
    duration_planned INTEGER NOT NULL,  -- seconds
    duration_actual INTEGER NOT NULL DEFAULT 0,  -- seconds
    started_at TEXT NOT NULL,
    completed_at TEXT,
    interrupted INTEGER DEFAULT 0  -- boolean
);

-- Habits
CREATE TABLE habits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '✓',
    target_frequency TEXT DEFAULT 'daily',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Habit completions
CREATE TABLE habit_entries (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Journal entries
CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD
    content TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- App settings (single row)
CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    work_duration INTEGER DEFAULT 1500,       -- 25 min in seconds
    short_break INTEGER DEFAULT 300,          -- 5 min
    long_break INTEGER DEFAULT 900,           -- 15 min
    sessions_before_long_break INTEGER DEFAULT 4,
    notification_sound TEXT DEFAULT 'bell',
    tray_behavior TEXT DEFAULT 'minimize' CHECK (tray_behavior IN ('minimize', 'quit')),
    theme TEXT DEFAULT 'dark'
);

-- Timer state (persists across app restarts)
CREATE TABLE timer_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_running INTEGER DEFAULT 0,
    type TEXT CHECK (type IN ('work', 'short-break', 'long-break')),
    remaining_seconds INTEGER DEFAULT 0,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    session_count INTEGER DEFAULT 0,
    started_at TEXT
);
```

## Design System: Glassmorphism Tokens

```css
:root {
    /* Purple/Blue gradient palette */
    --color-bg-primary: #0f0a1e;
    --color-bg-secondary: #1a1033;
    --color-accent-primary: #7c3aed;     /* Purple */
    --color-accent-secondary: #3b82f6;   /* Blue */
    --color-accent-gradient: linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%);
    --color-text-primary: #f1f5f9;
    --color-text-secondary: #94a3b8;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-danger: #ef4444;

    /* Glassmorphism tokens */
    --glass-bg: rgba(255, 255, 255, 0.05);
    --glass-border: rgba(255, 255, 255, 0.1);
    --glass-blur: 12px;
    --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    --glass-radius: 16px;

    /* Spacing */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --space-2xl: 48px;

    /* Typography */
    --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

## Tauri Configuration Highlights

```json
{
    "app": {
        "security": {
            "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"
        },
        "windows": [{
            "title": "DeepWork",
            "width": 1200,
            "height": 800,
            "minWidth": 800,
            "minHeight": 600,
            "decorations": true,
            "transparent": false
        }],
        "trayIcon": {
            "iconPath": "icons/tray-icon.png",
            "tooltip": "DeepWork"
        }
    },
    "plugins": {
        "sql": { "preload": ["sqlite:deepwork.db"] },
        "notification": { "all": true }
    }
}
```

## Key Implementation Details

### Timer Engine (Angular Service)
- Uses `setInterval` with 1-second ticks for the countdown display
- Actual elapsed time calculated via `Date.now()` difference (not tick count) to prevent drift
- Timer state persisted to `timer_state` table every 30 seconds and on pause/stop
- On app launch, checks `timer_state`: if interrupted, calculates elapsed time and offers resume

### Notification Loop
- On timer completion, calls Tauri notification plugin immediately
- Starts a 60-second interval that re-fires the notification
- Interval cleared only when user takes action (clicks notification or interacts with app)
- Sound played via Web Audio API from bundled `.ogg` files

### Recurring Task Generation
- On app startup (and midnight if running), runs recurrence check
- Queries tasks where `recurrence IS NOT NULL` and no instance exists for today
- Creates new task instances based on recurrence JSON config
- Original task serves as "template"; instances are independent copies

### Focus Mode
- Implemented as a CSS class toggle on the root component
- Hides sidebar, analytics widgets, task list — shows only timer + current task
- Keyboard shortcut (F11 or Ctrl+Shift+F) toggles Focus Mode
- Timer controls remain accessible

### Dashboard Timeline Bar
- Horizontal bar representing 24 hours (or waking hours: 6AM-midnight)
- Colored blocks for work sessions (purple) and breaks (blue)
- Current time marker moves in real-time
- Hover on block shows task name and duration

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Start/Pause timer (when on Dashboard) |
| `Ctrl+N` | Quick-add new task |
| `Ctrl+1-8` | Navigate to page 1-8 |
| `Ctrl+Shift+F` | Toggle Focus Mode |
| `Escape` | Exit Focus Mode / Close modals |

## Implementation Phases

1. **Phase 1 — Foundation**: Tauri + Angular scaffold, SQLite setup, basic routing, design system
2. **Phase 2 — Timer Core**: Timer service, Dashboard page, animated clock, notifications
3. **Phase 3 — Task Management**: Tasks page CRUD, Eisenhower Matrix with DnD, Today's View
4. **Phase 4 — Productivity Features**: Analytics charts, Habits tracking, Journal page
5. **Phase 5 — Polish**: Focus Mode, keyboard shortcuts, system tray, export/import, settings
6. **Phase 6 — Testing & Release**: Unit tests, E2E tests, build optimization, installer generation
