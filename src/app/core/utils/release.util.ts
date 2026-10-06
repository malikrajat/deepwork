/**
 * Reading a GitHub release the way the About page shows it: which file belongs
 * to this machine, how big it is, and when it was published.
 */
import type { ReleaseAsset } from '../models/update.model';

/** The platforms DeepWork ships installers for. */
export type Platform = 'windows' | 'macos' | 'linux' | 'unknown';

/**
 * How a release file can be used on one platform.
 *
 * The distinction is not cosmetic — it is what keeps the app from handing the OS
 * a file it cannot run:
 *
 * - `installer` — the system's own installer. It replaces the copy the user
 *   already has, so it is the only kind an in-app update may start.
 * - `portable` — a build the user unpacks and runs, or a package that is only
 *   ever a second copy. Worth offering as a download, never worth starting.
 * - `other` — a file for another platform, or one this build does not know.
 */
export type AssetUse = 'installer' | 'portable' | 'other';

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

// ─────────────────────────────────────────────────────────────────────────────
// What a file is, per platform
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Labels a file's name can carry, per platform, in the order they are read.
 *
 * An extension is the most specific thing a name can say — only macOS ships a
 * `.dmg` — so those come first, and a word naming a platform covers the rest.
 * This is what keeps a release's three portable archives apart: they are all
 * `.zip`, and only the word in the middle (`deepwork-windows-x64.zip` beside
 * `deepwork-macos-x64.zip` and `deepwork-linux-x64.zip`) tells them apart.
 */
const PLATFORM_LABELS: Record<Exclude<Platform, 'unknown'>, readonly RegExp[]> = {
  windows: [/\.(exe|msi)$/i, /win(dows|32|64)/i],
  macos: [/\.(dmg|pkg)$/i, /mac(os|intosh|-portable|-arm)/i],
  linux: [/\.(deb|rpm|appimage)$/i, /linux|appimage/i],
};

/** An installer the system itself can run, per platform. */
const INSTALLER_EXTENSIONS: Record<Exclude<Platform, 'unknown'>, readonly RegExp[]> = {
  windows: [/setup\.exe$/i, /\.msi$/i],
  macos: [/\.dmg$/i, /\.pkg$/i],
  linux: [/\.deb$/i, /\.rpm$/i, /\.appimage$/i],
};

/**
 * A build the user unpacks, or a package that is only ever a second copy.
 *
 * A bare `.exe` is here rather than among the installers on purpose: Tauri
 * publishes its Windows installer as `<name>_<version>_x64-setup.exe`, so an
 * `.exe` without `setup` in the name is a portable build — running it would not
 * update anything the user already has.
 */
const PORTABLE_EXTENSIONS: Record<Exclude<Platform, 'unknown'>, readonly RegExp[]> = {
  windows: [/\.zip$/i, /\.exe$/i, /\.7z$/i],
  macos: [/\.zip$/i, /\.tar\.gz$/i, /-portable$/i],
  linux: [/\.appimage$/i, /\.tar\.gz$/i, /\.zip$/i],
};

/** The strongest match a platform's patterns have in `name`, or -1. */
function matchIndex(patterns: readonly RegExp[], name: string): number {
  return patterns.findIndex((pattern) => pattern.test(name));
}

/**
 * Which platform a file's name says it is for.
 *
 * The order is deliberate, because a name can carry more than one word that
 * looks like a platform. `aarch64` contains `arch64`, not `win64` — but the
 * check is written as if it could, and the specific words (`.exe`, `mac`,
 * `linux`) are therefore read before the loose ones. A name nothing recognises
 * is `unknown`, which means "judge me on my extension" rather than "discard me".
 */
function platformOf(name: string): Platform {
  if (PLATFORM_LABELS.windows.some((label) => label.test(name))) return 'windows';
  if (PLATFORM_LABELS.linux.some((label) => label.test(name))) return 'linux';
  if (PLATFORM_LABELS.macos.some((label) => label.test(name))) return 'macos';
  return 'unknown';
}

/**
 * How this file could be used on `platform`.
 *
 * A name that belongs to another platform is `other` however it is spelled: the
 * portable archives a release carries are all `.zip`, and only the word in the
 * middle of the name tells them apart. A name that says nothing about a
 * platform — `DeepWork_1.0.0_x64-setup.exe`, as this project published before
 * its files were labelled — is judged on its extension alone, because refusing
 * it would lose a real installer.
 */
export function classifyAsset(asset: ReleaseAsset, platform: Platform): AssetUse {
  if (platform === 'unknown') return 'other';

  // The platform being asked about is read first: a file labelled for *this*
  // machine is never re-labelled by a word in it that happens to look like
  // another's. (`DeepWork_2.1.0_aarch64.dmg` contains `arm`, and an Apple
  // Silicon disk image is still a macOS installer.)
  const named =
    matchIndex(PLATFORM_LABELS[platform], asset.name) !== -1 ? platform : platformOf(asset.name);
  if (named !== 'unknown' && named !== platform) return 'other';

  if (matchIndex(INSTALLER_EXTENSIONS[platform], asset.name) !== -1) return 'installer';
  if (matchIndex(PORTABLE_EXTENSIONS[platform], asset.name) !== -1) return 'portable';
  return 'other';
}

/**
 * A name that says the build inside is for an ARM machine.
 *
 * Both spellings are read: this project's own files say `aarch64` (the Rust
 * target's word) while the document itself is named `DeepWork_x64.dmg`/`_aarch64.dmg`
 * on macOS. The two are interchangeable here because neither is ever the name an
 * Intel machine should be handed.
 */
const ARM_BUILD = /aarch64|arm64|armv7/i;

/** A name that says the build inside is for a 64-bit PC. */
const X64_BUILD = /x64|amd64|x86_64/i;

/** How much an architecture is worth when two files are otherwise equal. */
function archScore(name: string): number {
  // The user agent does not say whether a machine is Intel or ARM, or 64-bit or
  // 32-bit, so this is the tie-break for a release that publishes more than one
  // of a kind: `x64` first, then a build that names no architecture at all (it
  // is the only one there is), then `x86`, and an ARM build last.
  if (ARM_BUILD.test(name)) return 0;
  if (X64_BUILD.test(name)) return 3;
  if (/x86|i686|i386|win32/i.test(name)) return 1;
  return 2;
}

/** The best file of `use` for `platform` in `assets`, or null. */
function bestOf(
  assets: readonly ReleaseAsset[],
  platform: Exclude<Platform, 'unknown'>,
  use: AssetUse,
): ReleaseAsset | null {
  const patterns =
    use === 'installer' ? INSTALLER_EXTENSIONS[platform] : PORTABLE_EXTENSIONS[platform];
  const labels = PLATFORM_LABELS[platform];

  let best: ReleaseAsset | null = null;
  let bestScore = 0;

  for (const asset of assets) {
    if (classifyAsset(asset, platform) !== use) continue;

    const index = matchIndex(patterns, asset.name);
    const score =
      // How early the matching pattern sits: a package or the setup itself
      // beats whatever matched last.
      (patterns.length - Math.max(index, 0)) * 100 +
      // A name that says which platform it is for beats one that only implies
      // it.
      (matchIndex(labels, asset.name) === -1 ? 0 : 1) * 10 +
      // And, all else equal, the architecture that runs on the most machines
      // wins.
      archScore(asset.name);

    // `>=` so the first file of the best kind wins a tie rather than being
    // passed over, and the floor above zero so the scoring can never leave a
    // classified file unselected.
    if (score >= bestScore) {
      best = asset;
      bestScore = score;
    }
  }

  return best;
}

/**
 * The file from `assets` that best matches `platform`, or null when the release
 * carries nothing for it (in which case the UI offers the release page).
 *
 * This is the download a person chooses: an installer when the release has one,
 * and otherwise the portable build, which is a real way to run DeepWork — it is
 * just not a way for the app to replace itself.
 */
export function pickAssetFor(
  assets: readonly ReleaseAsset[],
  platform: Platform,
): ReleaseAsset | null {
  if (platform === 'unknown' || assets.length === 0) return null;

  return bestOf(assets, platform, 'installer') ?? bestOf(assets, platform, 'portable');
}

/**
 * The file an in-app update should fetch for `platform`, or null when the
 * release carries nothing this app can install for the user.
 *
 * Only an installer qualifies. This is the whole reason the rule exists: a
 * `.zip` handed to Windows is `os error 193`, "not a valid Win32 application",
 * which reads as a broken app rather than as a release that ships no setup.
 * Null here is what makes the UI say so and offer the release page instead.
 */
export function pickInstallAssetFor(
  assets: readonly ReleaseAsset[],
  platform: Platform,
): ReleaseAsset | null {
  if (platform === 'unknown' || assets.length === 0) return null;

  return bestOf(assets, platform, 'installer');
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
