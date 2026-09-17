import { Injectable, inject, signal } from '@angular/core';
import { DesktopPrefsService } from './desktop-prefs.service';

/**
 * The mini widget's window size, in logical pixels.
 *
 * Tauri ships the main window with an 800x600 minimum (see `tauri.conf.json`),
 * which Windows enforces for programmatic resizes too — so the minimum has to be
 * relaxed before the widget can shrink.
 */
const WIDGET_SIZE = { width: 220, height: 60 } as const;

/** Mirrors `app.windows[0].minWidth/minHeight` in `tauri.conf.json`. */
const MAIN_MIN_SIZE = { width: 800, height: 600 } as const;

/** Fallback geometry when the pre-widget size was never captured. */
const MAIN_FALLBACK_SIZE = { width: 1200, height: 800 } as const;

@Injectable({ providedIn: 'root' })
export class UiService {
  focusMode = signal(false);
  isMiniMode = signal(false);

  readonly isTauriEnv = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

  private readonly prefs = inject(DesktopPrefsService);

  /** Geometry captured on the way into the widget, restored on the way out. */
  private savedSize?: { width: number; height: number };
  private savedPosition?: { x: number; y: number };

  toggleFocusMode(): void {
    this.focusMode.update(v => !v);
  }

  enterFocusMode(): void {
    this.focusMode.set(true);
  }

  exitFocusMode(): void {
    this.focusMode.set(false);
  }

  /**
   * Shrinks the window into the always-on-top mini widget.
   *
   * The window keeps its current position on purpose: shrinking toward the
   * corner the user already placed it in feels less disruptive than jumping to
   * the middle of the screen.
   */
  async enterMiniMode(): Promise<void> {
    this.isMiniMode.set(true);
    if (!this.isTauriEnv) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { LogicalSize } = await import('@tauri-apps/api/dpi');
      const win = getCurrentWindow();

      const size = await win.outerSize();
      const position = await win.outerPosition();
      this.savedSize = { width: size.width, height: size.height };
      this.savedPosition = { x: position.x, y: position.y };

      // Minimum first, otherwise the resize is clamped back to 800x600.
      await win.setMinSize(new LogicalSize(WIDGET_SIZE.width, WIDGET_SIZE.height));
      await win.setResizable(false);
      await win.setSize(new LogicalSize(WIDGET_SIZE.width, WIDGET_SIZE.height));
      // A widget is on top by nature, whatever the main-window preference is.
      await win.setAlwaysOnTop(true);
    } catch (e) {
      console.warn('Tauri window API unavailable', e);
    }
  }

  /**
   * Restores the full window: original size, original position, and the
   * always-on-top state the user actually chose.
   */
  async exitMiniMode(): Promise<void> {
    this.isMiniMode.set(false);
    if (!this.isTauriEnv) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { LogicalSize, PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/dpi');
      const win = getCurrentWindow();

      await win.setResizable(true);

      const restoreSize = this.savedSize
        ? new PhysicalSize(this.savedSize.width, this.savedSize.height)
        : new LogicalSize(MAIN_FALLBACK_SIZE.width, MAIN_FALLBACK_SIZE.height);
      await win.setSize(restoreSize);

      if (this.savedPosition) {
        await win.setPosition(new PhysicalPosition(this.savedPosition.x, this.savedPosition.y));
      }

      await win.setMinSize(
        new LogicalSize(MAIN_MIN_SIZE.width, MAIN_MIN_SIZE.height)
      );

      // Hand the window back with the user's own always-on-top choice applied,
      // instead of assuming "off".
      await this.prefs.reapplyAlwaysOnTop();

      await win.unminimize();
      await win.setFocus();
    } catch (e) {
      console.warn('Tauri window API unavailable', e);
    }
  }
}
