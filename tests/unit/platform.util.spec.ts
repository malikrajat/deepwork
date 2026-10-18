import { describe, it, expect } from 'vitest';
import { detectOs, isMobileAgent, osLabel } from '../../src/app/core/utils/platform.util';

/**
 * Which machine the app is talking to.
 *
 * The copy in the startup explanation names an operating system, and naming the
 * wrong one is worse than naming none: "open Login Items in System Settings" on
 * an iPhone is an instruction to find a window that cannot exist. These are the
 * user agents that matter, including the two that lie — iPadOS reporting itself
 * as a Mac, and every iPhone carrying the words "like Mac OS X".
 */
const UA = {
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macos:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  crouton:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
} as const;

describe('detectOs', () => {
  it('names the three desktops the app ships for', () => {
    expect(detectOs(UA.windows)).toBe('windows');
    expect(detectOs(UA.macos)).toBe('macos');
    expect(detectOs(UA.linux)).toBe('linux');
  });

  it('reads an iPhone as iOS rather than as the Mac it claims to be', () => {
    expect(detectOs(UA.iphone)).toBe('ios');
  });

  it('reads an iPad as iOS from its touchscreen, because iPadOS reports a Mac', () => {
    // Safari on iPadOS 13+ sends a desktop Mac user agent. The only reliable
    // difference is a touch screen on a "Mac".
    expect(detectOs(UA.ipadAsMac, { maxTouchPoints: 5 })).toBe('ios');
    expect(detectOs(UA.ipadAsMac, { maxTouchPoints: 0 })).toBe('macos');
  });

  it('reads Android and ChromeOS honestly', () => {
    expect(detectOs(UA.android)).toBe('android');
    // ChromeOS carries "X11" and "Linux", but it is not a Linux desktop the
    // startup instructions describe; `other` is the honest answer there.
    expect(detectOs(UA.crouton)).toBe('other');
  });

  it('falls back to "other" rather than guessing', () => {
    expect(detectOs('')).toBe('other');
    expect(detectOs('curl/8.4.0')).toBe('other');
  });
});

describe('isMobileAgent', () => {
  it('recognises phones and tablets, and nothing else', () => {
    expect(isMobileAgent(UA.android)).toBe(true);
    expect(isMobileAgent(UA.iphone)).toBe(true);
    expect(isMobileAgent(UA.ipadAsMac, 5)).toBe(true);
    expect(isMobileAgent(UA.windows)).toBe(false);
    expect(isMobileAgent(UA.macos)).toBe(false);
    expect(isMobileAgent(UA.ipadAsMac, 0)).toBe(false);
  });
});

describe('osLabel', () => {
  it('gives every answer a name a sentence can use', () => {
    expect(osLabel('windows')).toBe('Windows');
    expect(osLabel('macos')).toBe('macOS');
    expect(osLabel('linux')).toBe('Linux');
    expect(osLabel('ios')).toBe('iPhone or iPad');
    expect(osLabel('android')).toBe('Android');
    expect(osLabel('other')).toBe('your computer');
  });
});
