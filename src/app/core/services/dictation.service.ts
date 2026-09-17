import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import {
  DEFAULT_CORRECTIONS,
  DICTATION_LANGUAGES,
  DictationCorrection,
  DictationPrefs,
  defaultDictationLanguage,
  polishTranscript,
} from './dictation.util';

export {
  DEFAULT_CORRECTIONS,
  DICTATION_LANGUAGES,
  defaultDictationLanguage,
  polishTranscript,
} from './dictation.util';
export type { DictationCorrection, DictationLanguage, DictationPrefs } from './dictation.util';

// ── Minimal typings for the Web Speech API (not in lib.dom) ─────────────────
interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}
interface RecognitionResultList {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
}
interface RecognitionEvent {
  resultIndex: number;
  results: RecognitionResultList;
}
interface RecognitionErrorEvent {
  error: string;
  message?: string;
}
interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionInstance;

const PREFS_KEY = 'dictation_prefs';

function resolveCtor(): RecognitionCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const scope = globalThis as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Dictation for the journal.
 *
 * Listening is delegated to the runtime's own speech engine (the Web Speech
 * API): the OS/browser captures the audio, so this app never records or uploads
 * anything itself and no third-party service is wired in. Availability depends
 * on the runtime — where the API is missing (some desktop webviews) the UI says
 * so instead of failing silently, and the journal keeps working with the
 * operating system's own dictation shortcut.
 *
 * On top of the raw transcript the service applies what actually makes
 * recognition usable for a specific speaker: a language variant (English
 * variants by default), a personal vocabulary of corrections, spoken
 * punctuation, filler removal and sentence capitalisation.
 */
@Injectable({ providedIn: 'root' })
export class DictationService {
  private readonly db = inject(DbService);

  private recognition: RecognitionInstance | null = null;
  private sessionWanted = false;
  private chunkId = 0;
  private loaded = false;

  readonly languages = DICTATION_LANGUAGES;

  /** True when this runtime can capture speech. */
  readonly supported = signal(resolveCtor() !== null);
  readonly listening = signal(false);
  readonly interim = signal('');
  readonly error = signal<string | null>(null);
  readonly language = signal<string>(defaultDictationLanguage(globalThis.navigator?.language));
  readonly corrections = signal<DictationCorrection[]>([...DEFAULT_CORRECTIONS]);

  /**
   * Every finished phrase, tagged with an id so two identical phrases are still
   * delivered twice.
   */
  readonly finalChunk = signal<{ id: number; text: string } | null>(null);

  /** Running inside the packaged desktop app. */
  readonly isDesktopApp =
    typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const prefs = await this.db.getAppState<DictationPrefs | null>(PREFS_KEY, null);
    if (prefs) {
      if (prefs.language) this.language.set(prefs.language);
      if (Array.isArray(prefs.corrections)) this.corrections.set(prefs.corrections);
    }
    this.supported.set(resolveCtor() !== null);
  }

  private async persist(): Promise<void> {
    await this.db.setAppState(PREFS_KEY, {
      language: this.language(),
      corrections: this.corrections(),
    } satisfies DictationPrefs);
  }

  setLanguage(code: string): void {
    this.language.set(code);
    void this.persist();
    // Restart so the new locale takes effect immediately.
    if (this.listening()) this.restart();
  }

  setCorrections(corrections: DictationCorrection[]): void {
    this.corrections.set(corrections);
    void this.persist();
  }

  toggle(): void {
    if (this.listening()) {
      this.stop();
    } else {
      this.start();
    }
  }

  start(): void {
    const Ctor = resolveCtor();
    if (!Ctor) {
      this.supported.set(false);
      this.error.set(
        'Speech recognition is not available in this runtime. Use your operating system dictation shortcut instead (Win + H on Windows, Fn Fn on macOS, or your desktop’s dictation key).'
      );
      return;
    }

    this.supported.set(true);
    this.error.set(null);
    this.interim.set('');
    this.sessionWanted = true;
    this.spawn(Ctor);
  }

  stop(): void {
    this.sessionWanted = false;
    this.listening.set(false);
    this.interim.set('');
    try {
      this.recognition?.stop();
    } catch {
      /* already stopped */
    }
    this.recognition = null;
  }

  private restart(): void {
    const Ctor = resolveCtor();
    this.sessionWanted = false;
    try {
      this.recognition?.abort();
    } catch {
      /* ignore */
    }
    this.recognition = null;
    if (Ctor) {
      this.sessionWanted = true;
      this.spawn(Ctor);
    }
  }

  private spawn(Ctor: RecognitionCtor): void {
    const recognition = new Ctor();
    this.recognition = recognition;

    recognition.lang = this.language();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.listening.set(true);
      this.error.set(null);
    };

    recognition.onresult = (event: RecognitionEvent) => {
      let interim = '';
      let finished = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finished += transcript;
        } else {
          interim += transcript;
        }
      }

      this.interim.set(interim.trim());

      const polished = this.polish(finished);
      if (polished) {
        this.chunkId += 1;
        this.finalChunk.set({ id: this.chunkId, text: polished });
      }
    };

    recognition.onerror = (event: RecognitionErrorEvent) => {
      switch (event.error) {
        case 'no-speech':
        case 'aborted':
          return;
        case 'not-allowed':
        case 'service-not-allowed':
          this.error.set('Microphone access was blocked. Allow the microphone for DeepWork and try again.');
          this.sessionWanted = false;
          break;
        case 'audio-capture':
          this.error.set('No microphone was found. Connect one and try again.');
          this.sessionWanted = false;
          break;
        case 'network':
          this.error.set('The speech service could not be reached. This runtime needs a connection for dictation.');
          this.sessionWanted = false;
          break;
        default:
          this.error.set(`Dictation stopped: ${event.error}.`);
      }
      this.listening.set(false);
    };

    recognition.onend = () => {
      this.listening.set(false);
      this.interim.set('');
      // Runtimes end the session after a pause — keep listening while the user
      // still has dictation switched on.
      if (this.sessionWanted) {
        setTimeout(() => {
          if (!this.sessionWanted) return;
          try {
            recognition.start();
          } catch {
            this.sessionWanted = false;
          }
        }, 250);
      }
    };

    try {
      recognition.start();
      this.listening.set(true);
    } catch {
      this.error.set('Dictation could not be started. Try again in a moment.');
      this.listening.set(false);
      this.sessionWanted = false;
    }
  }

  /** Apply the personal vocabulary, spoken punctuation and light formatting. */
  polish(raw: string): string {
    return polishTranscript(raw, this.corrections());
  }
}
