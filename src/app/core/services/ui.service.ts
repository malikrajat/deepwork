import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiService {
  focusMode = signal(false);
  isMiniMode = signal(false);

  readonly isTauriEnv = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;
  private savedPhysicalSize?: { width: number; height: number };

  toggleFocusMode(): void {
    this.focusMode.update(v => !v);
  }

  enterFocusMode(): void {
    this.focusMode.set(true);
  }

  exitFocusMode(): void {
    this.focusMode.set(false);
  }

  async enterMiniMode(): Promise<void> {
    this.isMiniMode.set(true);
    if (this.isTauriEnv) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWindow();
        const size = await win.outerSize();
        this.savedPhysicalSize = { width: size.width, height: size.height };
        await win.setSize(new LogicalSize(220, 60));
        await win.setAlwaysOnTop(true);
      } catch (e) {
        console.warn('Tauri window API unavailable', e);
      }
    }
  }

  async exitMiniMode(): Promise<void> {
    this.isMiniMode.set(false);
    if (this.isTauriEnv) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { LogicalSize, PhysicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWindow();
        await win.setAlwaysOnTop(false);
        const restoreSize = this.savedPhysicalSize
          ? new PhysicalSize(this.savedPhysicalSize.width, this.savedPhysicalSize.height)
          : new LogicalSize(1200, 800);
        await win.setSize(restoreSize);
      } catch (e) {
        console.warn('Tauri window API unavailable', e);
      }
    }
  }
}
