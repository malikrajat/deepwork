import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LogService } from '../../../core/services/log.service';

/** The map of the log folder, shown under the buttons. */
interface LogFile {
  name: string;
  purpose: string;
}

/**
 * "Where did DeepWork write down what went wrong?" — answered in Settings.
 *
 * One button opens the folder in Explorer/Finder/the Linux file manager, the
 * other copies the recent lines plus the environment they happened in. The list
 * below says what each file holds, so a future investigation starts with the
 * right file rather than the biggest one.
 */
@Component({
  selector: 'app-logs-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="group-header">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
      <span>Logs &amp; Diagnostics</span>
    </div>

    <div class="setting-item folder-row">
      <span>Log folder</span>
      <code class="log-path" [title]="log.folderPath() ?? ''">{{ folderLabel() }}</code>
    </div>

    <div class="log-actions">
      <button
        type="button"
        class="action-btn primary"
        [disabled]="log.busy()"
        (click)="log.openFolder()"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        {{ log.busy() ? 'Opening…' : 'Open log folder' }}
      </button>
      <button type="button" class="action-btn" (click)="log.copyDiagnostics()">
        Copy diagnostics
      </button>
    </div>

    <p class="log-status" role="status" aria-live="polite">
      @if (log.lastError(); as message) {
        <span class="is-error">{{ message }}</span>
      } @else if (log.lastAction(); as message) {
        {{ message }}
      }
    </p>

    <div class="log-files">
      @for (file of files; track file.name) {
        <div class="log-file">
          <code>{{ file.name }}</code>
          <span>{{ file.purpose }}</span>
        </div>
      }
    </div>

    <p class="log-hint">
      Every warning, error and crash is written here — from the window, the network, the app and
      Angular alike. Each file rolls over on its own, so none of them can grow without limit, and
      older copies are deleted once there are enough of them.
      @if (!log.isDesktopApp) {
        <span>
          This browser build keeps the same log in memory only: the desktop app is what writes the
          files.
        </span>
      }
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted);
        margin-bottom: var(--space-md, 16px);
        padding-bottom: var(--space-sm, 8px);
        border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      }
      .group-header svg {
        opacity: 0.5;
      }
      .setting-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        font-size: 14px;
        color: var(--color-text-secondary);
        border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      }
      .folder-row {
        align-items: flex-start;
      }
      .log-path {
        max-width: 320px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        line-height: 1.5;
        text-align: right;
        overflow-wrap: anywhere;
        color: var(--color-text-muted);
      }
      .log-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 0 4px;
      }
      .action-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid rgba(139, 92, 246, 0.2);
        background: rgba(139, 92, 246, 0.06);
        color: var(--color-text-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .action-btn:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.12);
        border-color: rgba(139, 92, 246, 0.4);
      }
      .action-btn.primary {
        background: rgba(139, 92, 246, 0.1);
        border-color: rgba(139, 92, 246, 0.35);
      }
      .action-btn.primary:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.22);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .action-btn:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.8);
        outline-offset: 2px;
      }
      .log-status {
        margin: 8px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted);
        min-height: 1.1em;
      }
      .log-status .is-error {
        color: #fca5a5;
      }
      .log-files {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      }
      .log-file {
        display: flex;
        align-items: baseline;
        gap: 10px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted);
      }
      .log-file code {
        flex: 0 0 108px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: var(--color-text-primary);
      }
      .log-hint {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 12px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class LogsPanelComponent {
  readonly log = inject(LogService);

  /**
   * The five files, in the order a reader should try them.
   *
   * Kept here rather than in Rust so the settings panel can describe them even
   * when the desktop layer is not answering.
   */
  protected readonly files: LogFile[] = [
    { name: 'deepwork.log', purpose: 'Everything, in order — the first file to read' },
    { name: 'system.log', purpose: 'App, window, tray and OS events, plus stray warnings' },
    { name: 'flow.log', purpose: 'What you were doing: pages, timer, imports, exports' },
    { name: 'crash.log', purpose: 'Crashes, unhandled errors and Angular errors' },
    { name: 'network.log', purpose: 'Failed requests, going offline and back online' },
  ];

  /** The folder path, or a sentence saying why there is none to show. */
  folderLabel(): string {
    if (this.log.folderPath()) return this.log.folderPath()!;
    return this.log.isDesktopApp ? 'Looking…' : 'Desktop app only';
  }
}
