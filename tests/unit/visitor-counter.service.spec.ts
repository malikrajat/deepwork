import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import {
  VisitorCounterService,
  resolveToken,
} from '../../src/app/core/services/visitor-counter.service';
import {
  GOATCOUNTER_API_TOKEN,
  GOATCOUNTER_COUNT_ENDPOINT,
  GOATCOUNTER_SCRIPT_INTEGRITY,
  GOATCOUNTER_SCRIPT_URL,
  VISITOR_OPTOUT_KEY,
  VISITOR_TOKEN_KEY,
  VISITOR_VISITS_KEY,
} from '../../src/app/core/constants/visitor.constants';

/**
 * The counter is the only part of DeepWork that talks to somebody else's
 * server, so what it sends, when it sends it, and what it refuses to do are all
 * worth pinning down: it must never count the packaged desktop app, must never
 * count anything when the user has switched it off, and must use the pinned,
 * integrity-checked script rather than whatever the CDN holds today.
 */
describe('VisitorCounterService', () => {
  let service: VisitorCounterService;
  let router: { url: string; events: Subject<unknown> };
  let countSpy: ReturnType<typeof vi.fn>;
  const realFetch = globalThis.fetch;

  /** Let the service's fire-and-forget start-up finish. */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const goatcounterGlobal = () =>
    (globalThis as unknown as { goatcounter?: Record<string, unknown> }).goatcounter;

  function setup(): VisitorCounterService {
    router = { url: '/', events: new Subject<unknown>() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    return TestBed.inject(VisitorCounterService);
  }

  /** A loaded `count.js`, with the pageview call watched. */
  function installCounterScript(filterReason: string | false = false): void {
    countSpy = vi.fn();
    (globalThis as unknown as { goatcounter?: unknown }).goatcounter = {
      count: countSpy,
      filter: () => filterReason,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    delete (globalThis as unknown as { goatcounter?: unknown }).goatcounter;
    document.querySelectorAll('script[data-goatcounter]').forEach((node) => node.remove());
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete (globalThis as unknown as { goatcounter?: unknown }).goatcounter;
    document.querySelectorAll('script[data-goatcounter]').forEach((node) => node.remove());
    localStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('knows the browser build is the one that gets counted', () => {
    service = setup();
    expect(service.isWeb).toBe(true);
  });

  it('records that this browser has opened the app', () => {
    service = setup();
    service.start();

    expect(service.visitNumber()).toBe(1);
    expect(localStorage.getItem(VISITOR_VISITS_KEY)).toBe('1');
  });

  it('counts the page it lands on, under the app own prefix', async () => {
    service = setup();
    installCounterScript();

    service.start();
    await flush();

    expect(countSpy).toHaveBeenCalledWith({
      path: '/deepwork/',
      title: 'DeepWork — Dashboard',
    });
    expect(service.counted()).toBe(true);
    expect(service.skippedBecause()).toBeNull();
  });

  it('counts every page after it, because an app changes page without reloading', async () => {
    service = setup();
    installCounterScript();
    service.start();
    await flush();

    router.url = '/tasks';
    router.events.next(new NavigationEnd(1, '/tasks', '/tasks'));
    router.url = '/journal/2026-06-05';
    router.events.next(new NavigationEnd(2, '/journal/2026-06-05', '/journal/2026-06-05'));

    expect(countSpy).toHaveBeenCalledTimes(3);
    expect(countSpy).toHaveBeenLastCalledWith({
      path: '/deepwork/journal/2026-06-05',
      title: 'DeepWork — Journal',
    });
  });

  it('keeps GoatCounter reason when it skips a visit, rather than showing a silent zero', async () => {
    service = setup();
    installCounterScript('local address');

    service.start();
    await flush();

    expect(countSpy).not.toHaveBeenCalled();
    expect(service.counted()).toBe(false);
    expect(service.skippedBecause()).toBe('local address');
  });

  it('loads the pinned script, with the integrity check that pins it', async () => {
    service = setup();
    service.start();
    await flush();

    const script = document.querySelector<HTMLScriptElement>('script[data-goatcounter]');
    expect(script).not.toBeNull();
    expect(script?.src).toBe(GOATCOUNTER_SCRIPT_URL);
    expect(script?.integrity).toBe(GOATCOUNTER_SCRIPT_INTEGRITY);
    expect(script?.crossOrigin).toBe('anonymous');
    // The endpoint travels on the tag as `data-goatcounter`, which is how the
    // script finds where to send pageviews.
    expect(script?.dataset['goatcounter']).toBe(GOATCOUNTER_COUNT_ENDPOINT);
    // `no_onload` has to be set before the script runs: the pageviews are ours
    // to send, because the app never loads another document.
    expect(goatcounterGlobal()?.['no_onload']).toBe(true);
    expect(goatcounterGlobal()?.['allow_local']).toBe(false);
    expect(goatcounterGlobal()?.['endpoint']).toBe(GOATCOUNTER_COUNT_ENDPOINT);
  });

  it('counts nothing at all when the user has switched it off', async () => {
    localStorage.setItem(VISITOR_OPTOUT_KEY, '1');
    service = setup();
    installCounterScript();

    service.start();
    await flush();
    router.events.next(new NavigationEnd(1, '/tasks', '/tasks'));

    expect(service.countingEnabled()).toBe(false);
    expect(countSpy).not.toHaveBeenCalled();
    // The script is never even fetched: nothing leaves the machine.
    expect(document.querySelector('script[data-goatcounter]')).toBeNull();
  });

  it('starts counting when the switch is turned back on', async () => {
    localStorage.setItem(VISITOR_OPTOUT_KEY, '1');
    service = setup();
    installCounterScript();
    service.start();
    await flush();

    service.setCounting(true);
    await flush();

    expect(localStorage.getItem(VISITOR_OPTOUT_KEY)).toBe('0');
    expect(countSpy).toHaveBeenCalledTimes(1);
  });

  it('remembers that counting was switched off', () => {
    service = setup();
    service.setCounting(false);

    expect(service.countingEnabled()).toBe(false);
    expect(localStorage.getItem(VISITOR_OPTOUT_KEY)).toBe('1');
    expect(service.counted()).toBe(false);
  });

  it('reports a script an ad blocker refused rather than failing', async () => {
    service = setup();
    service.start();
    await flush();

    const script = document.querySelector<HTMLScriptElement>('script[data-goatcounter]');
    script?.dispatchEvent(new Event('error'));
    await flush();

    expect(service.skippedBecause()).toContain('ad blocker');
    expect(service.counted()).toBe(false);
  });

  describe('the public visitor counter', () => {
    it('reads the site total', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ count: '28', count_unique: '28' }),
      })) as unknown as typeof fetch;
      service = setup();

      await service.loadTotal();

      expect(service.total()).toBe('28');
      expect(service.counterError()).toBeNull();
    });

    it('asks GoatCounter once, not on every visit to the settings page', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ count: '28' }),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      service = setup();

      await service.loadTotal();
      await service.loadTotal();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('explains a 404, which is the setting rather than a fault', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
      })) as unknown as typeof fetch;
      service = setup();

      await service.loadTotal();

      expect(service.counterError()).toContain('allow adding visitor counts');
      expect(service.total()).toBeNull();
    });

    it('survives a network that is not there', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch;
      service = setup();

      await service.loadTotal();

      expect(service.counterError()).toBe('offline');
    });
  });

  describe('the API token', () => {
    it('keeps it in this browser, not in the database', () => {
      service = setup();

      service.saveToken('  secret-token  ');

      expect(service.token()).toBe('secret-token');
      expect(localStorage.getItem(VISITOR_TOKEN_KEY)).toBe('secret-token');
      expect(service.tokenFromBuild()).toBe(false);
    });

    it('forgets the copy this browser holds, and leaves the build own alone', () => {
      localStorage.setItem(VISITOR_TOKEN_KEY, 'old');
      service = setup();

      service.forgetToken();

      // Forgotten means forgotten *here*: the browser's copy is gone. What the app
      // uses afterwards is whatever the build ships with — nothing in this
      // repository, a real token on a build that has one — so the assertion is
      // about the browser's copy rather than about the resolved token, and it never
      // has to spell one out.
      expect(localStorage.getItem(VISITOR_TOKEN_KEY)).toBeNull();
      expect(service.token()).toBe(resolveToken(null, GOATCOUNTER_API_TOKEN).token);
      expect(service.tokenFromBuild()).toBe(!!GOATCOUNTER_API_TOKEN.trim());
    });

    it('treats an empty paste as forgetting rather than as saving nothing', () => {
      service = setup();
      service.saveToken('something');

      service.saveToken('   ');

      expect(localStorage.getItem(VISITOR_TOKEN_KEY)).toBeNull();
      expect(service.token()).toBe(resolveToken(null, GOATCOUNTER_API_TOKEN).token);
    });
  });

  /**
   * The token the build ships with, tested through the resolver rather than
   * through a service built with one: `GOATCOUNTER_API_TOKEN` is empty in this
   * repository on purpose, and the whole point of the resolver is the choice
   * between the two sources.
   */
  describe('choosing a token', () => {
    it('uses the one this browser has, over the one the build ships', () => {
      expect(resolveToken('pasted-here', 'shipped-in-the-build')).toEqual({
        token: 'pasted-here',
        fromBuild: false,
      });
    });

    it('falls back to the build when this browser has none', () => {
      expect(resolveToken(null, 'shipped-in-the-build')).toEqual({
        token: 'shipped-in-the-build',
        fromBuild: true,
      });
    });

    it('has nothing to use when neither is set', () => {
      expect(resolveToken(null, '')).toEqual({ token: null, fromBuild: false });
      expect(resolveToken(null, '   ')).toEqual({ token: null, fromBuild: false });
    });

    it('ignores whitespace around either of them', () => {
      expect(resolveToken('  pasted  ', '  shipped  ')).toEqual({
        token: 'pasted',
        fromBuild: false,
      });
      expect(resolveToken('   ', '  shipped  ')).toEqual({
        token: 'shipped',
        fromBuild: true,
      });
    });
  });
});
