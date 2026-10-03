//! Opening a link in the user's own browser.
//!
//! A `target="_blank"` link inside the webview does nothing: the runtime denies
//! the new-window request and the click disappears. Every outward link in the
//! app — the developer's website, a release download, an email address — would
//! then be a button that looks alive and is not. So the Angular layer hands the
//! URL to this module, which opens it the way the OS would.
//!
//! No dependency is needed for that: `explorer`, `open` and `xdg-open` are on
//! every desktop already, and they are the same three the log folder uses.

use std::process::Command;

/// Schemes the app is willing to hand to the OS.
///
/// The allowlist is the security boundary: a webview that has been talked into
/// rendering `file://` or `javascript:` must not be able to make the app open
/// something local. `mailto` is the one non-web scheme the About page needs.
const ALLOWED_SCHEMES: [&str; 3] = ["https", "http", "mailto"];

/// Opens `url` in the default browser (or mail client).
pub fn open_url(url: &str) -> Result<(), String> {
    let target = url.trim();

    if !is_openable(target) {
        return Err(format!("Refusing to open {target}"));
    }

    opener(target)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Cannot open {target}: {err}"))
}

/// True when `url` has an allowed scheme and carries no control characters.
fn is_openable(url: &str) -> bool {
    if url.is_empty() || url.chars().any(char::is_control) {
        return false;
    }

    // Scheme before the first colon, with something after it: "https://x",
    // "mailto:someone@example.com". Deliberately does not accept a bare path.
    let Some((scheme, rest)) = url.split_once(':') else {
        return false;
    };

    !rest.is_empty() && ALLOWED_SCHEMES.contains(&scheme.to_ascii_lowercase().as_str())
}

#[cfg(windows)]
fn opener(url: &str) -> Command {
    // `explorer` hands the URL to the shell, which picks the default browser.
    let mut command = Command::new("explorer");
    command.arg(url);
    command
}

#[cfg(target_os = "macos")]
fn opener(url: &str) -> Command {
    let mut command = Command::new("open");
    command.arg(url);
    command
}

#[cfg(all(unix, not(target_os = "macos")))]
fn opener(url: &str) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(url);
    command
}

/// Command exposed to the Angular layer: open one outward link.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open_url(&url).inspect_err(|err| {
        log::warn!(target: crate::logging::SYSTEM, "could not open a link: {err}");
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_schemes_the_about_page_uses_are_allowed() {
        assert!(is_openable("https://rajatmalik.dev/"));
        assert!(is_openable("http://localhost:4999"));
        assert!(is_openable("mailto:mr.rajatmalik@gmail.com"));
        // Case is not a security decision, so it is not treated as one.
        assert!(is_openable("HTTPS://example.com"));
    }

    #[test]
    fn anything_local_or_scripted_is_refused() {
        assert!(!is_openable("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_openable("javascript:alert(1)"));
        assert!(!is_openable("ms-settings:windowsupdate"));
        assert!(!is_openable("C:/Users/Public/secret.txt"));
        assert!(!is_openable("https:"));
        assert!(!is_openable(""));
    }

    #[test]
    fn control_characters_are_refused() {
        // A newline would let one line of text look like two arguments.
        assert!(!is_openable("https://example.com/\nrm -rf /"));
        assert!(!is_openable("https://example.com/\u{0}"));
    }

    #[test]
    fn opening_something_disallowed_reports_why() {
        let error = open_url("file:///etc/passwd").unwrap_err();
        assert!(error.starts_with("Refusing to open"));
    }
}
