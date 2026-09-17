//! "Start DeepWork when the system starts" support.
//!
//! Implemented natively per platform so the app needs no extra plugin:
//!
//! * **Windows** — `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
//! * **Linux** — `~/.config/autostart/com.deepwork.app.desktop` (XDG autostart)
//! * **macOS** — `~/Library/LaunchAgents/com.deepwork.app.plist` (LaunchAgent)
//!
//! The Windows value name is `DeepWork`, which is the same name Tauri's NSIS
//! uninstaller deletes, so uninstalling always removes the startup entry.
//!
//! Every entry launches the app with [`AUTOSTART_FLAG`] so a login-launched copy
//! can wait quietly in the system tray instead of opening a window.

/// Registry value name / launch-item label. Matches the NSIS `${PRODUCTNAME}`.
pub const APP_LABEL: &str = "DeepWork";

/// Argument telling a login-launched copy to start hidden in the system tray.
pub const AUTOSTART_FLAG: &str = "--autostart";

/// True when this process was started by the OS at login.
pub fn launched_at_login() -> bool {
    std::env::args().skip(1).any(|arg| arg == AUTOSTART_FLAG)
}

/// True when a "start with the system" entry is currently registered.
pub fn is_enabled() -> bool {
    platform::is_enabled()
}

/// Registers or removes the "start with the system" entry.
pub fn set_enabled(enabled: bool) -> Result<(), String> {
    platform::set_enabled(enabled)
}

/// Rewrites the startup entry so it keeps pointing at *this* executable.
///
/// Upgrades can move the binary (a new versioned install directory, a moved
/// `.app`); without this the OS would keep launching a stale path. Doing nothing
/// when the feature is off keeps "off" honest.
pub fn refresh_if_enabled() {
    if is_enabled() {
        if let Err(err) = platform::set_enabled(true) {
            log::warn!("autostart: could not refresh the startup entry: {err}");
        }
    }
}

/// The command line stored in the startup entry, including the tray flag.
#[cfg(any(windows, target_os = "linux", target_os = "macos"))]
fn launch_command() -> Result<String, String> {
    let exe = std::env::current_exe()
        .map_err(|err| format!("Cannot locate the DeepWork executable: {err}"))?;
    Ok(format!("\"{}\" {}", exe.display(), AUTOSTART_FLAG))
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows — per-user Run key
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod platform {
    use super::{launch_command, APP_LABEL};
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

    pub fn is_enabled() -> bool {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(RUN_KEY, KEY_READ)
            .and_then(|key| key.get_value::<String, _>(APP_LABEL))
            .is_ok()
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(RUN_KEY)
            .map_err(|err| format!("Cannot open the Windows startup registry key: {err}"))?;

        if enabled {
            let command = launch_command()?;
            key.set_value(APP_LABEL, &command)
                .map_err(|err| format!("Cannot write the Windows startup entry: {err}"))
        } else {
            match key.delete_value(APP_LABEL) {
                Ok(()) => Ok(()),
                // Already absent — "off" is satisfied.
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(err) => Err(format!("Cannot remove the Windows startup entry: {err}")),
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Linux — XDG autostart desktop entry
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
mod platform {
    use super::launch_command;
    use std::fs;
    use std::path::PathBuf;

    const FILE_NAME: &str = "com.deepwork.app.desktop";

    fn desktop_path() -> Option<PathBuf> {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
        Some(base.join("autostart").join(FILE_NAME))
    }

    pub fn is_enabled() -> bool {
        desktop_path().is_some_and(|path| path.exists())
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        let path = desktop_path().ok_or("Cannot determine your home folder.")?;

        if !enabled {
            return match fs::remove_file(&path) {
                Ok(()) => Ok(()),
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(err) => Err(format!("Cannot remove the startup entry: {err}")),
            };
        }

        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)
                .map_err(|err| format!("Cannot create {}: {err}", dir.display()))?;
        }

        let command = launch_command()?;
        let body = format!(
            "[Desktop Entry]\n\
             Type=Application\n\
             Version=1.0\n\
             Name=DeepWork\n\
             Comment=Start DeepWork in the system tray\n\
             Exec={command}\n\
             Terminal=false\n\
             StartupNotify=false\n\
             X-GNOME-Autostart-enabled=true\n"
        );

        fs::write(&path, body).map_err(|err| format!("Cannot write {}: {err}", path.display()))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS — per-user LaunchAgent
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod platform {
    use std::fs;
    use std::path::PathBuf;

    const LABEL: &str = "com.deepwork.app";

    fn plist_path() -> Option<PathBuf> {
        let home = std::env::var_os("HOME")?;
        Some(
            PathBuf::from(home)
                .join("Library/LaunchAgents")
                .join(format!("{LABEL}.plist")),
        )
    }

    /// Minimal XML escaping so an unusual install path cannot break the plist.
    fn xml_escape(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    pub fn is_enabled() -> bool {
        plist_path().is_some_and(|path| path.exists())
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        let path = plist_path().ok_or("Cannot determine your home folder.")?;

        if !enabled {
            return match fs::remove_file(&path) {
                Ok(()) => Ok(()),
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(err) => Err(format!("Cannot remove the login item: {err}")),
            };
        }

        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)
                .map_err(|err| format!("Cannot create {}: {err}", dir.display()))?;
        }

        let exe = std::env::current_exe()
            .map_err(|err| format!("Cannot locate the DeepWork executable: {err}"))?;

        let plist = format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
             <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
             <plist version=\"1.0\">\n\
             <dict>\n\
             \x20 <key>Label</key>\n\
             \x20 <string>{label}</string>\n\
             \x20 <key>ProgramArguments</key>\n\
             \x20 <array>\n\
             \x20   <string>{exe}</string>\n\
             \x20   <string>{flag}</string>\n\
             \x20 </array>\n\
             \x20 <key>RunAtLoad</key>\n\
             \x20 <true/>\n\
             \x20 <key>ProcessType</key>\n\
             \x20 <string>Interactive</string>\n\
             </dict>\n\
             </plist>\n",
            label = LABEL,
            exe = xml_escape(&exe.display().to_string()),
            flag = super::AUTOSTART_FLAG,
        );

        fs::write(&path, plist).map_err(|err| format!("Cannot write {}: {err}", path.display()))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Anything else (mobile, other unixes) — the feature is simply unavailable.
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
mod platform {
    pub fn is_enabled() -> bool {
        false
    }

    pub fn set_enabled(_enabled: bool) -> Result<(), String> {
        Err("Starting with the system is not supported on this platform.".to_string())
    }
}
