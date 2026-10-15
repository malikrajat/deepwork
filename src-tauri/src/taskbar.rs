//! Keeping DeepWork one click away: taskbar on Windows, Dock on macOS, panel on
//! Linux.
//!
//! The three desktops do not treat this question the same way, and the
//! difference is not cosmetic — it is the difference between a call and an
//! instruction.
//!
//! * **Windows** has a supported way to ask, and it is deliberately a *request*:
//!   `Windows.UI.Shell.TaskbarManager` answers whether the app is already pinned,
//!   whether this desktop allows pinning at all, and — from the app's own
//!   foreground window, when the user has just asked for it — raises the shell's
//!   own "Pin to taskbar?" confirmation. That is the dialog the user meets in the
//!   app they asked about (see the Microsoft Learn page on [pinning an app to the
//!   taskbar][learn]), and it is the whole reason this is native code rather than
//!   a documentation link: `RequestPinCurrentAppAsync` does the pinning, with the
//!   user's consent, in one call.
//! * **macOS** has no equivalent. An app cannot add itself to the Dock; the user
//!   does it from the running app's own Dock tile (**Options → Keep in Dock**, or
//!   by dragging the app there), and the app can only say so.
//! * **Linux** is the same story with a different key: GNOME calls it *Pin to
//!   Dash*, KDE *Pin to Task Manager*, XFCE *Pin to Panel*, and none of them
//!   offers an application a supported way to do it.
//!
//! So the shape of this module is one question with two kinds of answer:
//! [`status`] reports what this desktop can do, and [`start_pin`] either asks the
//! Windows shell or returns the sentence that tells the user where the menu is.
//! Nothing here claims a pin happened when it did not — [`PinOutcome`] carries
//! the shell's own verdict, and it arrives when the shell has one.
//!
//! [learn]: https://learn.microsoft.com/en-us/windows/apps/develop/windows-integration/pin-to-taskbar

use serde::Serialize;

/// What this desktop calls the thing an app is pinned to.
///
/// The UI never says "taskbar" on a Mac or "Dock" on Windows: the user knows the
/// name of their own desktop, and the wrong one reads as an app that does not
/// know where it is running.
pub const TARGET_TASKBAR: &str = "taskbar";
pub const TARGET_DOCK: &str = "dock";
pub const TARGET_PANEL: &str = "panel";

/// What this desktop can do about pinning.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinStatus {
    /// What the thing is called here: `taskbar`, `dock` or `panel`.
    pub target: &'static str,
    /// True when the app can make the pin happen itself — Windows only.
    ///
    /// The user is still the one who confirms it: this says whether
    /// [`start_pin`] has anything to call, not whether the pin is silent.
    pub can_auto_pin: bool,
    /// True when this desktop already holds DeepWork among its pinned apps.
    ///
    /// Filled in by the caller that can ask — `taskbar_pin_status` in `lib.rs`
    /// puts the shell's own answer here. The default is load-bearing: work out of
    /// "no answer" is the safe reading, because a pin request for an app that is
    /// already pinned is a no-op rather than an error.
    pub pinned: bool,
}

/// One attempt at pinning, as the desktop answered it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinOutcome {
    /// True once the app is pinned. False means "not done", whatever was asked.
    pub pinned: bool,
    /// True when the desktop was asked and did the work itself — on Windows, the
    /// shell's own confirmation was shown and accepted.
    pub automatic: bool,
    /// What to tell the user next, when the app could not do it for them.
    ///
    /// `None` with `pinned: false` and `automatic: false` means *the request is
    /// in and unanswered* — Windows is showing its own prompt — which is a third
    /// state and not a failure. The frontend tells the two apart by polling; see
    /// `taskbar_pin_result` in `lib.rs`.
    pub message: Option<String>,
}

/// Reports what pinning means on this desktop.
///
/// Deliberately free of any window or shell call: this is asked as the app
/// starts, and the answer has to be there whether or not the shell is willing to
/// talk. On Windows the *real* state of the pin is not asked here either — see
/// `taskbar_pin_status` in `lib.rs` for why that question belongs on the main
/// thread.
pub fn status() -> PinStatus {
    PinStatus {
        target: target(),
        can_auto_pin: cfg!(windows),
        pinned: false,
    }
}

/// The name of the pinned location on the desktop this build runs on.
fn target() -> &'static str {
    if cfg!(windows) {
        TARGET_TASKBAR
    } else if cfg!(target_os = "macos") {
        TARGET_DOCK
    } else {
        TARGET_PANEL
    }
}

/// Starts the shell's own "is DeepWork already pinned?" question.
///
/// Must be called on the main thread, and returns as soon as the shell has
/// accepted the question — never the answer, because waiting for one here is what
/// freezes the window. [`finish_pinned`] turns it into an answer, off that thread.
///
/// `Err` is "this Windows cannot be asked at all", which is not the same answer as
/// "no": the caller decides whether that means ask anyway or stop asking, and on
/// Windows it means ask anyway — a pin request for an app that is already pinned
/// is a no-op rather than an error.
#[cfg(windows)]
pub fn start_pinned() -> Result<PinnedAsk, String> {
    platform::ask_pinned().map(PinnedAsk)
}

/// A question the shell has accepted and not yet answered.
#[cfg(windows)]
pub struct PinnedAsk(platform::PinnedAsk);

/// A question on a desktop that has none — an uninhabited type, so the commands in
/// `lib.rs` can be written once for every platform.
#[cfg(not(windows))]
pub struct PinnedAsk(std::convert::Infallible);

/// Answers a question started by [`start_pinned`].
///
/// **Never call this on the main thread.**
#[cfg(windows)]
pub fn finish_pinned(ask: PinnedAsk) -> Result<bool, String> {
    platform::finish_pinned(ask.0)
}

#[cfg(not(windows))]
pub fn finish_pinned(ask: PinnedAsk) -> Result<bool, String> {
    match ask.0 {}
}

/// Whether the shell is already holding DeepWork on the taskbar.
///
/// The non-Windows answer, and the fallback when the shell cannot be asked at all:
/// false, because a pin request for an app that is already pinned is a no-op.
#[cfg(not(windows))]
pub fn is_pinned() -> bool {
    false
}

/// Asks this desktop to pin DeepWork.
///
/// On Windows this must be called on the main thread, and it is split in two so
/// that the *asking* stays there while the *waiting* does not: this returns the
/// request as soon as the shell has accepted it, and [`finish_pin`] turns it into
/// an answer later. Waiting here instead is the bug this app already shipped once
/// — see the `platform` module.
///
/// Everywhere else there is no call to make, so the outcome is the instruction
/// that replaces it.
pub fn start_pin() -> Result<PinRequest, PinOutcome> {
    #[cfg(windows)]
    {
        platform::start_pin().map(PinRequest)
    }
    #[cfg(not(windows))]
    {
        Err(PinOutcome {
            pinned: false,
            automatic: false,
            message: Some(manual_instruction()),
        })
    }
}

/// A pin request the shell has accepted and not yet answered.
///
/// Opaque on purpose: nothing outside the Windows module has any business
/// looking inside the operation, and on every other desktop this type is never
/// constructed.
#[cfg(windows)]
pub struct PinRequest(platform::PinRequest);

/// A pin request on a desktop that has none — an uninhabited type, so
/// [`start_pin`] can still be written once for every platform.
#[cfg(not(windows))]
pub struct PinRequest(std::convert::Infallible);

/// Turns an accepted request into the shell's answer.
///
/// **Never call this on the main thread.** It waits for the user to answer the
/// shell's own prompt, and waiting on the thread that owns the window is what
/// froze the app.
#[cfg(windows)]
pub fn finish_pin(request: PinRequest) -> PinOutcome {
    platform::finish_pin(request.0)
}

#[cfg(not(windows))]
pub fn finish_pin(request: PinRequest) -> PinOutcome {
    match request.0 {}
}

/// Where the user pins DeepWork by hand, in this desktop's own words.
pub fn manual_instruction() -> String {
    if cfg!(target_os = "macos") {
        "macOS does not let an app pin itself to the Dock. Right-click the DeepWork icon in the \
         Dock and choose Options → Keep in Dock — or drag the app there from Applications, and \
         it stays."
            .to_string()
    } else if cfg!(windows) {
        "Right-click the DeepWork icon while it is running and choose Pin to taskbar. If the \
         icon is not on the taskbar, open the Start menu, right-click DeepWork there and choose \
         Pin to taskbar."
            .to_string()
    } else {
        "Linux desktops keep their own list of pinned apps and do not let one add itself. \
         Right-click the DeepWork icon and choose Pin to Dash (GNOME), Pin to Task Manager \
         (KDE) or Pin to Panel (XFCE). If the icon is not there, open DeepWork from your \
         applications menu and pin it from the running app."
            .to_string()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows — the shell's own taskbar pinning, without a single blocking wait
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod platform {
    use super::{manual_instruction, PinOutcome, TARGET_TASKBAR};
    use windows::UI::Shell::{ITaskbarManagerDesktopAppSupportStatics, TaskbarManager};
    use windows_future::{AsyncStatus, IAsyncOperation};

    /// The bug this module exists to not have.
    ///
    /// Waiting for a WinRT operation from the thread that owns the window blocks
    /// that thread's message loop — and a loop that is not pumping is a window
    /// that does not repaint, does not answer clicks and does not answer the
    /// webview. The first version of this module used `IAsyncOperation::get()`,
    /// which is the natural way to write it and freezes the entire app for as long
    /// as the shell takes to decide. So the *call* stays on the main thread,
    /// because the shell requires it, and everything that *waits* happens
    /// somewhere else — see `start_pin` and `finish_pin`, and the commands in
    /// `lib.rs` that keep them apart.
    ///
    /// Anything the shell has not answered within this long is treated as
    /// unanswered rather than waited for. A bound is needed because "no answer" is
    /// a real answer here: on a Windows where the API is gated the operation can
    /// never resolve, and a wait that ran forever would be a request that never
    /// reports back.
    const ANSWER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);

    /// How often the operation's status is read. Whatever waits is the only thing
    /// that sleeps.
    const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(120);

    /// A request the shell has accepted: the operation to watch, and what to say
    /// if it never resolves.
    pub struct PinRequest {
        operation: IAsyncOperation<bool>,
    }

    /// The taskbar manager, or `None` on a Windows that cannot be asked.
    ///
    /// Three different failures arrive here as the same answer, because they
    /// leave the caller with the same thing to do — describe the manual route:
    ///
    /// - `TaskbarManager` is not reachable at all, or is reachable without desktop
    ///   app support. The class was built for UWP hosts, and the marker interface
    ///   is how the API itself says a Win32 app may use it; on some builds that
    ///   support is further gated behind a Limited Access Feature token that a
    ///   third-party app does not have.
    /// - There is no taskbar (a server install, a kiosk shell).
    /// - A group policy has turned pinning off machine-wide. Asking into that only
    ///   produces a refusal the user would read as our failure.
    fn manager() -> Option<TaskbarManager> {
        windows::core::factory::<TaskbarManager, ITaskbarManagerDesktopAppSupportStatics>().ok()?;

        let manager = TaskbarManager::GetDefault().ok()?;
        if !manager.IsSupported().unwrap_or(false) || !manager.IsPinningAllowed().unwrap_or(false) {
            return None;
        }
        Some(manager)
    }

    /// Waits for an operation *without* blocking the thread that started it.
    ///
    /// `operation.get()` would be four lines and would freeze the window. Polling
    /// costs one status read every 120ms on whatever thread is doing the waiting,
    /// and it cannot deadlock, because the thread that must stay responsive — the
    /// one that owns the window and pumps its messages — is not the thread
    /// waiting. Call this from anywhere except the main thread.
    ///
    /// `failure` is what an operation that ended in `Error` means for this
    /// particular question, since "the shell refused" reads differently depending
    /// on what was asked.
    pub fn resolve<T: windows::core::RuntimeType + 'static>(
        operation: &IAsyncOperation<T>,
        failure: &'static str,
    ) -> Result<T, String> {
        let deadline = std::time::Instant::now() + ANSWER_TIMEOUT;

        loop {
            match operation.Status() {
                // `GetResults` is only legal once the operation is no longer
                // started, which is exactly what the two arms below check.
                Ok(AsyncStatus::Completed) => {
                    return operation.GetResults().map_err(|err| err.to_string())
                }
                Ok(AsyncStatus::Error) => {
                    let code = operation
                        .ErrorCode()
                        .map(|code| format!("0x{:08x}", code.0))
                        .unwrap_or_else(|_| "an unknown error".to_string());
                    return Err(format!("{failure} ({code})"));
                }
                Ok(AsyncStatus::Canceled) => {
                    return Err(format!("{failure} — the request was cancelled"));
                }
                // Still started, or the status could not be read at all: try
                // again rather than giving up on the first hiccup.
                Ok(_) | Err(_) => {}
            }

            if std::time::Instant::now() >= deadline {
                return Err(format!("{failure} — it did not answer in time"));
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    }

    /// A question the shell has accepted and not yet answered.
    pub struct PinnedAsk(IAsyncOperation<bool>);

    /// Starts the shell's own "is DeepWork already pinned?" question. Main thread
    /// only; the answer comes from [`finish_pinned`] and must not be waited for
    /// here.
    ///
    /// The answer is the shell's own — `IsCurrentAppPinnedAsync` — rather than a
    /// reading of the pinned-items store, which has moved between Windows versions
    /// and is documented as an interface in none of them.
    pub fn ask_pinned() -> Result<PinnedAsk, String> {
        let manager = manager().ok_or("The Windows taskbar cannot be asked about pinning.")?;
        manager
            .IsCurrentAppPinnedAsync()
            .map(PinnedAsk)
            .map_err(|err| format!("The Windows taskbar did not answer: {err}"))
    }

    /// Answers a question started by [`ask_pinned`].
    ///
    /// **Never call this on the main thread.**
    pub fn finish_pinned(ask: PinnedAsk) -> Result<bool, String> {
        resolve(&ask.0, "The Windows taskbar did not finish answering")
    }

    /// Starts a pin request and returns at once, with the shell's dialog on screen
    /// and the user's answer still to come.
    ///
    /// Must be called on the main thread: the shell shows its prompt from the app's
    /// own foreground window and refuses the request from anywhere else. What it
    /// must *not* do is wait — see this module's opening note.
    pub fn start_pin() -> Result<PinRequest, PinOutcome> {
        let Some(manager) = manager() else {
            return Err(PinOutcome {
                pinned: false,
                automatic: false,
                message: Some(format!(
                    "This Windows will not let DeepWork pin itself to the {TARGET_TASKBAR}. {}",
                    manual_instruction()
                )),
            });
        };

        match manager.RequestPinCurrentAppAsync() {
            Ok(operation) => Ok(PinRequest { operation }),
            Err(err) => Err(PinOutcome {
                pinned: false,
                automatic: false,
                message: Some(format!(
                    "Windows would not pin DeepWork to the {TARGET_TASKBAR}: {err}. {}",
                    manual_instruction()
                )),
            }),
        }
    }

    /// Turns an accepted request into the shell's answer.
    ///
    /// **Never call this on the main thread.** It waits for the user to answer the
    /// shell's own prompt, and waiting on the thread that owns the window is the
    /// freeze this whole arrangement exists to avoid.
    pub fn finish_pin(request: PinRequest) -> PinOutcome {
        match resolve(&request.operation, "The Windows taskbar did not finish") {
            // The user said yes — or the pin was already there, which the shell
            // answers true to without showing anything.
            Ok(true) => PinOutcome {
                pinned: true,
                automatic: true,
                message: None,
            },
            Ok(false) => PinOutcome {
                pinned: false,
                automatic: false,
                message: Some(format!(
                    "The taskbar did not pin DeepWork: the shell's own prompt was declined, or \
                     the pin was refused. {}",
                    manual_instruction()
                )),
            },
            Err(reason) => PinOutcome {
                pinned: false,
                automatic: false,
                message: Some(format!("{reason}. {}", manual_instruction())),
            },
        }
    }
}
