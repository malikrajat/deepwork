mod autostart;
mod downloads;
mod logging;
mod opener;
mod updates;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewWindow, WindowEvent, Wry,
};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Checkable tray items that must mirror the app's desktop preferences.
///
/// Both are managed as Tauri state so the `*_set_*` commands can keep the tray
/// menu tick marks in sync when the user flips a switch inside the app.
struct TrayPrefs {
    start_with_system: CheckMenuItem<Wry>,
    always_on_top: CheckMenuItem<Wry>,
}

/// What the window's close button does, as the app's own settings ask for it.
///
/// One atomic flag rather than a database read, because the decision is made
/// inside the window event handler, which cannot wait on anything. The frontend
/// pushes the stored preference here when the settings load and whenever the
/// **Keep running in the tray** switch is flipped.
///
/// The default is *keep running*: a window whose close button quit before the
/// settings had been read would lose the one behaviour the switch exists to
/// offer, and quitting is the one thing that cannot be taken back afterwards.
struct CloseInTray(AtomicBool);

impl CloseInTray {
    fn new() -> Self {
        Self(AtomicBool::new(true))
    }

    fn keep_running(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

/// True when closing the window should leave DeepWork running next to the clock.
///
/// Anything that stops the app remembering its own state falls back to keeping
/// it running, for the reason above.
fn window_keeps_running(window: &tauri::Window) -> bool {
    window
        .try_state::<CloseInTray>()
        .map(|state| state.keep_running())
        .unwrap_or(true)
}

/// Takes the window's own frame away while it is the widget, and hands it back.
///
/// Windows keeps a hairline border around every top-level window — a
/// borderless, transparent one included. It reserves that line as *non-client*
/// area and draws it in the system's colour, so around a 136x76 widget it reads
/// as a white outline the app never drew, on all four sides, with the corners
/// cut away from it.
///
/// Three calls, because none of them is enough on its own:
///
/// - `DwmExtendFrameIntoClientArea` with `-1` on every side pushes the client
///   area over the whole window, which is what removes the 1px band itself. This
///   is the call that matters: the band exists on every Windows version, and no
///   colouring of it makes it go away.
/// - `DWMWA_BORDER_COLOR` = `DWMWA_COLOR_NONE` tells Windows 11 to draw no
///   border at all, which covers the case where the attribute is what the border
///   is waiting for. Windows 10 does not know the attribute and ignores it.
/// - `DWMWA_WINDOW_CORNER_PREFERENCE` = `DWMWCP_ROUND` asks Windows 11 to round
///   the window's own corners, which is what the widget's surface is rounded to
///   match. It matters when the surface does not reach the window's edge — a
///   shadow, a stray pixel of the page behind — and it is free where it does not:
///   Windows 10 ignores it, and the call is logged either way.
///
/// Leaving the widget gives both back: the normal window keeps its ordinary
/// frame and its ordinary square corners, and the widget never draws one.
///
/// Best effort throughout — a frame that cannot be removed is a cosmetic loss,
/// never a reason to leave the widget half-built — but the result is written
/// down, because "the line is still there" is otherwise impossible to tell apart
/// from "the call never took".
#[cfg(windows)]
fn paint_widget_frame(window: &WebviewWindow, widget: bool) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWA_BORDER_COLOR,
        DWMWA_COLOR_DEFAULT, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE,
        DWMWCP_DEFAULT, DWMWCP_ROUND,
    };
    use windows_sys::Win32::UI::Controls::MARGINS;

    let Ok(handle) = window.hwnd() else {
        return;
    };

    let color = if widget {
        DWMWA_COLOR_NONE
    } else {
        DWMWA_COLOR_DEFAULT
    };
    // The widget's surface is a rounded card (see `MiniWidgetComponent`), so the
    // window it sits in is asked for the same shape. The full window goes back to
    // whatever the system prefers — usually round on Windows 11, which is what a
    // decorated app window should be.
    let corners = if widget { DWMWCP_ROUND } else { DWMWCP_DEFAULT };
    let margins = if widget {
        MARGINS {
            cxLeftWidth: -1,
            cxRightWidth: -1,
            cyTopHeight: -1,
            cyBottomHeight: -1,
        }
    } else {
        MARGINS {
            cxLeftWidth: 0,
            cxRightWidth: 0,
            cyTopHeight: 0,
            cyBottomHeight: 0,
        }
    };

    unsafe {
        let border = DwmSetWindowAttribute(
            handle.0,
            DWMWA_BORDER_COLOR as u32,
            &color as *const u32 as *const core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        let frame = DwmExtendFrameIntoClientArea(handle.0, &margins);
        let rounding = DwmSetWindowAttribute(
            handle.0,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            &corners as *const i32 as *const core::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
        log::info!(
            target: logging::SYSTEM,
            "widget frame: widget={widget} border=0x{border:08x} frame=0x{frame:08x} corners=0x{rounding:08x}"
        );
    }
}

/// Nothing to paint where the platform is not drawing a frame around the window.
#[cfg(not(windows))]
fn paint_widget_frame(_window: &WebviewWindow, _widget: bool) {}

/// Restores the main window: un-minimizes, shows, and focuses it.
/// `window.show()` alone does NOT un-minimize on Windows.
fn restore(window: &WebviewWindow) {
    set_webview_memory_target(window, false);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Opens the main window at its normal size without pulling focus.
///
/// Used when the OS started DeepWork at login: the full window is what the user
/// asked for, but it must not steal focus from whatever they are already doing.
fn restore_in_background(window: &WebviewWindow) {
    set_webview_memory_target(window, false);
    let _ = window.unminimize();
    let _ = window.show();
}

/// Tells the webview how much memory it may keep for itself.
///
/// A DeepWork window is a Chromium webview, and Chromium sizes its caches, its
/// decoders and its compositor budget for a page somebody is looking at. Parked
/// in the tray there is no page to look at — the timer is still counting and the
/// reminders are still running, but nothing is on screen — so the target is
/// lowered while the window is hidden and raised again when it comes back. This
/// is what WebView2's own `MemoryUsageTargetLevel` is for; measured on a running
/// window, roughly six sevenths of DeepWork's memory is Chromium rather than the
/// app, and this is the part of it that is idle while hidden.
///
/// Deliberately a *hint*, not a suspension: `TrySuspend` would stop the scripts
/// too, and a timer that pauses when the window is closed to the tray is a timer
/// that has lost the thing it was counting.
///
/// Best effort by construction. A WebView2 runtime older than
/// `ICoreWebView2_19`, a window that has already gone, and a refused call all do
/// nothing — the app never depends on this having worked.
#[cfg(windows)]
fn set_webview_memory_target(window: &WebviewWindow, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows::core::Interface;

    let level = if low {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
    } else {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
    };

    let _ = window.with_webview(move |webview| {
        // Three interfaces deep: the controller the window was built with, the
        // webview it holds, and the version of it that knows this setting.
        let Ok(core) = (unsafe { webview.controller().CoreWebView2() }) else {
            return;
        };
        let Ok(modern) = core.cast::<ICoreWebView2_19>() else {
            return;
        };
        if let Err(err) = unsafe { modern.SetMemoryUsageTargetLevel(level) } {
            log::debug!("webview memory target not applied: {err}");
        }
    });
}

/// Nothing to tell a webview that is not Chromium.
#[cfg(not(windows))]
fn set_webview_memory_target(_window: &WebviewWindow, _low: bool) {}

/// Tick the tray checkboxes to match the real OS/window state.
fn sync_tray_prefs(app: &AppHandle, window: Option<&WebviewWindow>) {
    if let Some(prefs) = app.try_state::<TrayPrefs>() {
        let _ = prefs.start_with_system.set_checked(autostart::is_enabled());
        if let Some(w) = window {
            let on_top = w.is_always_on_top().unwrap_or(false);
            let _ = prefs.always_on_top.set_checked(on_top);
        }
    }
}

/// How long the frontend gets to turn a minimise into the mini widget before the
/// window is parked in the tray instead.
const WIDGET_RESPONSE_GRACE_MS: u64 = 2_500;

/// Asks the frontend to reshape the window into the mini widget.
///
/// Windows reports the minimise button as a 0x0 resize, and the window has to be
/// un-minimised before it can be reshaped, so the work belongs to the Angular
/// layer (`UiService.enterMiniMode`). If that never happens — a webview that has
/// not finished booting, or a reload — the window would be left minimized and
/// invisible, so the old "minimize goes to the tray" behaviour is kept as a
/// fallback: by the time this runs, a handled minimise is no longer minimized.
fn request_mini_widget(window: &tauri::Window) {
    let _ = window.emit("deepwork:minimize", ());

    let fallback = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(WIDGET_RESPONSE_GRACE_MS));
        if fallback.is_minimized().unwrap_or(false) {
            log::warn!("minimize: no mini widget response, hiding to the tray");
            let _ = fallback.hide();
            if let Some(main) = fallback.app_handle().get_webview_window("main") {
                set_webview_memory_target(&main, true);
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands exposed to the Angular layer
// ─────────────────────────────────────────────────────────────────────────────

/// Reads the real "start with the system" state from the OS.
///
/// The OS is the source of truth: the entry can be added or removed outside the
/// app — by hand, or by another tool — so the switch reads the registry rather
/// than remembering what it last wrote.
#[tauri::command]
fn autostart_is_enabled() -> bool {
    autostart::is_enabled()
}

#[tauri::command]
fn autostart_set_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    autostart::set_enabled(enabled).inspect_err(|err| {
        log::error!(target: logging::SYSTEM, "start with system could not be turned {enabled}: {err}");
    })?;
    sync_tray_prefs(&app, app.get_webview_window("main").as_ref());
    log::info!(
        target: logging::SYSTEM,
        "start with system turned {enabled}"
    );
    Ok(())
}

#[tauri::command]
fn window_set_always_on_top(
    app: AppHandle,
    window: WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|err| format!("Cannot change always-on-top: {err}"))?;
    sync_tray_prefs(&app, Some(&window));
    log::info!(target: logging::SYSTEM, "always on top turned {enabled}");
    Ok(())
}

#[tauri::command]
fn window_is_always_on_top(window: WebviewWindow) -> bool {
    window.is_always_on_top().unwrap_or(false)
}

/// Records what the window's close button should do, from Desktop Behaviour.
///
/// `keep_in_tray` is the app's own setting: `true` hides the window and leaves
/// the timer, the water reminder and the tray icon running, `false` lets the
/// close button quit as it always used to. Either way the tray menu's **Exit**
/// quits, so a window that hides is never a window that cannot be closed.
#[tauri::command]
fn window_set_close_behavior(app: AppHandle, keep_in_tray: bool) {
    if let Some(state) = app.try_state::<CloseInTray>() {
        state.0.store(keep_in_tray, Ordering::Relaxed);
    }
    log::info!(
        target: logging::SYSTEM,
        "closing the window keeps DeepWork running: {keep_in_tray}"
    );
}

/// Takes the window's own border away for the mini widget, or hands it back.
///
/// Called by the frontend as the window becomes the widget and as it turns back
/// into a window (see `UiService`). The widget's surface fills its window edge to
/// edge, so the frame Windows draws in the system's colour is the one thing that
/// would still stand out from it.
#[tauri::command]
fn window_paint_widget_frame(window: WebviewWindow, widget: bool) {
    paint_widget_frame(&window, widget);
}

/// Posts the completion alert as a toast the OS re-raises instead of stacking.
///
/// The notification plugin cannot do this on Windows: its desktop path goes
/// through `notify-rust`, whose toast carries no tag or group, so every repeat
/// would be a *new* notification and an alert nobody answers would leave one
/// entry per interval in the Action Center. Windows replaces a toast whose tag it
/// already holds, so posting under a fixed tag is what lets the same alert repeat
/// in the one place the user's attention actually is — the desktop — without
/// piling up while they are away. See `NotificationService.sendNotification`.
///
/// The toast is silent on purpose: the alert's tone is played by the app's own
/// Web Audio (`NotificationService.playSound`), and the OS's default sound on top
/// of it would double every repeat.
///
/// `quote` is a second, smaller text line under the message: a motivational line
/// that arrived with the message is not part of it, and the toast says so in the
/// shape of the notification rather than by punctuating one string.
///
/// `sticky` asks for the one behaviour Windows gives beyond "post and hope": a
/// `reminder` toast stays on screen until the user dismisses or answers it,
/// instead of sliding away after the few seconds a default toast lives. That is
/// what the water reminder asks for — a nudge that disappears while the user is
/// heads-down is one that was never delivered — and the alert does not, because
/// it repeats itself anyway. A shell that will not take the scenario still gets
/// told: the long duration goes next (25 seconds rather than 7), and the ordinary
/// toast after that.
#[cfg(windows)]
#[tauri::command]
fn alert_notify(
    app: AppHandle,
    title: String,
    body: String,
    tag: String,
    quote: Option<String>,
    sticky: Option<bool>,
) -> Result<(), String> {
    let quote = quote.as_deref();
    let sticky = sticky.unwrap_or(false);

    // What is asked for, then what is left if the shell refuses it: the waiting
    // toast, then a long-lived one for a shell that takes the duration but not
    // the scenario, then the ordinary few seconds. Each one is a notification in
    // its own right, so a refusal costs a shorter toast rather than a silence.
    let mut attributes: Vec<&str> = Vec::new();
    if sticky {
        attributes.push(" duration=\"long\" scenario=\"reminder\"");
        attributes.push(" duration=\"long\"");
    }
    attributes.push("");

    let mut last = Err("no toast was posted".to_string());
    for attribute in attributes {
        match show_toast(&app, &toast_xml(&title, &body, quote, attribute), &tag) {
            Ok(()) => return Ok(()),
            Err(err) => last = Err(err),
        }
    }
    last
}

/// Posts one toast document under `tag`, replacing the toast that tag is
/// already holding.
#[cfg(windows)]
fn show_toast(app: &AppHandle, xml: &str, tag: &str) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

    let document = XmlDocument::new().map_err(|err| err.to_string())?;
    document
        .LoadXml(&HSTRING::from(xml))
        .map_err(|err| err.to_string())?;
    let toast =
        ToastNotification::CreateToastNotification(&document).map_err(|err| err.to_string())?;
    let handle = HSTRING::from(tag);
    toast.SetTag(&handle).map_err(|err| err.to_string())?;
    toast.SetGroup(&handle).map_err(|err| err.to_string())?;

    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(alert_app_id(app)))
        .and_then(|notifier| notifier.Show(&toast))
        .map_err(|err| err.to_string())
}

/// The toast's own XML: the title, the message, the quote when there is one, and
/// whatever `attributes` the caller wants on the `<toast>` element itself.
///
/// The quote is a third `<text>` node rather than a sentence appended to the
/// second, and it carries `placement="attribution"` — the toast's own smaller,
/// muted line — so the two read as two things on every Windows version rather
/// than as one run-on message.
#[cfg(windows)]
fn toast_xml(title: &str, body: &str, quote: Option<&str>, attributes: &str) -> String {
    let mut texts = format!(
        "<text>{}</text><text>{}</text>",
        escape_xml(title),
        escape_xml(body)
    );
    if let Some(quote) = quote {
        texts.push_str(&format!(
            "<text placement=\"attribution\">{}</text>",
            escape_xml(quote)
        ));
    }

    format!(
        "<toast{attributes}><visual><binding template=\"ToastGeneric\">{texts}</binding></visual><audio silent=\"true\"/></toast>"
    )
}

/// Everywhere else the shell's own notification plugin already is the platform's
/// notification, and neither macOS nor Linux has a handle that makes a post
/// replace the one before it. The repeats are therefore separate posts there —
/// which is why the body carries the count (see `NotificationService`), so they
/// are at least not identical copies of each other.
///
/// `sticky` and `tag` have nowhere to go here — the plugin takes neither — and
/// the quote becomes a paragraph of its own after a blank line, which is the
/// separation a one-string surface can offer.
#[cfg(not(windows))]
#[tauri::command]
fn alert_notify(
    app: AppHandle,
    title: String,
    body: String,
    _tag: String,
    quote: Option<String>,
    _sticky: Option<bool>,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let body = match quote {
        Some(quote) => format!("{body}\n\n{quote}"),
        None => body,
    };

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|err| err.to_string())
}

/// The app id a toast is posted under.
///
/// An installed DeepWork has a Start-menu shortcut carrying the bundle
/// identifier, and Windows only shows a toast whose app id it can resolve — so
/// that is the id to use. A binary still sitting in `target/` (a `tauri dev`
/// session, or a build run straight from the build folder) has no such shortcut,
/// and would otherwise post into nothing: those builds post as PowerShell, which
/// is the same fallback `notify-rust` takes when it is given no app id at all.
#[cfg(windows)]
fn alert_app_id(app: &AppHandle) -> String {
    /// Windows' own PowerShell AUMID — the one app id every Windows install can
    /// resolve without the app having registered itself.
    const POWERSHELL_APP_ID: &str =
        r"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe";

    let in_build_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_string_lossy().to_lowercase()))
        .is_some_and(|dir| dir.replace('\\', "/").contains("/target/"));
    if in_build_dir {
        POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

/// Escapes the five characters that would otherwise end or corrupt the toast's
/// own XML. The title and body are the app's own lines today; escaping them keeps
/// that from being the reason a completion alert goes missing tomorrow.
#[cfg(windows)]
fn escape_xml(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

/// Writes a generated file (task export, Excel template) into the user's
/// Downloads folder and returns the full path.
///
/// The webview could hand the file to its own download machinery, but then the
/// app has no idea where it went. Saving it here lets the UI answer the obvious
/// follow-up question — "downloaded, but where is it?" — with a real path.
#[tauri::command]
async fn save_download(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let path = downloads::save(&file_name, &bytes).inspect_err(|err| {
        log::error!(target: logging::SYSTEM, "download failed for {file_name}: {err}");
    })?;
    log::info!(target: logging::FLOW, "saved {file_name} to {path}");
    Ok(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Installed before anything else can panic, so a failure during startup
    // still leaves a line in `crash.log`. Until the app knows where that folder
    // is, the line goes to the system temp directory rather than nowhere.
    logging::install_panic_hook();

    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add missing settings columns",
            sql: include_str!("../migrations/002_add_settings_columns.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add task updated_at",
            sql: include_str!("../migrations/003_add_task_updated_at.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add calendar reminder setting",
            sql: include_str!("../migrations/004_add_calendar_reminders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add desktop preference settings",
            sql: include_str!("../migrations/005_add_desktop_prefs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add water intake log and reminder settings",
            sql: include_str!("../migrations/006_add_water_intake.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add water auto-log setting for the mini widget",
            sql: include_str!("../migrations/007_add_water_autolog.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "close the window into the system tray",
            sql: include_str!("../migrations/008_close_to_tray.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "how long the mini widget shakes for",
            sql: include_str!("../migrations/009_alert_shake.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "carry unfinished work forward, or close it",
            sql: include_str!("../migrations/010_carry_forward_tasks.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deepwork.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!(target: logging::SYSTEM, "second launch: showing the running window");
            if let Some(window) = app.get_webview_window("main") {
                restore(&window);
            }
        }))
        .invoke_handler(tauri::generate_handler![
            autostart_is_enabled,
            autostart_set_enabled,
            window_set_always_on_top,
            window_is_always_on_top,
            window_set_close_behavior,
            window_paint_widget_frame,
            alert_notify,
            save_download,
            logging::log_folder,
            logging::open_log_folder,
            logging::log_write,
            opener::open_external_url,
            updates::update_download,
            updates::update_install,
        ])
        .setup(|app| {
            // The log files are opened first: everything that follows — window,
            // tray, startup entry — is then written down, which is what makes
            // a bug report from another machine readable.
            let log_dir = logging::log_dir(app.handle()).map_err(std::io::Error::other)?;
            app.handle().plugin(logging::builder(&log_dir).build())?;
            log::info!(
                target: logging::SYSTEM,
                "DeepWork {} starting · {} {} · logs in {}",
                app.package_info().version,
                std::env::consts::OS,
                std::env::consts::ARCH,
                log_dir.display()
            );

            // Every launch opens the full DeepWork window — including a login
            // launch, which the user asked for so the app is never forgotten.
            // The login copy only differs in *how* it opens: without stealing
            // focus, since the user is usually mid-something right after signing
            // in. The tray icon is present either way.
            if let Some(window) = app.get_webview_window("main") {
                if autostart::launched_at_login() {
                    log::info!(target: logging::SYSTEM, "opened at login, without stealing focus");
                    restore_in_background(&window);
                } else {
                    restore(&window);
                }
            }

            // Keep the stored startup path valid across reinstalls/moves.
            autostart::refresh_if_enabled();

            // System tray
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let mute_i = CheckMenuItem::with_id(app, "mute", "Mute Reminder Sound", true, false, None::<&str>)?;
            let start_with_system_i = CheckMenuItem::with_id(
                app,
                "start_with_system",
                "Start with system",
                true,
                autostart::is_enabled(),
                None::<&str>,
            )?;
            let always_on_top_i = CheckMenuItem::with_id(
                app,
                "always_on_top",
                "Always on top",
                true,
                app.get_webview_window("main")
                    .and_then(|w| w.is_always_on_top().ok())
                    .unwrap_or(false),
                None::<&str>,
            )?;
            let pause_i = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
            let pause5_i = MenuItem::with_id(app, "pause5", "Pause for 5 min", true, None::<&str>)?;
            let pause10_i = MenuItem::with_id(app, "pause10", "Pause for 10 min", true, None::<&str>)?;
            let pause15_i = MenuItem::with_id(app, "pause15", "Pause for 15 min", true, None::<&str>)?;
            let pause30_i = MenuItem::with_id(app, "pause30", "Pause for 30 min", true, None::<&str>)?;
            let exit_i = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

            let pause_menu = Submenu::with_items(app, "Pause Timer", true, &[
                &pause_i,
                &pause5_i,
                &pause10_i,
                &pause15_i,
                &pause30_i,
            ])?;

            let separator1 = PredefinedMenuItem::separator(app)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let separator3 = PredefinedMenuItem::separator(app)?;

            let menu = Menu::new(app)?;
            menu.append(&show_i)?;
            menu.append(&separator1)?;
            menu.append(&mute_i)?;
            menu.append(&pause_menu)?;
            menu.append(&separator2)?;
            menu.append(&start_with_system_i)?;
            menu.append(&always_on_top_i)?;
            menu.append(&separator3)?;
            menu.append(&exit_i)?;

            // Hand the checkable items to the commands so in-app switches and the
            // tray menu can never disagree.
            app.manage(TrayPrefs {
                start_with_system: start_with_system_i.clone(),
                always_on_top: always_on_top_i.clone(),
            });
            // What closing the window does. Managed before the window can be
            // closed, and replaced by the stored preference as soon as the
            // frontend has read it.
            app.manage(CloseInTray::new());

            let _tray = {
                let mut builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .tooltip("DeepWork")
                    .show_menu_on_left_click(false);
                if let Some(icon) = app.default_window_icon() {
                    builder = builder.icon(icon.clone());
                }
                builder
                    .on_menu_event(move |app, event| {
                        let window = app.get_webview_window("main");
                        let emit = |payload: &str| {
                            if let Some(w) = &window {
                                let _ = w.emit("deepwork:tray", payload);
                            }
                        };
                        log::debug!(target: logging::SYSTEM, "tray menu: {}", event.id().as_ref());
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(w) = &window {
                                    restore(w);
                                }
                                // The window may be the mini widget rather than
                                // hidden: "Show" means the full app, so the
                                // frontend is asked to expand it back.
                                emit("show");
                            }
                            "mute" => {
                                let muted = mute_i.is_checked().unwrap_or(false);
                                emit(if muted { "mute:true" } else { "mute:false" });
                            }
                            "start_with_system" => {
                                // Flip the real OS state, then tell the app so it
                                // can persist the preference.
                                let next = !autostart::is_enabled();
                                match autostart::set_enabled(next) {
                                    Ok(()) => {
                                        start_with_system_i.set_checked(next).ok();
                                        emit(if next { "autostart:on" } else { "autostart:off" });
                                    }
                                    Err(err) => {
                                        log::warn!("autostart toggle failed: {err}");
                                        // Put the tick back where reality is.
                                        start_with_system_i
                                            .set_checked(autostart::is_enabled())
                                            .ok();
                                    }
                                }
                            }
                            "always_on_top" => {
                                if let Some(w) = &window {
                                    let next = !w.is_always_on_top().unwrap_or(false);
                                    if w.set_always_on_top(next).is_ok() {
                                        always_on_top_i.set_checked(next).ok();
                                        emit(if next { "aot:on" } else { "aot:off" });
                                    }
                                }
                            }
                            "pause" => emit("pause"),
                            "pause5" => emit("pause:5"),
                            "pause10" => emit("pause:10"),
                            "pause15" => emit("pause:15"),
                            "pause30" => emit("pause:30"),
                            "exit" => {
                                log::info!(target: logging::SYSTEM, "exiting from the tray menu");
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                restore(&window);
                            }
                            let _ = app.emit("deepwork:tray", "show");
                        }
                    })
                    .build(app)?
            };

            log::info!(target: logging::SYSTEM, "system tray ready");
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing the window parks DeepWork next to the clock rather than
            // ending it: the timer, the water reminder and the tray icon all
            // keep working, and the tray menu's **Exit** is what actually quits.
            // Desktop Behaviour can hand the old behaviour back — see
            // `window_set_close_behavior`.
            WindowEvent::CloseRequested { api, .. } => {
                if window_keeps_running(window) {
                    api.prevent_close();
                    let _ = window.hide();
                    // Nothing is on screen while it sits next to the clock, so
                    // the webview stops holding on to caches it cannot use.
                    if let Some(main) = window.app_handle().get_webview_window("main") {
                        set_webview_memory_target(&main, true);
                    }
                    log::info!(target: logging::SYSTEM, "window closed: still running in the tray");
                } else {
                    log::info!(target: logging::SYSTEM, "window closed: quitting");
                    window.app_handle().exit(0);
                }
            }
            // The system minimise button should shrink DeepWork into the mini
            // widget rather than bury the timer in the tray: Windows reports a
            // minimise as a 0x0 resize, which the frontend turns into the widget.
            WindowEvent::Resized(size) => {
                if size.width == 0 && size.height == 0 {
                    log::info!(target: logging::SYSTEM, "window minimised: turning into the mini widget");
                    request_mini_widget(window);
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
