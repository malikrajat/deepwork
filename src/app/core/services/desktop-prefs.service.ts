import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { SettingsService } from './settings.service';

/** True when running inside the packaged desktop app (Tauri). */
const IN_TAURI =
  typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

/** Lazily resolves Tauri's `invoke` so browser builds never import it. */
async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/**
 * Owns the two desktop preferences the user can flip from anywhere in the app:
 *
 * - **Start with system** — a per-user OS autostart entry (Windows `Run` key,
 *   Linux XDG autostart, macOS LaunchAgent) written by the Rust layer.
 * - **Always on top** — whether the main window floats above other windows.
 *
 * Both are mirrored into three places (Settings, the dashboard, the system tray)
 * plus a first-run dialog, so this service is the single source of truth: every
 * surface reads these signals and calls these setters, and nobody touches the
 * window or the OS directly.
 *
 * The OS is authoritative for "start with system", because the Windows installer
 * can enable it before the app has ever run and a user can remove the entry by
 * hand. On startup we read the real state and reconcile the stored preference to
 * match, so the switch never lies.
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
    this.alwaysOnTop.set(stored.alwaysOnTop);
    try {
      await this.applyAlwaysOnTop(stored.alwaysOnTop);
    } catch (err) {
      this.error.set(this.describe(err, 'Could not apply always-on-top.'));
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
      await this.applyAlwaysOnTop(enabled);
      this.alwaysOnTop.set(enabled);
      await this.persist({ alwaysOnTop: enabled });
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
   * Used when leaving the mini widget, which forces always-on-top while it is
   * open and must hand the window back in the state the user chose.
   */
  async reapplyAlwaysOnTop(): Promise<void> {
    if (!IN_TAURI) return;
    try {
      await this.applyAlwaysOnTop(this.alwaysOnTop());
    } catch (err) {
      this.error.set(this.describe(err, 'Could not restore always-on-top.'));
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

  private async applyAlwaysOnTop(enabled: boolean): Promise<void> {
    await invokeCmd('window_set_always_on_top', { enabled });
  }

  private async persist(patch: {
    startWithSystem?: boolean;
    alwaysOnTop?: boolean;
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
