/**
 * Where DeepWork can be run, other than the copy already on this machine.
 *
 * Only the browser build has a fixed address: GitHub Pages publishes it from
 * `main` on every push. The installers are deliberately *not* URLs here — they
 * live in the newest GitHub release, and a link typed into a constants file is
 * a link to last year's file the day after the next release. `UpdateService`
 * resolves them at runtime by asking that release for the file each platform
 * matches, and `APP_RELEASES_URL` is the honest fallback when a release carries
 * nothing for a platform yet.
 */
import type { Platform } from '../utils/release.util';
import { APP_WEB_APP_URL } from './app-info.constants';

/** A desktop platform DeepWork ships an installer for. */
export type DownloadPlatform = Exclude<Platform, 'unknown'>;

/** `https://malikrajat.github.io/deepwork/` → `malikrajat.github.io/deepwork`. */
const WEB_ADDRESS = APP_WEB_APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** One way to get DeepWork: the browser build, or an installer for a platform. */
export interface DownloadTarget {
  /** `web` for the browser build, otherwise the desktop platform. */
  kind: 'web' | DownloadPlatform;
  /** What the row is called. */
  name: string;
  /** What the user gets, in one line. */
  detail: string;
}

export const DOWNLOAD_TARGETS: readonly DownloadTarget[] = [
  {
    kind: 'web',
    name: 'Web app',
    detail: `Runs at ${WEB_ADDRESS} in any modern browser — nothing to install, and it can be added to your desktop from there.`,
  },
  {
    kind: 'windows',
    name: 'Windows',
    detail: 'Installer for Windows 10 and later, 64-bit.',
  },
  {
    kind: 'macos',
    name: 'macOS',
    detail: 'Disk image (.dmg) for recent versions of macOS.',
  },
  {
    kind: 'linux',
    name: 'Linux',
    detail: 'AppImage, .deb or .rpm for most distributions.',
  },
];
