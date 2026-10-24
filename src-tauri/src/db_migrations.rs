//! The schema's migrations, and the one repair the database may need before the
//! SQL plugin is allowed to look at them.
//!
//! ## Why the migrations live here
//!
//! Two things need the same list: the plugin that applies them, and the repair
//! below that compares the bytes this build embeds with the hashes recorded in
//! the database. Keeping one list means those two can never disagree about what
//! "migration 6" is.
//!
//! ## The problem the repair solves
//!
//! `sqlx` records a SHA-384 of each migration's bytes when it applies it, and
//! refuses to start if a migration it already applied now hashes differently —
//! the check that stops a changed migration from being skipped. That check is
//! right about content and wrong about line endings: a checkout with
//! `core.autocrlf=true` rewrites every `\n` to `\r\n`, which is not a change to
//! the schema but is a different hash.
//!
//! When that happens the SQL plugin hands the frontend no connection at all, and
//! the app falls back to localStorage — a working app with the user's real
//! database sitting unused on disk. The failure is invisible from the UI, which
//! is the worst shape a data problem can take.
//!
//! So before the plugin opens the file, this module compares each recorded hash
//! with the hash of the migration as it is embedded *and* with the same SQL
//! under the other line ending. A hash that matches the other line ending is
//! rewritten to the embedded one; a hash that matches neither is left alone, so
//! a migration whose **content** really changed still stops the startup — and
//! now says so instead of quietly switching stores (see `DbService`).
//!
//! ## Which SQLite it uses
//!
//! The one the app already links. `tauri-plugin-sql` brings SQLite in through
//! `libsqlite3-sys`, and that copy is in the final binary whether or not this
//! module exists — so the repair calls its `sqlite3_*` symbols directly rather
//! than adding a second SQLite (which is the cost the comment in `Cargo.toml`
//! rules out). The `extern` block below has no `#[link]` on purpose: linking
//! `winsqlite3` as well would define every one of these symbols twice.
//!
//! That also means the repair is a real `UPDATE` — transactional, with SQLite's
//! own locking — rather than a byte-patch of a file this process does not own.
//!
//! On the other desktops the repair does nothing: their checkouts are LF (there
//! is no `core.autocrlf` there), so the hashes already match.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_sql::{Migration, MigrationKind};

/// The migrations this build embeds: version, description, SQL.
///
/// The order is the order they are applied in, and the version numbers are the
/// keys `sqlx` records — neither may change once a release has shipped.
pub const MIGRATIONS: &[(i64, &str, &str)] = &[
    (
        1,
        "create initial tables",
        include_str!("../migrations/001_initial.sql"),
    ),
    (
        2,
        "add missing settings columns",
        include_str!("../migrations/002_add_settings_columns.sql"),
    ),
    (
        3,
        "add task updated_at",
        include_str!("../migrations/003_add_task_updated_at.sql"),
    ),
    (
        4,
        "add calendar reminder setting",
        include_str!("../migrations/004_add_calendar_reminders.sql"),
    ),
    (
        5,
        "add desktop preference settings",
        include_str!("../migrations/005_add_desktop_prefs.sql"),
    ),
    (
        6,
        "add water intake log and reminder settings",
        include_str!("../migrations/006_add_water_intake.sql"),
    ),
    (
        7,
        "add water auto-log setting for the mini widget",
        include_str!("../migrations/007_add_water_autolog.sql"),
    ),
    (
        8,
        "close the window into the system tray",
        include_str!("../migrations/008_close_to_tray.sql"),
    ),
    (
        9,
        "how long the mini widget shakes for",
        include_str!("../migrations/009_alert_shake.sql"),
    ),
    (
        10,
        "carry unfinished work forward, or close it",
        include_str!("../migrations/010_carry_forward_tasks.sql"),
    ),
    (
        11,
        "ask about starting with Windows, and remind until it is on",
        include_str!("../migrations/011_launch_prompt_and_nudges.sql"),
    ),
    (
        12,
        "make Add to Today apply to one day",
        include_str!("../migrations/012_add_today_order_date.sql"),
    ),
    (
        13,
        "remember the task title on a focus session",
        include_str!("../migrations/013_add_session_task_title.sql"),
    ),
];

/// The list the SQL plugin is configured with.
pub fn migrations() -> Vec<Migration> {
    MIGRATIONS
        .iter()
        .map(|(version, description, sql)| Migration {
            version: *version,
            description: (*description).into(),
            sql: (*sql).into(),
            kind: MigrationKind::Up,
        })
        .collect()
}

/// What the repair did, so the log can say which migrations needed it.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationRepair {
    /// The versions whose recorded hash was rewritten.
    pub repaired: Vec<i64>,
}

/// Brings recorded line-ending hashes in line with the migrations this build
/// embeds. See the module docs.
///
/// Called by the frontend *before* `Database.load`, and after the launch backup
/// (`db_backup`) has been taken: the repair is a write, and the copy is what
/// makes it reversible. Never fails the startup: a database that cannot be
/// repaired is left exactly as it is, and the plugin's own error then reaches the
/// user as the database error card rather than as a silent switch to
/// localStorage.
#[tauri::command]
pub fn db_repair_migrations(app: AppHandle) -> Result<MigrationRepair, String> {
    let path = crate::db_guard::path(&app)?;
    if !path.exists() {
        // A first run: the plugin creates the file and applies everything.
        return Ok(MigrationRepair::default());
    }

    let repaired = platform::repair_line_ending_hashes(&path)?;
    if !repaired.is_empty() {
        log::warn!(
            target: crate::logging::SYSTEM,
            "migration checksums repaired for line endings: {repaired:?}"
        );
    }
    Ok(MigrationRepair { repaired })
}

#[cfg(windows)]
mod platform {
    //! The Windows repair, through the SQLite this app already links.

    use super::MIGRATIONS;
    use sha2::{Digest, Sha384};
    use std::ffi::{c_char, c_int, c_void, CStr, CString};
    use std::path::Path;

    /// `sqlite3_open_v2`: the file must exist and is opened read-write.
    const SQLITE_OPEN_READWRITE: c_int = 0x0000_0002;
    const SQLITE_OK: c_int = 0;

    // The SQLite C API the app is already linked against — see the module docs
    // for why there is no `#[link]` here.
    //
    // `extern "C"`, not `extern "system"`: SQLite is a C library, and on 32-bit
    // Windows `system` is `stdcall`, which decorates every import (`@16`, `@8`)
    // that the cdecl functions SQLite exports do not define. The two agree on
    // 64-bit Windows, so only the x86 installer failed to link.
    extern "C" {
        fn sqlite3_open_v2(
            filename: *const c_char,
            db: *mut *mut c_void,
            flags: c_int,
            vfs: *const c_char,
        ) -> c_int;
        fn sqlite3_close(db: *mut c_void) -> c_int;
        fn sqlite3_busy_timeout(db: *mut c_void, milliseconds: c_int) -> c_int;
        fn sqlite3_exec(
            db: *mut c_void,
            sql: *const c_char,
            callback: Option<
                unsafe extern "C" fn(
                    *mut c_void,
                    c_int,
                    *mut *mut c_char,
                    *mut *mut c_char,
                ) -> c_int,
            >,
            argument: *mut c_void,
            error_message: *mut *mut c_char,
        ) -> c_int;
        fn sqlite3_changes(db: *mut c_void) -> c_int;
        fn sqlite3_free(pointer: *mut c_void);
    }

    /// Owns the connection so every early return still closes it.
    struct Connection(*mut c_void);

    impl Drop for Connection {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    sqlite3_close(self.0);
                }
            }
        }
    }

    pub fn repair_line_ending_hashes(path: &Path) -> Result<Vec<i64>, String> {
        let file = CString::new(path.to_string_lossy().as_bytes())
            .map_err(|_| "the database path contains a NUL byte".to_string())?;

        let mut handle = std::ptr::null_mut();
        let opened = unsafe {
            sqlite3_open_v2(
                file.as_ptr(),
                &mut handle,
                SQLITE_OPEN_READWRITE,
                std::ptr::null(),
            )
        };
        if opened != SQLITE_OK || handle.is_null() {
            // Locked, unreadable, or gone between the check and the open: none of
            // these is made better by failing the startup here. The plugin will
            // say what it thinks, and `DbService` now reports that.
            return Ok(Vec::new());
        }
        let connection = Connection(handle);
        // Another copy of the app should never be running (single-instance), but
        // a scanner or a backup tool can hold the file for a moment.
        unsafe {
            sqlite3_busy_timeout(connection.0, 2_000);
        }

        let mut repaired = Vec::new();
        for (version, _, sql) in MIGRATIONS {
            let embedded = checksum(sql.as_bytes());
            let alternate = checksum(other_line_endings(sql).as_bytes());
            if embedded == alternate {
                // No newlines at all: there is nothing a checkout could rewrite.
                continue;
            }

            let statement = format!(
                "UPDATE _sqlx_migrations SET checksum = X'{}' WHERE version = {} AND checksum = X'{}';",
                hex(&embedded),
                version,
                hex(&alternate)
            );

            match execute(&connection, &statement) {
                Ok(changed) if changed > 0 => repaired.push(*version),
                Ok(_) => {}
                // A database the plugin has not migrated yet has no table to
                // repair — every statement would fail the same way, so stop at
                // the first and let the plugin create it.
                Err(error) if error.contains("no such table") => return Ok(Vec::new()),
                Err(error) => return Err(error),
            }
        }

        Ok(repaired)
    }

    /// Runs one statement and returns how many rows it changed.
    fn execute(connection: &Connection, statement: &str) -> Result<c_int, String> {
        let sql = CString::new(statement)
            .map_err(|_| "a repair statement contained a NUL byte".to_string())?;
        let mut error_message: *mut c_char = std::ptr::null_mut();

        let result = unsafe {
            sqlite3_exec(
                connection.0,
                sql.as_ptr(),
                None,
                std::ptr::null_mut(),
                &mut error_message,
            )
        };

        if result == SQLITE_OK {
            return Ok(unsafe { sqlite3_changes(connection.0) });
        }

        let message = if error_message.is_null() {
            format!("sqlite error {result}")
        } else {
            let text = unsafe { CStr::from_ptr(error_message) }
                .to_string_lossy()
                .into_owned();
            unsafe {
                sqlite3_free(error_message as *mut c_void);
            }
            text
        };
        Err(message)
    }

    fn checksum(bytes: &[u8]) -> Vec<u8> {
        Sha384::digest(bytes).to_vec()
    }

    /// The same SQL under the line ending this checkout does not use.
    fn other_line_endings(sql: &str) -> String {
        if sql.contains("\r\n") {
            sql.replace("\r\n", "\n")
        } else {
            sql.replace('\n', "\r\n")
        }
    }

    /// The hex SQLite's `X'…'` literal takes.
    fn hex(bytes: &[u8]) -> String {
        use std::fmt::Write;
        let mut text = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            let _ = write!(text, "{byte:02X}");
        }
        text
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn the_alternate_is_the_line_ending_a_checkout_would_write() {
            assert_eq!(other_line_endings("a\nb"), "a\r\nb");
            assert_eq!(other_line_endings("a\r\nb"), "a\nb");
        }

        #[test]
        fn a_line_ending_changes_the_checksum_sqlx_records() {
            // This is the failure the module exists for: same SQL, same schema,
            // different bytes. If these two ever hashed the same, there would be
            // nothing to repair.
            assert_ne!(checksum(b"SELECT 1;\n"), checksum(b"SELECT 1;\r\n"));
        }

        #[test]
        fn the_hex_literal_is_uppercase_and_two_digits_per_byte() {
            assert_eq!(hex(&[0x00, 0x0a, 0xff]), "000AFF");
        }
    }
}

#[cfg(not(windows))]
mod platform {
    //! Nothing to repair where checkouts are LF already.

    use std::path::Path;

    pub fn repair_line_ending_hashes(_path: &Path) -> Result<Vec<i64>, String> {
        Ok(Vec::new())
    }
}
