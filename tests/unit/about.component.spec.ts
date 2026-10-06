import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AboutComponent } from '../../src/app/pages/about/about.component';
import { UpdateService } from '../../src/app/core/services/update.service';
import { UpdatePromptService } from '../../src/app/core/services/update-prompt.service';
import {
  APP_RELEASES_URL,
  APP_VERSION,
  APP_WEB_APP_URL,
} from '../../src/app/core/constants/app-info.constants';
import { DEVELOPER } from '../../src/app/core/constants/about.constants';
import type { ReleaseAsset, ReleaseInfo } from '../../src/app/core/models/update.model';

/**
 * The About page has one job per tab: introduce the developer so somebody can
 * hire them, and answer "am I running the latest DeepWork" honestly.
 */

const release: ReleaseInfo = {
  version: '1.1.0',
  tag: 'v1.1.0',
  name: 'Deep Work v1.1.0',
  notes: 'A newer build with fixes.',
  publishedAt: '2026-06-01T10:00:00Z',
  url: 'https://github.com/malikrajat/deepwork/releases/tag/v1.1.0',
  prerelease: false,
  assets: [
    {
      name: 'DeepWork_1.1.0_x64-setup.exe',
      size: 2_072_863,
      downloadUrl: 'https://example.com/setup.exe',
    },
  ],
};

/** The parts of the service the component reads, with nothing real behind them. */
function fakeUpdates(overrides: Record<string, unknown> = {}) {
  const status = signalLike('update-available');
  return {
    status,
    latest: signalLike<ReleaseInfo | null>(release),
    latestVersion: signalLike<string | null>('v1.1.0'),
    error: signalLike<string | null>(null),
    hasUpdate: signalLike(true),
    checking: signalLike(false),
    platformAsset: signalLike(release.assets[0]),
    releaseNotes: signalLike(release.notes),
    platform: 'windows',
    assetFor: (platform: string) => (platform === 'windows' ? release.assets[0] : null),
    currentVersionLabel: `v${APP_VERSION}`,
    start: vi.fn(),
    check: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** A stand-in for a signal that the template can call. */
function signalLike<T>(value: T) {
  const read = () => value;
  return read;
}

/**
 * The in-app installer, as the About page sees it.
 *
 * `isDesktopApp` is the one part worth setting per test: it decides whether the
 * page offers to install the update itself or only to download it. The two
 * assets are what the page's buttons read — `installAsset` is null whenever the
 * release carries nothing the app can run for this machine, which is what turns
 * "Update now" into a plain download.
 */
function fakePrompt(overrides: Record<string, unknown> = {}) {
  return {
    isDesktopApp: false,
    state: signalLike('idle'),
    busy: signalLike(false),
    percent: signalLike(0),
    error: signalLike<string | null>(null),
    note: signalLike<string | null>(null),
    installAsset: signalLike<ReleaseAsset | null>(release.assets[0]),
    downloadAsset: signalLike<ReleaseAsset | null>(release.assets[0]),
    install: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  };
}

/** Each "get it on another device" row: what it says, and where its link goes. */
function downloadRows(element: HTMLElement) {
  return Array.from(element.querySelectorAll('.download-list li')).map((row) => ({
    name: row.querySelector('.download-name')?.textContent?.trim() ?? '',
    detail: row.querySelector('.download-detail')?.textContent?.trim() ?? '',
    action: row.querySelector('a')?.textContent?.trim() ?? '',
    href: row.querySelector('a')?.getAttribute('href') ?? '',
  }));
}

function mount(
  updates: ReturnType<typeof fakeUpdates>,
  prompt: ReturnType<typeof fakePrompt> = fakePrompt(),
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AboutComponent],
    providers: [
      { provide: UpdateService, useValue: updates },
      { provide: UpdatePromptService, useValue: prompt },
    ],
  });
  const fixture = TestBed.createComponent(AboutComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AboutComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens on the developer tab, because that is why people look', () => {
    const fixture = mount(fakeUpdates());
    const element = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.tab()).toBe('developer');
    expect(element.textContent).toContain(DEVELOPER.name);
    expect(element.textContent).toContain('How I can help');
  });

  it('offers a way to be contacted and hired', () => {
    const fixture = mount(fakeUpdates());
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (a) => a.getAttribute('href'),
    );

    expect(links.some((href) => href?.startsWith('mailto:mr.rajatmalik@gmail.com'))).toBe(true);
    expect(links.some((href) => href?.includes('linkedin.com/in/errajatmalik'))).toBe(true);
    expect(links.some((href) => href?.includes('github.com/malikrajat'))).toBe(true);
  });

  it('leaves out the résumé, the skills, the numbers and the work list', () => {
    const fixture = mount(fakeUpdates());
    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent ?? '';
    const links = Array.from(element.querySelectorAll('a')).map((a) => a.getAttribute('href'));

    expect(text).not.toContain('Download resume');
    expect(text).not.toContain('What I am good at');
    expect(text).not.toContain('Experience, in numbers');
    expect(text).not.toContain('Selected work');
    expect(links.some((href) => href?.endsWith('.pdf'))).toBe(false);
  });

  it('never names the employer', () => {
    const fixture = mount(fakeUpdates());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('Siemens');
    expect(text).toContain(DEVELOPER.role);
  });

  it('checks for updates when the page opens', () => {
    const updates = fakeUpdates();
    mount(updates);

    expect(updates.start).toHaveBeenCalled();
  });

  it('switches to the app tab and reports the available release', () => {
    const fixture = mount(fakeUpdates());
    fixture.componentInstance.show('app');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Check for updates');
    expect(element.textContent).toContain(`v${APP_VERSION}`);
    expect(element.textContent).toContain('Version v1.1.0 is available');
    expect(element.textContent).toContain('DeepWork_1.1.0_x64-setup.exe');
    expect(element.textContent).toContain('2 MB');
    expect(element.textContent).toContain('published 1 June 2026');
    expect(element.textContent).toContain('A newer build with fixes.');
  });

  it('links to the issue tracker from the project card, and nothing else', () => {
    const fixture = mount(fakeUpdates());
    fixture.componentInstance.show('app');
    fixture.detectChanges();

    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.link-list a'),
    ).map((a) => a.getAttribute('href'));

    expect(links).toEqual(['https://github.com/malikrajat/deepwork/issues/new']);
  });

  it('offers the browser build and the other desktop platforms by name', () => {
    const fixture = mount(fakeUpdates());
    fixture.componentInstance.show('app');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const rows = downloadRows(element);

    expect(element.textContent).toContain('Get it on another device');
    expect(rows).toHaveLength(4);
    expect(rows[0].name).toBe('Web app');
    expect(rows[1].name).toContain('Windows');
    expect(rows[2].name).toBe('macOS');
    expect(rows[3].name).toBe('Linux');
    expect(rows[0].detail).toContain('malikrajat.github.io/deepwork');
  });

  it('links the browser build to the web app and the installers to their real files', () => {
    const fixture = mount(fakeUpdates());
    fixture.componentInstance.show('app');
    fixture.detectChanges();

    const rows = downloadRows(fixture.nativeElement as HTMLElement);

    expect(rows.map((row) => row.href)).toEqual([
      APP_WEB_APP_URL,
      release.assets[0].downloadUrl,
      APP_RELEASES_URL,
      APP_RELEASES_URL,
    ]);
    expect(rows[0].action).toBe('Open in browser');
    expect(rows[1].action).toBe('Download · 2 MB');
    expect(rows[2].action).toBe('Find it in releases');
  });

  it('marks the platform this copy is running on, with the file it would take', () => {
    const fixture = mount(fakeUpdates());
    fixture.componentInstance.show('app');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const current = element.querySelector('.download-list li.current');

    expect(element.querySelectorAll('.download-list li.current')).toHaveLength(1);
    expect(current?.textContent).toContain('Windows');
    expect(current?.textContent).toContain('This device');
    expect(current?.textContent).toContain('Download · 2 MB');
  });

  it('sends a platform with no file in the newest release to the releases page', () => {
    const macInstaller = {
      name: 'DeepWork_1.1.0_x64.dmg',
      size: 3_221_236,
      downloadUrl: 'https://example.com/x64.dmg',
    };
    const updates = fakeUpdates({
      platform: 'macos',
      assetFor: (platform: string) => (platform === 'macos' ? macInstaller : null),
    });
    const fixture = mount(updates);
    fixture.componentInstance.show('app');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const rows = downloadRows(element);

    expect(rows.map((row) => row.href)).toEqual([
      APP_WEB_APP_URL,
      APP_RELEASES_URL,
      macInstaller.downloadUrl,
      APP_RELEASES_URL,
    ]);
    expect(rows[2].action).toBe('Download · 3.1 MB');
    expect(rows[1].action).toBe('Find it in releases');
    expect(element.querySelector('.download-list li.current')?.textContent).toContain('macOS');
  });

  it('asks GitHub again when the button is pressed', async () => {
    const updates = fakeUpdates();
    const fixture = mount(updates);

    await fixture.componentInstance.checkForUpdates();

    expect(updates.check).toHaveBeenCalled();
  });

  it('writes a status line for each possible answer', () => {
    const cases: Array<{ status: string; title: string }> = [
      { status: 'checking', title: 'Checking GitHub…' },
      { status: 'update-available', title: 'Version v1.1.0 is available' },
      { status: 'up-to-date', title: `You are on the latest release (v${APP_VERSION})` },
      { status: 'ahead', title: `You are running v${APP_VERSION}, newer than the latest release` },
      { status: 'unavailable', title: 'Could not check for updates' },
      { status: 'unknown', title: `You are running v${APP_VERSION}` },
    ];

    for (const testCase of cases) {
      const updates = fakeUpdates({ status: signalLike(testCase.status) });
      const fixture = mount(updates);

      expect(fixture.componentInstance.statusTitle()).toBe(testCase.title);
    }
  });

  it('explains a failed check with the reason it failed', () => {
    const updates = fakeUpdates({
      status: signalLike('unavailable'),
      error: signalLike('No connection to GitHub.'),
      latest: signalLike<ReleaseInfo | null>(null),
      latestVersion: signalLike<string | null>(null),
    });
    const fixture = mount(updates);

    expect(fixture.componentInstance.statusDetail()).toBe('No connection to GitHub.');
  });

  it('names the installer to download and lists the rest of the release', () => {
    const updates = fakeUpdates();
    const fixture = mount(updates);

    expect(fixture.componentInstance.assetSize()).toBe('2 MB');
    expect(fixture.componentInstance.releaseDate()).toBe('1 June 2026');
    expect(fixture.componentInstance.otherAssets()).toEqual([]);
  });

  it('formats asset sizes for the "other files" list', () => {
    const fixture = mount(fakeUpdates());

    expect(fixture.componentInstance.formatSize(3_221_236)).toBe('3.1 MB');
  });

  it('offers to install the update itself inside the desktop app', () => {
    const updates = fakeUpdates();
    const prompt = fakePrompt({ isDesktopApp: true });
    const fixture = mount(updates, prompt);
    fixture.componentInstance.show('app');
    fixture.detectChanges();

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.update-actions button',
      ),
    ).find((candidate) => candidate.textContent?.includes('Update now'));
    button?.click();

    expect(button).toBeTruthy();
    expect(prompt.install).toHaveBeenCalledTimes(1);
  });

  it('leaves the browser build with the download link alone', () => {
    const fixture = mount(fakeUpdates(), fakePrompt({ isDesktopApp: false }));
    fixture.componentInstance.show('app');
    fixture.detectChanges();

    const actions = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(actions.querySelectorAll('.update-actions button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttons.some((label) => label?.includes('Update now'))).toBe(false);
    expect(
      Array.from(actions.querySelectorAll('.update-actions a')).some((link) =>
        link.textContent?.includes('Download'),
      ),
    ).toBe(true);
  });
});
