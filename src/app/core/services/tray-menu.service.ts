import { Injectable, inject, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DesktopPrefsService } from './desktop-prefs.service';
import { QuietService } from './quiet.service';
import { UiService } from './ui.service';
import { LogService } from './log.service';
import type { UnlistenFn } from '@tauri-apps/api/event';

/**
 * Bridges system-tray menu actions (emitted from the Rust layer) into the app:
 *
 * - `show` — the tray brought the window forward, so a mini widget expands back
 *   into the full app
 * - `new-task` — open the quick-add dialog, expanding the widget first
 * - `settings` — bring the full window up on the Settings page
 * - `pause` / `pause:5|10|15|30` / `resume` — the timer *and* the reminders,
 *   because a pause that still let a card through would not be a pause
 * - `mute:30|60|240|today|off` — the sound only, for a length of time
 * - `autostart:on|off`, `aot:on|off` — the tray changed the real OS or window
 *   state, so only the stored preference has to follow
 *
 * The pause, mute and resume actions are deliberately *not* implemented here:
 * they live in `QuietService`, which every surface that offers them calls — the
 * in-app panel, Settings and this tray. The tray is one more remote control for
 * the same state rather than a second definition of it, which is what keeps a
 * Linux session without a tray icon from having a different pause from Windows.
 */
@Injectable({ providedIn: 'root' })
export class TrayMenuService implements OnDestroy {
  private readonly quiet = inject(QuietService);
  private readonly desktopPrefs = inject(DesktopPrefsService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly log = inject(LogService);

  private unlisten: UnlistenFn | null = null;

  /**
   * Brings the full app up from the tray, expanding the widget first.
   *
   * `exitMiniMode` is not a no-op when the window is already full, so it is
   * asked rather than assumed: a menu item that reshapes a window that is
   * already the right shape is a menu item that steals focus for nothing.
   */
  private async revealApp(): Promise<void> {
    if (this.ui.isMiniMode()) await this.ui.exitMiniMode();
    else await this.ui.restoreWindowFrame();
  }

  async init(): Promise<void> {
    if (this.unlisten) return;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      this.unlisten = await listen<string>('deepwork:tray', (event) => {
        this.handle(event.payload);
      });
    } catch {
      // Running outside Tauri (browser dev / tests) — tray events are unavailable.
    }
  }

  private handle(payload: string): void {
    switch (payload) {
      case 'show':
        // Rust already un-minimised and focused the window; if it happens to be
        // the mini widget, the user asked for the app, not the widget.
        if (this.ui.isMiniMode()) void this.ui.exitMiniMode();
        // A window that was hidden to the tray comes back with the frame every
        // full window is entitled to — the frame is never left to chance.
        else void this.ui.restoreWindowFrame();
        break;
      case 'new-task':
        // The tray restored the window; the widget still has to become the app,
        // because a 136x76 frame cannot hold a form.
        void this.revealApp().then(() => this.ui.requestQuickAdd());
        break;
      case 'settings':
        void this.revealApp().then(() => this.router.navigate(['/settings']));
        break;
      case 'pause':
        this.quiet.pause(null);
        break;
      case 'resume':
        this.quiet.resume();
        break;
      case 'mute:30':
        this.quiet.mute(30);
        break;
      case 'mute:60':
        this.quiet.mute(60);
        break;
      case 'mute:240':
        this.quiet.mute(240);
        break;
      case 'mute:today':
        this.quiet.mute('today');
        break;
      case 'mute:off':
        this.quiet.unmute();
        break;
      case 'autostart:on':
        void this.desktopPrefs.adoptTrayChange('startWithSystem', true);
        break;
      case 'autostart:off':
        void this.desktopPrefs.adoptTrayChange('startWithSystem', false);
        break;
      case 'aot:on':
        void this.desktopPrefs.adoptTrayChange('alwaysOnTop', true);
        break;
      case 'aot:off':
        void this.desktopPrefs.adoptTrayChange('alwaysOnTop', false);
        break;
      default:
        if (payload.startsWith('pause:')) {
          const minutes = Number(payload.slice('pause:'.length));
          if (!Number.isFinite(minutes) || minutes <= 0) break;
          this.quiet.pause(minutes);
        }
        break;
    }
  }

  ngOnDestroy(): void {
    this.unlisten?.();
  }
}
