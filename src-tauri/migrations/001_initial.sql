-- DeepWork Initial Schema
-- All timestamps stored as ISO 8601 UTC strings

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'done')),
    quadrant TEXT CHECK (quadrant IN ('urgent-important', 'important', 'urgent', 'neither')),
    deadline TEXT,
    tags TEXT DEFAULT '[]',
    recurrence TEXT,
    today_order INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('work', 'short-break', 'long-break')),
    duration_planned INTEGER NOT NULL,
    duration_actual INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    interrupted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '✓',
    target_frequency TEXT DEFAULT 'daily',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_entries (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    content TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    work_duration INTEGER DEFAULT 1500,
    short_break INTEGER DEFAULT 300,
    long_break INTEGER DEFAULT 900,
    sessions_before_long_break INTEGER DEFAULT 4,
    notification_sound TEXT DEFAULT 'bell',
    tray_behavior TEXT DEFAULT 'minimize' CHECK (tray_behavior IN ('minimize', 'quit')),
    theme TEXT DEFAULT 'dark'
);

CREATE TABLE IF NOT EXISTS timer_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_running INTEGER DEFAULT 0,
    type TEXT CHECK (type IN ('work', 'short-break', 'long-break')),
    remaining_seconds INTEGER DEFAULT 0,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    session_count INTEGER DEFAULT 0,
    started_at TEXT
);

-- Insert default settings
INSERT OR IGNORE INTO settings (id) VALUES (1);

-- Insert default timer state
INSERT OR IGNORE INTO timer_state (id) VALUES (1);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_quadrant ON tasks(quadrant);
CREATE INDEX IF NOT EXISTS idx_tasks_today_order ON tasks(today_order);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_habit_entries_habit_id ON habit_entries(habit_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
