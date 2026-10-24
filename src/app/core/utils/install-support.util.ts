/**
 * Whether this browser can install DeepWork as an app, and what to say when it
 * will not offer to.
 *
 * The install icon in the address bar is a Chromium feature. `beforeinstallprompt`
 * — the event the app's own Install button is built on — is fired by Chrome and
 * Edge and by nothing else: Safari has been able to install a web app since 17
 * (`File → Add to Dock`) without ever firing it, and Firefox desktop cannot
 * install one at all. Telling every reader to "click the icon in the address
 * bar" is therefore wrong for two of the three browsers people actually use, and
 * it is how somebody ends up hunting for an icon that will never appear.
 *
 * Detection is a plain user-agent read rather than the device detection
 * service: this is asked during store construction and only needs the browser
 * family, while loading that library here would put its whole user-agent
 * database in the initial bundle for the stats popup that actually uses it.
 */

/** How this browser installs a web app, if it can. */
export type InstallKind = 'chromium' | 'safari' | 'firefox' | 'other';

/** What to tell the reader, and whether installing is possible at all. */
export interface InstallSupport {
  kind: InstallKind;
  /** True when this browser can install the app, whether or not it offers to. */
  supported: boolean;
  /** One sentence, in the browser's own words. Shown on its own. */
  hint: string;
}

/**
 * The Chromium family: the browsers that fire `beforeinstallprompt` and draw an
 * install icon. Brave and Arc do not change their user agent, so they arrive
 * here as plain Chrome — which is the same answer. Facebook's in-app browser is
 * Chromium too, but nothing can be installed from inside it, so it is
 * deliberately not on this list.
 */
const CHROMIUM_AGENT =
  /\b(?:OPR|Opera|Edg(?:e|A|iOS)?|SamsungBrowser|UCBrowser|Vivaldi|YaBrowser|DuckDuckGo)\b/;
const CHROME_AGENT = /\b(?:Chrome|CriOS|HeadlessChrome)\b/;
const FIREFOX_AGENT = /\b(?:Firefox|FxiOS)\b/;

/** Which family the user agent belongs to, checking the branded forks first. */
function installKind(userAgent: string): InstallKind {
  if (CHROMIUM_AGENT.test(userAgent)) return 'chromium';
  if (FIREFOX_AGENT.test(userAgent)) return 'firefox';
  // `CriOS` is Chrome on iOS, and every iOS browser carries a `Safari` token, so
  // this has to come before the Safari test.
  if (CHROME_AGENT.test(userAgent)) return 'chromium';
  // Windows Phone's IE also says `Safari`, but it can install nothing.
  if (/\b(?:Windows Phone|IEMobile)\b/.test(userAgent)) return 'other';
  if (/\bSafari\b/.test(userAgent)) return 'safari';
  return 'other';
}

/** What to do, per browser. */
export function installSupport(userAgent: string): InstallSupport {
  const kind = installKind(userAgent);

  if (kind === 'firefox') {
    return {
      kind,
      supported: false,
      hint: 'Firefox does not install web apps — use the desktop app below, or open this page in Chrome, Edge or Safari.',
    };
  }

  if (kind === 'safari') {
    return {
      kind,
      supported: true,
      hint: 'Open File → Add to Dock in Safari 17 or newer; on an iPhone or iPad it is Share → Add to Home Screen.',
    };
  }

  if (kind === 'chromium') {
    return {
      kind,
      supported: true,
      hint: 'Click the install icon in the address bar, or open your browser menu and choose Install DeepWork…',
    };
  }

  return {
    kind,
    supported: true,
    hint: 'Open your browser menu and look for Install, Add to Dock or Add to Home Screen.',
  };
}
