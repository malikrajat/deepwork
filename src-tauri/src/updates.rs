//! Getting a newer DeepWork onto this machine.
//!
//! The Angular layer knows *that* a newer release exists; this module is what
//! turns that answer into an installed app. It is deliberately two steps, so a
//! failure can be reported for the part that actually failed:
//!
//! 1. [`update_download`] fetches this platform's installer from the release
//!    into a private folder under the system temp directory, reporting the bytes
//!    written as it goes.
//! 2. [`update_install`] hands that file to the operating system: it runs the
//!    Windows installer, opens the macOS disk image, or starts the Linux package
//!    or app image.
//!
//! Both refuse anything that is not an `https` link to the project's own
//! releases, so a tampered update check cannot talk the app into downloading an
//! arbitrary file. Instructions are handed to the downloader the OS already
//! ships — `curl`, with `wget` as a fallback — rather than pulling a TLS stack
//! into the app for one request, the same way [`crate::opener`] hands links to
//! `explorer`/`open`/`xdg-open`.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::downloads;
use crate::logging;

/// Hosts an installer may be fetched from.
///
/// `github.com` is where a release asset link points; the redirect that serves
/// the bytes is followed by the downloader itself, so it is not listed here.
const ALLOWED_HOSTS: [&str; 1] = ["github.com"];

/// How often the size of the file being written is reported back.
const PROGRESS_STEP: Duration = Duration::from_millis(250);

/// How long the app waits before closing itself behind the Windows installer,
/// so the user sees the "installing" message before the window disappears.
#[cfg(windows)]
const QUIT_BEHIND_INSTALLER_MS: u64 = 2_000;

/// Event the Angular layer listens to for the progress of a download.
///
/// The payload is `[bytesWritten, totalBytes]`, with `totalBytes` coming from
/// the release asset and therefore zero when GitHub did not report a size.
pub const PROGRESS_EVENT: &str = "deepwork:update-progress";

/// Downloads `url` and returns the path of the file that was written.
///
/// Blocking on purpose: this is what [`update_download`] asks a worker thread to
/// do, so the window keeps painting while a few megabytes arrive.
pub fn download(app: &AppHandle, url: &str, file_name: &str, total: u64) -> Result<String, String> {
    if !is_allowed_url(url) {
        return Err(format!("Refusing to download an update from {url}"));
    }

    let dir = download_dir()?;
    let path = target_path(&dir, file_name)?;
    // A retry must not be mistaken for progress: the count starts at zero.
    let _ = std::fs::remove_file(&path);

    let mut child = downloader(url, &path)
        .spawn()
        .map_err(|err| format!("Cannot start the download: {err}"))?;

    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(status)) => {
                let _ = std::fs::remove_file(&path);
                return Err(format!("The download failed ({}).", describe_exit(&status)));
            }
            Ok(None) => {
                report(app, &path, total);
                std::thread::sleep(PROGRESS_STEP);
            }
            Err(err) => return Err(format!("The download stopped unexpectedly: {err}")),
        }
    }

    let written = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
    if written == 0 {
        let _ = std::fs::remove_file(&path);
        return Err("The download was empty.".to_string());
    }
    report(app, &path, written.max(total));

    let path = path.to_string_lossy().into_owned();
    log::info!(target: logging::SYSTEM, "update: downloaded {url} to {path} ({written} bytes)");
    Ok(path)
}

/// Starts the installer `path` points at and says what happens next.
///
/// The file has to be the one [`download`] wrote: a path outside the update
/// folder is refused, so nothing else on the machine can be talked into running
/// through this command. It also has to be a file this platform can actually
/// start, so a release that ships nothing but a portable archive is reported as
/// that rather than as a broken app.
pub fn install(app: &AppHandle, path: &str) -> Result<String, String> {
    let installer = verify_installer(&download_dir()?, Path::new(path))?;
    let name = installer
        .file_name()
        .map(|file| file.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());

    ensure_runnable(&installer, &name)?;

    let note = platform::start(&installer, name)?;
    log::info!(target: logging::SYSTEM, "update: started {path} — {note}");

    // On Windows the installer rewrites files inside the install directory, so
    // DeepWork has to be gone by the time it gets there. The delay is for the
    // user: the window stays long enough to read what is happening.
    #[cfg(windows)]
    {
        let handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(QUIT_BEHIND_INSTALLER_MS));
            log::info!(target: logging::SYSTEM, "update: closing so the installer can replace files");
            handle.exit(0);
        });
    }
    #[cfg(not(windows))]
    let _ = app;

    Ok(note)
}

/// True when `url` is an `https` link to the project's own releases.
///
/// Only the origin is judged: the path is the release's own business, and any
/// file attached to it is as trustworthy as the release the user was told about.
pub fn is_allowed_url(url: &str) -> bool {
    let trimmed = url.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_control) {
        return false;
    }

    let Some(rest) = trimmed.strip_prefix("https://") else {
        return false;
    };
    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        // A URL with credentials (`https://user@github.com/…`) is not one this
        // app builds, and the host would be misread, so it is refused.
        .to_ascii_lowercase();

    ALLOWED_HOSTS.contains(&host.as_str())
}

/// Where a downloaded update waits between the download and the install.
///
/// The system temp directory rather than the user's Downloads folder: the file
/// is an installer, not something to keep, and a restart of the machine may
/// clear it without costing the user anything.
pub fn download_dir() -> Result<PathBuf, String> {
    Ok(std::env::temp_dir().join("deepwork-update"))
}

/// The path `file_name` will be written to inside `dir`.
///
/// The name is sanitised exactly like an export's (`downloads.rs`), so it can
/// never climb out of the folder; the folder itself is created here.
fn target_path(dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|err| format!("Cannot open the update folder: {err}"))?;
    Ok(dir.join(downloads::sanitize_file_name(file_name)))
}

/// Checks that `path` is a real file inside `dir` and returns its full path.
fn verify_installer(dir: &Path, path: &Path) -> Result<PathBuf, String> {
    let resolved = path
        .canonicalize()
        .map_err(|_| "The downloaded installer is missing.".to_string())?;
    let folder = dir
        .canonicalize()
        .map_err(|_| "The update folder is missing.".to_string())?;

    if resolved.parent() != Some(folder.as_path()) || !resolved.is_file() {
        return Err("Refusing to run a file outside the update folder.".to_string());
    }
    Ok(resolved)
}

/// Refuses a file this platform cannot run as an installer, before trying.
///
/// The check exists because of what happens without it. A release whose Windows
/// build is a portable `deepwork-windows-x64.zip` used to be handed straight to
/// `CreateProcess`, which answers `os error 193` — "not a valid Win32
/// application" — and the user reads that as a broken app rather than as a
/// release that simply has no setup in it. The front end already declines to
/// offer such a file; this is the half that cannot be skipped by a stale window.
fn ensure_runnable(installer: &Path, name: &str) -> Result<(), String> {
    let extension = installer
        .extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    if RUNNABLE_EXTENSIONS.contains(&extension.as_str()) {
        return Ok(());
    }

    log::warn!(
        target: logging::SYSTEM,
        "update: refused to start {name} — {extension:?} is not an installer on this platform"
    );
    Err(format!(
        "{name} is a portable build, not an installer, so DeepWork cannot install it for you. \
         Download it from the release page and unpack it."
    ))
}

/// The extensions this platform's installer can be started from.
///
/// A portable archive is deliberately absent: it is a copy to unpack, not
/// something the OS can run in place of the app it is replacing.
#[cfg(windows)]
const RUNNABLE_EXTENSIONS: [&str; 2] = ["exe", "msi"];

#[cfg(target_os = "macos")]
const RUNNABLE_EXTENSIONS: [&str; 2] = ["dmg", "pkg"];

#[cfg(all(unix, not(target_os = "macos")))]
const RUNNABLE_EXTENSIONS: [&str; 3] = ["deb", "rpm", "appimage"];

/// The command that fetches `url` into `path`.
fn downloader(url: &str, path: &Path) -> Command {
    let mut command = Command::new("curl");
    command
        .arg("--location")
        .arg("--fail")
        .arg("--silent")
        .arg("--show-error")
        .args(["--connect-timeout", "20"])
        .arg("--output")
        .arg(path)
        .arg(url);
    quiet(&mut command);
    command
}

/// Reports how much of the file has been written, if there is anything to say.
fn report(app: &AppHandle, path: &Path, total: u64) {
    let Some(written) = std::fs::metadata(path).map(|meta| meta.len()).ok() else {
        return;
    };
    let _ = app.emit(PROGRESS_EVENT, (written, total));
}

/// One word for how a downloader exited, for a message the user can act on.
fn describe_exit(status: &std::process::ExitStatus) -> String {
    match status.code() {
        Some(6) => "the release file could not be found".to_string(),
        Some(22) => "the server refused the download".to_string(),
        Some(28) => "it took too long".to_string(),
        Some(code) => format!("exit code {code}"),
        None => "it was stopped".to_string(),
    }
}

/// Keeps a console window from flashing behind the app on Windows.
fn quiet(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
}

// ─────────────────────────────────────────────────────────────────────────────
// Starting the installer, per platform
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod platform {
    use super::*;

    /// Runs the NSIS setup the release ships.
    pub(super) fn start(installer: &Path, name: String) -> Result<String, String> {
        let mut command = Command::new(installer);
        quiet(&mut command);
        command
            .spawn()
            .map_err(|err| format!("Cannot start {name}: {err}"))?;
        Ok(format!(
            "{name} is installing this update. DeepWork will close now and can be opened again when it finishes."
        ))
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;

    /// Opens the disk image, which is as far as an installer can go without the
    /// user choosing to replace the copy in Applications.
    pub(super) fn start(installer: &Path, name: String) -> Result<String, String> {
        Command::new("open")
            .arg(installer)
            .spawn()
            .map_err(|err| format!("Cannot open {name}: {err}"))?;
        Ok("{name} is open. Drag DeepWork into Applications, then open it again.".to_string())
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    /// Starts a package with the desktop's own installer, or an AppImage as an
    /// app — the one it replaces is the file the user chose to run.
    pub(super) fn start(installer: &Path, name: String) -> Result<String, String> {
        let lower = name.to_ascii_lowercase();

        if lower.ends_with(".appimage") {
            let mut permissions = std::fs::metadata(installer)
                .map_err(|err| format!("Cannot read {name}: {err}"))?
                .permissions();
            permissions.set_mode(0o755);
            std::fs::set_permissions(installer, permissions)
                .map_err(|err| format!("Cannot make {name} runnable: {err}"))?;

            // The new copy starts after this one has gone, otherwise the
            // single-instance guard would hand it straight back to this window.
            Command::new("sh")
                .args(["-c", "sleep 2; exec \"$1\"", "deepwork-update"])
                .arg(installer)
                .spawn()
                .map_err(|err| format!("Cannot start {name}: {err}"))?;
            return Ok(format!(
                "{name} was made runnable and is starting. DeepWork will close first; the new copy opens by itself."
            ));
        }

        Command::new("xdg-open")
            .arg(installer)
            .spawn()
            .map_err(|err| format!("Cannot open {name}: {err}"))?;
        Ok(format!(
            "Your software installer is opening {name}. Follow it through, then open DeepWork again."
        ))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands exposed to the Angular layer
// ─────────────────────────────────────────────────────────────────────────────

/// Fetches this platform's installer and returns where it was written.
#[tauri::command]
pub async fn update_download(
    app: AppHandle,
    url: String,
    file_name: String,
    expected_bytes: u64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || download(&app, &url, &file_name, expected_bytes))
        .await
        .map_err(|err| format!("The update download stopped unexpectedly: {err}"))?
}

/// Starts the installer that [`update_download`] wrote.
#[tauri::command]
pub fn update_install(app: AppHandle, path: String) -> Result<String, String> {
    install(&app, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deepwork-updates-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn only_the_projects_own_https_releases_are_downloadable() {
        assert!(is_allowed_url(
            "https://github.com/malikrajat/deepwork/releases/download/v2.0.0/DeepWork_2.0.0_x64-setup.exe"
        ));
        assert!(is_allowed_url(
            "https://GitHub.com/malikrajat/deepwork/releases"
        ));

        for refused in [
            "",
            "http://github.com/malikrajat/deepwork/releases",
            "https://example.com/DeepWork.exe",
            "https://github.com.evil.test/DeepWork.exe",
            "file:///C:/Windows/System32/calc.exe",
            "https://user@github.com/DeepWork.exe",
            "https://github.com/malikrajat/deepwork\n/extra",
        ] {
            assert!(!is_allowed_url(refused), "{refused} should be refused");
        }
    }

    #[test]
    fn the_download_folder_lives_under_the_temp_directory() {
        let dir = download_dir().expect("update folder");
        assert!(dir.starts_with(std::env::temp_dir()));
        assert!(dir.ends_with("deepwork-update"));
    }

    #[test]
    fn the_file_name_can_never_escape_the_update_folder() {
        let dir = scratch_dir("names");
        let path = target_path(&dir, "../../Windows/System32/evil.exe").expect("path");
        assert_eq!(path.parent(), Some(dir.as_path()));

        let name = path.file_name().unwrap().to_string_lossy();
        assert!(!name.contains('/'), "{name} still has a separator");
        assert!(!name.contains('\\'), "{name} still has a separator");
        assert!(!name.starts_with('.'), "{name} can still climb a level");
    }

    #[test]
    fn a_missing_installer_is_reported_rather_than_run() {
        let dir = scratch_dir("missing");
        let err = verify_installer(&dir, &dir.join("DeepWork_2.0.0_x64-setup.exe"))
            .expect_err("a file that was never downloaded");
        assert!(err.contains("missing"), "{err}");
    }

    #[test]
    fn only_a_file_the_app_downloaded_is_started() {
        let dir = scratch_dir("inside");
        let outside = scratch_dir("outside");

        let inside = dir.join("DeepWork_2.0.0_x64-setup.exe");
        std::fs::write(&inside, b"installer").unwrap();

        let foreign = outside.join("DeepWork_2.0.0_x64-setup.exe");
        std::fs::write(&foreign, b"installer").unwrap();

        assert!(verify_installer(&dir, &inside).is_ok());
        let err = verify_installer(&dir, &foreign).expect_err("a file from elsewhere");
        assert!(err.contains("outside"), "{err}");
    }

    #[test]
    fn a_folder_is_never_treated_as_an_installer() {
        let dir = scratch_dir("folder");
        let folder = dir.join("update");
        std::fs::create_dir_all(&folder).unwrap();

        let err = verify_installer(&dir, &folder).expect_err("a directory");
        assert!(err.contains("outside"), "{err}");
    }

    #[test]
    fn a_real_installer_for_this_platform_is_runnable() {
        #[cfg(windows)]
        let names = ["DeepWork_2.0.18_x64-setup.exe", "DeepWork_2.0.18_x64.msi"];
        #[cfg(target_os = "macos")]
        let names = ["DeepWork_2.0.18_aarch64.dmg"];
        #[cfg(all(unix, not(target_os = "macos")))]
        let names = ["DeepWork_2.0.18_amd64.deb", "DeepWork_2.0.18_x64.AppImage"];

        for name in names {
            assert!(ensure_runnable(Path::new(name), name).is_ok(), "{name}");
        }
    }

    #[test]
    fn a_portable_archive_is_refused_rather_than_started() {
        // The one that produced "os error 193" on Windows: a `.zip` handed to
        // the OS as an executable. The message has to name the file and say
        // what to do instead.
        let name = "deepwork-windows-x64.zip";
        let err = ensure_runnable(Path::new(name), name).expect_err("a portable archive");

        assert!(err.contains(name), "{err}");
        assert!(err.contains("release page"), "{err}");
    }

    #[test]
    fn an_installer_for_another_platform_is_refused() {
        #[cfg(windows)]
        let foreign = "DeepWork_2.0.18_x64.dmg";
        #[cfg(target_os = "macos")]
        let foreign = "DeepWork_2.0.18_x64-setup.exe";
        #[cfg(all(unix, not(target_os = "macos")))]
        let foreign = "DeepWork_2.0.18_x64-setup.exe";

        assert!(ensure_runnable(Path::new(foreign), foreign).is_err());
    }

    #[test]
    fn a_file_with_no_extension_is_refused() {
        assert!(
            ensure_runnable(Path::new("deepwork-mac-portable"), "deepwork-mac-portable").is_err()
        );
    }
}
