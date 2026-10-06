import { describe, it, expect } from 'vitest';
import type { DeviceInfo } from 'rm-ng-device-detection';
import {
  campaignParams,
  canReadStatistics,
  describePermissions,
  describeSession,
  describeVisit,
  formatCount,
  formatLocalTime,
  formatScreen,
  formatUtcOffset,
  rankStats,
  referrerFact,
  referrerNote,
  seriesFromStats,
  shortDay,
  summariseConnection,
  type SessionEnvironment,
} from '../../src/app/core/utils/visitor-stats.util';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.86 Safari/537.36';

/**
 * What `rm-ng-device-detection` reports for that User-Agent.
 *
 * The library owns browser/OS/device identification; this is the shape it hands
 * back, copied from its own `DeviceInfo`.
 */
const DEVICE: DeviceInfo = {
  userAgent: CHROME_WINDOWS,
  os: 'Windows',
  os_version: 'windows-11',
  browser: 'Chrome',
  browser_version: '131.0.6778.86',
  device: 'Windows PC',
  deviceType: 'desktop',
  orientation: 'landscape',
  osDistro: 'Unknown',
  isBot: false,
  width: 1280,
  height: 800,
  resolution: '1920x1080',
  devicePixelRatio: 2,
};

/** Everything a Chromium browser on Windows will admit to. */
const FULL_ENVIRONMENT: SessionEnvironment = {
  device: DEVICE,
  language: 'en-GB',
  languages: ['en-GB', 'en', 'en-US', 'de'],
  maxTouchPoints: 10,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  online: true,
  connection: { effectiveType: '4g', downlink: 10, rtt: 50, saveData: true },
  cookiesEnabled: true,
  webdriver: false,
  screen: {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1040,
    colorDepth: 24,
    orientation: 'landscape-primary',
  },
  viewport: { width: 1280, height: 800 },
  pixelRatio: 2,
  timeZone: 'Asia/Kolkata',
  utcOffsetMinutes: 330,
  darkMode: true,
  reducedMotion: false,
  standalone: false,
  storageAvailable: true,
};

/** One fact's value, by label. */
function valueOf(facts: { label: string; value: string }[], label: string): string | undefined {
  return facts.find((fact) => fact.label === label)?.value;
}

/** One fact's note, by label. */
function noteOf(facts: { label: string; note?: string }[], label: string): string | undefined {
  return facts.find((fact) => fact.label === label)?.note;
}

describe('formatUtcOffset', () => {
  it('writes UTC and the offsets either side of it', () => {
    expect(formatUtcOffset(0)).toBe('UTC+00:00');
    expect(formatUtcOffset(330)).toBe('UTC+05:30');
    expect(formatUtcOffset(-330)).toBe('UTC-05:30');
    expect(formatUtcOffset(45)).toBe('UTC+00:45');
  });
});

describe('formatLocalTime', () => {
  it('renders a real date in the given zone', () => {
    const rendered = formatLocalTime(new Date('2026-06-05T14:12:00Z'), 'UTC');
    expect(rendered).toContain('2026');
    expect(rendered).not.toBe('Unknown');
  });

  it('falls back to the local clock when the zone is not one', () => {
    // An unknown zone is not worth failing over: the clock is still the
    // visitor's, it is only the label that would have been nicer.
    expect(formatLocalTime(new Date('2026-06-05T14:12:00Z'), 'Mars/Olympus')).toContain('2026');
  });

  it('says so when the date itself is nonsense', () => {
    expect(formatLocalTime(new Date('not a date'))).toBe('Unknown');
  });
});

describe('formatScreen', () => {
  it('writes the size, or nothing when the screen will not say', () => {
    expect(formatScreen({ width: 1920, height: 1080 })).toBe('1920 × 1080');
    expect(formatScreen({ width: 0, height: 0 })).toBe('');
    expect(formatScreen({})).toBe('');
    expect(formatScreen(undefined)).toBe('');
  });
});

describe('summariseConnection', () => {
  it('describes everything the browser reports', () => {
    expect(
      summariseConnection({ effectiveType: '4g', downlink: 10, rtt: 50, saveData: true }),
    ).toBe('4G · about 10 Mbps · 50 ms round trip · data saver on');
  });

  it('leaves out what it does not have', () => {
    expect(summariseConnection({ effectiveType: '3g' })).toBe('3G');
    expect(summariseConnection({})).toBe('');
    expect(summariseConnection(undefined)).toBe('');
  });
});

describe('campaignParams', () => {
  it('reads the campaign parameters out of a query string', () => {
    expect(campaignParams('?utm_source=news&utm_medium=email&gclid=abc')).toEqual([
      { name: 'utm_source', value: 'news' },
      { name: 'utm_medium', value: 'email' },
      { name: 'gclid', value: 'abc' },
    ]);
  });

  it('works without the question mark, which is how a link may arrive', () => {
    expect(campaignParams('utm_campaign=launch')).toEqual([
      { name: 'utm_campaign', value: 'launch' },
    ]);
  });

  it('ignores everything that is not a campaign parameter', () => {
    expect(campaignParams('?page=2&sort=asc')).toEqual([]);
    expect(campaignParams('')).toEqual([]);
  });
});

describe('referrerFact', () => {
  it('says plainly when nobody referred the visit', () => {
    const fact = referrerFact(undefined);
    expect(fact.value).toBe('Nowhere in particular');
    expect(fact.note).toContain('bookmark');
  });

  it('names the search engine rather than the URL', () => {
    const fact = referrerFact('https://www.google.com/search?q=deepwork');
    expect(fact.value).toBe('Google');
    expect(fact.note).toContain('google.com');
  });

  it('does not call a hop inside the app a referral', () => {
    const fact = referrerFact(
      'https://malikrajat.github.io/deepwork/tasks',
      'https://malikrajat.github.io',
    );
    expect(fact.value).toContain('Another page in DeepWork');
  });

  it('shows the host of anywhere else', () => {
    expect(referrerFact('https://example.com/article', 'https://malikrajat.github.io').value).toBe(
      'example.com',
    );
  });

  it('accepts a referrer that is not a URL at all', () => {
    // GoatCounter takes any string here, and "a newsletter" is a good answer.
    expect(referrerFact('a newsletter').value).toBe('a newsletter');
  });
});

describe('describeSession', () => {
  it('describes everything the browser admits to', () => {
    const facts = describeSession(FULL_ENVIRONMENT);

    expect(valueOf(facts, 'Browser')).toBe('Chrome 131.0');
    expect(noteOf(facts, 'Browser')).toBe('Blink engine');
    expect(valueOf(facts, 'System')).toBe('Windows · 11');
    expect(valueOf(facts, 'Device')).toBe('Desktop');
    expect(noteOf(facts, 'Device')).toBe('Windows PC');
    expect(valueOf(facts, 'Screen')).toBe('1920 × 1080');
    expect(noteOf(facts, 'Screen')).toContain('24-bit colour');
    expect(noteOf(facts, 'Screen')).toContain('landscape-primary');
    expect(valueOf(facts, 'Window')).toBe('1280 × 800');
    expect(noteOf(facts, 'Window')).toContain('2× pixel density');
    expect(valueOf(facts, 'Language')).toBe('en-GB');
    expect(noteOf(facts, 'Language')).toContain('also en, en-US, de');
    expect(valueOf(facts, 'Time zone')).toBe('Asia/Kolkata');
    expect(noteOf(facts, 'Time zone')).toContain('UTC+05:30');
    expect(valueOf(facts, 'Connection')).toContain('4G');
    expect(valueOf(facts, 'Storage')).toBe('cookies on · local storage available');
    expect(valueOf(facts, 'Display mode')).toBe('Browser tab');
    expect(valueOf(facts, 'Preferences')).toBe('prefers dark');
    expect(valueOf(facts, 'Hardware')).toBe('8 CPU threads · 8 GB memory · 10 touch points');
    expect(valueOf(facts, 'User agent')).toBe(CHROME_WINDOWS);
  });

  it('says what the browser keeps quiet about rather than inventing it', () => {
    const facts = describeSession({ device: DEVICE });

    expect(valueOf(facts, 'Screen')).toBe('Not reported');
    expect(valueOf(facts, 'Connection')).toBe('Not reported');
    expect(noteOf(facts, 'Connection')).toContain('Chromium');
  });

  it('stays sensible when there is nothing at all to go on', () => {
    const facts = describeSession({});

    expect(valueOf(facts, 'Browser')).toBe('Unknown');
    expect(valueOf(facts, 'System')).toBe('Unknown');
    expect(valueOf(facts, 'Device')).toBe('Unknown');
    // No User-Agent means no row for one, rather than an empty one.
    expect(valueOf(facts, 'User agent')).toBeUndefined();
    expect(facts.length).toBeGreaterThan(3);
  });

  it('calls out an installed app and a scripted browser', () => {
    const facts = describeSession({ device: DEVICE, standalone: true, webdriver: true });

    expect(valueOf(facts, 'Display mode')).toBe('Installed app (standalone)');
    expect(valueOf(facts, 'Automation')).toContain('Script-controlled');
  });

  it('reports an offline, cookie-less, storage-less browser', () => {
    const facts = describeSession({
      device: DEVICE,
      cookiesEnabled: false,
      storageAvailable: false,
      online: false,
    });

    expect(valueOf(facts, 'Storage')).toBe('cookies off · local storage unavailable · offline');
  });

  it('mentions reduced motion only when it was asked for', () => {
    expect(valueOf(describeSession({ reducedMotion: true }), 'Preferences')).toBe(
      'prefers reduced motion',
    );
    expect(valueOf(describeSession({ darkMode: false }), 'Preferences')).toBe('prefers light');
    expect(valueOf(describeSession({}), 'Preferences')).toBeUndefined();
  });

  describe('what the device library reports', () => {
    it('reads an OS version out of its slug', () => {
      // `windows-11` is an identifier, not a sentence: the name is already on
      // screen, and "OS X" inside macOS's own version says it twice.
      expect(valueOf(describeSession({ device: DEVICE }), 'System')).toBe('Windows · 11');

      const mac = { ...DEVICE, os: 'Mac', os_version: 'mac-os-x-15' };
      expect(valueOf(describeSession({ device: mac }), 'System')).toBe('macOS · 15');

      const android = { ...DEVICE, os: 'Android', os_version: 'android-15' };
      expect(valueOf(describeSession({ device: android }), 'System')).toBe('Android · 15');
    });

    it('names the shells that read better with a space in them', () => {
      const chromeOs = { ...DEVICE, os: 'Chrome-OS', os_version: 'chrome-os-14541' };
      expect(valueOf(describeSession({ device: chromeOs }), 'System')).toContain('ChromeOS');
    });

    it('names the Linux distribution when there is one', () => {
      const linux = { ...DEVICE, os: 'Linux', osDistro: 'Ubuntu' };
      expect(valueOf(describeSession({ device: linux }), 'Distribution')).toBe('Ubuntu');

      // ...and says nothing when there is not.
      expect(valueOf(describeSession({ device: DEVICE }), 'Distribution')).toBeUndefined();
    });

    it('shows the model when it knows one, and the type when it does not', () => {
      const pixel = { ...DEVICE, device: 'Google Pixel', deviceType: 'mobile' };
      const facts = describeSession({ device: pixel });
      expect(valueOf(facts, 'Device')).toBe('Mobile');
      expect(noteOf(facts, 'Device')).toBe('Google Pixel');
    });

    it('falls back to the model when the type is unknown', () => {
      const odd = { ...DEVICE, device: 'Steam Deck', deviceType: 'unknown' };
      expect(valueOf(describeSession({ device: odd }), 'Device')).toBe('Steam Deck');
    });

    it('says a crawler is a crawler', () => {
      const bot = { ...DEVICE, isBot: true };
      const facts = describeSession({ device: bot });

      expect(valueOf(facts, 'Crawler')).toContain('bot');
      expect(noteOf(facts, 'Crawler')).toContain('GoatCounter ignores');
    });

    it('leaves the engine out when the browser is not one it knows', () => {
      const unknown = { ...DEVICE, browser: 'Unknown', browser_version: '0' };
      const facts = describeSession({ device: unknown });

      expect(valueOf(facts, 'Browser')).toBe('Unknown');
      expect(noteOf(facts, 'Browser')).toBe('Unknown engine');
    });
  });
});

describe('describeVisit', () => {
  it('describes where the visit came from and that it was counted', () => {
    const facts = describeVisit({
      entryPath: '/deepwork/settings?utm_source=news',
      referrer: 'https://news.ycombinator.com/item?id=1',
      selfOrigin: 'https://malikrajat.github.io',
      search: 'utm_source=news',
      startedAt: new Date('2026-06-05T14:12:00Z'),
      timeZone: 'UTC',
      visitNumber: 3,
      counted: true,
    });

    expect(valueOf(facts, 'Landed on')).toBe('/deepwork/settings?utm_source=news');
    expect(valueOf(facts, 'Came from')).toBe('Hacker News');
    expect(valueOf(facts, 'Campaign')).toBe('utm_source=news');
    expect(valueOf(facts, 'Arrived at')).toContain('2026');
    expect(valueOf(facts, 'Visits from this browser')).toBe('3');
    expect(valueOf(facts, 'Counted')).toBe('Yes, by GoatCounter');
    expect(noteOf(facts, 'Counted')).toContain('no cookies');
  });

  it('says why GoatCounter skipped it when it did', () => {
    const facts = describeVisit({ skippedBecause: 'local address' });
    expect(valueOf(facts, 'Counted')).toBe('No');
    expect(noteOf(facts, 'Counted')).toContain('local address');
  });

  it('says when counting is switched off rather than blaming GoatCounter', () => {
    const facts = describeVisit({ counted: false });
    expect(valueOf(facts, 'Counted')).toBe('No');
    expect(noteOf(facts, 'Counted')).toContain('switched off in Settings');
  });

  it('leaves the visit uncounted when nothing is known about it', () => {
    expect(valueOf(describeVisit({}), 'Counted')).toBeUndefined();
  });

  it('omits the campaign row when there is no campaign', () => {
    expect(valueOf(describeVisit({ search: 'page=2' }), 'Campaign')).toBeUndefined();
  });
});

describe('rankStats', () => {
  it('sorts the biggest first and scales the bars against it', () => {
    const rows = rankStats(
      [
        { name: 'Firefox', count: 2 },
        { name: 'Chrome', count: 8 },
        { name: 'Safari', count: 4 },
      ],
      10,
    );

    expect(rows.map((row) => row.name)).toEqual(['Chrome', 'Safari', 'Firefox']);
    expect(rows[0].share).toBe(1);
    expect(rows[1].share).toBe(0.5);
    expect(rows[2].share).toBe(0.25);
  });

  it('puts a second line on a row when the caller has one to give', () => {
    const rows = rankStats([{ name: 'www.aocr.org', count: 1, ref_scheme: 'h' }], 10, (stat) =>
      referrerNote(stat.ref_scheme),
    );

    expect(rows[0].note).toBe('Referring site');
  });

  it('leaves the second line off when the caller has nothing to say', () => {
    expect(rankStats([{ name: 'Chrome', count: 1 }], 10)[0]).toEqual({
      name: 'Chrome',
      count: 1,
      share: 1,
    });
  });

  it('keeps only the asked-for number of rows', () => {
    const rows = rankStats(
      [
        { name: 'a', count: 3 },
        { name: 'b', count: 2 },
        { name: 'c', count: 1 },
      ],
      2,
    );
    expect(rows.map((row) => row.name)).toEqual(['a', 'b']);
  });

  it('gives an unnamed row something to show', () => {
    expect(rankStats([{ name: '', count: 1 }], 5)[0].name).toBe('(unknown)');
  });

  it('handles nothing at all', () => {
    expect(rankStats(undefined, 5)).toEqual([]);
    expect(rankStats([], 5)).toEqual([]);
  });

  it('does not divide by zero when the counts are zero', () => {
    expect(rankStats([{ name: 'a', count: 0 }], 5)[0].share).toBe(0);
  });
});

describe('seriesFromStats', () => {
  it('turns the API days into a series and its peak', () => {
    const { series, peak } = seriesFromStats([
      { day: '2026-06-01', daily: 3, hourly: [1, 2] },
      { day: '2026-06-02', daily: 7 },
      { day: '2026-06-03' },
    ]);

    expect(series).toEqual([
      { day: '2026-06-01', visits: 3 },
      { day: '2026-06-02', visits: 7 },
      { day: '2026-06-03', visits: 0 },
    ]);
    expect(peak).toBe(7);
  });

  it('drops rows with no day to name', () => {
    expect(seriesFromStats([{ day: '', daily: 2 }]).series).toEqual([]);
    expect(seriesFromStats(undefined)).toEqual({ series: [], peak: 0 });
  });
});

describe('shortDay', () => {
  it('writes a day the way an axis wants it', () => {
    expect(shortDay('2026-06-05')).toContain('Jun');
  });

  it('hands back anything it cannot parse', () => {
    expect(shortDay('whenever')).toBe('whenever');
  });
});

describe('formatCount', () => {
  it('separates thousands, so a dashboard figure can be read at a glance', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(28)).toBe('28');
    expect(formatCount(2841)).toBe('2,841');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});

describe('referrerNote', () => {
  it('names what kind of referral each row is', () => {
    expect(referrerNote('h')).toBe('Referring site');
    expect(referrerNote('g')).toBe('Search engine');
    expect(referrerNote('c')).toBe('Campaign');
    expect(referrerNote('o')).toBe('Other');
  });

  it('calls no scheme at all what it is: a referrer that never arrived', () => {
    expect(referrerNote(undefined)).toBe('No referrer');
    expect(referrerNote('')).toBe('No referrer');
  });
});

describe('token permissions', () => {
  it('names the permissions a token carries', () => {
    // 2 = record pageviews, 64 = read statistics.
    expect(describePermissions(66)).toEqual(['Record pageviews', 'Read statistics']);
    expect(describePermissions(64)).toEqual(['Read statistics']);
  });

  it('reads "nothing selected" as no permissions rather than as one with no name', () => {
    expect(describePermissions(1)).toEqual([]);
    expect(describePermissions(0)).toEqual([]);
    expect(describePermissions(undefined)).toEqual([]);
  });

  it('knows whether a token can read statistics at all', () => {
    expect(canReadStatistics(64)).toBe(true);
    expect(canReadStatistics(65)).toBe(true);
    expect(canReadStatistics(2)).toBe(false);
    expect(canReadStatistics(undefined)).toBe(false);
  });
});
