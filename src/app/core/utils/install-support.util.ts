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
 * Which browser this is comes from `rm-ng-device-detection`, so the names below
 * are the ones it reports rather than ones invented here.
 */

import { parseUserAgent } from 'rm-ng-device-detection';

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
 * install icon. Facebook's in-app browser is Chromium too, but nothing can be
 * installed from inside it, so it is deliberately not on this list.
 */
const CHROMIUM = new Set([
  'Chrome',
  'MS-Edge',
  'MS-Edge-Chromium',
  'Opera',
  'Samsung',
  'UC-Browser',
  'Brave',
  'Vivaldi',
  'Arc',
  'DuckDuckGo',
  'Yandex',
]);

/** What to do, per browser. */
export function installSupport(userAgent: string): InstallSupport {
  const browser = parseUserAgent(userAgent).browser;

  if (browser === 'Firefox') {
    return {
      kind: 'firefox',
      supported: false,
      hint: 'Firefox does not install web apps — use the desktop app below, or open this page in Chrome, Edge or Safari.',
    };
  }

  if (browser === 'Safari') {
    return {
      kind: 'safari',
      supported: true,
      hint: 'Open File → Add to Dock in Safari 17 or newer; on an iPhone or iPad it is Share → Add to Home Screen.',
    };
  }

  if (CHROMIUM.has(browser)) {
    return {
      kind: 'chromium',
      supported: true,
      hint: 'Click the install icon in the address bar, or open your browser menu and choose Install DeepWork…',
    };
  }

  return {
    kind: 'other',
    supported: true,
    hint: 'Open your browser menu and look for Install, Add to Dock or Add to Home Screen.',
  };
}
