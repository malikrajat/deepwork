/**
 * Which operating system this build is running on, as far as the UI needs to
 * know it.
 *
 * The app has to name the thing the user is looking at — "Start with Windows"
 * on Windows, "Start with macOS" on a Mac, "Start with your computer" where the
 * wording would otherwise be a lie. That is the whole reason this exists: a
 * desktop preference that works on three platforms must not be explained in the
 * words of one of them.
 *
 * Detection is deliberately a plain user-agent read rather than the device
 * detection service: this is asked during store construction, before Angular is
 * running, and `registerCustomOS` from that library is a global side effect this
 * file has no business performing.
 */

export type PlatformOs = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'other';

/** True when the user agent describes a phone or a tablet. */
export function isMobileAgent(userAgent: string, maxTouchPoints = 0): boolean {
  if (/android|iphone|ipod|ipad|iemobile|windows phone/i.test(userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac. A "Mac" with a touchscreen is an iPad.
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * The operating system, in the four words the copy uses plus two mobile ones.
 *
 * `ios` is checked before `macos` on purpose: every iPhone and iPad user agent
 * contains the word "like Mac OS X", and a phone told to find Login Items in
 * System Settings would be sent looking for a window that does not exist.
 */
export function detectOs(
  userAgent: string,
  options: { maxTouchPoints?: number } = {},
): PlatformOs {
  const mobile = isMobileAgent(userAgent, options.maxTouchPoints ?? 0);

  if (/iphone|ipod|ipad/i.test(userAgent) || (mobile && /macintosh/i.test(userAgent))) {
    return 'ios';
  }
  if (/android/i.test(userAgent)) return 'android';
  if (/windows/i.test(userAgent)) return 'windows';
  if (/macintosh|mac os x|macos/i.test(userAgent)) return 'macos';
  // ChromeOS sends an X11/Linux user agent, but it has no login items and no
  // `~/.config/autostart`; the Linux instructions would be wrong there.
  if (/cros/i.test(userAgent)) return 'other';
  if (/linux|x11/i.test(userAgent)) return 'linux';
  return 'other';
}

/** The OS as a person would name it, for headings and instructions. */
export function osLabel(os: PlatformOs): string {
  switch (os) {
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
    case 'ios':
      return 'iPhone or iPad';
    case 'android':
      return 'Android';
    default:
      return 'your computer';
  }
}
