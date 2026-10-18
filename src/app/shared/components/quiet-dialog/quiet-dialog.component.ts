import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { QuietService } from '../../../core/services/quiet.service';
import { QuietPanelComponent } from '../quiet-panel/quiet-panel.component';

/**
 * The quick quiet controls, as a dialog.
 *
 * It is a dialog rather than a drop-down menu because it is opened from three
 * different places — the sidebar, the phone's top bar and a keyboard shortcut —
 * and a popover anchored to whichever button was pressed has to be positioned
 * three ways and re-measured on every scroll. A small modal reads the same from
 * all three, and on a phone it becomes a bottom sheet, which is where a thumb
 * already is.
 *
 * It sits below the app's other dialogs (z-index 190) so a dialog that was
 * already open when it was summoned still covers it. It is not part of the
 * mini widget: the widget has its own 136x76 alert and no room for a sheet.
 */
@Component({
  selector: 'app-quiet-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QuietPanelComponent],
  host: {
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @if (quiet.panelOpen()) {
      <div class="quiet-backdrop" (click)="close()">
        <div
          class="quiet-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quiet-title"
          (click)="$event.stopPropagation()"
        >
          <header class="quiet-header">
            <div class="quiet-heading">
              <span class="quiet-icon" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 01-3.4 0" />
                </svg>
              </span>
              <h2 id="quiet-title" class="quiet-title">Focus &amp; reminders</h2>
            </div>
            <button type="button" class="quiet-close" aria-label="Close" (click)="close()">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <app-quiet-panel />
        </div>
      </div>
    }
  `,
  styles: [
    `
      .quiet-backdrop {
        position: fixed;
        inset: 0;
        z-index: 190;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(8, 6, 16, 0.62);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        animation: quiet-fade 0.18s ease-out;
      }
      .quiet-sheet {
        width: 100%;
        max-width: 460px;
        padding: 20px 22px 18px;
        border-radius: var(--radius-2xl, 20px);
        background: var(--surface-float, rgba(15, 11, 31, 0.96));
        border: 1px solid rgba(139, 92, 246, 0.28);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
        animation: quiet-rise 0.22s ease-out;
      }
      .quiet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .quiet-heading {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .quiet-icon {
        display: inline-flex;
        color: var(--color-accent-primary, #a78bfa);
      }
      .quiet-title {
        margin: 0;
        font-size: var(--text-xl, 16px);
        font-weight: 700;
        color: var(--color-text-primary, #f2f0ff);
      }
      .quiet-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        margin: -4px -6px -4px 0;
        border: none;
        border-radius: var(--radius-sm, 8px);
        background: transparent;
        color: var(--color-text-muted, #8b87ab);
        cursor: pointer;
      }
      .quiet-close:hover {
        background: rgba(255, 255, 255, 0.07);
        color: var(--color-text-primary, #f2f0ff);
      }

      @keyframes quiet-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes quiet-rise {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      /* ===== Phone layout =====
         The sheet comes up from the bottom edge as a sheet, takes the width of
         the phone, and keeps the home indicator's strip clear. It scrolls inside
         itself if the phone is short rather than letting the last control go
         under the edge. */
      @media (max-width: 640px) {
        .quiet-backdrop {
          align-items: flex-end;
          padding: 0;
        }
        .quiet-sheet {
          max-width: none;
          max-height: calc(100dvh - var(--safe-top) - 24px);
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding: 18px 16px calc(18px + var(--safe-bottom));
          padding-left: calc(16px + var(--safe-left));
          padding-right: calc(16px + var(--safe-right));
          border-radius: var(--radius-2xl, 20px) var(--radius-2xl, 20px) 0 0;
          border-bottom: none;
          animation: quiet-sheet-up 0.24s ease-out;
        }
        .quiet-close {
          width: 44px;
          height: 44px;
        }
      }

      @keyframes quiet-sheet-up {
        from {
          transform: translateY(100%);
        }
        to {
          transform: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .quiet-backdrop,
        .quiet-sheet {
          animation: none;
        }
      }
    `,
  ],
})
export class QuietDialogComponent {
  protected readonly quiet = inject(QuietService);

  close(): void {
    this.quiet.close();
  }
}
