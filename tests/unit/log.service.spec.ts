import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { LogService } from '../../src/app/core/services/log.service';
import { TimerService } from '../../src/app/core/services/timer.service';
import type { LogEntry } from '../../src/app/core/services/log.service';

/**
 * The log is the app's black box: it has to keep working when everything else
 * does not, and it has to be readable by somebody who was not there.
 *
 * So these tests are about the four promises the service makes: every kind of
 * misbehaviour is written down (window, network, console, Angular, flow), a
 * repeat cannot flood the file, the browser build keeps a copy of its own, and
 * nothing it does can throw back into the app.
 */

@Component({ selector: 'app-blank-route', template: '', standalone: true })
class BlankRouteComponent {}

/** The console, the clipboard and fetch as they were before any test wrapped them. */
const realWarn = console.warn;
const realError = console.error;
const realFetch = globalThis.fetch;

const LOG_FOLDER = 'C:\\Users\\Ada\\AppData\\Local\\com.deepwork.app\\logs';

/** The build under test: the desktop app, or a plain browser tab. */
function makeService(options: { desktop?: boolean } = {}): LogService {
  if (options.desktop) {
    (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke: vi.fn(async (cmd: string) =>
        cmd === 'log_folder' || cmd === 'open_log_folder' ? LOG_FOLDER : undefined,
      ),
    };
  } else {
    delete (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'];
  }

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'today', component: BlankRouteComponent }])],
  });
  return TestBed.inject(LogService);
}

/** The lines recorded so far, as a reader would scan them. */
function lines(service: LogService): string[] {
  return service.entries().map((entry) => `${entry.level}/${entry.category}: ${entry.message}`);
}

/** Lets the fire-and-forget forwarding to Rust reach the stub. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('LogService', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'];
  });

  afterEach(() => {
    console.warn = realWarn;
    console.error = realError;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('keeps every line, oldest first, with its category and level', async () => {
    const service = makeService();
    await service.install();

    service.info('flow', 'first');
    service.warn('network', 'second');
    service.error('crash', 'third');

    const recorded = lines(service);
    expect(recorded[0]).toContain('info/system: DeepWork started · browser');
    expect(recorded.slice(1)).toEqual([
      'info/flow: first',
      'warn/network: second',
      'error/crash: third',
    ]);
  });

  it('folds a line that repeats in quick succession into the one already recorded', async () => {
    const service = makeService();
    await service.install();

    for (let attempt = 0; attempt < 40; attempt++) {
      service.error('crash', 'the same thing again');
    }

    const repeated = service.entries().filter((entry) => entry.message === 'the same thing again');
    expect(repeated).toHaveLength(1);
    expect(repeated[0].repeats).toBe(40);
  });

  it('writes a multi-line message as one line', async () => {
    const service = makeService();
    await service.install();

    service.error('crash', 'it broke\r\nbecause of this\nand this');

    expect(lines(service)).toContain('error/crash: it broke | because of this | and this');
  });

  it('records an uncaught window error with where it happened', async () => {
    const service = makeService();
    await service.install();

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'kaboom',
        filename: 'main.js',
        lineno: 12,
        colno: 5,
        error: new Error('kaboom'),
      }),
    );

    expect(lines(service).some((line) => line.includes('uncaught error at main.js:12:5'))).toBe(
      true,
    );
  });

  it('records a promise nobody awaited, with its stack', async () => {
    const service = makeService();
    await service.install();

    const rejection = new Event('unhandledrejection');
    Object.assign(rejection, { reason: new Error('dropped') });
    window.dispatchEvent(rejection);

    const [line] = lines(service).filter((text) => text.includes('unhandled promise rejection'));
    expect(line).toContain('Error: dropped');
  });

  it('records console errors and warnings, and still prints them', async () => {
    const printed: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      printed.push(args);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = makeService();
    await service.install();

    // Both are how Angular and the libraries the app uses report trouble.
    console.error('Angular said no', new Error('bad'));
    console.warn('deprecated thing');

    expect(
      lines(service).some((line) => line.startsWith('error/crash: Angular said no Error: bad')),
    ).toBe(true);
    expect(lines(service)).toContain('warn/system: deprecated thing');
    expect(printed).toHaveLength(1);
  });

  it('records a request that failed, and one that came back unhappy', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('unreachable')) throw new TypeError('Failed to fetch');
      // jsdom has no `Response`, and the service only reads these two fields.
      return { ok: false, status: 503 } as unknown as Response;
    }) as unknown as typeof fetch;

    const service = makeService();
    await service.install();

    await expect(fetch('/api/unreachable')).rejects.toThrow('Failed to fetch');
    await fetch('/api/tasks');

    expect(lines(service)).toContain('error/network: GET /api/unreachable → Failed to fetch');
    expect(lines(service)).toContain('warn/network: GET /api/tasks → HTTP 503');
  });

  it('records which page the user moved to', async () => {
    const service = makeService();
    await service.install();

    await TestBed.inject(Router).navigateByUrl('/today');

    expect(lines(service)).toContain('info/flow: page → /today');
  });

  it('records the timer starting and pausing, because that is what the app is for', async () => {
    const service = makeService();
    await service.install();

    const timer = TestBed.inject(TimerService);
    timer.start();
    timer.pause();

    expect(lines(service)).toContain('info/flow: timer started · work');
    expect(lines(service)).toContain('info/flow: timer paused · work');
  });

  it('hands a report to the clipboard, environment included', async () => {
    const written: string[] = [];
    Object.assign(navigator, {
      clipboard: { writeText: async (text: string) => void written.push(text) },
    });

    const service = makeService();
    await service.install();
    service.error('crash', 'something specific');

    await service.copyDiagnostics();

    const [report] = written;
    expect(report).toContain('DeepWork diagnostics');
    expect(report).toContain('build: browser');
    expect(report).toContain('page: /');
    expect(report).toContain('crash: something specific');
    expect(service.lastError()).toBeNull();
  });

  it('keeps a copy in the browser build, and restores the previous run', async () => {
    const first = makeService();
    await first.install();
    first.info('flow', 'from the last run');

    const stored: LogEntry[] = JSON.parse(localStorage.getItem('deepwork.log.v1') ?? '[]');
    expect(stored[stored.length - 1].message).toBe('from the last run');

    const second = makeService();
    await second.install();
    expect(lines(second)).toContain('info/flow: from the last run');
  });

  it('says where the log lives instead of failing when there is no desktop shell', async () => {
    const service = makeService();
    await service.install();

    await service.openFolder();

    expect(service.lastError()).toBeNull();
    expect(service.lastAction()).toContain('desktop app');
  });

  it('reports the folder the desktop app writes to, and can open it', async () => {
    const service = makeService({ desktop: true });
    await service.install();

    expect(service.isDesktopApp).toBe(true);
    expect(service.folderPath()).toBe(LOG_FOLDER);

    await service.openFolder();

    expect(service.lastError()).toBeNull();
    expect(service.lastAction()).toBe(`Opened ${LOG_FOLDER}`);
  });

  it('forwards every line to Rust, which owns the files', async () => {
    const service = makeService({ desktop: true });
    await service.install();
    service.info('flow', 'a page was opened');
    await settle();

    const invoke = (globalThis as Record<string, any>)['__TAURI_INTERNALS__'].invoke;
    const calls = invoke.mock.calls.filter(([cmd]: [string]) => cmd === 'log_write');

    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0][1]).toMatchObject({ category: 'system', level: 'info' });
    expect(calls.some(([, args]: [string, LogEntry]) => args.category === 'flow')).toBe(true);
  });

  it('turns a failure to open the folder into a message, never into a crash', async () => {
    const service = makeService({ desktop: true });
    await service.install();

    const internals = (globalThis as Record<string, any>)['__TAURI_INTERNALS__'];
    internals.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'open_log_folder') throw new Error('no file manager here');
      return cmd === 'log_folder' ? LOG_FOLDER : undefined;
    });

    await service.openFolder();

    expect(service.lastError()).toBe('no file manager here');
    expect(service.busy()).toBe(false);
  });
});
