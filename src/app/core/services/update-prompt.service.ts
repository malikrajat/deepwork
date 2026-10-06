import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_RELEASES_URL } from '../constants/app-info.constants';
import type { ReleaseAsset, UpdateInstallState } from '../models/update.model';
import { pickAssetFor, pickInstallAssetFor } from '../utils/release.util';
import { LogService } from './log.service';
import { NotificationService } from './notification.service';
import { UpdateService } from './update.service';

/** Where the prompt remembers what it has already said. */
const PROMPT_KEY = 'deepwork.update.prompt.v1';

/** The progress event the Rust side emits while it writes the installer. */
const PROGRESS_EVENT = 'deepwork:update-progress';

/**
 * How long "Later" silences the card.
 *
 * A wave-away is a *deferral*, not a refusal: half a day later the same release
 * is worth mentioning again, because the alternative is a user who pressed the
 * wrong button once and then never hears about the update again while the
 * sidebar pill sits there unexplained. Twelve hours is long enough that it is
 * not a nag within a working day, and the notice is never repeated more than
 * once per version per day.
 */
const SNOOZE_MS = 12 * 60 * 60 * 1000;

/** True when running inside the packaged desktop app (Tauri). */
function inTauri(): boolean {
  return typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;
}

/** What has been said about which version, so a launch does not repeat itself. */
interface PromptHistory {
  /** The version the OS notification has been sent for. */
  announced: string | null;
  /** The version the user waved away — "Later", or the close button. */
  dismissed: string | null;
  /**
   * When that version was waved away, ISO timestamp.
   *
   * A dismissal written by an older build has no time beside it, and is read as
   * long overdue rather than as forever — otherwise the very users who need the
   * prompt back are the ones whose stored history keeps it away.
   */
  dismissedAt: string | null;
}

const EMPTY_HISTORY: PromptHistory = { announced: null, dismissed: null, dismissedAt: null };

/**
 * The update flow: what the user is told when a newer release exists, and the
 * download-and-install that the prompt offers.
 *
 * The check itself lives in {@link UpdateService}; this is everything after the
 * answer. Two things are deliberately separated:
 *
 * - **Telling the user happens once per version.** A system notification, fired
 *   when the startup check finds something newer, and a card in the app that
 *   stays until it is waved away. Waving it away snoozes the card for
 *   {@link SNOOZE_MS} rather than ending the conversation, so a release is still
 *   offered after a night's sleep; the sidebar keeps showing the update pill
 *   either way, and a *different* version is announced again.
 * - **Installing is explicit.** Nothing is downloaded until the user asks,
 *   because an installer is a large file and an action on their machine.
 *
 * On the desktop app the installer for this machine is fetched by Rust and
 * handed to the OS (see `src-tauri/src/updates.rs`). In the browser build there
 * is nothing to install, so the same button hands the download to the browser.
 */
@Injectable({ providedIn: 'root' })
export class UpdatePromptService {
  private readonly updates = inject(UpdateService);
  private readonly notifications = inject(NotificationService, { optional: true });
  private readonly log = inject(LogService, { optional: true });

  /** True when an installer can be downloaded and started by the app itself. */
  readonly isDesktopApp = inTauri();

  /** Where the download has got to. */
  readonly state = signal<UpdateInstallState>('idle');

  /** Bytes downloaded and the size the release reports, for the progress bar. */
  readonly receivedBytes = signal(0);
  readonly totalBytes = signal(0);

  /** What the OS did with the installer, once it has been started. */
  readonly note = signal<string | null>(null);

  /** Why it could not be installed, in a sentence. */
  readonly error = signal<string | null>(null);

  /** The version the user waved away, while the wave still stands. */
  private readonly snoozedVersion = signal<string | null>(activeSnooze(readHistory()));

  /** The version on offer, ready to show (`v2.1.0`), or null. */
  readonly version = computed(() => this.updates.latestVersion());

  /** The release being offered, if one has been read. */
  private readonly release = this.updates.latest;

  /**
   * The installer the app itself may run for this machine, or null.
   *
   * Only a real installer qualifies — the system's own setup, which replaces the
   * copy the user has. A portable archive is deliberately **not** one: handing
   * Windows a `.zip` is `os error 193` ("not a valid Win32 application"), and a
   * prompt that offers an Update button has to be able to keep that promise.
   */
  readonly installAsset = computed<ReleaseAsset | null>(() => {
    const release = this.release();
    return release ? pickInstallAssetFor(release.assets, this.updates.platform) : null;
  });

  /**
   * The file worth downloading for this machine, installable or not.
   *
   * This is what a Download button uses when no installer exists: the portable
   * build is a real way to run DeepWork, it is just the user's to unpack.
   */
  readonly downloadAsset = computed<ReleaseAsset | null>(() => {
    const release = this.release();
    return release ? pickAssetFor(release.assets, this.updates.platform) : null;
  });

  /** True while the update is being fetched or handed to the installer. */
  readonly busy = computed(() => this.state() === 'downloading' || this.state() === 'installing');

  /** How far the download has got, as a whole percentage. */
  readonly percent = computed(() => {
    const total = this.totalBytes();
    if (!total) return 0;
    return Math.min(100, Math.round((this.receivedBytes() / total) * 100));
  });

  /**
   * True when the prompt should be on screen: something newer is published and
   * the user has not waved this version away in the last twelve hours.
   *
   * The release is compared rather than the status alone, so the prompt follows
   * a *new* release even while an older one is snoozed.
   */
  readonly visible = computed(() => {
    if (this.updates.status() !== 'update-available') return false;
    const release = this.release();
    return !!release && release.version !== this.snoozedVersion();
  });

  /** Where "see every release" points, for the fallback link. */
  readonly releasesUrl = APP_RELEASES_URL;

  /**
   * Checks once, then tells the user if there is something to install.
   *
   * Called as the app starts, not awaited by the caller: the window must never
   * wait on GitHub. The system notification is remembered across launches, so
   * only the card comes back after a snooze.
   */
  async start(): Promise<void> {
    await this.updates.start();
    await this.announce();
  }

  /**
   * Snoozes the card for this version.
   *
   * The version is remembered so the card stops asking now, and the *time* is
   * remembered with it so the card comes back once the snooze has run out —
   * the sidebar pill is a reminder, and a reminder nothing ever explains is
   * worse than one that waits a few hours.
   */
  dismiss(): void {
    const version = this.updates.latest()?.version ?? null;
    this.snoozedVersion.set(version);
    writeHistory({ dismissed: version, dismissedAt: new Date().toISOString() });
  }

  /**
   * Downloads this machine's installer and starts it.
   *
   * Nothing here throws: a failure becomes a sentence in `error`, because the
   * user is sitting in front of the app that is still working.
   */
  async install(): Promise<void> {
    if (this.busy()) return;

    const asset = this.installAsset();
    if (!asset) {
      // A release of portable builds only has nothing the app can run for the
      // user. Saying that is the point — the alternative was starting a `.zip`
      // and reporting Windows' "not a valid Win32 application".
      this.error.set(
        'This release has no installer for your system. Download it from the release page, or open the portable build and unpack it.',
      );
      this.state.set('error');
      return;
    }
    if (!this.isDesktopApp) {
      // The browser build has no installer to run: the download is the update.
      this.openDownload(asset.downloadUrl);
      return;
    }

    this.state.set('downloading');
    this.error.set(null);
    this.note.set(null);
    this.receivedBytes.set(0);
    this.totalBytes.set(asset.size);

    const stopListening = await this.listenForProgress();
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke<string>('update_download', {
        url: asset.downloadUrl,
        fileName: asset.name,
        expectedBytes: asset.size,
      });

      this.state.set('installing');
      const note = await invoke<string>('update_install', { path });
      this.note.set(note);
      this.state.set('started');
      this.log?.info('system', `update ${this.version() ?? ''} started from ${path}`);
    } catch (failure) {
      const message = describeFailure(failure);
      this.error.set(message);
      this.state.set('error');
      this.log?.warn('system', `update could not be installed: ${message}`);
    } finally {
      stopListening?.();
    }
  }

  /**
   * Sends the one system notification that a newer version exists.
   *
   * It is posted under its own handle: a tagged post replaces the one before it,
   * and an update notice quietly taking the place of an unanswered completion
   * alert — or the other way round — would lose whichever of the two the user
   * had not read yet.
   */
  private async announce(): Promise<void> {
    const release = this.updates.latest();
    if (this.updates.status() !== 'update-available' || !release) return;

    const history = readHistory();
    if (history.announced === release.version) return;

    writeHistory({ announced: release.version });
    const title = `DeepWork ${this.version()} is available`;
    const body = this.installAsset()
      ? 'Open DeepWork and choose Update to download and install it.'
      : this.downloadAsset()
        ? 'Open DeepWork to download it from the update prompt.'
        : 'Open DeepWork to get it from the release page.';

    try {
      await this.notifications?.announce(title, body, {
        tag: NotificationService.UPDATE_NOTIFICATION_TAG,
      });
    } catch (failure) {
      // A refused notification is not a failure of the update itself.
      this.log?.warn('system', `update notification was not shown: ${String(failure)}`);
    }
  }

  /** Turns the download progress the Rust side reports into signals. */
  private async listenForProgress(): Promise<(() => void) | null> {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<[number, number]>(PROGRESS_EVENT, ({ payload }) => {
        const [received, total] = payload;
        this.receivedBytes.set(received);
        if (total > 0) this.totalBytes.set(total);
      });
    } catch {
      // Progress is a nicety: the download still reports when it is done.
      return null;
    }
  }

  /** The browser path: a download the browser owns from here on. */
  private openDownload(url: string): void {
    try {
      globalThis.open?.(url, '_blank', 'noopener,noreferrer');
    } catch {
      this.error.set('Open the release page to download it.');
      this.state.set('error');
    }
  }
}

/** Turns whatever Tauri rejected with into a sentence. */
function describeFailure(failure: unknown): string {
  const message =
    typeof failure === 'string' ? failure : failure instanceof Error ? failure.message : '';
  return message.trim() || 'The update could not be downloaded. Try the release page.';
}

/** Reads what has been announced or snoozed, ignoring anything unreadable. */
function readHistory(): PromptHistory {
  try {
    const raw = globalThis.localStorage?.getItem(PROMPT_KEY);
    if (!raw) return { ...EMPTY_HISTORY };

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_HISTORY };

    const record = parsed as Record<string, unknown>;
    return {
      announced: typeof record['announced'] === 'string' ? record['announced'] : null,
      dismissed: typeof record['dismissed'] === 'string' ? record['dismissed'] : null,
      dismissedAt: typeof record['dismissedAt'] === 'string' ? record['dismissedAt'] : null,
    };
  } catch {
    // Storage can be unavailable (privacy mode, a locked-down webview).
    return { ...EMPTY_HISTORY };
  }
}

/**
 * The version whose snooze is still running, or null when the card may speak.
 *
 * The comparison is on the dismissal's *age* rather than on its presence, so the
 * prompt comes back by itself. A snooze with no readable time — one an older
 * build wrote — counts as a night's sleep already taken.
 */
function activeSnooze(history: PromptHistory): string | null {
  if (!history.dismissed) return null;

  const at = history.dismissedAt ? Date.parse(history.dismissedAt) : Number.NaN;
  if (!Number.isFinite(at)) return null;

  return Date.now() - at < SNOOZE_MS ? history.dismissed : null;
}

/** Writes one field of the history, keeping the other as it was. */
function writeHistory(change: Partial<PromptHistory>): void {
  try {
    globalThis.localStorage?.setItem(PROMPT_KEY, JSON.stringify({ ...readHistory(), ...change }));
  } catch {
    // A history that cannot be written only costs one repeated notification.
  }
}
