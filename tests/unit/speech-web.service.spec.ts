import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SpeechService } from '../../src/app/core/services/speech.service';
import { NotificationService } from '../../src/app/core/services/notification.service';

/**
 * The browser-only voice typing service.
 *
 * These tests are deliberately about the browser build: the packaged app must
 * not grow a microphone, and the browser path must explain a refused permission
 * instead of listening into an open field that never receives a word.
 */

type Handler = ((event: any) => void) | null;

class FakeRecognition {
  static instances: FakeRecognition[] = [];

  static get last(): FakeRecognition | null {
    return this.instances[this.instances.length - 1] ?? null;
  }

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: Handler = null;
  onerror: Handler = null;
  onend: (() => void) | null = null;

  readonly start = vi.fn(() => this.onstart?.());
  readonly stop = vi.fn();
  readonly abort = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }
}

let getUserMedia: ReturnType<typeof vi.fn>;
let notifications: { showToastMessage: ReturnType<typeof vi.fn> };

function installSpeechApi(): void {
  Object.defineProperty(globalThis, 'SpeechRecognition', {
    configurable: true,
    writable: true,
    value: FakeRecognition,
  });
}

function removeSpeechApi(): void {
  delete (globalThis as unknown as Record<string, unknown>)['SpeechRecognition'];
  delete (globalThis as unknown as Record<string, unknown>)['webkitSpeechRecognition'];
}

function installMedia(): void {
  getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockRejectedValue(new Error('permission query unsupported')) },
  });
}

function results(items: Array<{ text: string; final: boolean }>): any {
  const list: Record<number, unknown> = {};
  items.forEach((item, index) => {
    list[index] = {
      0: { transcript: item.text, confidence: 1 },
      isFinal: item.final,
      length: 1,
    };
  });
  return { length: items.length, ...list };
}

function speechEvent(items: Array<{ text: string; final: boolean }>, resultIndex = 0): any {
  return { resultIndex, results: results(items) };
}

function makeService(): SpeechService {
  TestBed.configureTestingModule({
    providers: [SpeechService, { provide: NotificationService, useValue: notifications }],
  });
  return TestBed.inject(SpeechService);
}

describe('SpeechService (browser)', () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    notifications = { showToastMessage: vi.fn() };
    installSpeechApi();
    installMedia();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    removeSpeechApi();
    delete (globalThis as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  });

  it('is not offered inside the packaged desktop app', async () => {
    (globalThis as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
    const service = makeService();

    expect(service.isBrowser).toBe(false);
    expect(service.available).toBe(false);

    await service.start('task-title');

    expect(service.error()?.code).toBe('unsupported');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('explains a browser without a speech engine instead of opening a field', async () => {
    removeSpeechApi();
    const service = makeService();

    expect(service.available).toBe(false);
    await service.start('task-title');

    expect(service.error()?.code).toBe('unsupported');
    expect(service.error()?.message).toContain('browser');
    expect(notifications.showToastMessage).toHaveBeenCalledOnce();
  });

  it('asks for the microphone, then starts the recognizer', async () => {
    const service = makeService();

    await service.start('task-title');

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeRecognition.last?.start).toHaveBeenCalledOnce();
    expect(FakeRecognition.last?.continuous).toBe(true);
    expect(FakeRecognition.last?.interimResults).toBe(true);
    expect(service.listening()).toBe(true);
    expect(service.owner()).toBe('task-title');
  });

  it('turns a final result into one chunk its field can insert', async () => {
    const service = makeService();
    await service.start('task-description');

    FakeRecognition.last?.onresult?.(speechEvent([{ text: 'buy some milk', final: true }]));

    expect(service.transcript()).toBe('buy some milk');
    expect(service.finalChunk()).toMatchObject({
      text: 'buy some milk',
      owner: 'task-description',
    });
  });

  it('keeps the words still being heard apart from the finished ones', async () => {
    const service = makeService();
    await service.start('task-title');

    FakeRecognition.last?.onresult?.(
      speechEvent([
        { text: 'buy milk', final: true },
        { text: 'two litres', final: false },
      ]),
    );

    expect(service.transcript()).toBe('buy milk');
    expect(service.interim()).toBe('two litres');
    expect(service.finalChunk()?.text).toBe('buy milk');
  });

  it('turns a declined microphone into the site-settings message', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const service = makeService();

    await service.start('task-title');

    expect(service.error()?.code).toBe('permission-denied');
    expect(service.error()?.message).toContain('declined the permission by mistake');
    expect(service.permission()).toBe('denied');
    expect(service.listening()).toBe(false);
    expect(service.owner()).toBeNull();
    expect(FakeRecognition.instances).toHaveLength(0);
    expect(notifications.showToastMessage).toHaveBeenCalledWith(
      expect.stringContaining('Microphone'),
      expect.stringContaining('Allow'),
      'work',
      null,
      expect.any(Array),
    );
  });

  it('reports a browser speech error with the engine’s own words', async () => {
    const service = makeService();
    await service.start('task-title');

    FakeRecognition.last?.onerror?.({ error: 'no-speech', message: '' });

    expect(service.error()?.code).toBe('no-speech');
    expect(service.error()?.message).toContain('no words');
    expect(service.listening()).toBe(false);
    expect(notifications.showToastMessage).toHaveBeenCalledOnce();
  });

  it('does not report the abort that stopping or replacing a session causes', async () => {
    const service = makeService();
    await service.start('task-title');

    FakeRecognition.last?.onerror?.({ error: 'aborted', message: '' });

    expect(service.error()).toBeNull();
    expect(notifications.showToastMessage).not.toHaveBeenCalled();
  });

  it('restarts itself when the browser ends a continuous session without an error', async () => {
    const service = makeService();
    await service.start('task-title');
    expect(FakeRecognition.instances).toHaveLength(1);

    vi.useFakeTimers();
    try {
      FakeRecognition.last?.onend?.();
      await vi.advanceTimersByTimeAsync(300);
      expect(FakeRecognition.instances).toHaveLength(2);
      expect(service.listening()).toBe(true);
    } finally {
      vi.useRealTimers();
      service.stop();
    }
  });

  it('stops the session and leaves the microphone free', async () => {
    const service = makeService();
    await service.start('task-title');

    service.stop();

    expect(FakeRecognition.last?.abort).toHaveBeenCalled();
    expect(service.listening()).toBe(false);
    expect(service.owner()).toBeNull();
    expect(service.interim()).toBe('');
  });

  it('stops only the field that owns the microphone', async () => {
    const service = makeService();
    await service.start('quick-add-title');

    service.stopOwner('task-title');
    expect(service.owner()).toBe('quick-add-title');

    service.stopOwner('quick-add-title');
    expect(service.owner()).toBeNull();
  });
});
