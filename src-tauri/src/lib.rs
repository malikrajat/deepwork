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

/// True while the window is showing as the mini widget.
///
/// A widget is on top by nature, and that has to hold against *every* path that
/// could take it off: the Settings switch, the tray's own check box, and the
/// stored preference being re-applied as the window changes shape. One flag is
/// what turns "the widget is put on top when it opens" into a guarantee — see
/// `apply_always_on_top`.
struct WidgetMode(AtomicBool);

/// Puts the window above the others — or not, except that the widget is never
/// allowed to be anything but on top.
///
/// The main window's always-on-top is the user's to choose and is remembered
/// separately, so switching it off while the widget is up means "off when the
/// window comes back" rather than "off now": the widget is the one shape of this
/// app that has nowhere else to be.
///
/// The desktop layer's own `set_always_on_top` is deliberately not what this
/// calls — see [`set_topmost_native`] for why the flag has to be written
/// straight to the OS, and [`TopmostKeeper`] for what keeps it written.
fn apply_always_on_top(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    let widget = window
        .try_state::<WidgetMode>()
        .map(|mode| mode.0.load(Ordering::Relaxed))
        .unwrap_or(false);
    let wanted = enabled || widget;

    set_topmost_native(window, wanted)?;

    // The keeper is what makes the answer to "always on top" survive the rest of
    // the session rather than only the next few seconds: it re-asserts the flag
    // whenever the window is found without it.
    if let Some(keeper) = window.try_state::<TopmostKeeper>() {
        keeper.set_desired(wanted);
    }

    Ok(())
}

/// Writes the topmost flag straight to the operating system.
///
/// The desktop layer keeps the flag in a struct of its own and only calls
/// `SetWindowPos` when that struct *changes* — which makes it the wrong tool for
/// this job twice over. It does nothing at all when its cached idea already
/// matches the request, so the one call that would repair a window Windows has
/// dropped from the top of the z-order is the one call it skips; and it reports
/// its cache back when asked, so "it is on top" has been an answer about a
/// variable rather than about a window.
///
/// `SWP_NOACTIVATE` because a window asking to stay visible above the others is
/// not asking to take the keyboard with it, and no move or resize so a maximised
/// window is left maximised.
#[cfg(windows)]
fn set_topmost_native(window: &WebviewWindow, wanted: bool) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };

    let handle = window
        .hwnd()
        .map_err(|err| format!("Cannot find the window to keep on top: {err}"))?;

    let after = if wanted { HWND_TOPMOST } else { HWND_NOTOPMOST };
    let placed = unsafe {
        SetWindowPos(
            handle.0,
            after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
    };

    if placed == 0 {
        return Err("The window would not change its place in the stack.".to_string());
    }
    Ok(())
}

/// Everywhere else the desktop layer is the whole story, and the platforms where
/// it is not honoured say so themselves (`always_on_top_supported`).
#[cfg(not(windows))]
fn set_topmost_native(window: &WebviewWindow, wanted: bool) -> Result<(), String> {
    window
        .set_always_on_top(wanted)
        .map_err(|err| format!("Cannot change always-on-top: {err}"))
}

/// True when the window is, right now, above the windows that are not on top.
///
/// Asked of the window rather than of the flag that was requested — the two
/// disagreeing is the bug this whole section exists for.
#[cfg(windows)]
fn is_topmost_now(window: &WebviewWindow) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TOPMOST,
    };

    let Ok(handle) = window.hwnd() else {
        return false;
    };
    // The handle is already the pointer `GetWindowLongPtrW` takes.
    let style = unsafe { GetWindowLongPtrW(handle.0, GWL_EXSTYLE) } as u32;
    style & WS_EX_TOPMOST != 0
}

/// The other platforms report this themselves.
#[cfg(not(windows))]
fn is_topmost_now(window: &WebviewWindow) -> bool {
    window.is_always_on_top().unwrap_or(false)
}

/// How often the window's place in the stack is checked while it is meant to be
/// on top.
///
/// Four times a minute, not sixty: the flag is only ever lost to a rare event —
/// another application taking the top spot, a display change, the window being
/// hidden and shown — and a check that finds it still there costs one read of a
/// window style. What it buys is an answer that converges instead of a setting
/// that has to be flipped off and on again to be believed.
const TOPMOST_CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(15);

/// Keeps the window where the user put it: above the others, for as long as that
/// is what they asked for.
///
/// The flag is applied when the switch is flipped and when the widget opens, and
/// nothing in this app ever lowers it — which is why it was so hard to see it go:
/// the request was right, the call succeeded, and the window still ended up
/// behind. What is left is everything outside the app, and a topmost flag is not
/// a contract: Windows drops it when another window claims the top spot, when the
/// window is hidden and shown across a display change, and when a fullscreen
/// application takes the screen. A one-shot call cannot answer any of those.
///
/// So the desired state is remembered here and re-applied by a watcher that only
/// speaks when it finds the window without it — a repair, not a poll. Every repair
/// is logged, because "it went behind again" and "the repair ran" have to be
/// tellable apart in the file the user can hand over.
struct TopmostKeeper {
    /// The window being kept on top. Held here so the watcher has it without a
    /// lookup, and manages its own reference rather than making the keeper's
    /// ownership of the window a second fact to keep in step.
    window: WebviewWindow,
    /// Whether the window *should* be on top, as the user and the widget decide it.
    desired: AtomicBool,
    /// Set when the app is on its way out, to end the watcher rather than leave
    /// it running past the window it is holding.
    stopping: AtomicBool,
    /// Held while waiting, so a change of mind wakes the watcher instead of
    /// leaving it to notice up to fifteen seconds later.
    wake: (std::sync::Mutex<()>, std::sync::Condvar),
}

impl TopmostKeeper {
    fn new(window: WebviewWindow) -> Self {
        Self {
            window,
            desired: AtomicBool::new(false),
            stopping: AtomicBool::new(false),
            wake: (std::sync::Mutex::new(()), std::sync::Condvar::new()),
        }
    }

    fn set_desired(&self, wanted: bool) {
        let changed = self.desired.swap(wanted, Ordering::Relaxed) != wanted;
        if changed {
            // A state that was just applied does not need to wait out the
            // interval to be noticed: this is what makes leaving and re-entering
            // the widget immediate.
            self.wake.1.notify_all();
        }
    }

    fn is_desired(&self) -> bool {
        self.desired.load(Ordering::Relaxed)
    }

    /// Ends the watcher, for a window that is closing.
    fn stop(&self) {
        self.stopping.store(true, Ordering::Relaxed);
        self.wake.1.notify_all();
    }

    /// Watches the window from its own thread, re-asserting the flag as needed.
    ///
    /// A thread of its own rather than the async runtime: it sleeps for fifteen
    /// seconds at a time, and a blocking sleep inside an executor is a thread
    /// taken from whatever else needs one. It ends with the app — `stop` is
    /// called as the window closes — which is what keeps it from outliving the
    /// window it holds.
    fn watch(self: std::sync::Arc<Self>) {
        std::thread::spawn(move || loop {
            {
                // Parking on the mutex makes the wait interruptible: a change of
                // mind, or the app closing, wakes it at once.
                let guard = self
                    .wake
                    .0
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = self.wake.1.wait_timeout(guard, TOPMOST_CHECK_INTERVAL);
            }

            if self.stopping.load(Ordering::Relaxed) {
                break;
            }
            if !self.is_desired() || is_topmost_now(&self.window) {
                continue;
            }
            match set_topmost_native(&self.window, true) {
                Ok(()) => log::warn!(
                    target: logging::SYSTEM,
                    "always on top: the window had fallen behind; put back on top"
                ),
                Err(err) => log::warn!(
                    target: logging::SYSTEM,
                    "always on top: could not put the window back on top: {err}"
                ),
            }
        });
    }
}

/// Whether this desktop lets an application put its own window above the rest.
///
/// Wayland does not. There is no protocol for a client to raise itself — the
/// compositor decides the stacking order — so the call succeeds and nothing
/// happens, which is the worst of both worlds. `tao` records the same limitation
/// (tauri-apps/tao#1134) and it applies to every Wayland session, not to a few:
/// the answer is to say so rather than to leave a switch that appears to work.
///
/// X11 and XWayland are unaffected, and an empty `WAYLAND_DISPLAY` is the
/// documented way to ask for them, so an empty value counts as X11 here.
fn always_on_top_supported() -> bool {
    // Written as a `let` in both arms rather than as two blocks: a `cfg`-ed out
    // block in the middle of a body is a trap for the tail expression, and this
    // reads the same on every platform.
    #[cfg(target_os = "linux")]
    let unsupported = std::env::var_os("WAYLAND_DISPLAY").is_some_and(|value| !value.is_empty());

    #[cfg(not(target_os = "linux"))]
    let unsupported = false;

    !unsupported
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
        DWMWA_COLOR_DEFAULT, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DEFAULT,
        DWMWCP_ROUND,
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
    apply_always_on_top(&window, enabled)?;
    sync_tray_prefs(&app, Some(&window));
    log::info!(target: logging::SYSTEM, "always on top turned {enabled}");
    Ok(())
}

/// Whether always-on-top can work at all on this desktop — see
/// `always_on_top_supported`. The frontend asks once, so the switch can be
/// disabled with a reason instead of lying.
#[tauri::command]
fn window_always_on_top_supported() -> bool {
    always_on_top_supported()
}

/// Whether the window is on top right now.
///
/// Answered from the window itself on Windows rather than from the desktop
/// layer's own idea of it — a switch that reports the request rather than the
/// result is how "always on top" stayed on screen while the window went behind
/// everything. See `is_topmost_now`.
#[tauri::command]
fn window_is_always_on_top(window: WebviewWindow) -> bool {
    is_topmost_now(&window)
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

/// Says whether the window is showing as the mini widget, and shapes it as one.
///
/// Called by the frontend as the window becomes the widget and as it turns back
/// into a window (see `UiService`). Two things follow from it, and they are one
/// command because they are one fact: the widget's frame is taken away — its
/// surface fills the window edge to edge, so the frame Windows draws in the
/// system's colour is the one thing that would stand out from it — and the widget
/// is put on top, where nothing else may take it off while it is up.
#[tauri::command]
fn window_set_widget_mode(app: AppHandle, window: WebviewWindow, widget: bool) {
    if let Some(mode) = window.try_state::<WidgetMode>() {
        mode.0.store(widget, Ordering::Relaxed);
    }
    paint_widget_frame(&window, widget);

    if widget {
        if let Err(err) = apply_always_on_top(&window, true) {
            log::warn!(target: logging::SYSTEM, "the widget could not be put on top: {err}");
        }
    }

    // The tray's own check box answers for the main window, which the widget is
    // holding on top: it follows the window rather than lagging behind it.
    sync_tray_prefs(&app, Some(&window));
    log::info!(target: logging::SYSTEM, "mini widget {widget}");
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
            window_always_on_top_supported,
            window_set_close_behavior,
            window_set_widget_mode,
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
                    .map(|w| is_topmost_now(&w))
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
            // Whether the window is the widget. Off until the frontend says
            // otherwise, which is when it reshapes the window into one.
            app.manage(WidgetMode(AtomicBool::new(false)));
            // Above the others for as long as the user asks for it — and put
            // back there whenever the OS drops it, which is the half that a
            // single `set_always_on_top` never covered. See `TopmostKeeper`.
            // Managed as the `Arc` so the watcher can hold the same keeper the
            // commands flip.
            let keeper = std::sync::Arc::new(TopmostKeeper::new(
                app.get_webview_window("main")
                    .ok_or_else(|| "the main window is missing".to_string())?,
            ));
            app.manage(std::sync::Arc::clone(&keeper));
            keeper.watch();

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
                                    // Read and written natively, so both the
                                    // question and the answer are about the
                                    // window rather than about a cached flag.
                                    let next = !is_topmost_now(&w);
                                    if apply_always_on_top(&w, next).is_ok() {
                                        // The tick follows the window, not the
                                        // request: while the widget is up,
                                        // asking for "off" leaves it on top on
                                        // purpose, and the menu has to say so.
                                        let real = is_topmost_now(&w);
                                        always_on_top_i.set_checked(real).ok();
                                        emit(if real { "aot:on" } else { "aot:off" });
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
            // The window has gone for good: the watcher holding it stops rather
            // than outliving what it was watching.
            WindowEvent::Destroyed => {
                if let Some(keeper) = window
                    .app_handle()
                    .try_state::<std::sync::Arc<TopmostKeeper>>()
                {
                    keeper.stop();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
