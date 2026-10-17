//! What the app can learn about the desktop it is asking a favour of.
//!
//! Two questions live here, and both exist so the app can be quieter than it
//! would otherwise be:
//!
//! - **Is DeepWork already pinned to the taskbar?** The app cannot pin itself —
//!   Windows reserves that for a shortcut Windows itself creates, and the
//!   programmatic route that used to be attempted needed a feature token no
//!   ordinary build has (see the 2.0.22 changelog). What it *can* do is look at
//!   the folder Windows keeps pinned shortcuts in, which is enough to stop
//!   reminding someone who has already done it, and to keep reminding someone
//!   who has not.
//! - **Is now a moment when a notification is welcome?** Windows answers that
//!   itself through `SHQueryUserNotificationState`, and the answer covers
//!   Focus Assist's quiet hours, a fullscreen game, presentation mode and a
//!   locked screen. Asking the operating system is the only way to respect
//!   focus mode rather than fight it: the app has no business guessing.
//!
//! Both answers are advisory. A folder that cannot be read means "not pinned"
//! (the reminder is the harmless mistake there), and a desktop that cannot
//! answer the quiet-state question means "normal", because holding every
//! reminder forever on an unanswerable question is the worse failure.

use serde::Serialize;

/// Whether DeepWork is on the taskbar's pinned list.
#[derive(Serialize, Clone, Debug)]
pub struct TaskbarPinState {
    /// True when a pinned shortcut for DeepWork was found.
    pub pinned: bool,
    /// False on a platform where pinning is not a thing the app can read, so
    /// the frontend does not offer a reminder it could never retire.
    pub supported: bool,
}

/// What the desktop says about interrupting the user right now.
///
/// `normal` and `quiet` are the two the frontend acts on. `busy`, `away` and
/// `unknown` are reported rather than folded into one of them: a fullscreen
/// game and a locked screen are different situations from quiet hours, and
/// whichever policy the app settles on, it should be able to tell them apart in
/// a log line.
#[derive(Serialize, Clone, Debug)]
pub struct QuietState {
    /// One of `normal`, `quiet`, `busy`, `away`, `unknown`.
    pub state: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
pub fn taskbar_pin_state() -> TaskbarPinState {
    use std::path::PathBuf;

    /// Where Windows keeps the shortcuts that are pinned to the taskbar.
    ///
    /// Per user, because pinning is per user: someone else's pinned DeepWork on
    /// a shared machine says nothing about this account's taskbar.
    const PINNED_FOLDER: &str = r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar";

    let Some(app_data) = std::env::var_os("APPDATA") else {
        return TaskbarPinState {
            pinned: false,
            supported: true,
        };
    };
    let folder = PathBuf::from(app_data).join(PINNED_FOLDER);
    let exe_name = std::env::current_exe().ok().and_then(|exe| {
        exe.file_name()
            .map(|name| name.to_string_lossy().to_lowercase())
    });

    let pinned = std::fs::read_dir(&folder)
        .map(|entries| {
            entries.flatten().any(|entry| {
                let path = entry.path();
                shortcut_matches(&path, exe_name.as_deref())
            })
        })
        .unwrap_or(false);

    TaskbarPinState {
        pinned,
        supported: true,
    }
}

/// Whether one file in the pinned folder is DeepWork's shortcut.
///
/// Two tests, either of which is enough, because both are cheap and a false
/// negative costs the user one unnecessary reminder while a false positive
/// silences a reminder they still needed:
///
/// - the shortcut's own name, which is what "Pin to taskbar" gives it by
///   default (the app is called DeepWork, so the file is `DeepWork.lnk`);
/// - the shortcut's bytes, searched for the executable's file name and for the
///   product name in both the plain and the UTF-16 form a `.lnk` stores a path
///   in. A shortcut that was renamed by hand still carries its target.
#[cfg(windows)]
fn shortcut_matches(path: &std::path::Path, exe_name: Option<&str>) -> bool {
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("lnk"))
    {
        return false;
    }

    if let Some(stem) = path.file_stem() {
        let stem = stem.to_string_lossy().to_lowercase();
        if stem.contains("deepwork") || stem.contains("deep work") {
            return true;
        }
    }

    let needles = ["deepwork", exe_name.unwrap_or("")];
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    let utf16 = utf16_lowercase(&bytes);
    let ascii = String::from_utf8_lossy(&bytes).to_lowercase();
    needles
        .iter()
        .filter(|needle| !needle.is_empty())
        .any(|needle| ascii.contains(needle) || utf16.contains(needle))
}

/// The bytes read as UTF-16LE and lowercased, so a path stored as wide text can
/// be found for what it says.
///
/// A `.lnk` is a binary format and this deliberately does not parse it: a path
/// in it is either a run of wide characters or a run of bytes, and both are
/// found by treating the file as text of each kind and looking. Characters
/// outside ASCII keep their code unit, which is enough for a name search.
#[cfg(windows)]
fn utf16_lowercase(bytes: &[u8]) -> String {
    let units = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .map(|unit| {
            // `u16` has no ASCII helpers here, so the one range that matters is
            // spelled out: A–Z become their lowercase forms and everything else
            // is left as it was.
            if (u16::from(b'A')..=u16::from(b'Z')).contains(&unit) {
                unit + 32
            } else {
                unit
            }
        });
    String::from_utf16_lossy(&units.collect::<Vec<_>>())
}

#[cfg(windows)]
pub fn quiet_state() -> QuietState {
    use windows_sys::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_ACCEPTS_NOTIFICATIONS, QUNS_APP, QUNS_BUSY,
        QUNS_NOT_PRESENT, QUNS_PRESENTATION_MODE, QUNS_QUIET_TIME, QUNS_RUNNING_D3D_FULL_SCREEN,
    };

    let mut raw = 0;
    // SAFETY: the call only writes the state into `raw`, which outlives it.
    let result = unsafe { SHQueryUserNotificationState(&mut raw) };
    if result < 0 {
        return QuietState {
            state: "unknown".to_string(),
        };
    }

    let state = match raw {
        QUNS_ACCEPTS_NOTIFICATIONS => "normal",
        QUNS_QUIET_TIME => "quiet",
        // A fullscreen game, a presentation, or a Store app owning the screen:
        // windowed notifications have nowhere to land, so the app treats all
        // three as "do not interrupt with a card".
        QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE | QUNS_APP => "busy",
        QUNS_NOT_PRESENT => "away",
        _ => "unknown",
    };

    QuietState {
        state: state.to_string(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Everywhere else
// ─────────────────────────────────────────────────────────────────────────────

/// Pinning to a taskbar is a Windows arrangement; the other desktops each have
/// their own idea of it and none of them is a folder of shortcuts this app can
/// read. Reporting it as unsupported is what stops the reminder from existing
/// where the answer could never become yes.
#[cfg(not(windows))]
pub fn taskbar_pin_state() -> TaskbarPinState {
    TaskbarPinState {
        pinned: true,
        supported: false,
    }
}

/// Nothing outside Windows has a documented, per-user "do not disturb" state
/// this app can ask for, so the honest answer is the one that does not silence
/// every reminder forever: the user's own settings decide.
#[cfg(not(windows))]
pub fn quiet_state() -> QuietState {
    QuietState {
        state: "normal".to_string(),
    }
}
