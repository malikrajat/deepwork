import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/**
 * The category of a log line. Each one has its own file on disk, so a reader
 * can start where the problem is instead of scrolling one enormous file.
 *
 * - `system` — app lifecycle, window, settings, anything with no better home
 * - `flow` — what the user did: pages, timer, imports, exports
 * - `crash` — unhandled errors, rejections, Angular errors, console errors
 * - `network` — failed requests and offline/online transitions
 */
export type LogCategory = 'system' | 'flow' | 'crash' | 'network';

/** Severity of a log line, matching the levels the Rust logger understands. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** One recorded line, as shown in "Copy diagnostics". */
export interface LogEntry {
  /** ISO timestamp of the moment it was recorded. */
  at: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  /** How many times the same line repeated inside the repeat window. */
  repeats?: number;
}

/**
 * True when the webview is inside the packaged desktop app (Tauri).
 *
 * Read at the moment it is asked rather than once at import, so the same build
 * of this service reports the truth in the app, in a test and in a plain
 * browser tab.
 */
function inTauri(): boolean {
  return typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;
}

/** Entries kept in memory (and, in the browser build, in `localStorage`). */
const MAX_ENTRIES = 300;

/** Where a browser build keeps its copy — the desktop build writes real files. */
const STORAGE_KEY = 'deepwork.log.v1';

/**
 * How long identical lines are folded together.
 *
 * A render loop or a failing poll can fire the same error every frame; without
 * this, one misbehaving page would evict everything else from the log.
 */
const REPEAT_WINDOW_MS = 2_000;

/** Longest single message kept, so one runaway error cannot dominate. */
const MAX_MESSAGE_CHARS = 4_000;

/** Lazily resolves Tauri's `invoke` so browser builds never import it. */
async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** A log line as one line of text — the format "Copy diagnostics" prints. */
export function formatLogLine(entry: LogEntry): string {
  const repeats = entry.repeats && entry.repeats > 1 ? ` (×${entry.repeats})` : '';
  return `${entry.at} [${entry.level}] ${entry.category}: ${entry.message}${repeats}`;
}

/**
 * DeepWork's frontend log, and the environment report that goes with it.
 *
 * Everything the app can notice about itself is funnelled through here — window
 * errors, unhandled rejections, Angular errors, `console.error`/`warn`, failed
 * requests, offline/online changes, page navigation and timer transitions — and
 * forwarded to Rust, which writes it into the same five files the desktop side
 * logs to (`system.log`, `flow.log`, `crash.log`, `network.log`, plus
 * `deepwork.log` with everything in it).
 *
 * Three properties matter, because this is the code that has to work when the
 * rest of the app does not:
 *
 * 1. **It never throws.** A full disk, a missing command or a browser build all
 *    end in a quiet no-op, never in a second failure on top of the first.
 * 2. **It keeps a copy.** The last {@link MAX_ENTRIES} lines live in memory, so
 *    "Copy diagnostics" works even when the files cannot be opened.
 * 3. **It cannot be flooded.** A line that repeats within
 *    {@link REPEAT_WINDOW_MS} is folded into the one already recorded.
 */
@Injectable({ providedIn: 'root' })
export class LogService {
  /**
   * Optional: the log has to be injectable in places the router is not, such as
   * a service test or a command-line build. Without it, page changes are simply
   * not among the things recorded.
   */
  private readonly router = inject(Router, { optional: true });

  /** The most recent lines, oldest first. */
  private readonly buffer = signal<LogEntry[]>([]);

  /** Folder the log files are written to, once Rust has told us. */
  readonly folderPath = signal<string | null>(null);

  /** Outcome of the last "open folder" attempt, for the settings panel. */
  readonly lastAction = signal<string | null>(null);

  /** Last failure, so the UI can say what went wrong instead of doing nothing. */
  readonly lastError = signal<string | null>(null);

  /** True while the folder is being opened. */
  readonly busy = signal(false);

  /** True when this build writes real files (the desktop app does). */
  get isDesktopApp(): boolean {
    return inTauri();
  }

  private installed = false;
  private capturing = false;
  private lastRepeat: { key: string; at: number } | null = null;

  /**
   * Starts watching everything the app can misbehave in.
   *
   * Called once, from the app's initializer, before any other service has had a
   * chance to fail — that is the whole point: by the time something breaks, the
   * listeners are already in place. Safe to call again: later calls are no-ops.
   */
  async install(): Promise<void> {
    if (this.installed) return;
    this.installed = true;

    this.restoreBrowserEntries();
    this.watchWindowErrors();
    this.watchRejections();
    this.watchConsole();
    this.watchNetwork();
    this.watchRoutes();

    this.info('system', `DeepWork started · ${this.describeEnvironment()}`);

    if (this.isDesktopApp) {
      await this.resolveFolder();
    }
  }

  /** Records a line that describes what the app is doing. */
  info(category: LogCategory, message: string): void {
    this.record('info', category, message);
  }

  /** Records something off: a slow path, a fallback, a dependency refusing. */
  warn(category: LogCategory, message: string): void {
    this.record('warn', category, message);
  }

  /** Records a failure. */
  error(category: LogCategory, message: string): void {
    this.record('error', category, message);
  }

  /**
   * Opens the folder that holds the log files, in Explorer, Finder or the Linux
   * file manager — whichever this machine has.
   */
  async openFolder(): Promise<void> {
    this.lastError.set(null);

    if (!this.isDesktopApp) {
      this.lastAction.set(
        'The desktop app writes log files — this browser build keeps them in memory only.',
      );
      return;
    }

    this.busy.set(true);
    try {
      const folder = await invokeCmd<string>('open_log_folder');
      this.folderPath.set(folder);
      this.lastAction.set(`Opened ${folder}`);
      this.info('flow', `log folder opened (${folder})`);
    } catch (err) {
      const message = describeError(err, 'Could not open the log folder.');
      this.lastError.set(message);
      this.record('error', 'system', `opening the log folder failed: ${message}`);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Copies the recent lines plus the environment they happened in.
   *
   * This is the answer to "DeepWork misbehaved, what do I send you?" — one
   * paste that names the build, the platform, the page and the last 300 lines.
   */
  async copyDiagnostics(): Promise<void> {
    this.lastError.set(null);
    try {
      await writeToClipboard(this.report());
      this.lastAction.set(`Copied ${this.buffer().length} recent log lines to the clipboard`);
    } catch (err) {
      this.lastError.set(describeError(err, 'Could not copy to the clipboard.'));
    }
  }

  /** The recent lines, oldest first — a snapshot, not a live view. */
  entries(): LogEntry[] {
    return this.buffer();
  }

  /** The diagnostics report, exactly as "Copy diagnostics" writes it. */
  report(): string {
    const lines = this.buffer().map(formatLogLine);
    return [
      'DeepWork diagnostics',
      `when: ${new Date().toISOString()}`,
      `build: ${this.isDesktopApp ? 'desktop app' : 'browser'}`,
      `environment: ${this.describeEnvironment()}`,
      `page: ${this.safeUrl()}`,
      `log folder: ${this.folderPath() ?? 'not available in this build'}`,
      '',
      `recent log lines (${lines.length}):`,
      ...(lines.length ? lines : ['(nothing recorded yet)']),
      '',
    ].join('\n');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Recording
  // ──────────────────────────────────────────────────────────────────────────

  private record(level: LogLevel, category: LogCategory, message: string): void {
    const line = oneLine(message);
    if (!line) return;

    const key = `${level}|${category}|${line}`;
    const now = Date.now();

    // Fold a line that repeats in quick succession into the one already there.
    if (
      this.lastRepeat &&
      this.lastRepeat.key === key &&
      now - this.lastRepeat.at < REPEAT_WINDOW_MS
    ) {
      this.lastRepeat.at = now;
      this.buffer.update((entries) => {
        const last = entries[entries.length - 1];
        if (!last) return entries;
        return [...entries.slice(0, -1), { ...last, repeats: (last.repeats ?? 1) + 1 }];
      });
      return;
    }
    this.lastRepeat = { key, at: now };

    const entry: LogEntry = { at: new Date().toISOString(), level, category, message: line };
    this.buffer.update((entries) => [...entries, entry].slice(-MAX_ENTRIES));

    if (this.isDesktopApp) {
      void this.forward(entry);
    } else {
      this.persistBrowserEntries();
    }
  }

  /**
   * Hands one line to Rust, which appends it to the right file.
   *
   * Deliberately silent on failure: logging is a diagnostic, and a diagnostic
   * that breaks the feature it was watching is worse than a missing line.
   */
  private async forward(entry: LogEntry): Promise<void> {
    try {
      await invokeCmd('log_write', {
        category: entry.category,
        level: entry.level,
        message: entry.message,
      });
    } catch {
      // Nothing to do here: this is already the fallback path.
    }
  }

  private async resolveFolder(): Promise<void> {
    try {
      this.folderPath.set(await invokeCmd<string>('log_folder'));
    } catch (err) {
      this.lastError.set(describeError(err, 'Could not read the log folder.'));
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // What the app can misbehave in
  // ──────────────────────────────────────────────────────────────────────────

  /** Errors that never reached a `try` — script errors, bad handlers, images. */
  private watchWindowErrors(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.addEventListener('error', (event) => {
      const source = event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : 'unknown source';
      const detail = event.error instanceof Error ? event.error.stack : event.message;
      this.record('error', 'crash', `uncaught error at ${source}: ${detail ?? event.message}`);
    });
  }

  /** Promises nobody awaited — the classic source of a silent, broken screen. */
  private watchRejections(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.addEventListener('unhandledrejection', (event) => {
      this.record('error', 'crash', `unhandled promise rejection: ${describeCrash(event.reason)}`);
    });
  }

  /**
   * `console.warn` and `console.error`.
   *
   * Angular reports its own errors here, and so do the libraries the app uses —
   * this is what turns "yellow text somebody saw once" into a file with a
   * timestamp. Both originals still run, so the developer console is unchanged.
   */
  private watchConsole(): void {
    if (typeof console === 'undefined') return;

    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    console.warn = (...args: unknown[]) => {
      this.captureConsole('warn', 'system', args);
      originalWarn(...args);
    };

    console.error = (...args: unknown[]) => {
      this.captureConsole('error', 'crash', args);
      originalError(...args);
    };
  }

  private captureConsole(level: LogLevel, category: LogCategory, args: unknown[]): void {
    if (this.capturing) return;
    this.capturing = true;
    try {
      this.record(level, category, args.map(describeValue).join(' '));
    } finally {
      this.capturing = false;
    }
  }

  /**
   * Requests that fail.
   *
   * DeepWork works offline, so a failed request is usually survivable — but
   * "the app could not reach anything for twenty minutes" is the first thing a
   * support conversation needs, and it is invisible without this.
   */
  private watchNetwork(): void {
    if (typeof globalThis.fetch === 'function') {
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const url = describeRequest(input);
        try {
          const response = await originalFetch(input, init);
          if (!response.ok) {
            this.warn('network', `${method} ${url} → HTTP ${response.status}`);
          }
          return response;
        } catch (err) {
          this.error('network', `${method} ${url} → ${describeError(err)}`);
          throw err;
        }
      };
    }

    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('offline', () => this.warn('network', 'the machine went offline'));
    window.addEventListener('online', () => this.info('network', 'the machine is back online'));
  }

  /** Where the user is — the first question after "the timer vanished". */
  private watchRoutes(): void {
    this.router?.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.info('flow', `page → ${event.urlAfterRedirects}`);
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // The browser build's copy
  // ──────────────────────────────────────────────────────────────────────────

  private persistBrowserEntries(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.buffer()));
    } catch {
      // Private mode, a full quota, no storage at all — the in-memory copy is
      // enough for this session.
    }
  }

  private restoreBrowserEntries(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored: unknown = JSON.parse(raw);
      if (Array.isArray(stored)) {
        this.buffer.set(stored.slice(-MAX_ENTRIES) as LogEntry[]);
      }
    } catch {
      // A corrupt copy is not worth a second thought: start a clean one.
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  private describeEnvironment(): string {
    if (typeof navigator === 'undefined') return 'unknown runtime';
    const online = typeof navigator.onLine === 'boolean' ? navigator.onLine : undefined;
    return [
      this.isDesktopApp ? 'tauri' : 'browser',
      navigator.platform || 'unknown platform',
      navigator.language || 'unknown language',
      online === undefined ? 'connection unknown' : online ? 'online' : 'offline',
    ].join(' · ');
  }

  private safeUrl(): string {
    try {
      return this.router?.url ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

/** Collapses a message to a single line, and caps how much of it is kept. */
function oneLine(message: string): string {
  const flattened = message.replace(/\r\n|\r|\n/g, ' | ').trim();
  if (flattened.length <= MAX_MESSAGE_CHARS) return flattened;
  return `${flattened.slice(0, MAX_MESSAGE_CHARS)}… [truncated]`;
}

/** An error, or any thrown thing, as one sentence — the message, not the stack. */
function describeError(err: unknown, fallback = 'unknown error'): string {
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === 'object') return describeValue(err);
  return fallback;
}

/** The same thing with its stack, for a line that goes into `crash.log`. */
function describeCrash(err: unknown): string {
  if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`;
  return describeError(err);
}

/** A console argument or caught object, as text — truncated, never throwing. */
function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** `GET /api/x` — the request as a person would name it. */
function describeRequest(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

/** Clipboard write with a fallback for the browsers that refuse the API. */
async function writeToClipboard(text: string): Promise<void> {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand?.('copy') ?? false;
  document.body.removeChild(field);
  if (!copied) throw new Error('the clipboard is not available in this window');
}

/**
 * Records a failure that happened before there was an app to record it.
 *
 * A white window with nothing written down is the worst bug report there is, so
 * a bootstrap failure goes straight to `crash.log` and the console — the
 * service, the UI and the database may all be the thing that failed.
 */
export async function reportBootstrapFailure(err: unknown): Promise<void> {
  const message = `bootstrap failed: ${describeError(err, 'the app could not start')}`;

  if (inTauri()) {
    try {
      await invokeCmd('log_write', { category: 'crash', level: 'error', message });
    } catch {
      // The log is the last thing standing; there is nothing below this to try.
    }
  }

  console.error('DeepWork failed to start:', err);
}
