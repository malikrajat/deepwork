import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class InstallService {
  /** True when the browser's native install prompt is ready to trigger */
  readonly canInstall = signal(false);

  /** True when already running as an installed PWA (standalone mode) */
  readonly isInstalled = signal(
    globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false
  );

  /** True when user dismissed the install banner — stored in localStorage */
  readonly isDismissed = signal(
    localStorage.getItem('deepwork_install_dismissed') === '1'
  );

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
      localStorage.removeItem('deepwork_install_dismissed');
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
    localStorage.setItem('deepwork_install_dismissed', '1');
    this.isDismissed.set(true);
  }
}
