import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
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

    this.ready.set(true);
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
