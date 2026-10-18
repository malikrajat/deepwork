import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { InstallService } from '../../src/app/core/services/install.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { AttentionService } from '../../src/app/core/services/attention.service';
import { LogService } from '../../src/app/core/services/log.service';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

/** A Notification stand-in: only the permission the service asks about matters. */
class FakeNotification {
  static permission: NotificationPermission = 'granted';
  onclick: (() => void) | null = null;
  constructor(_title: string, _options?: NotificationOptions) {}
  close(): void {}
}

function stubMatchMedia(standalone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('display-mode: standalone') ? standalone : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function make(options: {
  userAgent?: string;
  standalone?: boolean;
  desktop?: boolean;
  paused?: boolean;
} = {}) {
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    value: options.userAgent ?? CHROME_WINDOWS,
    configurable: true,
  });
  stubMatchMedia(options.standalone ?? false);
  if (options.desktop) {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  } else {
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  }

  const notifications = { announce: vi.fn().mockResolvedValue(undefined) };
  const attention = { paused: signal(options.paused ?? false) };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: NotificationService, useValue: notifications },
      { provide: AttentionService, useValue: attention },
      { provide: LogService, useValue: log },
    ],
  });
  const install = TestBed.runInInjectionContext(() => new InstallService());
  return { install, notifications, attention, log };
}

describe('InstallService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.stubGlobal('Notification', FakeNotification);
    FakeNotification.permission = 'granted';
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    localStorage.clear();
  });

  describe('where the app is running', () => {
    it('reports the packaged desktop app, and never asks it to install itself', () => {
      const { install } = make({ desktop: true });

      expect(install.mode()).toBe('desktop');
      expect(install.isVisible()).toBe(false);
      expect(install.canStartAtLogin).toBe(true);
      expect(install.canFloatOnTop).toBe(false);
    });

    it('reports an installed web app as installed', () => {
      const { install } = make({ standalone: true });

      expect(install.mode()).toBe('installed');
      expect(install.isPwa()).toBe(true);
      expect(install.isVisible()).toBe(false);
    });

    it('reports a plain tab as a browser and offers the install bar', () => {
      const { install } = make();

      expect(install.mode()).toBe('browser');
      expect(install.isVisible()).toBe(true);
      expect(install.canStartAtLogin).toBe(false);
      expect(install.isMobile()).toBe(false);
      expect(install.os).toBe('windows');
    });

    it('follows the display mode into installed while the page is open', () => {
      const { install } = make();
      expect(install.isInstalled()).toBe(false);

      globalThis.dispatchEvent(new Event('appinstalled'));

      expect(install.isInstalled()).toBe(true);
      expect(install.justInstalled()).toBe(true);
      expect(install.isVisible()).toBe(false);
    });

    it('recognises a phone from its user agent', () => {
      const { install } = make({ userAgent: IPHONE, standalone: true });

      expect(install.isMobile()).toBe(true);
      expect(install.os).toBe('ios');
    });
  });

  describe('the install bar', () => {
    it('can be dismissed, remembered, and brought back on purpose', () => {
      const { install } = make();

      install.dismiss();
      expect(install.isVisible()).toBe(false);
      expect(localStorage.getItem('deepwork_install_dismissed')).toBe('1');

      install.showAgain();
      expect(install.isVisible()).toBe(true);
      expect(install.dialogOpen()).toBe(true);
    });

    it('explains instead of pretending when there is no native prompt', async () => {
      const { install } = make();

      // No `beforeinstallprompt` has fired in this environment.
      expect(install.canInstall()).toBe(false);
      await install.install();

      expect(install.dialogOpen()).toBe(true);
      expect(install.dialogView()).toBe('install');
    });

    it('accepts the browser prompt and closes the dialog when it is accepted', async () => {
      const prompt = {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      };

      // The event the page captured before Angular booted.
      (globalThis as { __pwaInstallPrompt?: unknown }).__pwaInstallPrompt = prompt;
      const { install } = make();
      expect(install.canInstall()).toBe(true);

      await install.install();

      expect(prompt.prompt).toHaveBeenCalledTimes(1);
      expect(install.canInstall()).toBe(false);
    });
  });

  describe('the system-level suggestion', () => {
    it('posts once, after the app has been used for a while', async () => {
      const { install, notifications } = make();

      install.startSystemPrompt();
      await vi.advanceTimersByTimeAsync(149_000);
      expect(notifications.announce).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2_000);
      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(notifications.announce.mock.calls[0][0]).toBe('Install DeepWork');
      expect(localStorage.getItem('deepwork_install_system_prompt_at')).toBeTruthy();
    });

    it('does not suggest installation to a copy that is already installed', async () => {
      const { install, notifications } = make({ standalone: true });

      install.startSystemPrompt();
      await vi.advanceTimersByTimeAsync(200_000);

      expect(notifications.announce).not.toHaveBeenCalled();
    });

    it('does not suggest it to someone who dismissed the bar', async () => {
      const { install, notifications } = make();
      install.dismiss();

      install.startSystemPrompt();
      await vi.advanceTimersByTimeAsync(200_000);

      expect(notifications.announce).not.toHaveBeenCalled();
    });

    it('says nothing without permission, and does not record a prompt it never made', async () => {
      FakeNotification.permission = 'denied';
      const { install, notifications } = make();

      install.startSystemPrompt();
      await vi.advanceTimersByTimeAsync(200_000);

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(localStorage.getItem('deepwork_install_system_prompt_at')).toBeNull();
    });

    it('waits out a pause rather than talking over it', async () => {
      const { install, notifications, attention } = make({ paused: true });

      install.startSystemPrompt();
      await vi.advanceTimersByTimeAsync(200_000);
      expect(notifications.announce).not.toHaveBeenCalled();

      attention.paused.set(false);
      await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);

      expect(notifications.announce).toHaveBeenCalledTimes(1);
    });
  });

  describe('after installation', () => {
    it('asks once how to start at login, and records that it asked', async () => {
      const { install } = make({ standalone: true });

      install.maybeExplainStartup();
      await vi.advanceTimersByTimeAsync(4_500);

      expect(install.dialogOpen()).toBe(true);
      expect(install.dialogView()).toBe('startup');
      expect(localStorage.getItem('deepwork_pwa_startup_asked')).toBe('1');

      // Closing it does not summon it again on the next launch.
      install.closeDialog();
      install.maybeExplainStartup();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(install.dialogOpen()).toBe(false);
    });

    it('stops asking for good once the explanation has been acknowledged', () => {
      const { install } = make({ standalone: true });

      install.acknowledgeStartup();

      expect(install.startupAcknowledged()).toBe(true);
      expect(install.shouldExplainStartup()).toBe(false);
    });

    it('opens the startup explanation when the app is installed mid-session', async () => {
      const { install } = make();

      globalThis.dispatchEvent(new Event('appinstalled'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(install.dialogView()).toBe('startup');
      expect(install.dialogOpen()).toBe(true);
    });
  });
});
