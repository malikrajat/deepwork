//! Writing generated files to the user's Downloads folder.
//!
//! DeepWork produces files the user keeps: the CSV task export and the Excel
//! import template. The webview could hand them to its own download machinery,
//! but then the app cannot tell the user where they went — so the frontend sends
//! the bytes here, gets the real path back, and can say so in the UI.
//!
//! Nothing is overwritten: a name that is already taken becomes `report (2).csv`.
//! The name itself is sanitised, so a file can never be written outside Downloads.

use std::path::{Path, PathBuf};

/// Writes `bytes` into the Downloads folder and returns the full path written.
pub fn save(file_name: &str, bytes: &[u8]) -> Result<String, String> {
    save_in(&platform::downloads_dir()?, file_name, bytes)
}

/// [`save`], but into an explicit folder — the part that has to be testable.
fn save_in(dir: &Path, file_name: &str, bytes: &[u8]) -> Result<String, String> {
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("Cannot open your Downloads folder: {err}"))?;

    let path = unique_path(dir, file_name);
    std::fs::write(&path, bytes)
        .map_err(|err| format!("Cannot write {}: {err}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// First free name: `report.csv`, then `report (2).csv`, `report (3).csv`, …
fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let safe = sanitize_file_name(file_name);
    let candidate = dir.join(&safe);
    if !candidate.exists() {
        return candidate;
    }

    let path = Path::new(&safe);
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "deepwork-export".to_string());
    let extension = path
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default();

    for copy in 2..1000 {
        let candidate = dir.join(format!("{stem} ({copy}){extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem} (copy){extension}"))
}

/// Strips anything that could escape the Downloads folder.
///
/// Path separators and the characters Windows forbids in a file name become
/// underscores, and leading dots are dropped so `..` cannot climb out.
fn sanitize_file_name(file_name: &str) -> String {
    let cleaned: String = file_name
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            control if (control as u32) < 32 => '_',
            other => other,
        })
        .collect();

    let trimmed = cleaned.trim().trim_start_matches('.').trim();
    if trimmed.is_empty() {
        "deepwork-export".to_string()
    } else {
        trimmed.to_string()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Where Downloads lives, per platform
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod platform {
    use super::PathBuf;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    /// Explorer's record of the Downloads folder.
    ///
    /// `{374DE290-…}` is the well-known Downloads folder id, and `Shell Folders`
    /// holds its *current* path — so a user who moved Downloads off the system
    /// drive still gets the file where they expect it. `%USERPROFILE%\Downloads`
    /// is the fallback when the key is missing.
    pub(super) fn downloads_dir() -> Result<PathBuf, String> {
        const SHELL_FOLDERS: &str =
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders";
        const DOWNLOADS_FOLDER_ID: &str = "{374DE290-123F-4565-9164-39C4925E467B}";

        if let Ok(path) = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(SHELL_FOLDERS, KEY_READ)
            .and_then(|key| key.get_value::<String, _>(DOWNLOADS_FOLDER_ID))
        {
            if !path.trim().is_empty() {
                return Ok(PathBuf::from(path));
            }
        }

        let profile = std::env::var("USERPROFILE")
            .map_err(|_| "Cannot locate your home folder".to_string())?;
        Ok(PathBuf::from(profile).join("Downloads"))
    }
}

#[cfg(not(windows))]
mod platform {
    use super::PathBuf;

    /// `$XDG_DOWNLOAD_DIR` when a desktop sets it, else `~/Downloads`.
    pub(super) fn downloads_dir() -> Result<PathBuf, String> {
        // Already a complete path when a desktop environment writes it.
        if let Ok(dir) = std::env::var("XDG_DOWNLOAD_DIR") {
            let dir = dir.trim().trim_matches('"');
            if !dir.is_empty() {
                return Ok(PathBuf::from(dir));
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            let home = home.trim();
            if !home.is_empty() {
                return Ok(PathBuf::from(home).join("Downloads"));
            }
        }
        Err("Cannot locate your Downloads folder".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A private, empty folder under the system temp directory.
    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deepwork-downloads-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn ordinary_file_names_are_kept() {
        assert_eq!(
            sanitize_file_name("export-2026-09-18.csv"),
            "export-2026-09-18.csv"
        );
        assert_eq!(sanitize_file_name("2026-09-18.xlsx"), "2026-09-18.xlsx");
    }

    #[test]
    fn names_can_never_escape_the_downloads_folder() {
        for hostile in [
            "../../etc/passwd",
            r"..\..\Windows\System32\evil.csv",
            "C:\\evil.csv",
        ] {
            let safe = sanitize_file_name(hostile);
            assert!(!safe.contains('/'), "{safe} still has a separator");
            assert!(!safe.contains('\\'), "{safe} still has a separator");
            assert!(!safe.starts_with('.'), "{safe} can still climb a level");
            assert_eq!(
                Path::new(&safe).components().count(),
                1,
                "{safe} is not a bare name"
            );
        }
    }

    #[test]
    fn blank_names_are_replaced() {
        assert_eq!(sanitize_file_name("   "), "deepwork-export");
        assert_eq!(sanitize_file_name("..."), "deepwork-export");
    }

    #[test]
    fn an_existing_file_is_never_overwritten() {
        let dir = scratch_dir("unique");
        std::fs::write(dir.join("report.csv"), b"first").unwrap();

        let second = unique_path(&dir, "report.csv");
        assert_eq!(
            second.file_name().unwrap().to_string_lossy(),
            "report (2).csv"
        );

        std::fs::write(&second, b"second").unwrap();
        let third = unique_path(&dir, "report.csv");
        assert_eq!(
            third.file_name().unwrap().to_string_lossy(),
            "report (3).csv"
        );

        // The original is untouched.
        assert_eq!(std::fs::read(dir.join("report.csv")).unwrap(), b"first");
    }

    #[test]
    fn saving_writes_the_bytes_and_reports_the_path() {
        let dir = scratch_dir("save");
        let path = save_in(&dir, "export.csv", b"a,b\r\n").expect("saved");

        assert!(path.ends_with("export.csv"));
        assert_eq!(std::fs::read(&path).unwrap(), b"a,b\r\n");
    }
}
