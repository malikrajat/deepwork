import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DesktopPrefsService } from '../../../core/services/desktop-prefs.service';
import { DesktopPrefsPanelComponent } from '../desktop-prefs-panel/desktop-prefs-panel.component';
import { MINI_WIDGET_HELP } from '../../../core/constants/desktop-prefs.constants';

/**
 * One-time "here is what these two options do" dialog, shown the first time the
 * desktop app runs.
 *
 * The Windows installer can ask about startup, but a macOS `.dmg`, a Linux
 * `.deb` and an `.AppImage` cannot show a checkbox — so every platform gets the
 * same, equally clear offer on first launch. It is also the only place that
 * explains the mini widget before the user discovers it by accident.
 */
@Component({
  selector: 'app-welcome-prefs-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DesktopPrefsPanelComponent],
  host: {
    '(document:keydown.escape)': 'dismiss()',
  },
  template: `
    @if (visible()) {
      <div class="dialog-backdrop" (click)="dismiss()">
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-prefs-title"
          (click)="$event.stopPropagation()"
        >
          <h2 id="welcome-prefs-title" class="dialog-title gradient-text">
            Make DeepWork work your way
          </h2>
          <p class="dialog-subtitle">
            Two optional settings — change them now or any time later. Nothing is
            switched on unless you choose it.
          </p>

          <div class="dialog-body">
            <app-desktop-prefs-panel />
          </div>

          <div class="widget-tip">
            <span class="widget-tip-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="12" x2="15" y2="12" />
              </svg>
            </span>
            <div>
              <strong>{{ miniHelp.heading }}</strong>
              <p>{{ miniHelp.body }}</p>
              <p class="widget-tip-hint">{{ miniHelp.hint }}</p>
            </div>
          </div>

          <div class="dialog-actions">
            <button type="button" class="btn-ghost" (click)="dismiss()">Not now</button>
            <button type="button" class="btn-primary" (click)="dismiss()">Done</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed; inset: 0; z-index: 200;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      background: rgba(8, 6, 16, 0.66);
      backdrop-filter: blur(6px);
      animation: dialog-fade 0.2s ease-out;
    }
    .dialog-card {
      width: 100%; max-width: 460px;
      padding: 26px 26px 20px;
      border-radius: 20px;
      background: var(--glass-bg, rgba(24, 20, 38, 0.9));
      backdrop-filter: blur(22px);
      border: 1px solid rgba(139, 92, 246, 0.28);
      box-shadow: 0 26px 60px rgba(0, 0, 0, 0.5);
      animation: dialog-rise 0.24s ease-out;
    }
    .dialog-title { font-size: 1.2rem; font-weight: 800; letter-spacing: -0.3px; margin: 0; }
    .dialog-subtitle {
      margin: 6px 0 0; font-size: 0.8rem; line-height: 1.5;
      color: var(--color-text-muted, #a1a1aa);
    }
    .dialog-body { margin-top: 18px; }

    .widget-tip {
      display: flex; gap: 10px; margin-top: 16px; padding: 12px 14px;
      border-radius: 12px;
      background: rgba(139, 92, 246, 0.08);
      border: 1px solid rgba(139, 92, 246, 0.2);
      font-size: 0.75rem; line-height: 1.5;
      color: var(--color-text-secondary, #d4d4d8);
    }
    .widget-tip-icon {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 7px;
      background: rgba(139, 92, 246, 0.16);
      color: var(--color-accent-primary, #a78bfa);
    }
    .widget-tip strong { display: block; margin-bottom: 3px; color: var(--color-text-primary, #f4f4f5); }
    .widget-tip p { margin: 0; }
    .widget-tip-hint { margin-top: 6px !important; color: var(--color-accent-primary, #a78bfa); }

    .dialog-actions {
      display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px;
    }
    .btn-ghost, .btn-primary {
      padding: 8px 18px; border-radius: 9px; font-size: 0.8rem; font-weight: 600;
      cursor: pointer; transition: background 0.2s, border-color 0.2s;
    }
    .btn-ghost {
      background: transparent; color: var(--color-text-secondary, #d4d4d8);
      border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
    }
    .btn-ghost:hover { background: rgba(255, 255, 255, 0.06); }
    .btn-primary {
      background: rgba(139, 92, 246, 0.24);
      border: 1px solid rgba(139, 92, 246, 0.55);
      color: var(--color-text-primary, #f4f4f5);
    }
    .btn-primary:hover { background: rgba(139, 92, 246, 0.36); }

    @keyframes dialog-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes dialog-rise {
      from { opacity: 0; transform: translateY(10px) scale(0.98); }
      to { opacity: 1; transform: none; }
    }
  `],
})
export class WelcomePrefsDialogComponent {
  protected readonly prefs = inject(DesktopPrefsService);
  protected readonly miniHelp = MINI_WIDGET_HELP;

  /**
   * Only after preferences have loaded, only in the desktop app, and only once.
   */
  visible(): boolean {
    return this.prefs.ready() && this.prefs.isDesktopApp && !this.prefs.prompted();
  }

  async dismiss(): Promise<void> {
    await this.prefs.markPrompted();
  }
}
