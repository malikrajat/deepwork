import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { UpdateService } from '../../src/app/core/services/update.service';
import { APP_RELEASES_API, APP_VERSION } from '../../src/app/core/constants/app-info.constants';
import type { ReleaseInfo } from '../../src/app/core/models/update.model';

/**
 * The update check is the one place the app talks to the internet, so it has to
 * be honest about all four answers it can give: something newer exists, nothing
 * does, this build is ahead of the releases, or GitHub could not be reached.
 *
 * Everything below runs against a stubbed `fetch` — no network, no rate limit,
 * no real releases.
 */

const CACHE_KEY = 'deepwork.update.v1';

/**
 * The release these tests put in front of the app: the next patch after the
 * version this build carries.
 *
 * Derived rather than written out, because the one thing that makes an update an
 * update is that it is *newer than the app*. A fixture pinned to a number turns
 * into "already up to date" the moment the app is released as that number — a
 * test failing over a version bump rather than over a change.
 */
const NEXT_VERSION = nextPatch(APP_VERSION);
const NEXT_TAG = `v${NEXT_VERSION}`;

/** `2.1.0` → `2.1.1`. */
function nextPatch(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

/** A release payload shaped like GitHub's, with sensible defaults. */
function release(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: NEXT_TAG,
    name: `Deep Work ${NEXT_TAG}`,
    body: `# Deep Work ${NEXT_TAG}\n\n- Something new`,
    published_at: '2026-06-01T10:00:00Z',
    html_url: `https://github.com/malikrajat/deepwork/releases/tag/${NEXT_TAG}`,
    prerelease: false,
    draft: false,
    assets: [
      {
        name: `DeepWork_${NEXT_VERSION}_x64-setup.exe`,
        size: 2_072_863,
        browser_download_url: `https://github.com/malikrajat/deepwork/releases/download/${NEXT_TAG}/setup.exe`,
      },
      {
        name: `DeepWork_${NEXT_VERSION}_x64.dmg`,
        size: 3_221_236,
        browser_download_url: `https://github.com/malikrajat/deepwork/releases/download/${NEXT_TAG}/x64.dmg`,
      },
    ],
    ...overrides,
  };
}

/** A release as the service stores it for the next run. */
function storedRelease(version: string): ReleaseInfo {
  return {
    version,
    tag: `v${version}`,
    name: `Deep Work v${version}`,
    notes: '',
    publishedAt: '2026-05-27T09:18:02Z',
    url: `https://github.com/malikrajat/deepwork/releases/tag/v${version}`,
    prerelease: false,
    assets: [],
  };
}

/** A response object with just the parts the service reads. */
function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('UpdateService', () => {
  let service: UpdateService;
  let fetchMock: ReturnType<typeof vi.fn>;
  const realFetch = globalThis.fetch;

  /** Injects the service as if it were running on Windows. */
  function setup(userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'): UpdateService {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: userAgent,
      configurable: true,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [UpdateService] });
    return TestBed.inject(UpdateService);
  }

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    service = setup();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts out not knowing, and says so', () => {
    expect(service.status()).toBe('unknown');
    expect(service.latest()).toBeNull();
    expect(service.hasUpdate()).toBe(false);
    expect(service.currentVersion).toBe(APP_VERSION);
  });

  it('reports a newer release, with the notes and the matching installer', async () => {
    fetchMock.mockResolvedValue(response([release()]));

    await service.check();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(APP_RELEASES_API);
    expect(service.status()).toBe('update-available');
    expect(service.hasUpdate()).toBe(true);
    expect(service.latestVersion()).toBe(NEXT_TAG);
    expect(service.error()).toBeNull();
    expect(service.checkedAt()).toBeTruthy();
    expect(service.platformAsset()?.name).toBe(`DeepWork_${NEXT_VERSION}_x64-setup.exe`);
    expect(service.platformAsset()?.size).toBe(2_072_863);
    expect(service.releaseNotes()).toContain('Something new');
  });

  it('says nothing is newer when the release matches this build', async () => {
    fetchMock.mockResolvedValue(response([release({ tag_name: `v${APP_VERSION}` })]));

    await service.check();

    expect(service.status()).toBe('up-to-date');
    expect(service.hasUpdate()).toBe(false);
  });

  it('admits when this build is ahead of anything published', async () => {
    fetchMock.mockResolvedValue(response([release({ tag_name: 'v1.0.0' })]));

    await service.check();

    expect(service.status()).toBe('ahead');
    expect(service.latestVersion()).toBe('v1.0.0');
  });

  it('picks the highest version, not the first or the last one listed', async () => {
    fetchMock.mockResolvedValue(
      response([
        release({ tag_name: 'v2.2.0' }),
        release({ tag_name: 'v2.10.0' }),
        release({ tag_name: 'v0.9.0' }),
      ]),
    );

    await service.check();

    expect(service.latestVersion()).toBe('v2.10.0');
  });

  it('ignores drafts and entries with no tag', async () => {
    fetchMock.mockResolvedValue(
      response([
        release({ tag_name: 'v9.0.0', draft: true }),
        release({ tag_name: '' }),
        'not an object',
        release({ tag_name: 'v1.0.0' }),
      ]),
    );

    await service.check();

    expect(service.latestVersion()).toBe('v1.0.0');
  });

  it('keeps only assets that can actually be downloaded', async () => {
    fetchMock.mockResolvedValue(
      response([
        release({
          assets: [
            { name: 'setup.exe', size: 10, browser_download_url: '' },
            { name: 'setup.exe', size: 10 },
            { size: 10, browser_download_url: 'https://example.com/x' },
          ],
        }),
      ]),
    );

    await service.check();

    expect(service.latest()?.assets).toEqual([]);
    expect(service.platformAsset()).toBeNull();
  });

  it('finds the file for any platform the release carries, not just this one', async () => {
    fetchMock.mockResolvedValue(response([release()]));

    await service.check();

    expect(service.platform).toBe('windows');
    expect(service.platformAsset()?.name).toBe(`DeepWork_${NEXT_VERSION}_x64-setup.exe`);
    expect(service.assetFor('macos')?.name).toBe(`DeepWork_${NEXT_VERSION}_x64.dmg`);
    // Nothing for Linux in this release — the page shows the releases instead.
    expect(service.assetFor('linux')).toBeNull();
  });

  it('has no file to offer before it has read a release', () => {
    expect(service.assetFor('windows')).toBeNull();
    expect(service.platformAsset()).toBeNull();
  });

  it('explains a rate limit instead of pretending the check worked', async () => {
    fetchMock.mockResolvedValue(response({ message: 'rate limited' }, 403));

    await service.check();

    expect(service.status()).toBe('unavailable');
    expect(service.error()).toContain('rate-limiting');
  });

  it('reports an unreachable GitHub as being offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await service.check();

    expect(service.status()).toBe('unavailable');
    expect(service.error()).toBe('No connection to GitHub.');
  });

  it('gives up on a request that never answers', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await service.check();

    expect(service.error()).toBe('GitHub did not answer in time.');
  });

  it('handles a repository with no releases yet', async () => {
    fetchMock.mockResolvedValue(response([]));

    await service.check();

    expect(service.status()).toBe('unavailable');
    expect(service.error()).toBe('No releases have been published yet.');
  });

  it('refuses to invent an answer from an unexpected payload', async () => {
    fetchMock.mockResolvedValue(response({ message: 'Not Found' }));

    await service.check();

    expect(service.status()).toBe('unavailable');
    expect(service.error()).toBe('GitHub returned an unexpected response.');
  });

  it('says so when the published tag is not a version it can compare', async () => {
    fetchMock.mockResolvedValue(response([release({ tag_name: 'latest' })]));

    await service.check();

    expect(service.status()).toBe('unavailable');
    expect(service.error()).toContain('not a version');
  });

  it('runs one request when the button is pressed during the startup check', async () => {
    fetchMock.mockResolvedValue(response([release()]));

    await Promise.all([service.check(), service.check(), service.check()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stores the answer and reuses it on the next start', async () => {
    fetchMock.mockResolvedValue(response([release()]));
    await service.check();
    expect(localStorage.getItem(CACHE_KEY)).toContain(NEXT_VERSION);

    // A fresh service — the app restarting.
    fetchMock.mockClear();
    const restarted = setup();
    restarted.start();

    expect(restarted.status()).toBe('update-available');
    expect(restarted.latestVersion()).toBe(NEXT_TAG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a stored answer at once and refreshes it once it is stale', async () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        release: storedRelease('2.0.0'),
        checkedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      }),
    );
    fetchMock.mockResolvedValue(response([release({ tag_name: 'v2.4.0' })]));

    const restarted = setup();
    restarted.start();

    // The stored answer is on screen before the request comes back.
    expect(restarted.latestVersion()).toBe('v2.0.0');

    await vi.waitFor(() => expect(restarted.latestVersion()).toBe('v2.4.0'));
  });

  it('ignores a stored answer that is malformed or not one of ours', async () => {
    localStorage.setItem(CACHE_KEY, '{"release":{}}');
    localStorage.setItem('something-else', 'v9.9.9');
    fetchMock.mockResolvedValue(response([release()]));

    const restarted = setup();
    restarted.start();

    // Nothing was read from storage, so it goes and asks GitHub.
    expect(restarted.latest()).toBeNull();
    await vi.waitFor(() => expect(restarted.status()).toBe('update-available'));
  });

  it('survives storage being unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    fetchMock.mockResolvedValue(response([release()]));

    const restarted = setup();
    await restarted.check();

    expect(restarted.status()).toBe('update-available');
  });

  it('labels the versions for display', () => {
    expect(service.currentVersionLabel).toBe(`v${APP_VERSION}`);
    expect(service.releasesUrl).toContain('/releases');
  });
});
