import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, type Subscription } from 'rxjs';
import {
  GOATCOUNTER_API_TOKEN,
  GOATCOUNTER_COUNT_ENDPOINT,
  GOATCOUNTER_ORIGIN,
  GOATCOUNTER_SCRIPT_INTEGRITY,
  GOATCOUNTER_SCRIPT_URL,
  VISITOR_COUNTER_TTL_MS,
  VISITOR_OPTOUT_KEY,
  VISITOR_TOKEN_KEY,
  VISITOR_VISITS_KEY,
} from '../constants/visitor.constants';
import { countedPath, pageTitleFor } from '../utils/analytics-path.util';
import type { GoatCounterCounterResponse } from '../models/visitor-stats.model';

/**
 * The parts of `window.goatcounter` this app touches.
 *
 * `count.js` is served unminified on purpose so it can be read, and its API is
 * documented at <https://www.goatcounter.com/help/js>; this is the subset that
 * matters here — the settings that go in before it loads, plus the two calls
 * made afterwards.
 */
interface GoatCounterGlobal {
  no_onload?: boolean;
  allow_local?: boolean;
  allow_frame?: boolean;
  endpoint?: string;
  path?: string | ((path: string) => string | null);
  title?: string;
  referrer?: string;
  count?: (vars?: { path?: string; title?: string }) => void;
  /** Why this request would not be counted, or `false` if it would. */
  filter?: () => string | false;
  get_data?: () => Record<string, unknown> | undefined;
}

/** The counter script, if it has loaded. */
function counterScript(): GoatCounterGlobal | undefined {
  return (globalThis as unknown as { goatcounter?: GoatCounterGlobal }).goatcounter;
}

/** Which token the app will authenticate with, and where it came from. */
export interface ResolvedToken {
  token: string | null;
  /** True when the token is the build's rather than this browser's. */
  fromBuild: boolean;
}

/**
 * Chooses between the token pasted into this browser and the one the build ships
 * with: the browser's own first, so a pasted token overrides a baked-in one on
 * that machine without a rebuild, and an empty paste falls back to the build's
 * rather than leaving the popup with nothing.
 */
export function resolveToken(local: string | null, baked: string): ResolvedToken {
  const own = local?.trim();
  if (own) return { token: own, fromBuild: false };

  const shipped = baked.trim();
  return { token: shipped || null, fromBuild: !!shipped };
}

/**
 * The packaged desktop app is not a website and has no origin to report, so it
 * is never counted. This is the same test the shell uses for the service worker.
 */
const IS_WEB = typeof globalThis !== 'undefined' && !('__TAURI_INTERNALS__' in globalThis);

/** `localStorage` can be unavailable — private mode, a locked-down webview. */
function readKey(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable — the setting holds for this session only */
  }
}

function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}

/** One line explaining a failed fetch, without leaking a stack trace into the UI. */
function failureText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'The request could not be completed.';
}

/**
 * Counts visits to the web build of DeepWork, and only the web build.
 *
 * The desktop app is a Tauri window with no origin: GoatCounter would file it
 * under a path that means nothing, and "how many people opened this" is not a
 * question about somebody's own laptop. So every entry point here returns early
 * unless the page is a real browser, and in the packaged app the settings panel
 * says as much rather than showing a number that would never move.
 *
 * Counting is opt-out, and the switch is in Settings: this app's whole promise
 * is that it keeps to itself, and a promise like that cannot be kept by
 * something the user is not allowed to turn off. With it off, the script is
 * never even fetched.
 */
@Injectable({ providedIn: 'root' })
export class VisitorCounterService {
  private readonly router = inject(Router);

  /** True in the browser build. The desktop app is never counted. */
  readonly isWeb = IS_WEB;

  /** On unless the user turned it off. */
  readonly countingEnabled = signal(readKey(VISITOR_OPTOUT_KEY) !== '1');

  /**
   * The site-wide visitor count, as GoatCounter's public counter reports it.
   *
   * "Site-wide" is the honest word: this GoatCounter site carries rajatmalik.dev
   * as well, and the public counter can only answer for a whole site or for one
   * exact path. The app's own number needs the API and a token, and that is what
   * the details popup is for.
   */
  readonly total = signal<string | null>(null);
  readonly counterLoading = signal(false);
  readonly counterError = signal<string | null>(null);

  /**
   * A token pasted into this browser's popup, if there is one.
   *
   * Private because the token in use may also come from the build: see
   * `token` and `tokenFromBuild`.
   */
  private readonly localToken = signal<string | null>(readKey(VISITOR_TOKEN_KEY));

  /** What the build was compiled with — empty unless somebody filled it in. */
  private readonly bakedToken = GOATCOUNTER_API_TOKEN.trim();

  /**
   * The API token in use: this browser's, or the one the build ships with.
   *
   * The browser's own wins, so a token pasted into the popup overrides a baked-in
   * one on that machine without a rebuild.
   */
  private readonly resolvedToken = computed(() => resolveToken(this.localToken(), this.bakedToken));

  /** The token the API calls will carry, or null when there is none. */
  readonly token = computed(() => this.resolvedToken().token);

  /**
   * True when the token comes from the build rather than from this browser.
   *
   * The popup says which it is: a token that is not the reader's own is one they
   * cannot take away, and hiding that would make "forget" look broken.
   */
  readonly tokenFromBuild = computed(() => this.resolvedToken().fromBuild);

  /** Why GoatCounter skipped the last pageview, in its own words. */
  readonly skippedBecause = signal<string | null>(null);

  /** Whether the last pageview was handed to GoatCounter. */
  readonly counted = signal(false);

  /** How many times this browser has opened the web app. */
  readonly visitNumber = signal(0);

  /** When the entry page was opened, and where — this visit's own facts. */
  readonly startedAt = new Date();
  readonly entryPath = entryPathOf();
  readonly referrer = globalThis.document?.referrer ?? '';
  readonly selfOrigin = globalThis.location?.origin ?? '';

  private script?: Promise<void>;
  private navigation?: Subscription;
  private totalFetchedAt = 0;

  /**
   * Begin counting, once, from the app's own startup.
   *
   * Called by the shell rather than by a page, because a visit is a visit
   * wherever it lands: someone who opens DeepWork on `/settings` and never
   * touches the dashboard is still a reader.
   */
  start(): void {
    if (!IS_WEB) return;

    this.visitNumber.set(bumpVisitCount());
    if (!this.countingEnabled()) return;
    void this.begin();
  }

  /** Turn counting on or off. Off means nothing is loaded and nothing is sent. */
  setCounting(enabled: boolean): void {
    this.countingEnabled.set(enabled);
    writeKey(VISITOR_OPTOUT_KEY, enabled ? '0' : '1');

    if (enabled) {
      void this.begin();
      return;
    }
    this.counted.set(false);
    this.skippedBecause.set(null);
  }

  /**
   * Store the API token for the details popup. Empty input forgets it.
   *
   * Forgetting falls back to the token the build ships with, if it ships one:
   * this removes *this browser's* token, which is the only one the reader put
   * there.
   */
  saveToken(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) {
      this.forgetToken();
      return;
    }
    this.localToken.set(trimmed);
    writeKey(VISITOR_TOKEN_KEY, trimmed);
  }

  /** Forget this browser's token: remove it from storage and from memory. */
  forgetToken(): void {
    this.localToken.set(null);
    removeKey(VISITOR_TOKEN_KEY);
  }

  /**
   * Read the public visitor counter.
   *
   * The answer is cached by GoatCounter for up to four hours, and by this
   * service for a quarter of an hour, so asking again on every settings visit
   * would be rude for no gain. `force` skips only the local cache.
   */
  async loadTotal(force = false): Promise<void> {
    if (!IS_WEB) return;
    const fresh =
      this.total() !== null && Date.now() - this.totalFetchedAt < VISITOR_COUNTER_TTL_MS;
    if (!force && fresh) return;

    this.counterLoading.set(true);
    try {
      const response = await fetch(`${GOATCOUNTER_ORIGIN}/counter/TOTAL.json`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'GoatCounter has no counter for this site — check that “allow adding visitor counts on your website” is on in the site’s settings.'
            : `GoatCounter answered ${response.status}.`,
        );
      }

      const body = (await response.json()) as GoatCounterCounterResponse;
      this.total.set(body.count ?? '0');
      this.totalFetchedAt = Date.now();
      this.counterError.set(null);
    } catch (error) {
      this.counterError.set(failureText(error));
    } finally {
      this.counterLoading.set(false);
    }
  }

  /** Fetch the counter script and count this page, then every page after it. */
  private async begin(): Promise<void> {
    try {
      await this.loadScript();
    } catch (error) {
      // An ad blocker is the usual reason, and it is a perfectly good one: the
      // app carries on without a counter rather than reporting an error.
      this.skippedBecause.set(failureText(error));
      return;
    }

    if (!this.navigation) {
      // `no_onload` hands the pageviews to us because an Angular app changes
      // page without ever loading another document; without this subscription
      // a visit would be counted once and every page after it would be lost.
      this.navigation = this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => this.countCurrentPage());
    }

    this.countCurrentPage();
  }

  /** Load the script exactly once, pinned and integrity-checked. */
  private loadScript(): Promise<void> {
    if (counterScript()?.count) return Promise.resolve();
    if (this.script) return this.script;

    this.script = new Promise<void>((resolve, reject) => {
      const document_ = globalThis.document;
      if (!document_) {
        reject(new Error('There is no document to count from.'));
        return;
      }

      // Both settings have to be in place *before* the script runs: `count.js`
      // reads them as it loads. `no_onload` stops it counting the first page by
      // itself, and `allow_local` is left off so opening the app on localhost
      // while working on it does not land in the same list as real readers.
      // `endpoint` says where pageviews go, on both this object and the tag
      // below, because the attribute is what the script documents and this is
      // what it honours.
      const existing = counterScript() ?? {};
      (globalThis as unknown as { goatcounter?: GoatCounterGlobal }).goatcounter = {
        ...existing,
        no_onload: true,
        allow_local: false,
        endpoint: GOATCOUNTER_COUNT_ENDPOINT,
      };

      const script = document_.createElement('script');
      script.async = true;
      script.src = GOATCOUNTER_SCRIPT_URL;
      script.integrity = GOATCOUNTER_SCRIPT_INTEGRITY;
      script.crossOrigin = 'anonymous';
      // `count.js` finds where to send pageviews by looking for this attribute
      // on its own script tag: without it, it loads and counts nothing at all.
      script.dataset['goatcounter'] = GOATCOUNTER_COUNT_ENDPOINT;
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () =>
        reject(
          new Error(
            'The GoatCounter script could not be loaded — an ad blocker is the usual reason.',
          ),
        ),
      );
      document_.head.appendChild(script);
    });

    return this.script;
  }

  /**
   * Count the page the router is on.
   *
   * `filter()` is asked first and its answer is kept, so the popup can explain a
   * visit that was counted as nothing rather than showing a silent zero:
   * localhost, a robot, a frame, or an ad blocker that ate the request.
   */
  private countCurrentPage(): void {
    if (!IS_WEB || !this.countingEnabled()) return;

    const goatcounter = counterScript();
    if (!goatcounter?.count) return;

    const reason = filterReason(goatcounter);
    if (reason) {
      this.counted.set(false);
      this.skippedBecause.set(reason);
      return;
    }

    const url = this.router.url;
    goatcounter.count({ path: countedPath(url), title: pageTitleFor(url) });
    this.skippedBecause.set(null);
    this.counted.set(true);
  }
}

/**
 * Why `count.js` would not count this page, or `false` if it would.
 *
 * It filters local addresses, robots and frames, and it is the authority on all
 * three — asking it rather than guessing keeps this app's answer and
 * GoatCounter's the same answer.
 */
function filterReason(goatcounter: GoatCounterGlobal): string | false {
  try {
    return goatcounter.filter?.() ?? false;
  } catch {
    return false;
  }
}

/** The address this visit landed on, before the router rewrote anything. */
function entryPathOf(): string {
  const location = globalThis.location;
  if (!location) return '';
  return `${location.pathname}${location.search}${location.hash}`;
}

/** Count this browser's visits, and return the new total. */
function bumpVisitCount(): number {
  const stored = Number.parseInt(readKey(VISITOR_VISITS_KEY) ?? '', 10);
  const next = (Number.isFinite(stored) ? stored : 0) + 1;
  writeKey(VISITOR_VISITS_KEY, String(next));
  return next;
}
