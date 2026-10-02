import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_RELEASES_API, APP_RELEASES_URL, APP_VERSION } from '../constants/app-info.constants';
import type { ReleaseAsset, ReleaseInfo, UpdateStatus } from '../models/update.model';
import { compareVersions, formatVersion } from '../utils/version.util';
import { detectPlatform, pickAssetFor, summarizeNotes } from '../utils/release.util';
import type { Platform } from '../utils/release.util';
import { LogService } from './log.service';

/** Where the last answer is kept, so a restart does not spend a request. */
const CACHE_KEY = 'deepwork.update.v1';

/**
 * How long a stored answer is trusted.
 *
 * GitHub allows 60 unauthenticated requests per hour per IP, so a check on every
 * page view would run the app out of budget by lunchtime. Six hours is fresh
 * enough that a release published in the morning is noticed the same day, and
 * "Check now" always overrides it.
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** A request that never answers must not leave the card spinning forever. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Releases fetched per check, newest first. */
const RELEASES_PER_PAGE = 10;

/** What is stored between runs. */
interface CachedCheck {
  release: ReleaseInfo;
  checkedAt: string;
}

/**
 * Answers one question: is there a newer DeepWork than the one running?
 *
 * The source of truth is the project's own GitHub releases, because that is
 * where installers are published. The service reads the release list, keeps the
 * highest version it can parse, and reports one of four honest outcomes rather
 * than a yes/no that cannot express "this build is not released yet" or "the
 * network is down".
 *
 * Nothing here throws and nothing here blocks: a failed check is a sentence on
 * the About page, never a broken app.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly log = inject(LogService, { optional: true });

  /** The version of the running build. */
  readonly currentVersion = APP_VERSION;

  /** The newest release that has been read, if any. */
  readonly latest = signal<ReleaseInfo | null>(null);

  readonly status = signal<UpdateStatus>('unknown');

  /** When the answer was obtained, ISO timestamp. */
  readonly checkedAt = signal<string | null>(null);

  /** Why the last check could not answer, or null. */
  readonly error = signal<string | null>(null);

  /** True while a request is in flight, so the button can say so. */
  readonly checking = computed(() => this.status() === 'checking');

  /** True when a newer release exists — what the sidebar dot listens to. */
  readonly hasUpdate = computed(() => this.status() === 'update-available');

  /** The version on GitHub, ready to show (`v1.0.0`), or null. */
  readonly latestVersion = computed(() => {
    const release = this.latest();
    return release ? formatVersion(release.version) : null;
  });

  /** The running build, ready to show (`v2.0.0`). */
  readonly currentVersionLabel = formatVersion(APP_VERSION);

  /** Where "see all releases" points. */
  readonly releasesUrl = APP_RELEASES_URL;

  /** The platform this build is running on, for the download link. */
  readonly platform: Platform = detectPlatform(
    typeof navigator === 'undefined' ? '' : navigator.userAgent,
  );

  /** The installer in the newest release that fits this machine, if there is one. */
  readonly platformAsset = computed<ReleaseAsset | null>(() => this.assetFor(this.platform));

  /** The release notes, trimmed to a readable length for the card. */
  readonly releaseNotes = computed(() => {
    const release = this.latest();
    return release ? summarizeNotes(release.notes) : '';
  });

  /**
   * The installer in the newest release that fits `platform`, if there is one.
   *
   * Reads the same release as `platformAsset`, so the About page can offer every
   * platform's download from the one release it already fetched — and gets null,
   * rather than an invented link, when that release carries nothing for it.
   */
  assetFor(platform: Platform): ReleaseAsset | null {
    const release = this.latest();
    return release ? pickAssetFor(release.assets, platform) : null;
  }

  /** Prevents two checks running at once (a click during the startup check). */
  private inFlight: Promise<void> | null = null;

  /**
   * The quiet check: uses a stored answer when it is fresh, and otherwise asks
   * GitHub in the background. Called once as the app starts, never awaited, so
   * a slow network cannot delay the window.
   *
   * Returns when the answer is known — from the cache immediately, or from
   * GitHub — which is what lets the update prompt announce a release as soon as
   * it has been read.
   */
  async start(): Promise<void> {
    const cached = this.readCache();
    if (cached) {
      this.apply(cached.release, cached.checkedAt);
      if (Date.now() - Date.parse(cached.checkedAt) < CHECK_INTERVAL_MS) return;
    }
    await this.check({ silent: cached !== null });
  }

  /**
   * Asks GitHub for the newest release.
   *
   * `silent` keeps the startup check from flipping the card into "checking" when
   * there is already an answer on screen to read.
   */
  async check(options: { silent?: boolean } = {}): Promise<void> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.runCheck(options).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runCheck({ silent = false }: { silent?: boolean }): Promise<void> {
    if (!silent) {
      this.status.set('checking');
      this.error.set(null);
    }

    try {
      const releases = await this.fetchReleases();
      const newest = newestRelease(releases);

      if (!newest) {
        this.fail('No releases have been published yet.');
        return;
      }

      const checkedAt = new Date().toISOString();
      this.apply(newest, checkedAt);
      this.writeCache({ release: newest, checkedAt });
      this.log?.info(
        'flow',
        `update check · running ${APP_VERSION} · latest ${newest.version} · ${this.status()}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.fail(message);
      this.log?.warn('network', `update check failed: ${message}`);
    }
  }

  /** Fetches the release list and reduces it to the fields the app shows. */
  private async fetchReleases(): Promise<ReleaseInfo[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${APP_RELEASES_API}?per_page=${RELEASES_PER_PAGE}`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(describeHttpFailure(response.status));
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error('GitHub returned an unexpected response.');

      return payload.map(toReleaseInfo).filter((release): release is ReleaseInfo => !!release);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('GitHub did not answer in time.');
      }
      // A blocked request surfaces as a TypeError ("Failed to fetch").
      if (error instanceof TypeError) throw new Error('No connection to GitHub.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Records the newest release and what it means for this build. */
  private apply(release: ReleaseInfo, checkedAt: string): void {
    const comparison = compareVersions(release.version, APP_VERSION);

    this.latest.set(release);
    this.checkedAt.set(checkedAt);
    this.status.set(statusFor(comparison));
    this.error.set(
      comparison === null
        ? `The release tag "${release.tag}" is not a version this build can compare against.`
        : null,
    );
  }

  private fail(message: string): void {
    this.status.set('unavailable');
    this.error.set(message);

    // A stored release is still worth showing next to the failure: the user can
    // see the last known version and the page it came from.
    const cached = this.readCache();
    if (cached && !this.latest()) {
      this.latest.set(cached.release);
      this.checkedAt.set(cached.checkedAt);
    }
  }

  /** Reads the stored answer, ignoring anything malformed or outdated. */
  private readCache(): CachedCheck | null {
    try {
      const raw = globalThis.localStorage?.getItem(CACHE_KEY);
      if (!raw) return null;

      const parsed: unknown = JSON.parse(raw);
      if (!isCachedCheck(parsed)) return null;
      if (!Number.isFinite(Date.parse(parsed.checkedAt))) return null;

      return parsed;
    } catch {
      // Storage can be unavailable (privacy mode, a locked-down webview).
      return null;
    }
  }

  private writeCache(value: CachedCheck): void {
    try {
      globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(value));
    } catch {
      // A cache that cannot be written only costs one extra request.
    }
  }
}

/** Turns a version comparison into the status the page shows. */
function statusFor(comparison: number | null): UpdateStatus {
  if (comparison === null) return 'unavailable';
  if (comparison > 0) return 'update-available';
  if (comparison === 0) return 'up-to-date';
  return 'ahead';
}

/** A failure the user can act on: rate limit, missing repository, offline. */
function describeHttpFailure(status: number): string {
  if (status === 403 || status === 429) {
    return 'GitHub is rate-limiting this machine. Try again in a little while.';
  }
  if (status === 404) return 'The releases page could not be found.';
  return `GitHub answered with ${status}.`;
}

/** The highest version in a list, ignoring entries whose version is unreadable. */
function newestRelease(releases: readonly ReleaseInfo[]): ReleaseInfo | null {
  let newest: ReleaseInfo | null = null;

  for (const release of releases) {
    if (!newest) {
      newest = release;
      continue;
    }
    if ((compareVersions(release.version, newest.version) ?? 0) > 0) newest = release;
  }

  return newest;
}

/** Maps one GitHub release payload, or null when it is not a usable release. */
function toReleaseInfo(payload: unknown): ReleaseInfo | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  if (raw['draft'] === true) return null;

  const tag = typeof raw['tag_name'] === 'string' ? raw['tag_name'].trim() : '';
  if (!tag) return null;

  return {
    version: tag.replace(/^v/i, ''),
    tag,
    name: typeof raw['name'] === 'string' && raw['name'].trim() ? raw['name'].trim() : tag,
    notes: typeof raw['body'] === 'string' ? raw['body'] : '',
    publishedAt:
      typeof raw['published_at'] === 'string'
        ? raw['published_at']
        : typeof raw['created_at'] === 'string'
          ? raw['created_at']
          : null,
    url: typeof raw['html_url'] === 'string' ? raw['html_url'] : APP_RELEASES_URL,
    prerelease: raw['prerelease'] === true,
    assets: toAssets(raw['assets']),
  };
}

/** Maps the release's attached files, skipping anything without a download URL. */
function toAssets(payload: unknown): ReleaseAsset[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((entry): ReleaseAsset[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;

    const name = typeof raw['name'] === 'string' ? raw['name'] : '';
    const downloadUrl =
      typeof raw['browser_download_url'] === 'string' ? raw['browser_download_url'] : '';
    if (!name || !downloadUrl) return [];

    return [
      {
        name,
        size: typeof raw['size'] === 'number' ? raw['size'] : 0,
        downloadUrl,
      },
    ];
  });
}

/** Shape check for the stored answer, so a stale version of it is ignored. */
function isCachedCheck(value: unknown): value is CachedCheck {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;

  const release = raw['release'];
  if (!release || typeof release !== 'object') return false;

  return (
    typeof raw['checkedAt'] === 'string' &&
    typeof (release as Record<string, unknown>)['version'] === 'string'
  );
}
