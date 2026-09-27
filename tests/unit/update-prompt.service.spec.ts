import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { UpdatePromptService } from '../../src/app/core/services/update-prompt.service';
import { UpdateService } from '../../src/app/core/services/update.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import type { ReleaseInfo, UpdateStatus } from '../../src/app/core/models/update.model';

/**
 * The update prompt is the half of the update check the user meets: a system
 * notification that a release exists, and a button that installs it. Everything
 * here runs without a network and without Tauri — the two things it talks to are
 * the update answer and the OS.
 */

const invoke = vi.fn();
let progressHandler: ((event: { payload: [number, number] }) => void) | null = null;
const listen = vi.fn(
  async (_event: string, handler: (event: { payload: [number, number] }) => void) => {
    progressHandler = handler;
    return () => {
      progressHandler = null;
    };
  },
);

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen }));

/** A release shaped like the ones the app publishes, with every platform's file. */
function release(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    version: '2.1.0',
    tag: 'v2.1.0',
    name: 'Deep Work v2.1.0',
    notes: 'A newer build.',
    publishedAt: '2026-06-01T10:00:00Z',
    url: 'https://github.com/malikrajat/deepwork/releases/tag/v2.1.0',
    prerelease: false,
    assets: [
      {
        name: 'DeepWork_2.1.0_x64-setup.exe',
        size: 2_072_863,
        downloadUrl: 'https://github.com/malikrajat/deepwork/releases/download/v2.1.0/setup.exe',
      },
      {
        name: 'DeepWork_2.1.0_amd64.deb',
        size: 3_221_236,
        downloadUrl: 'https://github.com/malikrajat/deepwork/releases/download/v2.1.0/app.deb',
      },
      {
        name: 'DeepWork_2.1.0_x64.AppImage',
        size: 3_221_236,
        downloadUrl: 'https://github.com/malikrajat/deepwork/releases/download/v2.1.0/app.AppImage',
      },
    ],
    ...overrides,
  };
}

/** The update answer, as signals so the prompt's computed values stay live. */
function fakeUpdates(platform = 'windows', status: UpdateStatus = 'update-available') {
  return {
    status: signal<UpdateStatus>(status),
    latest: signal<ReleaseInfo | null>(release()),
    latestVersion: signal<string | null>('v2.1.0'),
    platform,
    error: signal<string | null>(null),
    start: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeNotifications() {
  return { announce: vi.fn().mockResolvedValue(undefined), init: vi.fn() };
}

describe('UpdatePromptService', () => {
  let updates: ReturnType<typeof fakeUpdates>;
  let notifications: ReturnType<typeof fakeNotifications>;
  let service: UpdatePromptService;

  function build(platform = 'windows', status: UpdateStatus = 'update-available') {
    updates = fakeUpdates(platform, status);
    notifications = fakeNotifications();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        UpdatePromptService,
        { provide: UpdateService, useValue: updates },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    service = TestBed.inject(UpdatePromptService);
    return service;
  }

  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    listen.mockClear();
    progressHandler = null;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'];
    TestBed.resetTestingModule();
  });

  /** Removes the "running inside the app" flag the browser path is built on. */
  function asBrowser(): void {
    delete (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'];
  }

  function asDesktop(): void {
    (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
  }

  describe('telling the user', () => {
    it('announces a newer release once, with the version in the title', async () => {
      const prompt = build();

      await prompt.start();

      expect(updates.start).toHaveBeenCalled();
      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(notifications.announce.mock.calls[0][0]).toContain('v2.1.0');
    });

    it('stays quiet for a version it has already announced', async () => {
      await build().start();
      notifications.announce.mockClear();

      // A second launch of the same build: a fresh service, the same storage.
      const relaunched = build();
      await relaunched.start();

      expect(notifications.announce).not.toHaveBeenCalled();
    });

    it('announces a different version again', async () => {
      await build().start();
      notifications.announce.mockClear();

      const next = build();
      updates.latest.set(release({ version: '2.2.0', tag: 'v2.2.0' }));
      updates.latestVersion.set('v2.2.0');
      await next.start();

      expect(notifications.announce).toHaveBeenCalledTimes(1);
    });

    it('says nothing when this build is already the latest release', async () => {
      const prompt = build('windows', 'up-to-date');

      await prompt.start();

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(prompt.visible()).toBe(false);
    });

    it('shows the prompt while a newer release is on offer', () => {
      const prompt = build();
      expect(prompt.visible()).toBe(true);
      expect(prompt.version()).toBe('v2.1.0');
    });

    it('stays out of the way once the user has waved this version away', () => {
      const prompt = build();

      prompt.dismiss();
      expect(prompt.visible()).toBe(false);

      // A newer release is a new question, so it is asked again.
      updates.latest.set(release({ version: '2.2.0', tag: 'v2.2.0' }));
      expect(prompt.visible()).toBe(true);
    });

    it('remembers a dismissal across launches', () => {
      build().dismiss();

      const relaunched = build();
      expect(relaunched.visible()).toBe(false);
    });

    it('survives an unreadable history', () => {
      localStorage.setItem('deepwork.update.prompt.v1', '{ not json');

      const prompt = build();
      expect(prompt.visible()).toBe(true);
    });
  });

  describe('the installer it would fetch', () => {
    it('picks the setup the platform can actually install', () => {
      expect(build('windows').asset()?.name).toBe('DeepWork_2.1.0_x64-setup.exe');
    });

    it('prefers a package over a portable file on Linux', () => {
      expect(build('linux').asset()?.name).toBe('DeepWork_2.1.0_amd64.deb');
    });

    it('offers nothing when the release carries nothing for this machine', () => {
      const prompt = build('macos');
      expect(prompt.asset()).toBeNull();
    });
  });

  describe('installing', () => {
    it('handles the download to the browser outside the desktop app', async () => {
      asBrowser();
      const open = vi.fn();
      const originalOpen = globalThis.open;
      globalThis.open = open as unknown as typeof globalThis.open;
      try {
        const prompt = build();

        await prompt.install();

        expect(open).toHaveBeenCalledWith(
          'https://github.com/malikrajat/deepwork/releases/download/v2.1.0/setup.exe',
          '_blank',
          'noopener,noreferrer',
        );
        expect(invoke).not.toHaveBeenCalled();
      } finally {
        globalThis.open = originalOpen;
      }
    });

    it('explains a release with no installer for this machine', async () => {
      asDesktop();
      const prompt = build('macos');

      await prompt.install();

      expect(prompt.state()).toBe('error');
      expect(prompt.error()).toContain('release page');
    });

    it('downloads the installer and starts it', async () => {
      asDesktop();
      const prompt = build();
      let finishDownload: (path: string) => void = () => undefined;
      invoke.mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finishDownload = resolve;
          }),
      );
      invoke.mockResolvedValueOnce('The installer is running.');

      const pending = prompt.install();
      // The bytes are reported while the download is still running, so the
      // listener has to be in place before the download can be allowed to end.
      await vi.waitFor(() => expect(progressHandler).not.toBeNull());
      progressHandler?.({ payload: [1_036_431, 2_072_863] });
      expect(prompt.percent()).toBe(50);

      finishDownload('C:\\Temp\\deepwork-update\\DeepWork_2.1.0_x64-setup.exe');
      await pending;

      expect(invoke).toHaveBeenNthCalledWith(1, 'update_download', {
        url: 'https://github.com/malikrajat/deepwork/releases/download/v2.1.0/setup.exe',
        fileName: 'DeepWork_2.1.0_x64-setup.exe',
        expectedBytes: 2_072_863,
      });
      expect(invoke).toHaveBeenNthCalledWith(2, 'update_install', {
        path: 'C:\\Temp\\deepwork-update\\DeepWork_2.1.0_x64-setup.exe',
      });
      expect(prompt.state()).toBe('started');
      expect(prompt.note()).toBe('The installer is running.');
      expect(prompt.busy()).toBe(false);
    });

    it('becomes a sentence, not a crash, when the download fails', async () => {
      asDesktop();
      const prompt = build();
      invoke.mockRejectedValueOnce('No connection to GitHub.');

      await prompt.install();

      expect(prompt.state()).toBe('error');
      expect(prompt.error()).toBe('No connection to GitHub.');
    });

    it('ignores a second click while it is already working', async () => {
      asDesktop();
      const prompt = build();
      let finishDownload: (path: string) => void = () => undefined;
      invoke.mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finishDownload = resolve;
          }),
      );
      invoke.mockResolvedValueOnce('started');

      const pending = prompt.install();
      expect(prompt.state()).toBe('downloading');

      // The second click while the first download is still running.
      await prompt.install();

      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      finishDownload('path');
      await pending;

      // One download and one install: the second click started nothing.
      expect(invoke).toHaveBeenCalledTimes(2);
    });
  });
});
