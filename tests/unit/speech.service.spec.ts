import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SpeechService } from '../../src/app/core/services/speech.service';
import { chooseEngine } from '../../src/app/core/services/speech-engine';
import { speechLog } from '../../src/app/core/services/speech-log';

/**
 * Dictation in the packaged app: the engine question comes before the microphone.
 *
 * The bug this guards against was never a broken microphone. Windows cannot
 * dictate until a speech language has been installed, and on a machine without
 * one the app opened the microphone anyway, waited seven seconds and said
 * "Nothing heard yet" — while the reason Windows had already given it was thrown
 * away. The service now asks the bridge whether the machine can dictate at all,
 * shows that answer, and keeps it on screen when a start fails.
 *
 * The tests drive the *real* Tauri client by standing in for the webview's
 * `__TAURI_INTERNALS__`, which is what the packaged app provides.
 */

const NO_LANGUAGE_REASON =
  'Windows has no speech language installed, so its dictation engine cannot start — this is a Windows setting, not a microphone problem.';

let invoke: ReturnType<typeof vi.fn>;
let callbacks: Map<number, (event: unknown) => void>;
let nextCallbackId: number;

/** Stand in for the Tauri runtime, the way the desktop webview would. */
function installFakeShell(): void {
  callbacks = new Map();
  nextCallbackId = 1;
  const internals = {
    __TAURI_INTERNALS__: {
      invoke: (...args: unknown[]) => invoke(...args),
      transformCallback: (callback: (event: unknown) => void) => {
        const id = nextCallbackId++;
        callbacks.set(id, callback);
        return id;
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => undefined },
  };
  Object.assign(globalThis, internals);
}

function removeFakeShell(): void {
  for (const key of ['__TAURI_INTERNALS__', '__TAURI_EVENT_PLUGIN_INTERNALS__']) {
    delete (globalThis as unknown as Record<string, unknown>)[key];
  }
}

/**
 * The packaged app runs in WebView2, which is Edge and therefore exposes the Web
 * Speech API — that is the engine dictation falls back to on a machine where
 * Windows' own recognizer hears the user and transcribes nothing.
 */
interface FakeWebRecognition {
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

/** The last engine the service built, so a test can make it answer. */
let lastWebRecognition: FakeWebRecognition | null = null;

function installFakeWebEngine(): void {
  class FakeRecognition {
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult = null;
    onerror = null;
    onend = null;
    constructor() {
      lastWebRecognition = this as unknown as FakeWebRecognition;
    }
    start(): void {}
    stop(): void {}
    abort(): void {}
  }
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    value: FakeRecognition,
    configurable: true,
    writable: true,
  });
}

/** A microphone the web engine can open, which jsdom does not provide. */
function installFakeMicrophone(): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: () =>
        Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }),
      enumerateDevices: () => Promise.resolve([]),
    },
    configurable: true,
  });
}

/** Push a bridge event to whoever is listening, exactly as the Rust side would. */
function emitFromBridge(payload: unknown): void {
  callbacks.forEach(callback =>
    callback({ event: 'deepwork:speech', id: 1, payload })
  );
}

/** The status the bridge returns for a machine whose engine is ready. */
function readyStatus() {
  return {
    available: true,
    engine: 'Windows speech recognition',
    reason: null,
    remedyLabel: null,
    remedyCommand: null,
    languages: ['en-US'],
  };
}

function noLanguageStatus() {
  return {
    available: false,
    engine: 'Windows speech recognition',
    reason: NO_LANGUAGE_REASON,
    remedyLabel: 'Open Speech settings',
    remedyCommand: 'open_speech_settings',
    languages: [],
  };
}

describe('SpeechService (desktop app)', () => {
  let service: SpeechService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    invoke = vi.fn();
    // The engine preference is remembered per machine, so a test that switches
    // engine must not decide what the next test runs on.
    localStorage.clear();
    installFakeShell();
    installFakeWebEngine();
    TestBed.configureTestingModule({ providers: [SpeechService] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    removeFakeShell();
  });

  it('says exactly what is missing instead of listening into the void', async () => {
    invoke.mockResolvedValue(noLanguageStatus());
    service = TestBed.inject(SpeechService);

    await service.start('owner');

    // The log stream is the only other call the service makes, and it opens no
    // microphone of its own: no `native_speech_start`, nothing to hear.
    expect(
      invoke.mock.calls
        .map(call => [call[0], call[1]])
        .filter(([name]) => String(name).startsWith('native_speech'))
    ).toEqual([['native_speech_status', { language: 'en-US' }]]);
    expect(
      invoke.mock.calls.some(call => call[0] === 'native_speech_start')
    ).toBe(false);
    expect(service.listening()).toBe(false);
    expect(service.supported()).toBe(false);
    expect(service.error()).toBe(NO_LANGUAGE_REASON);
    expect(service.remedy()).toEqual({
      label: 'Open Speech settings',
      command: 'open_speech_settings',
    });
  });

  it('asks the bridge before it could possibly open a microphone', async () => {
    invoke.mockResolvedValue(noLanguageStatus());
    service = TestBed.inject(SpeechService);

    await service.refreshStatus();

    // The engine check is the only thing the service has done: no microphone
    // request, no session, nothing that could end in "nothing heard".
    expect(
      invoke.mock.calls
        .map(call => call[0])
        .filter(name => String(name).startsWith('native_speech'))
    ).toEqual(['native_speech_status']);
  });

  it('repeats the reason the session refused to start with', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'native_speech_status') return readyStatus();
      if (command === 'native_speech_start') {
        throw 'Windows has no speech language installed, so its dictation engine cannot start.';
      }
      return undefined;
    });
    service = TestBed.inject(SpeechService);

    await service.start('owner');

    expect(service.listening()).toBe(false);
    expect(service.error()).toContain('no speech language installed');
    // The button that asked still owns the message, so the bubble shows it.
    expect(service.owner()).toBe('owner');
  });

  it('keeps the reason on screen when the session ends right after failing', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'native_speech_status') return readyStatus();
      if (command === 'native_speech_start') {
        throw 'The microphone is being used by another app.';
      }
      return undefined;
    });
    service = TestBed.inject(SpeechService);

    await service.start('owner');
    // Rust always follows a failed start with `stopped`; the explanation has to
    // survive it — this is exactly what used to hide the real error.
    emitFromBridge({ kind: 'stopped' });

    expect(service.error()).toBe('The microphone is being used by another app.');
    expect(service.owner()).toBe('owner');
  });

  it('listens once the engine is ready and the session starts', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'native_speech_status') return readyStatus();
      return undefined;
    });
    service = TestBed.inject(SpeechService);

    await service.start('owner');

    expect(invoke.mock.calls.map(call => [call[0], call[1]])).toContainEqual([
      'native_speech_start',
      { language: 'en-US' },
    ]);
    expect(service.listening()).toBe(true);
    expect(service.error()).toBeNull();
  });

  it('streams what the recognizer heard into the transcript', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'native_speech_status') return readyStatus();
      return undefined;
    });
    service = TestBed.inject(SpeechService);
    await service.start('owner');

    emitFromBridge({ kind: 'final', text: 'buy milk' });
    expect(service.transcript()).toBe('buy milk');

    emitFromBridge({ kind: 'hypothesis', text: 'two litres' });
    expect(service.transcript()).toBe('buy milk two litres');
  });

  it('reports what the operating system says its recognizer is doing', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'native_speech_status') return readyStatus();
      return undefined;
    });
    service = TestBed.inject(SpeechService);
    await service.start('owner');

    emitFromBridge({ kind: 'state', state: 'capturing' });
    expect(service.engineState()).toBe('capturing');

    emitFromBridge({ kind: 'state', state: 'speechDetected' });
    expect(service.engineState()).toBe('speechDetected');
    // A recognizer that is hearing a voice is not a microphone problem, so the
    // listening state is untouched.
    expect(service.listening()).toBe(true);
  });

  it('blames the speech model, not the microphone, when Windows heard speech', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockImplementation(async (command: string) => {
        if (command === 'native_speech_status') return readyStatus();
        return undefined;
      });
      service = TestBed.inject(SpeechService);
      await service.start('owner');

      // The engine says it heard a voice, and then produces nothing at all.
      emitFromBridge({ kind: 'state', state: 'speechDetected' });
      await vi.advanceTimersByTimeAsync(8_000);

      // Windows cannot transcribe here, so the engine changes — and the change
      // happens inside the same press, not by asking for another one.
      expect(service.engine()).toBe('browser');
      expect(
        speechLog.entries().some(entry => entry.message.includes('continuing on the browser engine'))
      ).toBe(true);
      expect(service.error()).not.toContain('Speak a little closer');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays on the browser engine for the next session, without another failed attempt', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'native_speech_status') return readyStatus();
      return undefined;
    });
    service = TestBed.inject(SpeechService);
    await service.start('owner');

    // Windows: heard you, produced nothing (the bridge's own sentence).
    emitFromBridge({
      kind: 'error',
      message: 'Windows is hearing you — its recognizer detected speech — but it produced no words.',
    });

    const started = service.start('owner');
    expect(service.engine()).toBe('browser');
    await started;

    // The second press never asks Windows to listen again.
    expect(
      invoke.mock.calls
        .map(call => call[0])
        .filter(name => name === 'native_speech_start')
    ).toHaveLength(1);
  });

  it('says the engine is receiving audio but no voice, instead of blaming the model', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockImplementation(async (command: string) => {
        if (command === 'native_speech_status') return readyStatus();
        return undefined;
      });
      service = TestBed.inject(SpeechService);
      await service.start('owner');

      // Sound reached the recognizer, but no voice was found in it — which is a
      // device question, not a speech-model one.
      emitFromBridge({ kind: 'state', state: 'soundStarted' });
      await vi.advanceTimersByTimeAsync(8_000);

      expect(service.error()).toContain('no voice was recognised');
      expect(service.engine()).toBe('windows');
    } finally {
      vi.useRealTimers();
    }
  });

  it('walks the field log as reported: four voices heard, no words, engine changed', async () => {
    // The timeline from the machine this was reported from, unchanged: the
    // recognizer announced sound and a voice four times over ten seconds and
    // never produced a hypothesis or a phrase. This is the sequence the app has
    // to turn into "the microphone is fine, Windows cannot transcribe here".
    vi.useFakeTimers();
    try {
      invoke.mockImplementation(async (command: string) => {
        if (command === 'native_speech_status') return readyStatus();
        return undefined;
      });
      service = TestBed.inject(SpeechService);
      await service.start('owner');

      for (const gap of [1_800, 2_100, 3_700, 2_700]) {
        await vi.advanceTimersByTimeAsync(gap);
        emitFromBridge({ kind: 'state', state: 'soundStarted' });
        emitFromBridge({ kind: 'state', state: 'speechDetected' });
        emitFromBridge({ kind: 'state', state: 'soundEnded' });
      }
      expect(service.transcript()).toBe('');
      expect(service.engine()).toBe('windows');

      // Six seconds after the first voice was recognised the bridge gives up and
      // says why; the app takes the only route left on this machine.
      await vi.advanceTimersByTimeAsync(6_000);
      emitFromBridge({
        kind: 'error',
        message:
          'Windows is hearing you — its recognizer detected speech — but it produced no words.',
      });
      emitFromBridge({ kind: 'stopped' });

      expect(service.engine()).toBe('browser');
      expect(service.error()).toContain('browser');
      expect(service.listening()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('records what the browser engine reported when it refuses its own service', async () => {
    // A session that dies in two seconds with no text and no trace is what an
    // uninstrumented web engine looks like — which is exactly what one field
    // test run produced. The engine's own words are the evidence.
    chooseEngine('browser', 'test');
    installFakeMicrophone();
    invoke.mockImplementation(async (command: string) => {
      if (command === 'native_speech_status') return readyStatus();
      return undefined;
    });
    service = TestBed.inject(SpeechService);

    await service.start('owner');
    expect(service.engine()).toBe('browser');
    expect(service.listening()).toBe(true);

    lastWebRecognition?.onerror({ error: 'service-not-allowed' });

    const lines = speechLog.entries().map(entry => `${entry.scope}: ${entry.message}`);
    expect(lines.some(line => line.includes('web') && line.includes('service-not-allowed'))).toBe(
      true
    );
    // Not the microphone's fault, and not something the app can fix: the answer
    // names what still works on this machine.
    expect(service.error()).toContain('Win + H');
    expect(service.error()).not.toContain('microphone is blocked');
    service.stop();
  });

  it('falls back to the desktop engine when Windows says it is available', async () => {
    // The machine this was written for: WinRT hears you and transcribes nothing,
    // while the older desktop recogniser is installed and works offline.
    invoke.mockImplementation(async (command: string) => {
      if (command === 'native_speech_status') return readyStatus();
      if (command === 'sapi_speech_status') {
        return {
          available: true,
          engine: 'Windows desktop speech recognition (offline)',
          reason: null,
          remedyLabel: null,
          remedyCommand: null,
          languages: ['en-GB', 'en-US'],
          offlineModels: true,
        };
      }
      return undefined;
    });
    service = TestBed.inject(SpeechService);
    // The engine checks are asynchronous; the app makes them on startup.
    await service.refreshStatus(true);
    expect(service.desktopStatus()?.available).toBe(true);

    await service.start('owner');
    expect(service.engine()).toBe('windows');

    emitFromBridge({
      kind: 'error',
      message: 'Windows is hearing you — its recognizer detected speech — but it produced no words.',
    });

    // Offline and on this machine beats online and elsewhere.
    expect(service.engine()).toBe('desktop');
    expect(service.error()).toContain('desktop');
  });

  it('still points at the input device when nothing was heard at all', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockImplementation(async (command: string) => {
        if (command === 'native_speech_status') return readyStatus();
        return undefined;
      });
      service = TestBed.inject(SpeechService);
      await service.start('owner');

      await vi.advanceTimersByTimeAsync(8_000);

      expect(service.error()).toContain('Nothing heard yet');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SpeechService (browser)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    invoke = vi.fn();
    removeFakeShell();
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('explains that a browser without a speech engine cannot listen', async () => {
    const service = TestBed.inject(SpeechService);

    await service.start('owner');

    expect(service.listening()).toBe(false);
    expect(service.supported()).toBe(false);
    expect(service.error()).toContain('no speech engine');
    expect(invoke).not.toHaveBeenCalled();
  });
});
