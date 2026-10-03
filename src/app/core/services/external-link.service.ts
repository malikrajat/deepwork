import { Injectable, inject } from '@angular/core';
import { LogService } from './log.service';

/** True when running inside the packaged desktop app (Tauri). */
function inTauri(): boolean {
  return typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;
}

/**
 * Opens a link that leaves the app.
 *
 * In a browser this is nothing special. In the desktop app it very much is: a
 * `target="_blank"` link inside the webview is swallowed — the new-window
 * request is denied, so the click appears to do nothing — which makes a "visit
 * my website" button a trap. So the desktop build hands the URL to Rust, which
 * opens it in the user's real browser, and falls back to the webview's own
 * `window.open` if that ever fails.
 */
@Injectable({ providedIn: 'root' })
export class ExternalLinkService {
  private readonly log = inject(LogService, { optional: true });

  /** True when links have to be handed to the OS rather than to the webview. */
  readonly isDesktopApp = inTauri();

  /**
   * Opens `url` outside the app and reports whether the native path handled it.
   * Never throws: the worst case is a log line and the webview fallback.
   */
  async open(url: string): Promise<boolean> {
    if (!url) return false;
    if (!this.isDesktopApp) return false;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_external_url', { url });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log?.warn('system', `could not open ${url} in the browser: ${message}`);
      this.openInWebview(url);
      return false;
    }
  }

  /** The last resort, and the normal path in a browser build. */
  private openInWebview(url: string): void {
    try {
      globalThis.open?.(url, '_blank', 'noopener,noreferrer');
    } catch {
      // Nothing left to try; the link text is still on screen to copy.
    }
  }
}
