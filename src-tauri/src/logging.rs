//! DeepWork's log files: what goes in each one, how they roll over, and how the
//! user opens the folder that holds them.
//!
//! A single log file is useless the day something breaks: it is either the size
//! of a book, or it has been overwritten by the last run. So DeepWork writes
//! **five small files** instead, each one answering a different question, and
//! each one rolling over on its own once it reaches [`MAX_FILE_SIZE`]:
//!
//! | File | Contains | Question it answers |
//! |------|----------|---------------------|
//! | `deepwork.log` | Everything at the current level | "What happened, in order?" |
//! | `system.log` | App lifecycle, window, tray, OS, plus any warning or error that has no home of its own | "Did the app or the desktop shell misbehave?" |
//! | `flow.log` | What the user did: pages, timer, imports, exports | "What was the user doing when it broke?" |
//! | `crash.log` | Panics, unhandled errors and rejections, Angular errors | "Why did it die?" |
//! | `network.log` | Failed requests, offline/online transitions | "Was the network to blame?" |
//!
//! Angular reports its own trouble through the `log_write` command, so the same
//! five files describe the webview and the Rust side together.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use log::{Level, LevelFilter, Metadata};
use tauri::{AppHandle, Manager};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// Log targets the app writes to. A `target:` in a `log::` call selects the
/// file the record lands in.
pub const SYSTEM: &str = "deepwork::system";
pub const FLOW: &str = "deepwork::flow";
pub const CRASH: &str = "deepwork::crash";
pub const NETWORK: &str = "deepwork::network";

/// How much a single file may hold before it is archived and started again.
///
/// 512 KB is a few thousand lines — enough for a week of ordinary use, small
/// enough to open in Notepad and mail to somebody.
const MAX_FILE_SIZE: u128 = 512 * 1024;

/// Rotated copies kept next to each file before the oldest is deleted.
///
/// Five files × six generations is a hard ceiling on what DeepWork can ever
/// leave on disk (~15 MB), so a long-running install can never fill a drive
/// with logs.
const KEEP_FILES: usize = 5;

/// Longest message accepted from the webview, so one runaway error cannot
/// dominate a file.
const MAX_MESSAGE_CHARS: usize = 4_000;

/// The log folder, remembered so [`install_panic_hook`] can write to it even
/// when it fires before the app has a handle.
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

/// The logger for the whole desktop app: one small file per kind of trouble.
///
/// Rotating is handled by the plugin, per target, so a chatty file (the flow
/// log, usually) rolls over without touching the quiet ones.
pub fn builder(dir: &Path) -> tauri_plugin_log::Builder {
    let file = |name: &str| TargetKind::Folder {
        path: dir.to_path_buf(),
        file_name: Some(name.to_string()),
    };

    tauri_plugin_log::Builder::new()
        .clear_targets()
        .level(if cfg!(debug_assertions) {
            LevelFilter::Debug
        } else {
            LevelFilter::Info
        })
        .max_file_size(MAX_FILE_SIZE)
        .rotation_strategy(RotationStrategy::KeepSome(KEEP_FILES))
        .timezone_strategy(TimezoneStrategy::UseLocal)
        // sqlx logs every statement it runs at debug level, SQL text included.
        // Useful while working on the schema, ruinous in a file the user is
        // asked to read, so the database is only heard from when it complains.
        .level_for("sqlx", LevelFilter::Warn)
        // Terminal output stays readable: warnings and worse only.
        .target(Target::new(TargetKind::Stdout).filter(|metadata| metadata.level() <= Level::Info))
        .target(Target::new(file("deepwork")))
        .target(Target::new(file("system")).filter(is_system))
        .target(Target::new(file("flow")).filter(|metadata| metadata.target() == FLOW))
        .target(Target::new(file("crash")).filter(is_crash))
        .target(Target::new(file("network")).filter(|metadata| metadata.target() == NETWORK))
}

/// True for records that carry a category of their own.
fn is_categorised(target: &str) -> bool {
    target == FLOW || target == CRASH || target == NETWORK
}

/// True when a record is at least as severe as a warning.
///
/// `log` orders `Error` *below* `Warn`, so "worse than ordinary" is `<=` rather
/// than the `>=` it reads like.
fn is_trouble(metadata: &Metadata<'_>) -> bool {
    metadata.level() <= Level::Warn
}

/// `system.log`: our own lifecycle notes, plus any warning or error that no
/// other file claims — the "something smells wrong" catch-all.
fn is_system(metadata: &Metadata<'_>) -> bool {
    metadata.target() == SYSTEM || (is_trouble(metadata) && !is_categorised(metadata.target()))
}

/// `crash.log`: what DeepWork reported *as* a crash, plus anything at error
/// level, including a failing dependency.
fn is_crash(metadata: &Metadata<'_>) -> bool {
    metadata.target() == CRASH || metadata.level() == Level::Error
}

/// Where the log files live on this machine.
///
/// The OS decides — `%LOCALAPPDATA%\com.deepwork.app\logs` on Windows,
/// `~/Library/Logs/com.deepwork.app` on macOS, `~/.local/share/…` on Linux —
/// and the folder is created if it is not there yet. The same path is handed to
/// the UI, so "Open log folder" always shows the folder these files are in.
pub fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|err| format!("Cannot locate the log folder: {err}"))?;
    prepare_dir(&dir)?;
    Ok(dir)
}

/// Creates the log folder, and remembers it for the panic hook.
pub fn prepare_dir(dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir)
        .map_err(|err| format!("Cannot create {}: {err}", dir.display()))?;
    let _ = LOG_DIR.set(dir.to_path_buf());
    Ok(())
}

/// The remembered log folder, or the temp directory when setup never got that
/// far — a crash before setup is exactly the one worth keeping.
fn remembered_dir() -> PathBuf {
    LOG_DIR.get().cloned().unwrap_or_else(std::env::temp_dir)
}

/// Records a panic in `crash.log`.
///
/// Two paths, because a panic is the one line a user is asked to send us: the
/// ordinary logger when it is running, and a hand-written line when the panic
/// happened before the logger was attached (a crash on startup) or when the
/// logger itself is what failed.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();

    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        let message = panic_message(info.payload());

        if log::max_level() == LevelFilter::Off {
            append_to_crash_file(
                &remembered_dir(),
                &format!("panic at {location}: {message}"),
            );
        } else {
            log::error!(target: CRASH, "panic at {location}: {message}");
        }

        previous(info);
    }));
}

/// The panic payload as text — `panic!("x")` and `panic!("{}", x)` arrive here
/// differently, and anything else has no message to show.
fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(text) = payload.downcast_ref::<&str>() {
        return (*text).to_string();
    }
    if let Some(text) = payload.downcast_ref::<String>() {
        return text.clone();
    }
    "panic (no message)".to_string()
}

/// Writes straight into `crash.log`, bypassing the logger entirely.
///
/// Used only when there is no logger to write through; the entry is stamped
/// with Unix seconds rather than a formatted time, because the point is to
/// leave *something* behind even when the app is falling over.
fn append_to_crash_file(dir: &Path, line: &str) {
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }

    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default();

    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("crash.log"))
    {
        use std::io::Write;
        let _ = writeln!(file, "[{seconds}] {}", one_line(line, MAX_MESSAGE_CHARS));
    }
}

/// How the webview names a file: `flow` → the flow log, anything unknown →
/// `system.log`, so a stray category can never lose a line.
pub fn target_for(category: &str) -> &'static str {
    match category.trim().to_ascii_lowercase().as_str() {
        "flow" => FLOW,
        "crash" => CRASH,
        "network" => NETWORK,
        _ => SYSTEM,
    }
}

/// How the webview names a level. Debug records only reach the files in a debug
/// build; the rest are kept in every build.
pub fn level_for(level: &str) -> Level {
    match level.trim().to_ascii_lowercase().as_str() {
        "debug" => Level::Debug,
        "warn" | "warning" => Level::Warn,
        "error" => Level::Error,
        _ => Level::Info,
    }
}

/// Collapses a message into one line, because a log file that is read by eye
/// (and by "find in Notepad") is worth more than one that keeps a stack trace's
/// newlines. Long messages are truncated with a visible marker.
fn one_line(message: &str, limit: usize) -> String {
    let flattened = message
        .replace("\r\n", " | ")
        .replace(['\r', '\n'], " | ")
        .trim()
        .to_string();

    if flattened.chars().count() <= limit {
        return flattened;
    }

    let kept: String = flattened.chars().take(limit).collect();
    format!("{kept}… [truncated]")
}

/// Opens the log folder in the OS file manager.
///
/// `explorer`, `open` and `xdg-open` are the one thing every desktop already
/// has, so the app needs no extra dependency to answer "where are the logs?".
pub fn open_folder(dir: &Path) -> Result<(), String> {
    prepare_dir(dir)?;
    opener(dir)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Cannot open {}: {err}", dir.display()))
}

#[cfg(windows)]
fn opener(path: &Path) -> Command {
    let mut command = Command::new("explorer");
    command.arg(path);
    command
}

#[cfg(target_os = "macos")]
fn opener(path: &Path) -> Command {
    let mut command = Command::new("open");
    command.arg(path);
    command
}

#[cfg(all(unix, not(target_os = "macos")))]
fn opener(path: &Path) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(path);
    command
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands exposed to the Angular layer
// ─────────────────────────────────────────────────────────────────────────────

/// The folder the log files are written to, for display in Settings.
#[tauri::command]
pub fn log_folder(app: AppHandle) -> Result<String, String> {
    log_dir(&app).map(|dir| dir.to_string_lossy().into_owned())
}

/// Opens that folder in Explorer / Finder / the Linux file manager, and reports
/// the path so the UI can show the user where they just landed.
#[tauri::command]
pub fn open_log_folder(app: AppHandle) -> Result<String, String> {
    let dir = log_dir(&app)?;
    open_folder(&dir)?;
    Ok(dir.to_string_lossy().into_owned())
}

/// One line from the Angular layer: a page change, a failed request, a caught
/// error, an Angular `ErrorHandler` report.
///
/// `category` picks the file (`flow`, `crash`, `network`, anything else →
/// `system`) and `level` picks the severity. Failures are the caller's problem
/// to report — a broken log write must never break the feature that was being
/// logged.
#[tauri::command]
pub fn log_write(category: String, level: String, message: String) {
    let line = one_line(&message, MAX_MESSAGE_CHARS);
    if line.is_empty() {
        return;
    }
    log::log!(target: target_for(&category), level_for(&level), "{line}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use log::Metadata;

    fn metadata<'a>(level: Level, target: &'a str) -> Metadata<'a> {
        Metadata::builder().level(level).target(target).build()
    }

    #[test]
    fn a_category_that_is_not_ours_lands_in_the_system_log() {
        assert_eq!(target_for("flow"), FLOW);
        assert_eq!(target_for("  Crash "), CRASH);
        assert_eq!(target_for("network"), NETWORK);
        assert_eq!(target_for("system"), SYSTEM);
        assert_eq!(target_for("something-else"), SYSTEM);
    }

    #[test]
    fn every_level_the_webview_sends_maps_to_a_real_level() {
        assert_eq!(level_for("debug"), Level::Debug);
        assert_eq!(level_for("info"), Level::Info);
        assert_eq!(level_for("WARN"), Level::Warn);
        assert_eq!(level_for("warning"), Level::Warn);
        assert_eq!(level_for("error"), Level::Error);
        assert_eq!(level_for("???"), Level::Info);
    }

    #[test]
    fn a_message_becomes_a_single_readable_line() {
        assert_eq!(one_line("hello", 100), "hello");
        assert_eq!(one_line("first\r\nsecond", 100), "first | second");
        assert_eq!(one_line("  padded  ", 100), "padded");
    }

    #[test]
    fn a_runaway_message_is_cut_short_and_says_so() {
        let long = "x".repeat(50);
        let line = one_line(&long, 10);
        assert!(line.starts_with(&"x".repeat(10)));
        assert!(line.ends_with("[truncated]"));
    }

    #[test]
    fn the_log_folder_is_created_where_it_is_asked_for() {
        let dir = std::env::temp_dir().join(format!("deepwork-logs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        prepare_dir(&dir).expect("the log folder is created");
        prepare_dir(&dir).expect("a second call changes nothing");

        assert!(dir.is_dir());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_crash_outside_the_logger_still_reaches_crash_log() {
        let dir = std::env::temp_dir().join(format!("deepwork-crash-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        // No logger is installed in a test binary, exactly like a panic during
        // startup: the line has to be written by hand.
        append_to_crash_file(&dir, "panic at main.rs:12: it broke\nand said why");

        let written = std::fs::read_to_string(dir.join("crash.log")).expect("crash.log");
        assert!(written.contains("panic at main.rs:12: it broke"));
        assert!(written.contains("and said why"));
        // One entry, one line: the file stays greppable.
        assert_eq!(written.lines().count(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_system_log_keeps_warnings_and_errors_that_have_no_home() {
        assert!(is_system(&metadata(Level::Info, SYSTEM)));
        assert!(is_system(&metadata(Level::Warn, "tauri::window")));
        assert!(is_system(&metadata(Level::Error, "tauri::window")));
        // A normal third-party info line is not trouble for the system log.
        assert!(!is_system(&metadata(Level::Info, "tauri::window")));
        // Categorised records belong to their own files.
        assert!(!is_system(&metadata(Level::Info, FLOW)));
    }

    #[test]
    fn the_crash_log_takes_reported_crashes_and_every_error() {
        // Anything the app reports *as* a crash is a crash, whatever level it
        // arrived with — the category is the signal, not the severity.
        assert!(is_crash(&metadata(Level::Error, CRASH)));
        assert!(is_crash(&metadata(Level::Info, CRASH)));
        // A failing dependency is worth a crash-log line too.
        assert!(is_crash(&metadata(Level::Error, "tauri::window")));
        // A warning is not a crash, and neither is ordinary chatter.
        assert!(!is_crash(&metadata(Level::Warn, "tauri::window")));
        assert!(!is_crash(&metadata(Level::Info, "tauri::window")));
    }

    #[test]
    fn the_flow_and_network_logs_only_take_their_own_category() {
        let flow_is_flow = |metadata: &Metadata<'_>| metadata.target() == FLOW;
        let network_is_network = |metadata: &Metadata<'_>| metadata.target() == NETWORK;

        assert!(flow_is_flow(&metadata(Level::Info, FLOW)));
        assert!(!flow_is_flow(&metadata(Level::Error, NETWORK)));
        assert!(network_is_network(&metadata(Level::Warn, NETWORK)));
        assert!(!network_is_network(&metadata(Level::Info, FLOW)));
    }
}
