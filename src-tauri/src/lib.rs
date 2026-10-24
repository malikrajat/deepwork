mod autostart;
mod db_guard;
mod db_migrations;
mod downloads;
mod logging;
mod nudges;
mod opener;
mod updates;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewWindow, WindowEvent, Wry,
};

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

/// Shapes the window like the card while it is the widget, and hands it back.
///
/// The widget's surface is a 136x76 rectangle with 18px corners, and the *window*
/// is a rectangle. The pixels between the two — four narrow lunes at the corners,
/// between the card's arc and the window's corner — are the whole of this
/// function's reason to exist: every way of making a transparent window on
/// Windows leaves *something* to fill the client area where the page is empty,
/// and whatever that something is (a frame material, the window's background
/// brush, a border) it appears in those four corners as the one shape a
/// round-cornered card must never wear — a second, larger angle behind it.
///
/// So the corners are not painted, coloured or shadowed: they are **removed**.
/// `SetWindowRgn` cuts the window to a rounded rectangle of the card's own size
/// and radius, which leaves no pixel outside the card for anything to be drawn
/// in. The desktop shows at the corners because there is no corner there.
///
/// The region is inset by one pixel so that the cut falls *inside* the card's
/// antialiased edge: a region is not antialiased, and clipping just inside the
/// card means the hard boundary is made of the card's own opaque pixels rather
/// than of its half-covered ones.
///
/// This is also why nothing here tries to turn the window's own drop shadow or
/// its non-client rendering off any more. Disabling non-client rendering took
/// the DWM composition with it, and the window fell back to its white background
/// — the four corners came back as pure white. A shaped window has nothing for a
/// shadow to frame, and `shadow: false` in `tauri.conf.json` keeps the desktop
/// layer from drawing one around the rectangle before the shape is applied.
///
/// Leaving the widget clears the region, because a region left behind would keep
/// the full window shaped like a widget. Windows owns the region once it has been
/// set; the one created here is only destroyed if setting it failed.
///
/// Best effort throughout — a shape that cannot be applied is a cosmetic loss,
/// never a reason to leave the widget half-built — but the result is written
/// down: "the corners are still there" is otherwise impossible to tell apart from
/// "the call never took".
#[cfg(windows)]
fn paint_widget_frame(window: &WebviewWindow, widget: bool) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_DEFAULT, DWMWA_COLOR_NONE,
    };
    use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};

    /// The card's own radius, in logical pixels — `border-radius: 18px` on
    /// `.mini-widget`, in `MiniWidgetComponent`.
    const CARD_RADIUS: f64 = 18.0;

    let Ok(handle) = window.hwnd() else {
        return;
    };

    let color = if widget {
        DWMWA_COLOR_NONE
    } else {
        DWMWA_COLOR_DEFAULT
    };

    unsafe {
        let border = DwmSetWindowAttribute(
            handle.0,
            DWMWA_BORDER_COLOR as u32,
            &color as *const u32 as *const core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        // The region is in physical pixels and the radius has to be too.
        let rgn = if widget {
            match (window.inner_size(), window.scale_factor()) {
                (Ok(size), Ok(scale)) => {
                    let radius = (CARD_RADIUS * scale).round().max(1.0) as i32;
                    let region = CreateRoundRectRgn(
                        1,
                        1,
                        size.width as i32 - 1,
                        size.height as i32 - 1,
                        radius * 2,
                        radius * 2,
                    );
                    // The desktop layer takes ownership of a region it accepted,
                    // so this is only freed when it did not take it.
                    if SetWindowRgn(handle.0, region, 1) == 0 {
                        let _ = DeleteObject(region);
                        "rejected"
                    } else {
                        "applied"
                    }
                }
                _ => "unmeasurable",
            }
        } else {
            // No region at all: `None` hands the window its rectangle back.
            SetWindowRgn(handle.0, std::ptr::null_mut(), 1);
            "cleared"
        };
        log::info!(
            target: logging::SYSTEM,
            "widget frame: widget={widget} border=0x{border:08x} shape={rgn}"
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
/// surface leaves its own corners empty and keeps a transparent ring around
/// itself for its own shadow, and a frame drawn in the system's colour is the one
/// thing that would stand out around that — and the widget is put on top, where
/// nothing else may take it off while it is up.
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

/// One button a toast offers, as the frontend describes it.
///
/// `id` is what comes back when the button is pressed — the page's own
/// vocabulary (`yes`, `no`, `pin`, `cancel`) rather than the sentence the button
/// happens to wear, so rewording a label cannot break its handler. `label` is
/// what the button says.
#[derive(Clone, serde::Deserialize)]
struct ToastAction {
    id: String,
    label: String,
}

/// What a pressed toast button reports back to the page.
///
/// The tag says which message was answered — the frontend keeps one handler per
/// tag, so a water reminder's **Yes** cannot be mistaken for a pin prompt's.
#[cfg(windows)]
#[derive(Clone, serde::Serialize)]
struct ToastActionEvent {
    tag: String,
    action: String,
}

/// What a toast reports when it goes away without one of its buttons being
/// pressed.
///
/// `reason` separates the cases the page has to treat differently: `user` (the
/// user crossed or swiped it away) and `timeout` (the shell let a toast that was
/// not sticky expire) both mean the question is unanswered and deserves another
/// reminder; `activated` is a click on the toast's body, which brings the app
/// forward but still chooses no answer. `app` — the app taking its own toast back
/// after an answer — is filtered out in the shell, because that is the one
/// dismissal that is *not* the user declining to answer.
#[cfg(windows)]
#[derive(Clone, serde::Serialize)]
struct ToastDismissedEvent {
    tag: String,
    reason: String,
}

/// The toasts the app has posted and not yet replaced, one per tag.
///
/// Windows raises `Activated` on the `ToastNotification` **object**, so a toast
/// dropped the moment `Show` returns is a toast whose buttons cannot do
/// anything: the click reaches the shell, the shell looks for the process that
/// owns the app id, and that process has nothing left to call. Holding one
/// object per tag is the whole of what makes a button work; holding *one* per
/// tag is what keeps an alert that repeats every few minutes from accumulating
/// them, since a post replaces both the toast on screen and the object here.
#[cfg(windows)]
struct ToastHandles(
    std::sync::Mutex<
        std::collections::HashMap<String, windows::UI::Notifications::ToastNotification>,
    >,
);

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
///
/// `actions` are the toast's buttons, in the order they should appear — the
/// page's ids and labels, posted as foreground actions so a press reaches
/// `deepwork:toast-action`. A message that asks a question passes them; one
/// that only tells the user something passes none, and the toast is the plain
/// one it has always been.
#[cfg(windows)]
#[tauri::command]
fn alert_notify(
    app: AppHandle,
    title: String,
    body: String,
    tag: String,
    quote: Option<String>,
    sticky: Option<bool>,
    actions: Option<Vec<ToastAction>>,
) -> Result<(), String> {
    let quote = quote.as_deref();
    let sticky = sticky.unwrap_or(false);
    let actions = actions.unwrap_or_default();

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
        match show_toast(
            &app,
            &toast_xml(&title, &body, quote, attribute, &actions),
            &tag,
            &actions,
        ) {
            Ok(()) => return Ok(()),
            Err(err) => last = Err(err),
        }
    }
    last
}

/// Posts one toast document under `tag`, replacing the toast that tag is
/// already holding.
///
/// `actions` is what decides whether the toast is listened to at all: a plain
/// notification has nothing to report, so it is posted without a handler and
/// without being kept alive. A toast with buttons is kept in `ToastHandles` for
/// the reason described there — the button press is delivered to the object,
/// not to the process.
#[cfg(windows)]
fn show_toast(
    app: &AppHandle,
    xml: &str,
    tag: &str,
    actions: &[ToastAction],
) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{
        ToastActivatedEventArgs, ToastDismissalReason, ToastDismissedEventArgs, ToastNotification,
        ToastNotificationManager,
    };

    let document = XmlDocument::new().map_err(|err| err.to_string())?;
    document
        .LoadXml(&HSTRING::from(xml))
        .map_err(|err| err.to_string())?;
    let toast =
        ToastNotification::CreateToastNotification(&document).map_err(|err| err.to_string())?;
    let handle = HSTRING::from(tag);
    toast.SetTag(&handle).map_err(|err| err.to_string())?;
    toast.SetGroup(&handle).map_err(|err| err.to_string())?;

    if !actions.is_empty() {
        // The press arrives as the action's own `arguments` string — the id the
        // page gave the button — and leaves again as one event. The tag travels
        // with it so the page can tell which of its messages was answered.
        //
        // An activation with no argument is not a button: it is a click on the
        // toast's body. That brings the app forward but answers nothing, so it is
        // reported as a dismissal rather than silently dropped — a question the
        // user clicked past still has to be asked again.
        let app_for_action = app.clone();
        let tag_for_action = tag.to_string();
        toast
            .Activated(&TypedEventHandler::new(
                move |_sender: windows::core::Ref<'_, ToastNotification>,
                      args: windows::core::Ref<'_, windows::core::IInspectable>| {
                    if let Some(args) = args.as_ref() {
                        if let Ok(args) = args.cast::<ToastActivatedEventArgs>() {
                            if let Ok(argument) = args.Arguments() {
                                let argument = argument.to_string();
                                if argument.is_empty() {
                                    let _ = app_for_action.emit(
                                        "deepwork:toast-dismissed",
                                        ToastDismissedEvent {
                                            tag: tag_for_action.clone(),
                                            reason: "activated".to_string(),
                                        },
                                    );
                                } else {
                                    let _ = app_for_action.emit(
                                        "deepwork:toast-action",
                                        ToastActionEvent {
                                            tag: tag_for_action.clone(),
                                            action: argument,
                                        },
                                    );
                                }
                            }
                        }
                    }
                    Ok(())
                },
            ))
            .map_err(|err| err.to_string())?;

        // The other way a toast can end without an answer: the user crosses it,
        // or a shell that ignored `sticky` lets it expire. The app hiding its own
        // toast after an answer reports `ApplicationHidden` and is not passed on.
        let app_for_dismiss = app.clone();
        let tag_for_dismiss = tag.to_string();
        toast
            .Dismissed(&TypedEventHandler::new(
                move |_sender: windows::core::Ref<'_, ToastNotification>,
                      args: windows::core::Ref<'_, ToastDismissedEventArgs>| {
                    let reason = args
                        .as_ref()
                        .and_then(|args| args.Reason().ok())
                        .map(|reason| {
                            if reason == ToastDismissalReason::UserCanceled {
                                "user"
                            } else if reason == ToastDismissalReason::TimedOut {
                                "timeout"
                            } else if reason == ToastDismissalReason::ApplicationHidden {
                                "app"
                            } else {
                                "unknown"
                            }
                        })
                        .unwrap_or("unknown");
                    if reason != "app" {
                        let _ = app_for_dismiss.emit(
                            "deepwork:toast-dismissed",
                            ToastDismissedEvent {
                                tag: tag_for_dismiss.clone(),
                                reason: reason.to_string(),
                            },
                        );
                    }
                    Ok(())
                },
            ))
            .map_err(|err| err.to_string())?;
    }

    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(alert_app_id(app)))
        .and_then(|notifier| notifier.Show(&toast))
        .map_err(|err| err.to_string())?;

    // Kept only after the shell has taken it: a toast that could not be posted
    // is not one whose buttons can be pressed. Whatever object the tag held
    // before is dropped at the same moment — Windows has just replaced that
    // toast, and keeping the old object would let a button on a notification
    // that is no longer on screen answer a question that has been replaced
    // (a water reminder replaced by its own auto-counted version, say).
    if let Some(handles) = app.try_state::<ToastHandles>() {
        if let Ok(mut live) = handles.0.lock() {
            live.remove(tag);
            if !actions.is_empty() {
                live.insert(tag.to_string(), toast);
            }
        }
    }
    Ok(())
}

/// Takes a toast out of the notification centre, by the tag it was posted under.
///
/// This is the other half of `sticky`: a reminder that waits on screen until the
/// user does something has to *stop* waiting once they have done it, or the
/// question answered in the app would stay on the desktop as if it had not been.
/// Windows only, because Windows is the only platform whose toast the app owns
/// after posting it — elsewhere the notification has already been handed to the
/// OS and the app has no handle left to close.
///
/// A tag with no live toast is not an error: the user may have already dismissed
/// it, or a plain notification was posted under it (which is not held, because it
/// has no button to answer).
#[cfg(windows)]
#[tauri::command]
fn toast_dismiss(app: AppHandle, tag: String) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::UI::Notifications::ToastNotificationManager;

    let toast = app
        .try_state::<ToastHandles>()
        .and_then(|handles| handles.0.lock().ok().and_then(|mut live| live.remove(&tag)));
    let Some(toast) = toast else {
        return Ok(());
    };

    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(alert_app_id(&app)))
        .and_then(|notifier| notifier.Hide(&toast))
        .map_err(|err| err.to_string())
}

/// Everywhere else the app does not own the notification once posted.
#[cfg(not(windows))]
#[tauri::command]
fn toast_dismiss(_app: AppHandle, _tag: String) -> Result<(), String> {
    Ok(())
}

/// The toast's own XML: the title, the message, the quote when there is one, and
/// whatever `attributes` the caller wants on the `<toast>` element itself.
///
/// The typography is Windows': the first `<text>` is the title and is drawn bold
/// and larger, the second is the body and is smaller, and
/// `placement="attribution"` is the quieter line at the foot. The toast schema
/// has **no** font family, size, weight or italic attribute — those exist for
/// adaptive tiles, not for a toast's text — so the app's own type (an italic
/// quote, a title two steps above its body) is what the in-app card is for. The
/// system notification gets the same hierarchy the platform allows.
///
/// The quote is a third `<text>` node rather than a sentence appended to the
/// second, and it carries `placement="attribution"` — the toast's own smaller,
/// muted line — so the two read as two things on every Windows version rather
/// than as one run-on message.
/// The buttons, as the `<actions>` block the schema puts between `<visual>` and
/// `<audio>`.
///
/// `activationType="foreground"` on purpose: it is the one activation kind a
/// toast posted without a registered COM activator can actually deliver. The
/// cost is that a press brings the window forward — which is what a pin request
/// needs anyway, since the shell will only draw its consent dialog for an app
/// that is already in front. `background` would send the press back without
/// interrupting the user, but a desktop app can only receive that through an
/// activator registered in the installer, which this app does not have.
///
/// Five is the schema's limit. More than that is not "one more button": the
/// document is rejected, so the extra ones are dropped here rather than taking
/// the notification with them.
#[cfg(windows)]
fn toast_actions_xml(actions: &[ToastAction]) -> String {
    if actions.is_empty() {
        return String::new();
    }

    let mut xml = String::from("<actions>");
    for action in actions.iter().take(5) {
        xml.push_str(&format!(
            "<action content=\"{}\" arguments=\"{}\" activationType=\"foreground\"/>",
            escape_xml(&action.label),
            escape_xml(&action.id)
        ));
    }
    xml.push_str("</actions>");
    xml
}

#[cfg(windows)]
fn toast_xml(
    title: &str,
    body: &str,
    quote: Option<&str>,
    attributes: &str,
    actions: &[ToastAction],
) -> String {
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
        "<toast{attributes}><visual><binding template=\"ToastGeneric\">{texts}</binding></visual>{}<audio silent=\"true\"/></toast>",
        toast_actions_xml(actions)
    )
}

/// Everywhere else the shell's own notification plugin already is the platform's
/// notification, and neither macOS nor Linux has a handle that makes a post
/// replace the one before it. The repeats are therefore separate posts there —
/// which is why the body carries the count (see `NotificationService`), so they
/// are at least not identical copies of each other.
///
/// `sticky`, `tag` and `actions` have nowhere to go here — the plugin takes
/// none of them, and neither macOS's notification framework nor the freedesktop
/// protocol offers a button a desktop app can receive without its own delegate
/// or notification server on the other end. The quote becomes a paragraph of its
/// own after a blank line, which is the separation a one-string surface can
/// offer.
#[cfg(not(windows))]
#[tauri::command]
fn alert_notify(
    app: AppHandle,
    title: String,
    body: String,
    _tag: String,
    quote: Option<String>,
    _sticky: Option<bool>,
    _actions: Option<Vec<ToastAction>>,
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
/// that is the id to use, and it is also where the notification's app name and
/// icon come from. A binary still sitting in `target/` has no shortcut of its
/// own: on a machine where DeepWork *is* installed, it borrows the installed
/// app's identity, so a development build's notifications still say DeepWork and
/// wear the app's icon instead of PowerShell's. Only a build on a machine with no
/// installed copy falls back to PowerShell, because an unresolvable app id posts
/// into nothing.
#[cfg(windows)]
fn alert_app_id(app: &AppHandle) -> String {
    /// Windows' own PowerShell AUMID — the one app id every Windows install can
    /// resolve without the app having registered itself.
    const POWERSHELL_APP_ID: &str =
        r"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe";

    let installed = app_id_is_registered(app);
    let in_build_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_string_lossy().to_lowercase()))
        .is_some_and(|dir| dir.replace('\\', "/").contains("/target/"));

    if in_build_dir && !installed {
        log::warn!(
            target: logging::SYSTEM,
            "notifications will use PowerShell's app id: DeepWork has no installed Start-menu shortcut"
        );
        POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

/// Whether this machine has a Start-menu entry for DeepWork.
///
/// The shortcut is what Windows resolves the bundle identifier against, and its
/// icon is the one the notification's attribution area draws. Its presence is
/// therefore the same question as "would `com.deepwork.app` work here?".
#[cfg(windows)]
fn app_id_is_registered(app: &AppHandle) -> bool {
    let Some(app_data) = std::env::var_os("APPDATA") else {
        return false;
    };
    std::path::PathBuf::from(app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join(format!("{}.lnk", app.package_info().name))
        .exists()
}

/// Tells the shell which application this process is, before it draws anything.
///
/// Windows identifies a desktop app by a string — an Application User Model ID —
/// and it can learn that string from three places: this call, a Start-menu
/// shortcut carrying the same id, or, failing both, a guess made from the
/// executable's path. Only the first two are the same app. The guess is a path,
/// not an identity, so the running process never matches the shortcut Windows
/// checks before it lets an app pin itself — and the request is refused.
///
/// The refusal is not the quiet "no" it sounds like: the shell cannot find an app
/// list entry for the process, so it shows the folder the executable lives in and
/// expects the user to right-click it. That is what this call prevents, and it is
/// why Tauri's notification identity work in `alert_app_id` was not enough on its
/// own — that names the app on a toast, while this names the *process* to the
/// taskbar.
///
/// The id is the bundle identifier: the same string the installer stamped on the
/// Start-menu shortcut, and the same one toasts are posted under, so all three
/// agree. Set once, at the top of `run`, because the documentation requires it
/// before any window is presented or any jump list is touched.
///
/// Returns the call's own result so the startup log can record it once the log
/// files exist — this runs before the logger, on purpose.
#[cfg(windows)]
fn identify_to_the_shell(app_id: &str) -> i32 {
    use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    let wide: Vec<u16> = app_id.encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: `wide` is NUL-terminated and outlives the call, which only reads it.
    unsafe { SetCurrentProcessExplicitAppUserModelID(wide.as_ptr()) }
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

/// Whether this build can ask the shell to pin DeepWork to the taskbar.
///
/// The taskbar is a WinRT class that was written for packaged apps, and a Win32
/// process reaches it through the marker interface Microsoft added for desktop
/// apps (`ITaskbarManagerDesktopAppSupportStatics`). The marker is what is asked
/// for here: if the activation factory does not offer it, the version of Windows
/// underneath has no desktop-app support at all, and a pin button would be a
/// button that does nothing.
///
/// Asked once by the frontend so the setting can be absent rather than disabled:
/// there is no useful thing to say to a user whose Windows cannot do this.
#[cfg(windows)]
#[tauri::command]
fn taskbar_pin_supported() -> bool {
    use windows::core::factory;
    use windows::UI::Shell::{ITaskbarManagerDesktopAppSupportStatics, TaskbarManager};

    factory::<TaskbarManager, ITaskbarManagerDesktopAppSupportStatics>().is_ok()
}

#[cfg(not(windows))]
#[tauri::command]
fn taskbar_pin_supported() -> bool {
    false
}

/// Asks the shell to pin DeepWork to the taskbar.
///
/// Deliberately *not* a silent pin, because there is no such thing: Windows
/// shows its own consent dialog, and the answer comes back as a
/// `deepwork:taskbar-pin` event carrying `true` or `false`. What this command
/// does is put the window in front — the request is only allowed from a
/// foreground app — and hand the request to the main thread, which is the
/// thread the dialog is drawn on.
///
/// Returns as soon as the request is scheduled. The user may sit on the dialog
/// for as long as they like, and a command that waited for the answer would hold
/// a message loop hostage while they did.
#[cfg(windows)]
#[tauri::command]
fn taskbar_pin(app: AppHandle) -> Result<(), String> {
    let app_for_main = app.clone();
    app.run_on_main_thread(move || {
        // The press arrives with the window still in the background on some
        // setups; `restore` is the app's own rule for "bring it back", and the
        // request needs it to have happened first.
        if let Some(window) = app_for_main.get_webview_window("main") {
            restore(&window);
            let _ = window.set_focus();
        }
        request_pin(app_for_main);
    })
    .map_err(|err| format!("could not reach the main thread: {err}"))
}

/// Everywhere else the taskbar does not exist, or does not take requests.
#[cfg(not(windows))]
#[tauri::command]
fn taskbar_pin(_app: AppHandle) -> Result<(), String> {
    Err("Pinning to the taskbar is a Windows feature.".to_string())
}

/// Opens the list of installed apps, where the user can pin DeepWork themselves.
///
/// The honest half of the pin feature: when the shell has refused the request —
/// a policy that forbids pinning, or a Windows that cannot match this build to an
/// app list entry — `shell:AppsFolder` is the same list the Start menu's "All
/// apps" is built from, and the context menu there has **Pin to taskbar**. This
/// is what the notification's **Yes** falls back to, better than a button that
/// ends in an error message.
#[tauri::command]
fn open_pin_helper() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg("shell:AppsFolder")
            .spawn()
            .map(|_| ())
            .map_err(|err| format!("Could not open the app list: {err}"))
    }

    #[cfg(not(windows))]
    {
        Err("Pinning to the taskbar is a Windows feature.".to_string())
    }
}

/// Issues the pin request and reports the answer as an event.
///
/// The operation is waited on through a completion handler rather than
/// `get()`: the latter blocks the calling thread on an event, and the calling
/// thread here is the one that has to keep pumping messages for the shell's
/// consent dialog to be drawn at all. Blocking it would trade a pin for a
/// freeze that never resolves.
///
/// The answer is a word rather than a boolean, because a user who read the
/// dialog and said no has not had a failure: `declined` leaves the app exactly
/// as it was and says nothing, while `failed` is the request that could not be
/// made and is worth telling them about.
#[cfg(windows)]
fn request_pin(app: AppHandle) {
    use windows::UI::Shell::TaskbarManager;
    use windows_future::AsyncOperationCompletedHandler;

    let outcome: Result<(), String> = (|| {
        let manager = TaskbarManager::GetDefault().map_err(|err| err.to_string())?;
        // A group policy can forbid pinning outright, in which case the request
        // is refused without ever showing the dialog — say so in the log rather
        // than leaving a button that appears to have been ignored.
        match manager.IsPinningAllowed() {
            Ok(true) => {}
            Ok(false) => return Err("the taskbar does not allow pinning right now".to_string()),
            Err(err) => return Err(err.to_string()),
        }

        let request = manager
            .RequestPinCurrentAppAsync()
            .map_err(|err| err.to_string())?;
        let app_for_result = app.clone();
        // The handler holds its own reference to the operation: the shell may
        // take minutes over its dialog, and a request whose only handle was
        // dropped the moment it was made is a request with nothing left to
        // collect the answer. The pair is released together when the operation
        // completes.
        let answered = request.clone();
        request
            .SetCompleted(&AsyncOperationCompletedHandler::new(
                move |_request, _status| {
                    let answer = if answered.GetResults().unwrap_or(false) {
                        "pinned"
                    } else {
                        "declined"
                    };
                    log::info!(target: logging::SYSTEM, "taskbar pin answered: {answer}");
                    let _ = app_for_result.emit("deepwork:taskbar-pin", answer);
                    Ok(())
                },
            ))
            .map_err(|err| err.to_string())?;
        Ok(())
    })();

    if let Err(err) = outcome {
        log::warn!(target: logging::SYSTEM, "taskbar pin unavailable: {err}");
        let _ = app.emit("deepwork:taskbar-pin", "failed");
    }
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

/// Whether the user's database is there, holds data, and can be read — asked
/// before anything is allowed to open it for writing.
///
/// See `db_guard` for why the frontend cannot simply let the SQL plugin create
/// what it does not find.
#[tauri::command]
fn db_preflight(app: AppHandle) -> db_guard::DbReport {
    db_guard::preflight(&app)
}

/// Copies the database and its write-ahead log aside, under a timestamped name.
///
/// Called by the frontend before the SQL plugin opens the database — the last
/// moment at which a copy is certainly the state the user left behind. `note`
/// only names the copy (`launch`, `migrate`): the file it protects is the same
/// one either way.
#[tauri::command]
fn db_backup(app: AppHandle, note: String) -> Option<String> {
    db_guard::backup(&app, &note)
}

/// Takes the installer's "this is a fresh install" marker, if it left one.
///
/// The first-run setup is recorded in the database, which survives a reinstall
/// by design — the user's tasks are in the same folder. That means a reinstall
/// would otherwise never show the setup again. The NSIS installer writes one
/// marker beside the database (`installer-hooks.nsh`), and this hands it to the
/// frontend once and deletes it, so the reset happens exactly once per install.
///
/// A silent update from the app's own updater does not write the marker, so an
/// update never interrupts the user with a setup wizard. No marker is not an
/// error: it is the ordinary launch of an app that was installed long ago.
#[tauri::command]
fn first_run_take_marker(app: AppHandle) -> bool {
    let Ok(dir) = app.path().app_config_dir() else {
        return false;
    };
    let marker = dir.join("just-installed");
    match std::fs::remove_file(&marker) {
        Ok(()) => {
            log::info!(target: logging::SYSTEM, "fresh install: the first-run setup will be offered again");
            true
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => false,
        Err(err) => {
            log::warn!(target: logging::SYSTEM, "fresh-install marker could not be read: {err}");
            false
        }
    }
}

/// Whether DeepWork is already pinned to the taskbar, and whether pinning is
/// something this platform can answer for at all.
///
/// Asked by the reminder before every toast it raises rather than once at
/// startup, because the user can pin (or unpin) DeepWork at any moment without
/// telling the app, and a reminder that keeps arriving after they said yes is
/// the one that gets the feature turned off. See `nudges`.
#[tauri::command]
fn nudges_taskbar_pin_state() -> nudges::TaskbarPinState {
    nudges::taskbar_pin_state()
}

/// What the desktop says about interrupting the user right now.
///
/// The app's own focus mode is a page it draws; this is the operating system's,
/// and only the operating system knows about quiet hours, a fullscreen game or a
/// locked screen. Polled while the app runs, and used to hold in-app reminders
/// without pretending the desktop notification can be made to appear either.
#[tauri::command]
fn nudges_quiet_state() -> nudges::QuietState {
    nudges::quiet_state()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Installed before anything else can panic, so a failure during startup
    // still leaves a line in `crash.log`. Until the app knows where that folder
    // is, the line goes to the system temp directory rather than nowhere.
    logging::install_panic_hook();

    // The context is built here rather than in the final `run` call, because the
    // shell has to be told which app this is before anything is drawn and that
    // needs the bundle identifier the context carries. See
    // `identify_to_the_shell`.
    let context = tauri::generate_context!();

    #[cfg(windows)]
    let shell_identity = identify_to_the_shell(&context.config().identifier);

    // One list, in `db_migrations`, because the repair command compares the same
    // bytes this build embeds with the hashes in the database. See that module.
    let migrations = db_migrations::migrations();

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
            toast_dismiss,
            taskbar_pin_supported,
            taskbar_pin,
            open_pin_helper,
            save_download,
            db_preflight,
            db_backup,
            db_migrations::db_repair_migrations,
            first_run_take_marker,
            nudges_taskbar_pin_state,
            nudges_quiet_state,
            logging::log_folder,
            logging::open_log_folder,
            logging::log_write,
            opener::open_external_url,
            updates::update_download,
            updates::update_install,
        ])
        .setup(move |app| {
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

            // Written now rather than where it happens: the identity is set
            // before the logger exists, and a process the shell cannot name is
            // the start of "pin to taskbar opened a folder instead".
            #[cfg(windows)]
            if shell_identity < 0 {
                log::warn!(
                    target: logging::SYSTEM,
                    "the shell does not know this app's identity: 0x{shell_identity:08X}"
                );
            }

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

            // System tray.
            //
            // The menu is the app's smallest surface and it is the one that is
            // always reachable, so it carries the things a user reaches for
            // while working somewhere else: the window, a new task, a pause, a
            // mute that ends by itself, the two desktop switches and the way
            // out. Every entry either does its work here (the OS and window
            // state) or tells the frontend to, and nothing in it is a dead end.
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let new_task_i = MenuItem::with_id(app, "new_task", "New task…", true, None::<&str>)?;
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
            let resume_i = MenuItem::with_id(app, "resume", "Resume", true, None::<&str>)?;
            let pause_i = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
            let pause5_i = MenuItem::with_id(app, "pause5", "Pause for 5 min", true, None::<&str>)?;
            let pause10_i = MenuItem::with_id(app, "pause10", "Pause for 10 min", true, None::<&str>)?;
            let pause15_i = MenuItem::with_id(app, "pause15", "Pause for 15 min", true, None::<&str>)?;
            let pause30_i = MenuItem::with_id(app, "pause30", "Pause for 30 min", true, None::<&str>)?;
            // A mute that has no end is the one that outlives the reason it was
            // turned on, so the tray only offers lengths: half an hour, an hour,
            // four hours or the rest of the day.
            let mute30_i = MenuItem::with_id(app, "mute30", "Mute sound for 30 min", true, None::<&str>)?;
            let mute60_i = MenuItem::with_id(app, "mute60", "Mute sound for 1 hour", true, None::<&str>)?;
            let mute240_i = MenuItem::with_id(app, "mute240", "Mute sound for 4 hours", true, None::<&str>)?;
            let mute_today_i = MenuItem::with_id(app, "mute_today", "Mute sound until tomorrow", true, None::<&str>)?;
            let mute_off_i = MenuItem::with_id(app, "mute_off", "Sound on", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let exit_i = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

            let pause_menu = Submenu::with_items(app, "Pause", true, &[
                &pause_i,
                &pause5_i,
                &pause10_i,
                &pause15_i,
                &pause30_i,
                &resume_i,
            ])?;

            let mute_separator = PredefinedMenuItem::separator(app)?;
            let mute_menu = Submenu::with_items(app, "Mute sound", true, &[
                &mute30_i,
                &mute60_i,
                &mute240_i,
                &mute_today_i,
                &mute_separator,
                &mute_off_i,
            ])?;

            let separator1 = PredefinedMenuItem::separator(app)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let separator3 = PredefinedMenuItem::separator(app)?;
            let separator4 = PredefinedMenuItem::separator(app)?;

            let menu = Menu::new(app)?;
            menu.append(&show_i)?;
            menu.append(&new_task_i)?;
            menu.append(&separator1)?;
            menu.append(&pause_menu)?;
            menu.append(&mute_menu)?;
            menu.append(&separator2)?;
            menu.append(&start_with_system_i)?;
            menu.append(&always_on_top_i)?;
            menu.append(&separator3)?;
            menu.append(&settings_i)?;
            menu.append(&separator4)?;
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
            // The toasts whose buttons are still worth listening to. Managed
            // before the frontend can post one, since the store is what keeps a
            // button's press from having nowhere to land. See `ToastHandles`.
            #[cfg(windows)]
            app.manage(ToastHandles(std::sync::Mutex::new(
                std::collections::HashMap::new(),
            )));
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
                            // The two entries that open a particular place in the
                            // app rather than the app itself. The window is
                            // brought forward here and the frontend does the rest:
                            // leaving that to a page nobody has opened yet would
                            // make the menu item do nothing on a cold tray.
                            "new_task" => {
                                if let Some(w) = &window {
                                    restore(w);
                                }
                                emit("new-task");
                            }
                            "settings" => {
                                if let Some(w) = &window {
                                    restore(w);
                                }
                                emit("settings");
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
                            "resume" => emit("resume"),
                            // The mute lengths are the frontend's to remember:
                            // how long is a setting the app owns, and the tray is
                            // only one of the places it can be set.
                            "mute30" => emit("mute:30"),
                            "mute60" => emit("mute:60"),
                            "mute240" => emit("mute:240"),
                            "mute_today" => emit("mute:today"),
                            "mute_off" => emit("mute:off"),
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
            //
            // That 0x0 is the *whole* test on Windows, where it is what the OS
            // sends for a minimise and nothing else. Elsewhere a 0x0 can also be
            // reported for a window that has merely been un-mapped or moved off
            // the screen — and the widget is the only window in this app without
            // a title bar, so a stray 0x0 must not be allowed to take the frame
            // away. There the window's own state has to agree as well.
            WindowEvent::Resized(size) => {
                let looks_minimised = size.width == 0 && size.height == 0;
                let confirmed = cfg!(windows) || window.is_minimized().unwrap_or(false);
                if looks_minimised && confirmed {
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
        .run(context)
        .expect("error while running tauri application");
}

/// The toast document, pinned down without a desktop to show it on.
///
/// The XML is the one part of the notification path that cannot be exercised by
/// clicking something: a malformed document costs the notification silently, and
/// the only place the mistake would show up is a machine the developer is not
/// sitting at. These tests are the stand-in for that machine.
#[cfg(all(test, windows))]
mod toast_tests {
    use super::*;

    fn action(id: &str, label: &str) -> ToastAction {
        ToastAction {
            id: id.to_string(),
            label: label.to_string(),
        }
    }

    #[test]
    fn a_message_with_no_buttons_has_no_actions_block() {
        let xml = toast_xml("Title", "Body", None, "", &[]);
        assert!(!xml.contains("<actions>"));
        // The silent audio element is what keeps the app's own tone the only
        // sound an alert makes; it has to survive every shape of the document.
        assert!(xml.contains(r#"<audio silent="true"/>"#));
    }

    #[test]
    fn buttons_come_after_the_visual_and_before_the_audio() {
        let xml = toast_xml("Title", "Body", None, "", &[action("yes", "Yes, drank")]);
        let visual = xml.find("</visual>").expect("the visual block");
        let actions = xml.find("<actions>").expect("the actions block");
        let audio = xml.find("<audio").expect("the audio element");

        // The schema orders these; a document that does not is rejected whole.
        assert!(visual < actions, "actions must follow the visual block");
        assert!(actions < audio, "actions must precede the audio element");
        assert!(xml.contains(
            r#"<action content="Yes, drank" arguments="yes" activationType="foreground"/>"#
        ));
    }

    #[test]
    fn button_labels_and_ids_cannot_end_the_document() {
        let xml = toast_xml("T", "B", None, "", &[action("a&b", r#"Say "hi""#)]);
        assert!(xml.contains(r#"arguments="a&amp;b""#));
        assert!(xml.contains(r#"content="Say &quot;hi&quot;""#));
    }

    #[test]
    fn a_sixth_button_is_dropped_rather_than_taking_the_toast_with_it() {
        let actions: Vec<ToastAction> = (0..6)
            .map(|index| action(&format!("a{index}"), "Button"))
            .collect();
        let xml = toast_xml("T", "B", None, "", &actions);

        assert_eq!(xml.matches("<action ").count(), 5);
        assert!(!xml.contains(r#"arguments="a5""#));
    }

    #[test]
    fn a_waiting_toast_keeps_the_scenario_that_makes_it_wait() {
        let xml = toast_xml(
            "T",
            "B",
            None,
            r#" duration="long" scenario="reminder""#,
            &[],
        );
        assert!(xml.contains(r#"scenario="reminder""#));
    }

    #[test]
    fn the_quote_is_a_line_of_its_own_and_is_escaped() {
        let xml = toast_xml("T", "B", Some("A & B"), "", &[]);
        assert!(xml.contains(r#"<text placement="attribution">A &amp; B</text>"#));
    }
}

/// The process identity, which is the difference between a pin request that is
/// answered and one that opens the executable's folder instead.
///
/// The call is one Win32 function, so the test is not about the algorithm: it is
/// about the two ways it silently does nothing — a wide string that is not what
/// the API expects, and a call made too late — neither of which produces an
/// error the app could notice. Reading the id back is the only way to know the
/// process is actually named.
#[cfg(all(test, windows))]
mod shell_identity_tests {
    use super::*;

    #[test]
    fn the_process_can_be_named_to_the_shell() {
        use windows_sys::Win32::UI::Shell::GetCurrentProcessExplicitAppUserModelID;

        let id = "com.deepwork.app.aumid-test";
        let set = identify_to_the_shell(id);
        assert!(set >= 0, "setting the app id failed: 0x{set:08X}");

        let mut raw = std::ptr::null_mut();
        // SAFETY: the call writes one pointer, which `raw` outlives.
        let read = unsafe { GetCurrentProcessExplicitAppUserModelID(&mut raw) };
        assert!(read >= 0, "reading the app id back failed: 0x{read:08X}");

        let mut length = 0usize;
        // SAFETY: the returned string is NUL-terminated.
        while unsafe { *raw.add(length) } != 0 {
            length += 1;
        }
        // SAFETY: `length` counts the units before the terminator.
        let read_back =
            String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(raw, length) });

        // The string is the API's own allocation and this process ends in a
        // moment; freeing it would mean a whole COM dependency for one line.
        assert_eq!(read_back, id);
    }
}
