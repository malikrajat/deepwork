import { Injectable, computed, inject, signal } from '@angular/core';
import { DesktopPrefsService } from './desktop-prefs.service';
import { fitInsideWorkArea } from '../utils/window.util';
import type { Window as TauriWindow } from '@tauri-apps/api/window';

/**
 * The mini widget's window size, in logical pixels.
 *
 * Tauri ships the main window with an 800x600 minimum (see `tauri.conf.json`),
 * which Windows enforces for programmatic resizes too — so the minimum has to be
 * relaxed before the widget can shrink.
 *
 * 136x76 is the ring (60), the gaps and padding (8 + 8 + 8) and the 2x2 grid of
 * 24px controls the widget answers its alerts with (52). The browser build's
 * floating panel is the same shape, and `tests/unit/visual-crispness.spec.ts`
 * holds the two together.
 */
const WIDGET_SIZE = { width: 136, height: 76 } as const;

/** Mirrors `app.windows[0].minWidth/minHeight` in `tauri.conf.json`. */
const MAIN_MIN_SIZE = { width: 800, height: 600 } as const;

/** Fallback geometry when the pre-widget size was never captured. */
const MAIN_FALLBACK_SIZE = { width: 1200, height: 800 } as const;

@Injectable({ providedIn: 'root' })
export class UiService {
  focusMode = signal(false);
  isMiniMode = signal(false);

  readonly isTauriEnv = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

  /**
   * True while the native window *is* the widget.
   *
   * The browser build also has a mini mode, but there it is a floating panel over
   * the running app — only the desktop build hides the app shell and strips the
   * window's title bar.
   */
  readonly isNativeWidget = computed(() => this.isMiniMode() && this.isTauriEnv);

  /**
   * True when the window the widget lives in is really transparent.
   *
   * `tauri.conf.json` asks for a transparent window, but only Windows delivers
   * one without the macOS private API — and a page that paints no background
   * inside a window that cannot be transparent shows white, which is worse than
   * a square corner. So the transparent surface is only claimed where it is
   * known to work; elsewhere the widget keeps the app's dark background.
   */
  private readonly widgetWindowIsTransparent =
    this.isTauriEnv && /Windows/i.test(globalThis.navigator?.userAgent ?? '');

  private readonly prefs = inject(DesktopPrefsService);

  /** Geometry captured on the way into the widget, restored on the way out. */
  private savedSize?: { width: number; height: number };
  private savedPosition?: { x: number; y: number };
  /** Whether the full window was maximised when it shrank. */
  private savedMaximized = false;

  private initialized = false;

  /**
   * Connects the widget to the desktop shell.
   *
   * The desktop event that matters here is the **system minimise button**:
   * Windows reports it as a 0x0 resize, the Rust layer forwards it as
   * `deepwork:minimize`, and the window turns into the widget. Small, always on
   * top, and never lost behind other windows — the timer stays visible exactly
   * when the user stops looking at the full app.
   *
   * Starting with the system is a different story: that opens the normal DeepWork
   * window (see `restore_in_background` in `src-tauri/src/lib.rs`).
   *
   * Safe to call more than once and inert outside the desktop app.
   */
  async init(): Promise<void> {
    if (this.initialized || !this.isTauriEnv) return;
    this.initialized = true;

    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      // Remember where the full window lives before anything can shrink it, so
      // leaving the widget always has somewhere sensible to return to.
      await this.captureGeometry(getCurrentWindow());

      const { listen } = await import('@tauri-apps/api/event');
      // The listener lives as long as the window does, so the handle is not kept.
      await listen('deepwork:minimize', () => {
        // Not "return if already a widget": repeating it also recovers the window
        // if the widget itself was minimized from the taskbar.
        void this.enterMiniMode({ wasMinimized: true });
      });
    } catch (e) {
      console.warn('Tauri window API unavailable', e);
    }
  }

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
   *
   * The widget deliberately has no title bar: no minimise, maximise or close
   * buttons of its own. The expand arrow inside it (or Esc) is the way back, and
   * dragging it anywhere moves the whole window.
   */
  async enterMiniMode(
    options: { wasMinimized?: boolean } = {}
  ): Promise<void> {
    this.isMiniMode.set(true);
    // The window is transparent, so the page behind the widget has to be too —
    // that is what makes the rounded corners empty instead of square.
    this.setWidgetSurface(true);
    if (!this.isTauriEnv) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { LogicalSize } = await import('@tauri-apps/api/dpi');
      const win = getCurrentWindow();

      const sizeBefore = await win.outerSize();
      // A minimized window has to be un-minimized before it can be reshaped —
      // otherwise the widget stays buried in the taskbar. The OS minimise button
      // is announced by the caller (Windows reports it as a 0x0 resize); the size
      // check is the fallback for any other way in.
      const wasMinimized =
        options.wasMinimized ?? (sizeBefore.width === 0 || sizeBefore.height === 0);
      if (wasMinimized) {
        await win.unminimize();
        // Hide while the window is between two shapes, so the full-size window
        // never flashes on screen on its way to becoming the widget.
        await win.hide();
      }
      await this.captureGeometry(win);

      // Minimum first, otherwise the resize is clamped back to 800x600.
      await win.setMinSize(new LogicalSize(WIDGET_SIZE.width, WIDGET_SIZE.height));
      await win.setResizable(false);
      await win.setDecorations(false);
      await win.setSize(new LogicalSize(WIDGET_SIZE.width, WIDGET_SIZE.height));
      // A widget is on top by nature, whatever the main-window preference is.
      await win.setAlwaysOnTop(true);
      // Last, because reshaping the window is what puts the frame back: the
      // widget's surface fills the window, and the border Windows draws around
      // it is repainted in that same colour — see `paintWidgetFrame`.
      await this.paintWidgetFrame(true);

      if (wasMinimized) {
        await win.show();
        await win.setFocus();
      }
    } catch (e) {
      console.warn('Tauri window API unavailable', e);
    }
  }

  /**
   * Restores the full window: original size, original position, and the
   * always-on-top state the user actually chose.
   *
   * The geometry it goes back to is only a wish until the desktop agrees to it.
   * The widget can be dragged anywhere in the meantime — onto a second monitor, a
   * different DPI scale, or a display that has since been unplugged — and a
   * maximised window's frame is wider and taller than the screen it was maximised
   * on. Growing back to those numbers unexamined is how a restored window ends up
   * with its title bar above the top of the screen, where it cannot be dragged or
   * closed, and the maximise button has to be pressed to rescue it. So the wanted
   * geometry is fitted into the work area of the monitor that owns it first — see
   * `fitInsideWorkArea` — which is a no-op for a window that already fits.
   */
  async exitMiniMode(): Promise<void> {
    this.isMiniMode.set(false);
    // Back to an opaque background for the full window.
    this.setWidgetSurface(false);
    if (!this.isTauriEnv) return;
    try {
      const { getCurrentWindow, currentMonitor, monitorFromPoint } =
        await import('@tauri-apps/api/window');
      const { LogicalSize, PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/dpi');
      const win = getCurrentWindow();

      // The title bar has to come back before the window grows again, otherwise
      // the restored window looks like a widget with a full app inside it.
      await win.setDecorations(true);
      await win.setResizable(true);

      // Where the window wants to be: the geometry it had before it shrank. The
      // fallback size is logical, so it is converted before it can be compared
      // with a monitor's physical work area.
      const wantedSize =
        this.savedSize ??
        new LogicalSize(MAIN_FALLBACK_SIZE.width, MAIN_FALLBACK_SIZE.height).toPhysical(
          await win.scaleFactor(),
        );
      const wantedPosition = this.savedPosition ?? (await win.outerPosition());

      // ...and where it is allowed to be: inside the monitor that owns that
      // position, falling back to the one the widget is sitting on.
      const monitor =
        (await monitorFromPoint(wantedPosition.x, wantedPosition.y).catch(() => null)) ??
        (await currentMonitor().catch(() => null));
      const fit = fitInsideWorkArea(
        {
          position: { x: wantedPosition.x, y: wantedPosition.y },
          size: { width: wantedSize.width, height: wantedSize.height },
        },
        monitor?.workArea,
      );

      await win.setSize(new PhysicalSize(fit.size.width, fit.size.height));
      await win.setPosition(new PhysicalPosition(fit.position.x, fit.position.y));

      await win.setMinSize(
        new LogicalSize(MAIN_MIN_SIZE.width, MAIN_MIN_SIZE.height)
      );

      // A window that was maximised when it shrank goes back maximised: the fit
      // above has already put it where the OS expects to un-maximise it to.
      if (this.savedMaximized) await win.maximize();

      // The widget is over: the window's own border belongs to Windows again,
      // rather than to the widget's surface colour.
      await this.paintWidgetFrame(false);

      // Hand the window back with the user's own always-on-top choice applied,
      // instead of assuming "off".
      await this.prefs.reapplyAlwaysOnTop();

      await win.unminimize();
      await win.setFocus();
    } catch (e) {
      console.warn('Tauri window API unavailable', e);
    }
  }

  /**
   * Makes the window visible enough for the water nudge to be answered.
   *
   * The nudge is the one thing in the app that asks a question and then waits:
   * it cannot be missed and it cannot be dismissed by waiting, so it also cannot
   * be delivered to a window that is behind a maximized browser or shrunk into
   * the 136x76 widget. The full window is restored first (the widget has no room
   * for a question), then raised above whatever the user is working in.
   *
   * Focus is deliberately *not* taken: the user may be mid-sentence in another
   * app, and the card is on top of their work either way.
   */
  async surfaceForNudge(): Promise<void> {
    if (this.isMiniMode()) await this.exitMiniMode();
    if (!this.isTauriEnv) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.unminimize();
      await win.show();
      await win.setAlwaysOnTop(true);
    } catch (e) {
      console.warn('Tauri window API unavailable', e);
    }
  }

  /**
   * Hands the window back to the always-on-top preference the user chose.
   *
   * `surfaceForNudge` forces always-on-top on so the question is actually seen;
   * answering it puts the window back the way the user left it.
   */
  async releaseNudgeSurface(): Promise<void> {
    if (!this.isTauriEnv) return;
    await this.prefs.reapplyAlwaysOnTop();
  }

  /**
   * Tells the desktop shell to take the window's own border away — or give it
   * back.
   *
   * Windows keeps a hairline border around every top-level window — a
   * decoration-less, transparent one included — and colours it from the system,
   * which around a 136x76 widget reads as a white line the app never drew, on all
   * four sides. `window_paint_widget_frame` removes the band the border lives in
   * and tells Windows 11 to draw no border at all, and hands both back on the way
   * out — so the widget has no frame of any kind, and the full window keeps the
   * one it always had.
   *
   * Best effort: a border that cannot be repainted is a cosmetic loss, never a
   * reason to leave the widget half-built, so the failure is logged and dropped.
   */
  private async paintWidgetFrame(widget: boolean): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('window_paint_widget_frame', { widget });
    } catch (e) {
      console.warn('Tauri window API unavailable', e);
    }
  }

  /**
   * Paints — or clears — the page background behind the widget.
   *
   * Kept as a class on <html> rather than a blanket CSS rule so the app window
   * itself is never transparent: the widget claims it on the way in and gives it
   * back on the way out, which leaves the full window (and its subpixel text)
   * exactly as it was.
   */
  private setWidgetSurface(transparent: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(
      'widget-transparent',
      transparent && this.widgetWindowIsTransparent
    );
  }

  /**
   * Remembers the window's full-size geometry so leaving the widget can put it
   * back.
   *
   * Readings taken while the window is minimized (0x0 at the -32000 parking
   * position Windows uses) or while it already *is* the widget are ignored, so a
   * shrink can never overwrite the size the user actually wants back.
   *
   * The maximised flag is saved with them because a maximised window's frame is
   * not the geometry the user thinks of as theirs: it is the screen plus the
   * resize border on every side. Remembering that it was maximised is what lets
   * leaving the widget hand back the window they had, rather than a screen-sized
   * window that only looks the same until it is moved.
   */
  private async captureGeometry(win: TauriWindow): Promise<void> {
    const size = await win.outerSize();
    const position = await win.outerPosition();
    const looksLikeMainWindow = size.width >= MAIN_MIN_SIZE.width && size.height >= MAIN_MIN_SIZE.height;
    const usablePosition = position.x > -20_000 && position.y > -20_000;
    if (looksLikeMainWindow && usablePosition) {
      this.savedSize = { width: size.width, height: size.height };
      this.savedPosition = { x: position.x, y: position.y };
      this.savedMaximized = await win.isMaximized().catch(() => false);
    }
  }

}
