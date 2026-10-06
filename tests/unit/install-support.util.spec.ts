import { describe, it, expect } from 'vitest';
import { installSupport } from '../../src/app/core/utils/install-support.util';

/**
 * How to install DeepWork depends on the browser, and getting this wrong is how
 * somebody with Safari or Firefox ends up hunting for an address-bar icon that
 * browser will never draw: only Chromium fires `beforeinstallprompt` and only
 * Chromium shows the icon.
 */
const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.86 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.51',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0',
  curl: 'curl/8.4.0',
};

describe('installSupport', () => {
  it('names the address-bar icon for the browsers that have one', () => {
    for (const userAgent of [UA.chromeWindows, UA.edgeWindows, UA.operaWindows]) {
      const support = installSupport(userAgent);
      expect(support.kind).toBe('chromium');
      expect(support.supported).toBe(true);
      expect(support.hint).toContain('install icon in the address bar');
    }
  });

  it('sends Safari to its own menu, because it has no icon to click', () => {
    const support = installSupport(UA.safariMac);

    expect(support.kind).toBe('safari');
    expect(support.supported).toBe(true);
    expect(support.hint).toContain('Add to Dock');
    // The address-bar instruction would be a wild goose chase here.
    expect(support.hint).not.toContain('address bar');
  });

  it('says plainly that Firefox cannot install a web app', () => {
    const support = installSupport(UA.firefoxLinux);

    expect(support.kind).toBe('firefox');
    expect(support.supported).toBe(false);
    expect(support.hint).toContain('does not install web apps');
    // ...and offers the two things that do work.
    expect(support.hint).toContain('desktop app');
    expect(support.hint).toContain('Chrome, Edge or Safari');
  });

  it('keeps the instructions generic when the browser is not one it knows', () => {
    const support = installSupport(UA.curl);

    expect(support.kind).toBe('other');
    expect(support.hint).toContain('browser menu');
  });

  it('always answers with something to show', () => {
    for (const userAgent of [...Object.values(UA), '']) {
      expect(installSupport(userAgent).hint.length).toBeGreaterThan(10);
    }
  });
});
