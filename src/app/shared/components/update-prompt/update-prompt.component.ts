import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { UpdatePromptService } from '../../../core/services/update-prompt.service';
import { ExternalLinkDirective } from '../../directives/external-link.directive';

/**
 * "There is a newer DeepWork" — the card that offers to install it.
 *
 * The card is the part the user acts on, and it exists on every platform: the
 * system notification that arrives with it can only say that a release exists,
 * because a desktop notification has no button the app can hear. So the
 * notification brings the user to the app, and this is what they press.
 *
 * It stands down entirely in the browser build, where there is nothing to
 * install — there the same button hands the download to the browser.
 */
@Component({
  selector: 'app-update-prompt',
  imports: [ExternalLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (prompt.visible()) {
      <div class="update-prompt" role="status" aria-live="polite">
        <div class="prompt-icon" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 3v12" />
            <polyline points="7,10 12,15 17,10" />
            <path d="M5 20h14" />
          </svg>
        </div>

        <div class="prompt-text">
          <span class="prompt-title">{{ title() }}</span>
          <span class="prompt-detail">{{ detail() }}</span>

          @if (prompt.state() === 'downloading') {
            <span class="prompt-progress" aria-hidden="true">
              <span class="prompt-progress-fill" [style.width.%]="prompt.percent()"></span>
            </span>
          }

          @if (prompt.error(); as failure) {
            <span class="prompt-error">{{ failure }}</span>
          }
        </div>

        <div class="prompt-actions">
          @if (showInstallButton()) {
            <button
              type="button"
              class="prompt-btn primary"
              [disabled]="prompt.busy()"
              (click)="prompt.install()"
            >
              Update
            </button>
          }

          @if (showDownloadLink()) {
            <a
              class="prompt-btn primary"
              appExternalLink
              [href]="downloadUrl()"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </a>
          }

          @if (prompt.state() !== 'started') {
            <button type="button" class="prompt-btn" (click)="prompt.dismiss()">Later</button>
          }

          @if (prompt.state() === 'started') {
            <button type="button" class="prompt-btn" (click)="prompt.dismiss()">Hide</button>
          }

          @if (prompt.error()) {
            <a
              class="prompt-btn"
              appExternalLink
              [href]="prompt.releasesUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Release page
            </a>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        bottom: 24px;
        right: 24px;
        /* Above the timer toast: this one is waiting for an answer. */
        z-index: 10000;
        pointer-events: none;
      }

      .update-prompt {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px 18px;
        max-width: 380px;
        border-radius: 14px;
        pointer-events: all;
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.16) 0%, var(--toast-bg) 100%);
        border: 1px solid rgba(6, 182, 212, 0.32);
        backdrop-filter: blur(20px);
        box-shadow:
          var(--glass-shadow),
          0 0 0 1px var(--glass-border);
        animation: prompt-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      .prompt-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        color: var(--color-accent-secondary);
        background: rgba(6, 182, 212, 0.16);
      }

      .prompt-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex: 1;
        min-width: 0;
      }

      .prompt-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .prompt-detail {
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-secondary);
      }

      .prompt-error {
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-danger);
      }

      .prompt-progress {
        display: block;
        height: 4px;
        margin-top: 4px;
        border-radius: 999px;
        background: var(--clock-track);
        overflow: hidden;
      }

      .prompt-progress-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--color-accent-gradient);
        transition: width 0.2s linear;
      }

      .prompt-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
      }

      .prompt-btn {
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
      }

      .prompt-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      .prompt-btn.primary {
        border-color: rgba(6, 182, 212, 0.42);
        background: rgba(6, 182, 212, 0.16);
        color: var(--color-text-primary);
      }

      .prompt-btn.primary:hover {
        background: rgba(6, 182, 212, 0.26);
      }

      .prompt-btn:disabled {
        opacity: 0.6;
        cursor: default;
      }

      @keyframes prompt-in {
        0% {
          opacity: 0;
          transform: translateY(16px) scale(0.96);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `,
  ],
})
export class UpdatePromptComponent {
  protected readonly prompt = inject(UpdatePromptService);

  /** `DeepWork v2.1.0 is available`. */
  readonly title = computed(() => {
    const version = this.prompt.version();
    return version ? `DeepWork ${version} is available` : 'A DeepWork update is available';
  });

  /** The second line: what the button does, or what is happening. */
  readonly detail = computed(() => {
    switch (this.prompt.state()) {
      case 'downloading':
        return `Downloading the installer… ${this.prompt.percent()}%`;
      case 'installing':
        return 'Starting the installer…';
      case 'started':
        return this.prompt.note() ?? 'The installer is running.';
      case 'error':
        return 'The update could not be installed automatically.';
      default:
        return this.prompt.asset()
          ? 'Download and install it now — nothing on this machine is touched until you press Update.'
          : 'This release has no installer for your system; the release page has every file.';
    }
  });

  /** The installer for this machine, downloaded and started by the app. */
  readonly showInstallButton = computed(
    () =>
      this.prompt.isDesktopApp && this.prompt.asset() !== null && this.prompt.state() !== 'started',
  );

  /** The fallback: a plain download, in the browser and anywhere without one. */
  readonly showDownloadLink = computed(
    () =>
      this.prompt.state() !== 'started' &&
      (!this.prompt.isDesktopApp || this.prompt.asset() === null),
  );

  /** Where the fallback download goes. */
  readonly downloadUrl = computed(
    () => this.prompt.asset()?.downloadUrl ?? this.prompt.releasesUrl,
  );
}
