import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';

/** True when running inside the packaged desktop app (Tauri). */
const IN_TAURI = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

/** Lazily resolves Tauri's `invoke` so browser builds never import it. */
async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/**
 * Owns the desktop preferences the user can flip from anywhere in the app:
 *
 * - **Start with system** — a per-user OS autostart entry (Windows `Run` key,
 *   Linux XDG autostart, macOS LaunchAgent) written by the Rust layer.
 * - **Always on top** — whether the main window floats above other windows.
 * - **Keep running in the tray** — whether closing the window hides DeepWork
 *   next to the clock or ends it. The window itself decides the moment the X is
 *   pressed (it cannot wait for the frontend), so this one is *pushed* to Rust
 *   whenever it changes, and the Rust side keeps working while the window is
 *   hidden and there is no page left to ask.
 *
 * Both are mirrored into three places (Settings, the dashboard, the system tray)
 * plus a first-run dialog, so this service is the single source of truth: every
 * surface reads these signals and calls these setters, and nobody touches the
 * window or the OS directly.
 *
 * The OS is authoritative for "start with system", because the entry can be
 * added or removed outside the app — by hand in Task Manager's startup list, or
 * by another tool. On startup we read the real state and reconcile the stored
 * preference to match, so the switch never lies.
 */
@Injectable({ providedIn: 'root' })
export class DesktopPrefsService {
  private readonly db = inject(DbService);
  private readonly settings = inject(SettingsService);
  private readonly notifications = inject(NotificationService);

  /** True when the desktop-only switches can actually do something. */
  readonly isDesktopApp = IN_TAURI;

  /** Mirrors the OS autostart entry. */
  readonly startWithSystem = signal(false);

  /** Mirrors the main window's always-on-top flag. */
  readonly alwaysOnTop = signal(false);

  /**
   * Whether this desktop lets an app put its own window above the others.
   *
   * False on Wayland, where no client may raise itself — the compositor decides
   * the stacking order — so the switch is disabled with that as the reason
   * instead of being left to accept a change nothing will honour. Asked of the
   * desktop layer once, at startup.
   */
  readonly alwaysOnTopSupported = signal(true);

  /**
   * True while closing the window leaves DeepWork running in the system tray.
   *
   * On by default, and the tray menu's own **Exit** is the other half of it: a
   * hidden window is never a window that cannot be closed.
   */
  readonly closeToTray = signal(true);

  /** True once the one-time desktop-preferences dialog has been shown. */
  readonly prompted = signal(false);

  /**
   * True once stored preferences have been loaded and reconciled with the OS.
   *
   * The first-run dialog waits for this so it never flashes on screen before we
   * know whether it is still needed — or shows at all in the browser build.
   */
  readonly ready = signal(false);

  /**
   * Whether this build can ask the shell to pin DeepWork to the taskbar.
   *
   * Windows only, and only where the desktop-app form of the taskbar API
   * exists — so the row is absent rather than disabled on a Windows that has no
   * way to answer it. See `taskbar_pin_supported` in `src-tauri/src/lib.rs`.
   */
  readonly pinSupported = signal(false);

  /**
   * Whether Windows would accept a pin request from this app *right now*.
   *
   * A taskbar API can exist and still refuse: a policy can forbid pinning, the
   * shell may not be able to match the running process to an app list entry,
   * and a request is only allowed from an app that is in front. When this is
   * false the app stops pretending: **Yes** opens the installed-app list and the
   * user does the two clicks Windows wants. It is re-read whenever the user
   * asks, because the answer is about the moment — see `refreshPinState`.
   */
  readonly pinAllowed = signal(false);

  /** True once the shell has said DeepWork is pinned. */
  readonly pinned = signal(false);

  /** True while the shell's own confirmation dialog is up. */
  readonly pinBusy = signal(false);

  /** Removes the toast-button handler when this service goes away. */
  private unlistenPinAction: (() => void) | null = null;

  /** Last user-facing failure, or null. Cleared on the next successful change. */
  readonly error = signal<string | null>(null);

  /** True while a change is being written to the OS. */
  readonly busy = signal(false);

  private initialized = false;

  /**
   * Loads stored preferences and reconciles them with reality.
   *
   * Safe to call more than once — later calls are no-ops.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.db.init();
    await this.settings.loadSettings();
    const stored = this.settings.settings();

    this.prompted.set(stored.desktopPrefsPrompted);

    if (!IN_TAURI) {
      // Browser/PWA build: nothing to reconcile with the OS.
      this.startWithSystem.set(false);
      this.alwaysOnTop.set(false);
      // Nothing to hide a tab *into* without a tray, so the switch is moot here.
      this.closeToTray.set(false);
      this.ready.set(true);
      return;
    }

    // The OS wins for autostart: the installer may have enabled it, or the user
    // may have deleted the entry outside the app.
    const actualAutostart = await this.readAutostart();
    this.startWithSystem.set(actualAutostart);
    if (actualAutostart !== stored.startWithSystem) {
      await this.persist({ startWithSystem: actualAutostart });
    }

    // Always-on-top is ours to apply; push the stored preference to the window.
    // A window failure must never reject — this runs from an APP_INITIALIZER, so
    // throwing here would stop the whole app from starting.
    this.alwaysOnTopSupported.set(await this.readAlwaysOnTopSupported());
    this.alwaysOnTop.set(stored.alwaysOnTop);
    try {
      // What the window reports, not what was asked for: a desktop that accepts
      // the call and does nothing (Wayland) must not leave the switch saying
      // "on" about a window that is not.
      this.alwaysOnTop.set(await this.applyAlwaysOnTop(stored.alwaysOnTop));
    } catch (err) {
      this.error.set(this.describe(err, 'Could not apply always-on-top.'));
    }

    // What the close button does is decided by Rust, at the moment the X is
    // pressed — so the stored preference is handed over as soon as the settings
    // are read, rather than being left to the switch to remember.
    this.closeToTray.set(stored.trayBehavior !== 'quit');
    try {
      await this.applyCloseBehavior(this.closeToTray());
    } catch (err) {
      this.error.set(this.describe(err, 'Could not apply the close behaviour.'));
    }

    // The pin question travels through the notification, so both halves of it
    // are wired before the row that asks can be clicked: the button press comes
    // back as a toast action, the shell's answer as an event.
    await this.refreshPinState();
    void this.listenForPinResult();
    this.unlistenPinAction = this.notifications.onToastAction(
      NotificationService.PIN_NOTIFICATION_TAG,
      (action) => {
        // One tag, three ways of asking the same question: the first-run row's
        // **Pin** / **Cancel**, and the reminder's **Yes** / **Not now**. They
        // all end with the notification taken down, because a question that has
        // been answered must not stay on screen asking.
        if (action === 'pin' || action === 'yes') {
          void this.pinNow().finally(() =>
            this.notifications.dismissSystemNotification(NotificationService.PIN_NOTIFICATION_TAG),
          );
          return;
        }
        // **Cancel** / **Not now** need no handler beyond leaving the app as it
        // is: the notification is the only thing that changes.
        void this.notifications.dismissSystemNotification(NotificationService.PIN_NOTIFICATION_TAG);
      },
    );

    this.ready.set(true);
  }

  /**
   * Offers the pin, or shows the two clicks Windows requires.
   *
   * A notification rather than a dialog inside the window when the shell will
   * accept a request: **Yes** asks Windows directly, and Windows draws its own
   * confirmation on top. Where the shell will not accept one — a policy that
   * forbids pinning, or a build Windows cannot match to an app list entry — a
   * **Yes** that ends in an error would be worse than no button, so this opens
   * the installed-app list instead and says what to click.
   *
   * The shell's answer is asked *now*, not remembered from startup: see
   * {@link settlePinState}.
   */
  async askToPin(): Promise<void> {
    if (!IN_TAURI || !this.pinSupported() || this.pinned()) return;

    await this.settlePinState();
    if (this.pinned()) return;

    if (!this.pinAllowed()) {
      await this.showPinHelper();
      return;
    }

    this.error.set(null);
    try {
      await this.notifications.announce(
        'Pin DeepWork to the taskbar?',
        'Keep your timer one click away. Windows will ask you to confirm.',
        {
          tag: NotificationService.PIN_NOTIFICATION_TAG,
          sticky: true,
          actions: [
            // The same two answers the reminder asks with: the row in Settings,
            // the first-run setup and the reminder are one question, so they
            // must not answer with three different pairs of words.
            { id: 'yes', label: 'Yes, pin it' },
            { id: 'no', label: 'Not now' },
          ],
        },
      );
    } catch (err) {
      this.error.set(this.describe(err, 'Could not ask Windows to pin DeepWork.'));
    }
  }

  /**
   * Opens the installed-app list, where **Pin to taskbar** lives.
   *
   * `shell:AppsFolder` is the same list the Start menu's "All apps" is built
   * from; right-clicking DeepWork there is exactly the action the app cannot
   * perform for itself. Used by the row, the notification's **Yes** and the
   * reminder's card when `pinAllowed` is false.
   */
  async showPinHelper(): Promise<void> {
    this.error.set(null);
    try {
      await invokeCmd('open_pin_helper');
      this.notifications.showToastMessage(
        'Pin DeepWork to the taskbar',
        'Right-click DeepWork in the list, then choose “Pin to taskbar”. Windows keeps this one for you.',
        'work',
      );
    } catch (err) {
      this.error.set(this.describe(err, 'Could not open the app list.'));
      this.notifications.showToastMessage(
        'Pin DeepWork to the taskbar',
        'Right-click DeepWork in the Start menu, then choose “Pin to taskbar”.',
        'work',
      );
    }
  }

  /**
   * Asks the shell to pin DeepWork, after the toast's **Pin** was pressed.
   *
   * The command returns as soon as the request is scheduled; the answer arrives
   * on `deepwork:taskbar-pin`, because the user may take as long as they like
   * over the dialog and nothing should be blocked waiting for them. Returns
   * whether the request could be made — not whether the user then agreed, which
   * is the event's business.
   */
  private async pinToTaskbar(): Promise<boolean> {
    if (!IN_TAURI || this.pinBusy()) return false;

    this.pinBusy.set(true);
    this.error.set(null);
    try {
      await invokeCmd('taskbar_pin');
      // The event is what normally clears this. The timeout is only so that a
      // request the shell never answers cannot leave the button dead.
      setTimeout(() => this.pinBusy.set(false), 120_000);
      return true;
    } catch (err) {
      this.pinBusy.set(false);
      this.error.set(this.describe(err, 'Could not ask Windows to pin DeepWork.'));
      return false;
    }
  }

  /**
   * The **Yes** on a pin reminder: asks Windows straight away.
   *
   * The reminder's toast and its card both come here, so the two surfaces cannot
   * disagree about what yes means. Nothing is pinned silently — the request is
   * what raises Windows' own confirmation, exactly as the row in Settings does.
   */
  async pinNow(): Promise<boolean> {
    if (!IN_TAURI || !this.pinSupported() || this.pinned()) return false;

    await this.settlePinState();
    if (this.pinned()) return false;

    if (!this.pinAllowed()) {
      await this.showPinHelper();
      return false;
    }
    return this.pinToTaskbar();
  }

  /**
   * Re-reads what the taskbar says about pinning DeepWork right now.
   *
   * Three answers, and all three can change while the app runs: whether the API
   * exists, whether DeepWork is already pinned, and whether the shell would take
   * a request at this moment. The last one is why this is a method rather than a
   * field — `IsPinningAllowed` is about the present, not about the shell's mood
   * at startup. See `nudges::taskbar_pin_state`.
   */
  async refreshPinState(): Promise<void> {
    if (!IN_TAURI) return;
    const state = await this.readPinState();
    this.pinSupported.set(state.supported !== false);
    this.pinAllowed.set(state.allowed === true);
    this.pinned.set(state.pinned === true);
  }

  /**
   * The state, read once and then once more after a moment.
   *
   * The second read is for the one case the first cannot see: a request is only
   * allowed from an app that is *in front*, and the notification's **Yes** can
   * arrive while the window is still coming forward. A quarter of a second is
   * enough for that to finish and far too short to notice; without it, a perfectly
   * pinnable app answers "not allowed" and the user is sent to the app list to do
   * by hand what the button could have done.
   */
  private async settlePinState(): Promise<void> {
    await this.refreshPinState();
    if (this.pinAllowed() || this.pinned()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await this.refreshPinState();
  }

  /** Turns "start with the system" on or off. */
  async setStartWithSystem(enabled: boolean): Promise<void> {
    if (!IN_TAURI) return;
    const previous = this.startWithSystem();
    if (previous === enabled) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await invokeCmd('autostart_set_enabled', { enabled });
      this.startWithSystem.set(enabled);
      await this.persist({ startWithSystem: enabled });
    } catch (err) {
      // Put the switch back where reality is.
      this.startWithSystem.set(previous);
      this.error.set(this.describe(err, 'Could not change the startup setting.'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Turns "always on top" on or off for the main window. */
  async setAlwaysOnTop(enabled: boolean): Promise<void> {
    if (!IN_TAURI) return;
    const previous = this.alwaysOnTop();
    if (previous === enabled) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const applied = await this.applyAlwaysOnTop(enabled);
      this.alwaysOnTop.set(applied);

      if (applied === enabled) {
        await this.persist({ alwaysOnTop: enabled });
      } else {
        // The call was accepted and the window did not change. Storing a
        // preference the desktop is not honouring would only make the next
        // startup lie in the same way, so the switch goes back and says why.
        this.error.set(this.refusedText());
      }
    } catch (err) {
      this.alwaysOnTop.set(previous);
      this.error.set(this.describe(err, 'Could not change always-on-top.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Re-applies the current always-on-top preference to the window.
   *
   * Used when leaving the mini widget, which holds the window on top while it is
   * open and must hand it back in the state the user chose — and which may have
   * been changed, or refused, in the meantime, so the switch follows the window's
   * own answer.
   */
  async reapplyAlwaysOnTop(): Promise<void> {
    if (!IN_TAURI) return;
    try {
      this.alwaysOnTop.set(await this.applyAlwaysOnTop(this.alwaysOnTop()));
    } catch (err) {
      this.error.set(this.describe(err, 'Could not restore always-on-top.'));
    }
  }

  /**
   * Chooses what the window's close button does.
   *
   * On: the X hides DeepWork in the system tray and everything keeps running —
   * the timer, the water reminder, the tray icon — until **Exit** is chosen from
   * the tray menu. Off: the X quits, as it always used to.
   *
   * The window is told first and the preference stored second, so a write that
   * fails cannot leave the app hiding when the user asked it to quit.
   */
  async setCloseToTray(enabled: boolean): Promise<void> {
    if (!IN_TAURI) return;
    const previous = this.closeToTray();
    if (previous === enabled) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.applyCloseBehavior(enabled);
      this.closeToTray.set(enabled);
      await this.persist({ trayBehavior: enabled ? 'minimize' : 'quit' });
    } catch (err) {
      this.closeToTray.set(previous);
      this.error.set(this.describe(err, 'Could not change what closing the window does.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Records a change the tray menu already made to the OS.
   *
   * The Rust side flips the real state and emits an event; there is nothing left
   * to invoke, but the preference still has to be stored.
   */
  async adoptTrayChange(pref: 'startWithSystem' | 'alwaysOnTop', enabled: boolean): Promise<void> {
    const target = pref === 'startWithSystem' ? this.startWithSystem : this.alwaysOnTop;
    if (target() === enabled) return;
    target.set(enabled);
    await this.persist({ [pref]: enabled });
  }

  /** Marks the one-time desktop-preferences dialog as shown. */
  async markPrompted(): Promise<void> {
    if (this.prompted()) return;
    this.prompted.set(true);
    await this.persist({ desktopPrefsPrompted: true });
  }

  /**
   * Puts the first-run dialog back on the list, so it can be seen again.
   *
   * Two callers need this. The shell uses it when a database from an older
   * version already carries "the preferences dialog has been seen" but has never
   * been asked the newer first-run question — closing a dialog before the
   * question existed is not an answer to it, so the whole setup is offered once
   * more. Settings uses it for the deliberate case: someone who wants to read
   * the introduction again.
   */
  async reopenFirstRun(): Promise<void> {
    if (!IN_TAURI) return;
    this.error.set(null);
    this.prompted.set(false);
    await this.persist({ desktopPrefsPrompted: false });
  }

  // ──────────────────────────────────────────────────────────────────────────

  private async readAutostart(): Promise<boolean> {
    try {
      return await invokeCmd<boolean>('autostart_is_enabled');
    } catch (err) {
      this.error.set(this.describe(err, 'Could not read the startup setting.'));
      return this.settings.settings().startWithSystem;
    }
  }

  /**
   * Applies the flag and returns what the window actually reports.
   *
   * The read-back is the point rather than a nicety: `set_always_on_top`
   * *succeeds* on a desktop that cannot honour it — Wayland has no protocol for
   * a client to raise itself above the others — so success is not the same
   * answer as "it is on top". `window_is_always_on_top` is asked straight
   * afterwards, and its answer is what the switch and the stored preference
   * follow.
   */
  private async applyAlwaysOnTop(enabled: boolean): Promise<boolean> {
    await invokeCmd('window_set_always_on_top', { enabled });
    try {
      const reported = await invokeCmd<boolean>('window_is_always_on_top');
      // Anything that is not an answer is no answer: the signal stays a boolean
      // whatever the desktop layer hands back.
      return typeof reported === 'boolean' ? reported : enabled;
    } catch {
      // No read-back to be had: the request is the best information there is.
      return enabled;
    }
  }

  /** Asks the desktop layer whether always-on-top can work on this desktop. */
  private async readAlwaysOnTopSupported(): Promise<boolean> {
    try {
      return await invokeCmd<boolean>('window_always_on_top_supported');
    } catch {
      // A desktop layer that does not know the question: assume it can, which
      // is what every platform except Wayland answers.
      return true;
    }
  }

  /**
   * Asks the desktop layer what the taskbar can do here.
   *
   * Three answers in one call: whether the API exists, whether DeepWork is
   * already pinned, and — the one this feature needed — whether Windows will
   * even accept a request. A shell from before the extra field existed simply
   * reads `allowed` as undefined, which is false, so the app offers the manual
   * route instead of a button that cannot work.
   */
  private async readPinState(): Promise<{
    pinned?: boolean;
    supported?: boolean;
    allowed?: boolean;
  }> {
    try {
      const state = await invokeCmd<{
        pinned?: boolean;
        supported?: boolean;
        allowed?: boolean;
      } | null>('nudges_taskbar_pin_state');
      return state ?? {};
    } catch {
      // A desktop without a taskbar: nothing to offer, so nothing to show.
      return { pinned: false, supported: false, allowed: false };
    }
  }

  /**
   * Listens for the shell's answer to a pin request.
   *
   * The three answers are kept apart on purpose: **declined** is the user
   * saying no in Windows' own dialog, which leaves everything exactly as it was
   * and needs no message at all; **failed** is the request that could not be
   * made, which does. The reason for a failure is in `system.log`.
   */
  private async listenForPinResult(): Promise<void> {
    if (!IN_TAURI) return;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<'pinned' | 'declined' | 'failed'>('deepwork:taskbar-pin', (event) => {
        this.pinBusy.set(false);
        this.pinned.set(event.payload === 'pinned');

        if (event.payload === 'failed') {
          this.error.set(
            'Windows did not pin DeepWork. You can still pin it yourself: right-click DeepWork in the Start menu, then choose Pin to taskbar.',
          );
        }
      });
    } catch {
      // No event channel: the row can still ask, it just cannot report back.
    }
  }

  /** One sentence for a desktop that took the call and ignored it. */
  private refusedText(): string {
    if (this.alwaysOnTopSupported()) {
      return 'The window would not stay on top — the desktop refused the change.';
    }
    return 'This desktop does not let an app stay above other windows: Wayland leaves the stacking order to the compositor. Starting DeepWork through X11 (run it with WAYLAND_DISPLAY= ) makes it work.';
  }

  private async applyCloseBehavior(keepInTray: boolean): Promise<void> {
    await invokeCmd('window_set_close_behavior', { keepInTray });
  }

  private async persist(patch: {
    startWithSystem?: boolean;
    alwaysOnTop?: boolean;
    trayBehavior?: 'minimize' | 'quit';
    desktopPrefsPrompted?: boolean;
  }): Promise<void> {
    const current = this.settings.settings();
    await this.settings.saveSettings({ ...current, ...patch });
  }

  private describe(err: unknown, fallback: string): string {
    if (typeof err === 'string' && err.trim()) return err;
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }
}
