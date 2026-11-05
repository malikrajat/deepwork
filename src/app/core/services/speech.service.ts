import { Injectable, inject, signal } from '@angular/core';
import { NotificationService, type ToastAction } from './notification.service';
import { normalizeDictation } from '../utils/dictation.util';

/**
 * Browser-only voice typing.
 *
 * The feature is deliberately absent from the packaged desktop app. The desktop
 * build is a Tauri webview, and every native code path that used to exist for
 * speech has been removed from the repository; what is left here is the Web
 * Speech API a real browser exposes. {@link available} is therefore the gate the
 * UI reads, and it is false in Tauri even when the webview happens to expose the
 * API, so a native user never sees a microphone they cannot use.
 *
 * The service owns the session, not the field. It raises small final chunks —
 * one per phrase the recognizer finished — and whoever has a microphone on
 * screen decides where that phrase belongs. The chunk carries an id because
 * Angular effects may run more than once for the same signal value; a consumer
 * that remembers the last id inserts each phrase exactly once.
 *
 * Permission is asked for explicitly with `getUserMedia` before the recognizer
 * starts. That is what lets a refusal become a real message instead of a silent
 * wait: the browser reports `NotAllowedError`, the service keeps the permission
 * state, shows a card that names the site-settings fix, and leaves the mic
 * button in place for when the user comes back. Once a browser has a denial, it
 * will not ask again, so "press the mic again" is only useful after the setting
 * has been changed — the card says that too.
 */

export type SpeechPermission = 'unknown' | 'granted' | 'denied' | 'unsupported';

export type SpeechFailureCode =
  | 'unsupported'
  | 'permission-denied'
  | 'no-microphone'
  | 'microphone-busy'
  | 'no-speech'
  | 'network'
  | 'language-not-supported'
  | 'service-not-allowed'
  | 'unknown';

/** One thing that stopped voice typing, with the words the user should read. */
export interface SpeechFailure {
  code: SpeechFailureCode;
  title: string;
  message: string;
  /** True when the browser's site settings are the way back. */
  permissionBlocked?: boolean;
}

/** A finished phrase from the recognizer, numbered so consumers apply it once. */
export interface SpeechChunk {
  id: number;
  text: string;
  /** The field that was listening when the phrase arrived. */
  owner: string;
}

/** Options for one dictation session. */
export interface SpeechStartOptions {
  /** BCP-47 language tag. Defaults to the browser's own language. */
  lang?: string;
}

/** True when the page is inside the packaged Tauri app. */
function inTauri(): boolean {
  return typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;
}

/* ── The very small shape of the Web Speech API we need ─────────────────────
 *
 * TypeScript's DOM library ships the result and error event types but not the
 * `SpeechRecognition` constructor itself, because it is still a vendor-prefixed
 * API in most browsers. These are the members the service actually touches —
 * enough to compile without pretending the standard is finished.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** How long the browser is given to wind a session down after `stop()`. */
const RESTART_DELAY_MS = 300;

/**
 * A limit on the automatic restarts.
 *
 * Chrome ends a continuous session when it hears nothing for a while. Starting
 * it again is what makes dictation feel continuous, but a broken engine that
 * ends immediately must not become an infinite loop.
 */
const MAX_RESTARTS = 20;

/** The vendor-prefixed constructor, read each time so tests can install one. */
function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof globalThis === 'undefined') return null;
  const scope = globalThis as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function unsupportedFailure(): SpeechFailure {
  return {
    code: 'unsupported',
    title: 'Voice typing is not available here',
    message:
      'This browser does not provide a speech engine, so the microphone cannot turn words into text. Chrome, Edge and Safari do; Firefox and some private browsing modes do not. Typing works as always.',
  };
}

function permissionDeniedFailure(): SpeechFailure {
  return {
    code: 'permission-denied',
    title: 'Microphone permission is blocked',
    message:
      'Microphone access is blocked, so voice typing will not work. If you declined the permission by mistake, open this site’s permissions (the padlock or site controls beside the address), set Microphone to Allow, then press the mic again. The browser will not ask a second time by itself.',
    permissionBlocked: true,
  };
}

function noMicrophoneFailure(): SpeechFailure {
  return {
    code: 'no-microphone',
    title: 'No microphone found',
    message:
      'The browser could not open a microphone. Plug one in, choose an input device in your system settings, then press the mic again.',
  };
}

function microphoneBusyFailure(): SpeechFailure {
  return {
    code: 'microphone-busy',
    title: 'The microphone is busy',
    message:
      'Another app or tab is using the microphone. Close it, or choose a different input device, then press the mic again.',
  };
}

function noSpeechFailure(): SpeechFailure {
  return {
    code: 'no-speech',
    title: 'Nothing was heard',
    message:
      'The microphone opened, but no words were recognised. Check that the right microphone is selected, then press the mic and speak a little closer.',
  };
}

function networkFailure(): SpeechFailure {
  return {
    code: 'network',
    title: 'The speech service could not be reached',
    message:
      'Your browser’s speech recognition service needs a connection on this browser. Check your connection, or keep typing — what you already wrote is safe.',
  };
}

function languageFailure(): SpeechFailure {
  return {
    code: 'language-not-supported',
    title: 'This language is not supported',
    message:
      'The browser could not recognise the language it was asked to use. Change the browser’s language or type instead.',
  };
}

function serviceNotAllowedFailure(): SpeechFailure {
  return {
    code: 'service-not-allowed',
    title: 'Voice typing was refused',
    message:
      'The browser’s speech service refused this session. Check that this site is allowed to use the microphone, then press the mic again. If it still refuses, Chrome or Edge may have the service available where this browser does not.',
    permissionBlocked: true,
  };
}

function unknownFailure(detail: string): SpeechFailure {
  const detailText = (detail ?? '').trim();
  const suffix = detailText ? ` The browser said: ${detailText}` : '';
  return {
    code: 'unknown',
    title: 'Voice typing stopped',
    message: `The recognizer ended before it could finish. Press the mic to try again.${suffix}`,
  };
}

/** Maps a `SpeechRecognitionErrorEvent.error` into something readable. */
function engineFailure(code: string, detail: string, permission: SpeechPermission): SpeechFailure {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return permissionDeniedFailure();
    case 'service-not-allowed':
      return permission === 'denied' ? permissionDeniedFailure() : serviceNotAllowedFailure();
    case 'no-speech':
      return noSpeechFailure();
    case 'audio-capture':
      return noMicrophoneFailure();
    case 'network':
      return networkFailure();
    case 'language-not-supported':
      return languageFailure();
    default:
      return unknownFailure(detail || code);
  }
}

/** Maps a `getUserMedia`/`start()` DOMException into the same vocabulary. */
function microphoneFailure(error: unknown): SpeechFailure {
  const name = (error as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return permissionDeniedFailure();
    case 'SecurityError':
      return {
        ...permissionDeniedFailure(),
        message:
          'The browser blocked the microphone on this page. Voice typing needs microphone permission and a secure page (HTTPS or localhost). Allow the microphone in this site’s settings, then press the mic again.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return noMicrophoneFailure();
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return microphoneBusyFailure();
    case 'NotSupportedError':
      return unsupportedFailure();
    default:
      return unknownFailure((error as { message?: string } | null)?.message ?? '');
  }
}

@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly notifications = inject(NotificationService);

  /** True in a real browser tab; false inside the Tauri desktop app. */
  get isBrowser(): boolean {
    return !inTauri();
  }

  /**
   * Whether the mic should exist at all.
   *
   * A getter rather than a field so a test can install a fake recognizer after
   * the module has loaded — and so the Tauri answer is read from the environment
   * at the moment it is asked, not frozen at import time.
   */
  get available(): boolean {
    return this.isBrowser && recognitionConstructor() !== null;
  }

  readonly listening = signal(false);
  readonly starting = signal(false);
  readonly permission = signal<SpeechPermission>('unknown');
  readonly owner = signal<string | null>(null);
  readonly interim = signal('');
  readonly transcript = signal('');
  readonly finalChunk = signal<SpeechChunk | null>(null);
  readonly error = signal<SpeechFailure | null>(null);

  private recognition: SpeechRecognitionLike | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartCount = 0;
  private shouldListen = false;
  private activeLanguage = 'en-US';
  private chunkCounter = 0;
  private epoch = 0;

  constructor() {
    if (!this.isBrowser) {
      this.permission.set('unsupported');
      return;
    }
    void this.readPermission();
  }

  /**
   * Starts a dictation session for one owner, or stops the one already running.
   *
   * `owner` is the field's own name ("task-title", "journal-entry"). Only one
   * session can be open at a time: pressing a second microphone ends the first,
   * because two recognizers competing for one device is not a feature.
   */
  async start(owner: string, options: SpeechStartOptions = {}): Promise<void> {
    const resolvedOwner = owner.trim() || 'voice-typing';
    const epoch = ++this.epoch;

    this.clearRestart();
    this.abortRecognition();
    this.resetSession(resolvedOwner);

    if (!this.isBrowser) {
      this.report(unsupportedFailure(), resolvedOwner);
      return;
    }
    if (!this.available) {
      this.report(unsupportedFailure(), resolvedOwner);
      return;
    }

    const permissionFailure = await this.ensureMicrophonePermission();
    // A second press, or a close, may have replaced this request while the
    // permission prompt was open. The newest request owns the microphone.
    if (epoch !== this.epoch) return;
    if (permissionFailure) {
      this.report(permissionFailure, resolvedOwner);
      return;
    }

    this.activeLanguage = options.lang?.trim() || this.preferredLanguage();
    this.beginRecognition(resolvedOwner, this.activeLanguage, epoch);
  }

  /** Presses the same microphone: start when idle, stop when this owner is live. */
  async toggle(owner: string, options: SpeechStartOptions = {}): Promise<void> {
    if (this.owner() === owner && (this.listening() || this.starting())) {
      this.stop();
      return;
    }
    await this.start(owner, options);
  }

  /** Ends the current session and forgets everything about it but the words. */
  stop(): void {
    this.shouldListen = false;
    this.epoch++;
    this.clearRestart();
    this.abortRecognition();
    this.finishSession();
  }

  /** Stops only when the given field owns the microphone. */
  stopOwner(owner: string): void {
    if (this.owner() === owner) this.stop();
  }

  /** Clears a message the user has already read. */
  clearError(): void {
    this.error.set(null);
  }

  /** Asks the browser for its microphone permission state without prompting. */
  async refreshPermission(): Promise<SpeechPermission> {
    return this.readPermission();
  }

  private resetSession(owner: string): void {
    this.owner.set(owner);
    this.listening.set(false);
    this.starting.set(true);
    this.interim.set('');
    this.transcript.set('');
    this.finalChunk.set(null);
    this.error.set(null);
    this.restartCount = 0;
    this.shouldListen = false;
  }

  private beginRecognition(owner: string, language: string, epoch: number): void {
    if (epoch !== this.epoch) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      this.report(unsupportedFailure(), owner);
      return;
    }

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Constructor();
    } catch {
      this.report(unsupportedFailure(), owner);
      return;
    }

    this.recognition = recognition;
    this.shouldListen = true;
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (epoch !== this.epoch) return;
      this.starting.set(false);
      this.listening.set(true);
    };
    recognition.onresult = (event) => {
      if (epoch !== this.epoch) return;
      this.handleResult(event, owner);
    };
    recognition.onerror = (event) => {
      if (epoch !== this.epoch) return;
      this.handleError(event, owner);
    };
    recognition.onend = () => {
      if (epoch !== this.epoch) return;
      this.handleEnd(owner, epoch);
    };

    try {
      recognition.start();
      this.starting.set(false);
      this.listening.set(true);
    } catch (error) {
      this.recognition = null;
      this.shouldListen = false;
      try {
        recognition.abort();
      } catch {
        /* already gone */
      }
      this.report(microphoneFailure(error), owner);
    }
  }

  private handleResult(event: SpeechRecognitionEventLike, owner: string): void {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      if (!result) continue;
      const text = result[0]?.transcript ?? '';

      if (result.isFinal) {
        const phrase = normalizeDictation(text);
        if (!phrase) continue;
        this.transcript.update((current) => (current ? `${current} ${phrase}` : phrase));
        this.finalChunk.set({ id: ++this.chunkCounter, text: phrase, owner });
      } else {
        interim += ` ${text}`;
      }
    }
    this.interim.set(normalizeDictation(interim));
  }

  private handleError(event: SpeechRecognitionErrorEventLike, owner: string): void {
    this.shouldListen = false;
    this.clearRestart();

    // An abort is how the app itself ends a session — either a press on Stop or
    // a new microphone taking over. It is not a failure to report.
    if (event.error === 'aborted') {
      this.finishSession();
      return;
    }

    const failure = engineFailure(event.error, event.message, this.permission());
    if (failure.code === 'permission-denied') this.permission.set('denied');

    const recognition = this.recognition;
    this.recognition = null;
    try {
      recognition?.abort();
    } catch {
      /* already gone */
    }
    this.report(failure, owner);
  }

  private handleEnd(owner: string, epoch: number): void {
    if (epoch !== this.epoch) return;

    if (this.shouldListen && !this.error()) {
      if (this.restartCount >= MAX_RESTARTS) {
        this.shouldListen = false;
        this.finishSession();
        return;
      }
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (epoch !== this.epoch || !this.shouldListen) return;
        this.restartCount++;
        this.beginRecognition(owner, this.activeLanguage, epoch);
      }, RESTART_DELAY_MS);
      return;
    }

    this.finishSession();
  }

  private finishSession(): void {
    this.recognition = null;
    this.shouldListen = false;
    this.starting.set(false);
    this.listening.set(false);
    this.interim.set('');
    this.owner.set(null);
  }

  private abortRecognition(): void {
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    try {
      recognition.abort();
    } catch {
      /* already gone */
    }
  }

  private clearRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private preferredLanguage(): string {
    try {
      return globalThis.navigator?.language || 'en-US';
    } catch {
      return 'en-US';
    }
  }

  private async readPermission(): Promise<SpeechPermission> {
    if (!this.isBrowser) {
      this.permission.set('unsupported');
      return 'unsupported';
    }

    const permissions = globalThis.navigator?.permissions;
    if (!permissions?.query) return this.permission();

    try {
      const status = await permissions.query({ name: 'microphone' });
      const state = this.toPermission(status.state);
      this.permission.set(state);
      status.onchange = () => this.permission.set(this.toPermission(status.state));
      return state;
    } catch {
      // Firefox, some embedded browsers and older Safari do not expose the
      // microphone permission here. Asking `getUserMedia` is the fallback.
      return this.permission();
    }
  }

  private toPermission(state: PermissionState): SpeechPermission {
    if (state === 'granted' || state === 'denied') return state;
    return 'unknown';
  }

  private async ensureMicrophonePermission(): Promise<SpeechFailure | null> {
    const permission = await this.readPermission();
    if (permission === 'denied') return permissionDeniedFailure();

    // Already allowed: go straight to the recognizer. This matters in Safari,
    // where `start()` must stay close to the user's press.
    if (permission === 'granted') return null;

    const media = globalThis.navigator?.mediaDevices;
    if (!media?.getUserMedia) {
      // No explicit permission API: let the recognizer ask in its own way. A
      // refusal still arrives as a `not-allowed` error and is reported there.
      return null;
    }

    try {
      const stream = await media.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      this.permission.set('granted');
      return null;
    } catch (error) {
      return microphoneFailure(error);
    }
  }

  private report(failure: SpeechFailure, owner: string): void {
    if (failure.code === 'permission-denied') this.permission.set('denied');
    this.error.set(failure);
    this.starting.set(false);
    this.listening.set(false);
    this.interim.set('');
    this.owner.set(null);
    this.shouldListen = false;
    this.clearRestart();

    this.notifications.showToastMessage(
      failure.title,
      failure.message,
      'work',
      null,
      this.retryActions(failure, owner),
    );
  }

  private retryActions(failure: SpeechFailure, owner: string): ToastAction[] {
    if (failure.code === 'unsupported') return [];
    return [
      {
        label: 'Try again',
        primary: true,
        run: () => this.start(owner),
      },
    ];
  }
}
