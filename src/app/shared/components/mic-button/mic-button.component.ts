import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { SpeechService } from '../../../core/services/speech.service';

/**
 * The microphone that sits inside whatever field is being written.
 *
 * It is intentionally a small button rather than a full dictation panel: the
 * text appears in the field the user was already looking at, and the button is
 * the whole interface around it. The component owns no transcript of its own —
 * the service streams final phrases and this component forwards each one, once,
 * through {@link dictation}. The field decides where a phrase belongs.
 *
 * The button does not exist outside a real browser. `speech.available` is false
 * in the packaged desktop app, so the native build never grows an input it
 * cannot honour.
 */
@Component({
  selector: 'app-mic-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (speech.available) {
      <button
        type="button"
        class="mic"
        [class.listening]="active()"
        [class.starting]="starting()"
        [class.blocked]="blocked()"
        [class.has-label]="label()"
        [attr.aria-pressed]="active()"
        [attr.aria-label]="buttonLabel()"
        [title]="buttonLabel()"
        (mousedown)="keepFocus($event)"
        (click)="toggle()"
      >
        <span class="mic-icon" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
          @if (active()) {
            <span class="mic-pulse"></span>
          }
        </span>
        @if (label()) {
          <span class="mic-label">{{
            listeningNow() ? 'Stop listening' : starting() ? 'Waiting for permission…' : label()
          }}</span>
        }
      </button>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .mic {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 1px solid rgba(139, 92, 246, 0.28);
        border-radius: 9px;
        background: rgba(139, 92, 246, 0.1);
        color: var(--color-text-secondary, #d4d4d8);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease,
          box-shadow 0.18s ease;
      }
      .mic.has-label {
        width: auto;
        padding: 0 12px;
      }
      .mic:hover {
        background: rgba(139, 92, 246, 0.2);
        border-color: rgba(139, 92, 246, 0.55);
        color: var(--color-text-primary, #fff);
      }
      .mic:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.8);
        outline-offset: 2px;
      }
      .mic.listening {
        background: rgba(139, 92, 246, 0.3);
        border-color: rgba(167, 139, 250, 0.85);
        color: #fff;
        box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.14);
        animation: mic-breathe 1.6s ease-in-out infinite;
      }
      .mic.starting {
        opacity: 0.8;
        cursor: progress;
      }
      .mic.blocked {
        border-color: rgba(248, 113, 113, 0.55);
        background: rgba(248, 113, 113, 0.12);
        color: #fca5a5;
      }

      .mic-icon {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      /* A second ring, painted behind the icon, is what makes "listening" read
         at a glance without changing the icon the user pressed. */
      .mic-pulse {
        position: absolute;
        inset: -7px;
        border: 1px solid rgba(167, 139, 250, 0.65);
        border-radius: 50%;
        animation: mic-ring 1.6s ease-out infinite;
        pointer-events: none;
      }

      .mic-label {
        white-space: nowrap;
      }

      @keyframes mic-breathe {
        0%,
        100% {
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.1);
        }
        50% {
          box-shadow: 0 0 0 7px rgba(139, 92, 246, 0.2);
        }
      }
      @keyframes mic-ring {
        0% {
          opacity: 0.7;
          transform: scale(0.75);
        }
        70%,
        100% {
          opacity: 0;
          transform: scale(1.35);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .mic.listening,
        .mic-pulse {
          animation: none;
        }
      }
    `,
  ],
})
export class MicButtonComponent {
  readonly speech = inject(SpeechService);

  /** The field this microphone belongs to, e.g. "task-title". */
  readonly owner = input.required<string>();

  /** Optional visible caption. With no caption the button is the mic alone. */
  readonly label = input('');

  /** Emits every finished phrase while this component's owner is listening. */
  readonly dictation = output<string>();

  private lastChunkId = 0;

  readonly active = computed(
    () =>
      this.speech.owner() === this.owner() && (this.speech.listening() || this.speech.starting()),
  );

  readonly starting = computed(
    () => this.speech.owner() === this.owner() && this.speech.starting(),
  );

  readonly listeningNow = computed(
    () => this.speech.owner() === this.owner() && this.speech.listening(),
  );

  readonly blocked = computed(() => this.speech.permission() === 'denied');

  readonly buttonLabel = computed(() => {
    if (this.starting()) return 'Waiting for microphone permission';
    if (this.active()) return 'Stop voice typing';
    if (this.blocked()) return 'Voice typing is blocked — open microphone permission';
    return this.label() ? `Start voice typing: ${this.label()}` : 'Start voice typing';
  });

  constructor() {
    effect(() => {
      const chunk = this.speech.finalChunk();
      if (!chunk || chunk.id === this.lastChunkId) return;
      this.lastChunkId = chunk.id;
      if (chunk.owner !== this.owner()) return;
      this.dictation.emit(chunk.text);
    });
  }

  /**
   * Keeps the caret where the user left it.
   *
   * A normal mouse press would move focus to the button, and in a textarea that
   * loses the selection the next phrase is meant to replace. `preventDefault`
   * on `mousedown` leaves focus and the caret in the field; the `click` still
   * arrives, so the microphone still starts.
   */
  keepFocus(event: MouseEvent): void {
    event.preventDefault();
  }

  toggle(): void {
    void this.speech.toggle(this.owner());
  }
}
