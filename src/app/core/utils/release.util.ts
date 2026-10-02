/**
 * Reading a GitHub release the way the About page shows it: which file belongs
 * to this machine, how big it is, and when it was published.
 */
import type { ReleaseAsset } from '../models/update.model';

/** The platforms DeepWork ships installers for. */
export type Platform = 'windows' | 'macos' | 'linux' | 'unknown';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Which platform this build is running on.
 *
 * Read from the user agent because both the webview and a browser report it,
 * and because the answer is used only to pick a download link — a wrong guess
 * costs one extra click on "all releases", never a broken app.
 */
export function detectPlatform(userAgent: string): Platform {
  const agent = userAgent.toLowerCase();
  if (!agent) return 'unknown';
  // Order matters: an Android user agent also contains "linux".
  if (agent.includes('android') || agent.includes('iphone') || agent.includes('ipad')) {
    return 'unknown';
  }
  if (agent.includes('windows')) return 'windows';
  if (agent.includes('mac os x') || agent.includes('macintosh')) return 'macos';
  if (agent.includes('linux') || agent.includes('x11')) return 'linux';
  return 'unknown';
}

/**
 * Installer patterns per platform, strongest first.
 *
 * The order is the tie-breaker when a release carries several files for the
 * same platform: a `.dmg` beats a bare `.app`, an `x64` build beats an `arm64`
 * one, because the first runs on every machine of that platform.
 */
const PLATFORM_PATTERNS: Record<Exclude<Platform, 'unknown'>, readonly RegExp[]> = {
  windows: [/setup\.exe$/i, /\.exe$/i, /\.msi$/i, /win(dows|32|64)/i],
  macos: [/x64\.dmg$/i, /\.dmg$/i, /mac-portable$/i, /mac/i],
  linux: [/\.appimage$/i, /\.deb$/i, /\.rpm$/i, /linux/i],
};

/**
 * The file from `assets` that best matches `platform`, or null when the release
 * carries nothing for it (in which case the UI offers the release page).
 */
export function pickAssetFor(
  assets: readonly ReleaseAsset[],
  platform: Platform,
): ReleaseAsset | null {
  if (platform === 'unknown' || assets.length === 0) return null;

  return bestMatch(assets, PLATFORM_PATTERNS[platform]);
}

/**
 * Installer patterns per platform for an update the app installs itself,
 * strongest first.
 *
 * This order differs from {@link PLATFORM_PATTERNS} on purpose. Every one of
 * these is downloadable, but for an unattended install the file the system's own
 * installer can replace wins: a `.deb`/`.rpm` upgrades the package the user
 * already has, where an AppImage is only ever a second copy sitting somewhere
 * else on disk.
 */
const INSTALL_PATTERNS: Record<Exclude<Platform, 'unknown'>, readonly RegExp[]> = {
  windows: [/setup\.exe$/i, /\.msi$/i, /\.exe$/i, /win(dows|32|64)/i],
  macos: [/x64\.dmg$/i, /\.dmg$/i, /mac-portable$/i, /mac/i],
  linux: [/\.deb$/i, /\.rpm$/i, /\.appimage$/i, /linux/i],
};

/**
 * The file an in-app update should fetch for `platform`, or null when the
 * release carries nothing this app knows how to install.
 *
 * The same release can be offered differently in two places: the About page
 * links to `pickAssetFor`, because a person choosing a download may prefer the
 * portable build, and the updater asks for `pickInstallAssetFor`, because a
 * package is what it can install for the user.
 */
export function pickInstallAssetFor(
  assets: readonly ReleaseAsset[],
  platform: Platform,
): ReleaseAsset | null {
  if (platform === 'unknown' || assets.length === 0) return null;

  return bestMatch(assets, INSTALL_PATTERNS[platform]);
}

/** The asset matching the earliest pattern in `patterns`, or null. */
function bestMatch(
  assets: readonly ReleaseAsset[],
  patterns: readonly RegExp[],
): ReleaseAsset | null {
  let best: ReleaseAsset | null = null;
  let bestScore = 0;

  for (const asset of assets) {
    const index = patterns.findIndex((pattern) => pattern.test(asset.name));
    // No pattern matched: the file is not for this platform, however much the
    // rest of the release looks like it is.
    if (index === -1) continue;

    const score = patterns.length - index;
    if (score > bestScore) {
      best = asset;
      bestScore = score;
    }
  }

  return best;
}

/** `2072863` → `2.0 MB`; `512` → `512 B`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // Bytes are whole, larger units are rounded to one decimal.
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/**
 * `2026-05-27T09:18:02Z` → `27 May 2026`.
 *
 * Written out from a month table rather than `toLocaleDateString`, so the date
 * reads the same in every webview and in every test.
 */
export function formatReleaseDate(iso: string | null | undefined): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The first `limit` characters of the release notes, ending on a whole word. */
export function summarizeNotes(notes: string, limit = 700): string {
  const text = (notes ?? '')
    .replace(/\r\n/g, '\n')
    // Headings, list markers and emphasis read as noise once the Markdown is
    // shown as plain text, so they are trimmed rather than rendered.
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length <= limit) return text;

  const cut = text.slice(0, limit);
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf(' '));
  return `${(lastBreak > limit * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd()}…`;
}
