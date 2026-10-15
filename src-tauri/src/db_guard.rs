//! Guarding the one thing in DeepWork that cannot be recreated: the user's own
//! database.
//!
//! Everything else in this app can be rebuilt from the code. The tasks someone
//! has finished, the sessions they sat through, the journal they wrote are the
//! only state that exists nowhere else — and they live in one SQLite file that
//! this app, on the face of it, is free to recreate. Two habits in the stack make
//! that a real risk rather than a theoretical one:
//!
//! * The SQL plugin *creates the database when it is missing*
//!   (`Sqlite::create_database` in `tauri-plugin-sql`) and then runs every
//!   migration that has not been recorded. A file that has gone missing — a moved
//!   install, a half-finished upgrade, a folder a sync client dropped it from —
//!   is therefore not an error anyone sees. It is a fresh, empty database, and
//!   the app carries on looking exactly like DeepWork.
//! * The installed app's data folder belongs to the bundle identifier rather than
//!   to the folder the binary lives in, so the two can drift apart without
//!   anything failing loudly.
//!
//! So this module looks at the file *before* the plugin is allowed to open it,
//! and [`preflight`] answers what it found: is it there, does it hold data, and
//! is it a database at all. `DbService.init` is what acts on the answer — a file
//! that holds data and cannot be read stops the app rather than being silently
//! replaced. [`backup`] copies it aside first, because a check can only prove a
//! file is *not* obviously broken.
//!
//! ## Why the check is the header and not the whole file
//!
//! SQLite's own `PRAGMA integrity_check` reads every page, and it is the only way
//! to find damage in the middle of a file. It also needs SQLite to run, and this
//! app already links exactly one copy of it — through `tauri-plugin-sql`. A
//! second copy (`rusqlite` and its bundled amalgamation) would either duplicate
//! the library inside the binary or fight the first one for the same symbols, and
//! neither is a price worth paying for a check that runs before the database is
//! even open. The frontend asks the *linked* SQLite the deeper question once the
//! database is open, where it costs nothing extra — see `DbService.verify`.
//!
//! What is left here is still the check that matters most, because it is the one
//! that answers "is there anything here at all?". SQLite refuses to open a file
//! whose header it does not recognise, and the plugin's answer to a refused open
//! is to create a new database — so a file whose header is wrong, or whose header
//! promises pages the file does not have, is precisely the file that must not be
//! handed over. That is decided from the first hundred bytes, with no library, no
//! allocation and no write: the read is opened read-only, so the check cannot
//! itself be the thing that loses the data.
//!
//! The header itself is documented, and stable since SQLite 3.0 — see
//! [the database file format][fmt].
//!
//! [fmt]: https://www.sqlite.org/fileformat.html

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// The database file name, as the connection string in `lib.rs` spells it.
const DB_FILE: &str = "deepwork.db";

/// The sidecar files SQLite keeps beside a database.
///
/// A write-ahead log holds committed pages that are not in the database file yet,
/// so a copy of `deepwork.db` alone can be a copy of a *previous* state of the
/// data. Backups copy all three or none of them.
const DB_SIDECARS: [&str; 2] = ["deepwork.db-wal", "deepwork.db-shm"];

/// The sixteen bytes every SQLite database begins with.
///
/// A file that does not start with these is not a database: it is a text file, an
/// empty file, a half-written download, or whatever else ended up at the path.
/// SQLite will not open it, and — this is the part that matters — the SQL plugin
/// will happily create a new database over it instead.
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

/// Length of the header every SQLite database carries.
const SQLITE_HEADER_LEN: usize = 100;

/// The page size a header asks for when its field reads `1`.
///
/// 65536 does not fit in the header's two-byte page-size field, so the format
/// reserves `1` to mean it. A reader that took the `1` literally would divide the
/// file into 65536 times too many pages.
const PAGE_SIZE_65536: u32 = 65_536;

/// What was found at the database path, before anything opened it for writing.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbReport {
    /// True when the file is there.
    pub present: bool,
    /// Its size in bytes; zero when it is not there.
    pub bytes: u64,
    /// True when the file holds tables DeepWork could have written.
    ///
    /// The one field the frontend must not get wrong: when this is true and
    /// [`DbReport::unreadable`] is set, opening the database through the plugin
    /// would replace the user's data with an empty database, so the app refuses
    /// instead and says where the file is.
    pub holds_data: bool,
    /// Why the file is not a usable database, when it is not.
    pub unreadable: Option<String>,
    /// The full path, so a message about it can point at the real file.
    pub path: String,
}

/// Where the database lives, as the SQL plugin resolves it.
///
/// `app_config_dir` is the plugin's own choice — it pushes the connection
/// string's file name onto that directory (`path_mapper` in `tauri-plugin-sql`)
/// — so this is the same file the plugin will open, on all three desktops.
pub fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(DB_FILE))
        .map_err(|err| format!("Cannot locate DeepWork's data folder: {err}"))
}

/// Inspects the database without writing to it.
///
/// Never fails: every problem it meets comes back as a filled-in [`DbReport`],
/// because "the check itself went wrong" must not be reported as "the database is
/// fine".
pub fn preflight(app: &AppHandle) -> DbReport {
    let Ok(path) = path(app) else {
        return DbReport {
            present: false,
            bytes: 0,
            holds_data: false,
            unreadable: Some("DeepWork's data folder could not be located.".to_string()),
            path: DB_FILE.to_string(),
        };
    };

    preflight_at(&path)
}

/// The whole check, against a path — which is what makes it testable.
pub fn preflight_at(path: &Path) -> DbReport {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        // Not there at all: a first run, and nothing to protect.
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return DbReport {
                present: false,
                bytes: 0,
                holds_data: false,
                unreadable: None,
                path: display(path),
            };
        }
        Err(err) => {
            return DbReport {
                present: false,
                bytes: 0,
                holds_data: false,
                unreadable: Some(format!("The database file could not be read: {err}")),
                path: display(path),
            };
        }
    };

    let bytes = metadata.len();
    let report = |holds_data, unreadable| DbReport {
        present: true,
        bytes,
        holds_data,
        unreadable,
        path: display(path),
    };

    // What the header claimed, and whether the file has the bytes to back the
    // claim up. Written as named values rather than a match guard because the
    // comparison *is* the decision here: a header that promises pages the file
    // does not contain describes a truncated database, and a truncated database
    // is data to protect, not an empty file to start over.
    let said = header(path);
    let claimed_bytes = said
        .as_ref()
        .ok()
        .and_then(|said| said.pages.map(|pages| (pages, u64::from(said.page_size))))
        .map(|(pages, page_size)| u64::from(pages) * page_size)
        .unwrap_or(0);

    match said {
        // A database that says it holds pages, with the bytes to hold them.
        // Anything deeper than this is the linked SQLite's question, asked once
        // the database is open.
        Ok(said) if said.pages.is_some_and(|pages| pages > 0) && bytes >= claimed_bytes => {
            report(true, None)
        }
        // Pages claimed, bytes missing: the file was truncated — an interrupted
        // copy, a full disk, a folder a sync client emptied.
        Ok(said) if said.pages.is_some_and(|pages| pages > 0) => report(
            true,
            Some(format!(
                "the database says it holds {claimed_bytes} bytes but the file has {bytes}, so it is incomplete"
            )),
        ),
        // A header that reads correctly and counts no pages: a file the plugin
        // created and never wrote to, which is what a run that died between
        // `create_database` and its first migration leaves behind. Nothing to
        // lose by starting over, and refusing to would strand the user on a
        // database they cannot use.
        Ok(said) if said.pages == Some(0) => report(false, None),
        // The count lives in the write-ahead log. There is no reading it from
        // here — SQLite works it out from the log's size, which means the
        // *database file* is not the thing holding the answer. That is a database
        // some version of this app has written to, so it is data to protect: the
        // one answer that must not be given here is "nothing to lose".
        Ok(_) => report(true, None),
        // Not a database at all. `bytes > 0` is the decision that matters: a file
        // with content in it is *not* something to recreate, because whatever is
        // wrong with it may be a copy still in progress, and the data may still
        // be in there.
        Err(reason) => report(bytes > 0, Some(reason)),
    }
}

/// What a SQLite header says about the file it starts.
struct Header {
    /// Bytes per page, as the header asks for or as the reserved `1` means.
    page_size: u32,
    /// How many pages the database has.
    ///
    /// `None` when the header says the count is not in the main file at all but
    /// in the write-ahead log — see [`header`] — which is *not* the same answer
    /// as "no pages", and treating it as one is how a database with committed data
    /// still sitting in its log gets mistaken for an empty file.
    pages: Option<u32>,
}

/// Reads, and validates, the first hundred bytes of a file.
///
/// Everything here is a *refusal*: it describes what the file is not, never
/// repairs it. The read is read-only, so a missing file stays missing and a
/// damaged header stays damaged — a check with write access would be a check
/// capable of doing the very thing it exists to prevent.
fn header(path: &Path) -> Result<Header, String> {
    use std::io::Read;

    let mut file = std::fs::File::open(path)
        .map_err(|err| format!("the file could not be opened to check it: {err}"))?;

    let mut bytes = [0u8; SQLITE_HEADER_LEN];
    let read = file
        .read(&mut bytes)
        .map_err(|err| format!("the file could not be read: {err}"))?;

    if read < SQLITE_HEADER_LEN {
        return Err(format!(
            "the file is too short to be a DeepWork database: {read} bytes, and a database header is {SQLITE_HEADER_LEN}"
        ));
    }

    if &bytes[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("the file is not a SQLite database".to_string());
    }

    // The page size lives at offset 16 as a big-endian 16-bit number.
    let page_size = u32::from(u16::from_be_bytes([bytes[16], bytes[17]]));
    let page_size = match page_size {
        1 => PAGE_SIZE_65536,
        // 512 is the floor and 32768 the ceiling the format allows, and they are
        // all powers of two; anything else is a header no version of SQLite wrote.
        value if (512..=32_768).contains(&value) && value.is_power_of_two() => value,
        value => {
            return Err(format!(
                "the database header says its pages are {value} bytes, which is not a size SQLite uses"
            ));
        }
    };

    // Read version and reserved-space checks, in the order the format defines
    // them: a file whose *reader* version is newer than SQLite 3 cannot be opened
    // by this app's SQLite, and handing it to the plugin would get it replaced.
    let read_version = bytes[19];
    if read_version > 2 {
        return Err(format!(
            "the database needs a newer SQLite than DeepWork ships (its format version is {read_version})"
        ));
    }

    // The page count, at offset 28.
    //
    // **Zero** means the database has no pages, and is therefore one no version
    // of this app has written anything to: the plugin creates a header-only file
    // and fills it in on the first migration, so a crash in between leaves this
    // behind.
    //
    // **One** is the format's reserved stand-in for "the count is not here". It
    // is not one page: it means the real count lives in the write-ahead log, and
    // SQLite computes it from that file's size. Reading it as a page count — or
    // worse, folding it into the `None` above — is how a database whose committed
    // changes are still in its log would be mistaken for an empty one and
    // recreated over the top of the user's work. It is reported as `None` so the
    // caller has to decide what that means, rather than being handed a number
    // that looks like an answer.
    let pages = match u32::from_be_bytes([bytes[28], bytes[29], bytes[30], bytes[31]]) {
        0 => Some(0),
        1 => None,
        count => Some(count),
    };

    Ok(Header { page_size, pages })
}

/// Copies the database beside itself, under a timestamped name, before it is
/// touched.
///
/// This runs before the SQL plugin opens the database, which is the only moment
/// at which a copy is *certain* to be the state the user left behind: after that
/// the migrations are already applying, and a copy is of a schema half-way
/// through changing.
///
/// The copies are kept rather than rotated, deliberately. One file per launch
/// that changed something is a few hundred kilobytes in the user's own data
/// folder, and a rolling window of them is the only thing that helps after a bad
/// upgrade — which is exactly the case this exists for. The sidecar files travel
/// with it, so the copy is the database as SQLite last committed it rather than
/// as the main file happened to look.
///
/// Returns the copy's path, or `None` when there was nothing to copy.
pub fn backup(app: &AppHandle, note: &str) -> Option<String> {
    let path = path(app).ok()?;
    backup_at(&path, note)
}

/// The whole backup, against a path — which is what makes it testable.
pub fn backup_at(path: &Path, note: &str) -> Option<String> {
    if !path.is_file() {
        return None;
    }

    let dir = path.parent()?.join("backups");
    if let Err(err) = std::fs::create_dir_all(&dir) {
        log::warn!(
            target: crate::logging::SYSTEM,
            "backup: cannot create {}: {err}",
            dir.display()
        );
        return None;
    }

    let stem = format!("deepwork-{}-{note}", timestamp());
    let mut wrote_any = false;

    for (source, suffix) in sources(path) {
        if !source.is_file() {
            continue;
        }
        let target = dir.join(format!("{stem}{suffix}"));
        match std::fs::copy(&source, &target) {
            Ok(_) => wrote_any = true,
            Err(err) => log::warn!(
                target: crate::logging::SYSTEM,
                "backup: {} could not be copied: {err}",
                source.display()
            ),
        }
    }

    if !wrote_any {
        return None;
    }

    let database = dir.join(format!("{stem}.db"));
    log::info!(
        target: crate::logging::SYSTEM,
        "backup: copied the database to {} before it was opened",
        database.display()
    );
    Some(display(&database))
}

/// The database and its sidecars, each with the suffix it is copied under.
fn sources(path: &Path) -> Vec<(PathBuf, String)> {
    let mut files = vec![(path.to_path_buf(), ".db".to_string())];
    for sidecar in DB_SIDECARS {
        let suffix = sidecar.trim_start_matches("deepwork.db").to_string();
        files.push((path.with_file_name(sidecar), suffix));
    }
    files
}

/// A file system-safe timestamp: `20261007T143012`.
///
/// Written out by hand rather than pulled from a date library: this is the only
/// place the app needs a date as text, and a calendar library is a large
/// dependency for eight digits. The civil-date conversion is the standard one
/// (days since the Unix epoch to a year, month and day), and the value only ever
/// names and orders backup files.
fn timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);

    let seconds = now % 60;
    let minutes = (now / 60) % 60;
    let hours = (now / 3_600) % 24;
    let days = (now / 86_400) as i64;

    let (year, month, day) = civil_from_days(days);
    format!("{year:04}{month:02}{day:02}T{hours:02}{minutes:02}{seconds:02}")
}

/// Days since 1970-01-01 to a calendar date — Howard Hinnant's `civil_from_days`.
///
/// Shifts the epoch to 0000-03-01 so the leap day is the last day of the year,
/// which is what makes the month arithmetic a single linear expression.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_position = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_position + 2) / 5 + 1) as u32;
    let month = if month_position < 10 {
        month_position + 3
    } else {
        month_position - 9
    } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

/// A path as text, for reports and log lines.
fn display(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A file whose header claims `pages` pages of `page_size` bytes, padded out
    /// to `file_len` bytes.
    ///
    /// The padding is what the guard measures the claim against: a header that
    /// says two pages and a file holding one page's worth is a truncated
    /// database, and the only way a test can express that is by controlling both
    /// numbers.
    fn database_file(page_size: u16, pages: u32, read_version: u8, file_len: usize) -> Vec<u8> {
        let mut bytes = vec![0u8; file_len.max(SQLITE_HEADER_LEN)];
        bytes[..SQLITE_MAGIC.len()].copy_from_slice(SQLITE_MAGIC);
        bytes[16..18].copy_from_slice(&page_size.to_be_bytes());
        bytes[18] = 1;
        bytes[19] = read_version;
        bytes[28..32].copy_from_slice(&pages.to_be_bytes());
        bytes
    }

    fn write_temp(name: &str, bytes: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join("deepwork-db-guard-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn a_missing_file_is_a_first_run_and_not_a_problem() {
        let path = std::env::temp_dir().join("deepwork-db-guard-tests/definitely-not-here.db");
        let _ = std::fs::remove_file(&path);

        let report = preflight_at(&path);

        assert!(!report.present);
        assert!(!report.holds_data);
        assert!(report.unreadable.is_none());
    }

    #[test]
    fn an_empty_file_is_creatable_rather_than_protected() {
        let path = write_temp("empty.db", &[]);

        let report = preflight_at(&path);

        assert!(report.present);
        assert!(!report.holds_data);
        assert!(report.unreadable.is_some());
    }

    #[test]
    fn a_healthy_database_is_left_alone() {
        // Two pages claimed, two pages present and no complaint: this is what a
        // database written by any version of this app looks like on disk.
        let path = write_temp("healthy.db", &database_file(4096, 2, 1, 4096 * 2));

        let report = preflight_at(&path);

        assert!(report.present);
        assert!(report.holds_data);
        assert!(report.unreadable.is_none());
    }

    #[test]
    fn a_truncated_database_still_counts_as_data_to_protect() {
        // The header promises two pages and the file holds one: a copy that was
        // interrupted, or a disk that filled up. Reporting this as "no data" is
        // the one answer that lets the plugin create a database over it.
        let path = write_temp("short.db", &database_file(4096, 2, 1, 4096));

        let report = preflight_at(&path);

        assert!(report.holds_data);
        assert!(report.unreadable.is_some());
    }

    #[test]
    fn a_database_with_no_pages_is_not_data_to_protect() {
        let path = write_temp("no-pages.db", &database_file(4096, 0, 1, SQLITE_HEADER_LEN));

        let report = preflight_at(&path);

        assert!(report.present);
        assert!(!report.holds_data);
        assert!(report.unreadable.is_none());
    }

    #[test]
    fn a_file_that_is_not_a_database_is_reported_as_data() {
        // The dangerous case: something with content in it, at the path the
        // plugin would otherwise decide to create a database on top of.
        let path = write_temp("not-a-database.txt", b"these are the user's notes, not a database");

        let report = preflight_at(&path);

        assert!(report.holds_data);
        assert!(report.unreadable.is_some());
    }

    #[test]
    fn a_truncated_header_still_counts_as_content() {
        let path = write_temp(
            "truncated.db",
            &database_file(4096, 2, 1, SQLITE_HEADER_LEN)[..40],
        );

        let report = preflight_at(&path);

        assert!(report.holds_data);
        assert!(report.unreadable.is_some());
    }

    #[test]
    fn a_database_from_a_newer_sqlite_is_not_silently_replaced() {
        let path = write_temp(
            "from-the-future.db",
            &database_file(4096, 2, 3, 4096 * 2),
        );

        let report = preflight_at(&path);

        assert!(report.holds_data);
        assert!(report.unreadable.is_some());
    }

    #[test]
    fn the_reserved_page_count_of_one_is_data_and_never_an_empty_database() {
        // The format's reserved stand-in for "the count is in the write-ahead
        // log". Read as a page count it would say "one page"; folded in with zero
        // it would say "empty". Both are wrong, and the second is how a database
        // whose committed changes are still in its log gets recreated over the
        // user's work.
        let path = write_temp(
            "wal-pages.db",
            &database_file(4096, 1, 1, PAGE_SIZE_65536 as usize),
        );

        let report = preflight_at(&path);

        assert!(report.holds_data, "{report:?}");
        assert!(report.unreadable.is_none());
    }

    #[test]
    fn the_reserved_page_size_of_one_means_sixty_five_thousand() {
        // A 65536-byte page size does not fit the header's two-byte field, so the
        // format writes `1` there. A reader that took it literally would divide
        // the file into 65536 times too many pages and call a healthy database
        // truncated.
        let path = write_temp(
            "big-pages.db",
            &database_file(1, 2, 1, PAGE_SIZE_65536 as usize * 2),
        );

        let report = preflight_at(&path);

        assert!(report.holds_data, "{report:?}");
        assert!(report.unreadable.is_none());
    }

    #[test]
    fn an_impossible_page_size_is_refused() {
        let path = write_temp("bad-page-size.db", &database_file(999, 2, 1, 4096 * 2));

        let report = preflight_at(&path);

        assert!(report.holds_data);
        assert!(report.unreadable.is_some());
    }

    #[test]
    fn a_backup_copies_the_database_and_its_log() {
        let dir = std::env::temp_dir().join("deepwork-db-guard-tests/backup");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("deepwork.db");
        std::fs::write(&db, b"the database").unwrap();
        std::fs::write(dir.join("deepwork.db-wal"), b"the log").unwrap();

        let copy = backup_at(&db, "launch").expect("a backup should have been written");

        let copy = PathBuf::from(copy);
        assert!(copy.is_file());
        assert_eq!(std::fs::read(&copy).unwrap(), b"the database");
        assert!(dir.join("backups").is_dir());
        assert!(copy
            .with_file_name(format!("{}-wal", copy.file_stem().unwrap().to_string_lossy()))
            .is_file());
    }

    #[test]
    fn a_missing_database_has_nothing_to_back_up() {
        let dir = std::env::temp_dir().join("deepwork-db-guard-tests/absent");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        assert!(backup_at(&dir.join("deepwork.db"), "launch").is_none());
    }

    #[test]
    fn the_timestamp_is_a_date_and_not_a_count_of_seconds() {
        let stamp = timestamp();

        assert_eq!(stamp.len(), 15, "{stamp}");
        assert!(stamp.starts_with("20"), "{stamp}");
        assert_eq!(&stamp[8..9], "T", "{stamp}");
        assert!(stamp[..8].chars().all(|c| c.is_ascii_digit()), "{stamp}");
    }

    #[test]
    fn civil_dates_land_on_the_known_days() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
        // 2024 is a leap year: the 29th of February exists and the day after the
        // 28th is the 29th rather than the 1st of March.
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
        assert_eq!(civil_from_days(19_783), (2024, 3, 1));
    }
}
