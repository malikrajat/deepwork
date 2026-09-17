import { Injectable, signal } from '@angular/core';

const DISMISS_KEY = 'deepwork_install_dismissed';

/** localStorage can be unavailable (private mode, locked-down webview) — never throw. */
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class InstallService {
  /**
   * True when running inside the packaged desktop app (Tauri).
   *
   * The desktop bundle is already an installed application: `beforeinstallprompt`
   * never fires there and `(display-mode: standalone)` never matches, so the
   * browser-only install UI would otherwise show up on every page of the
   * installed app as an extra full-width bar above the app header.
   */
  readonly isDesktopApp =
    typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

  /** True when the browser's native install prompt is ready to trigger */
  readonly canInstall = signal(false);

  /** True when already running as an installed PWA (standalone mode) */
  readonly isInstalled = signal(
    globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false
  );

  /** True when user dismissed the install banner — stored in localStorage */
  readonly isDismissed = signal(readDismissed());

  private deferredPrompt: any = null;

  constructor() {
    // Pick up prompt captured before Angular bootstrapped (race condition fix)
    const early = (globalThis as any).__pwaInstallPrompt;
    if (early) {
      this.deferredPrompt = early;
      this.canInstall.set(true);
      (globalThis as any).__pwaInstallPrompt = null;
    }

    // Also handle prompts that fire after bootstrap
    globalThis.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall.set(true);
    });

    globalThis.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isInstalled.set(true);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* storage unavailable */
      }
    });
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      this.deferredPrompt = null;
      this.canInstall.set(false);
    }
  }

  /** Hide the banner without preventing future installs */
  dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable — hide for this session only */
    }
    this.isDismissed.set(true);
  }
}
