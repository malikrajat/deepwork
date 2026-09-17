import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DesktopPrefsService } from '../../../core/services/desktop-prefs.service';
import { InfoTipComponent } from '../info-tip/info-tip.component';
import {
  ALWAYS_ON_TOP_HELP,
  MINI_WIDGET_HELP,
  START_WITH_SYSTEM_HELP,
} from '../../../core/constants/desktop-prefs.constants';

/**
 * The two desktop switches — "Start with system" and "Always on top".
 *
 * Deliberately one component shown in several places (Settings, the dashboard,
 * and the first-run dialog) so the wording, the behaviour and the error handling
 * cannot drift apart. The system tray offers the same two toggles from Rust.
 */
@Component({
  selector: 'app-desktop-prefs-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InfoTipComponent],
  template: `
    @if (title()) {
      <div class="prefs-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M8 20h8" />
        </svg>
        <span>{{ title() }}</span>
      </div>
    }

    <div class="prefs">
      <div class="pref-row">
        <span class="pref-label">
          Start with system
          <app-info-tip
            [heading]="startHelp.heading"
            [body]="startHelp.body"
            [hint]="startHelp.hint"
          />
        </span>
        <button
          type="button"
          class="switch"
          role="switch"
          [class.on]="prefs.startWithSystem()"
          [attr.aria-checked]="prefs.startWithSystem()"
          [attr.aria-label]="startHelp.heading"
          [disabled]="disabled()"
          (click)="toggleStartWithSystem()"
        >
          <span class="knob"></span>
        </button>
      </div>

      <div class="pref-row">
        <span class="pref-label">
          Always on top
          <app-info-tip
            [heading]="onTopHelp.heading"
            [body]="onTopHelp.body"
            [hint]="onTopHelp.hint"
          />
        </span>
        <button
          type="button"
          class="switch"
          role="switch"
          [class.on]="prefs.alwaysOnTop()"
          [attr.aria-checked]="prefs.alwaysOnTop()"
          [attr.aria-label]="onTopHelp.heading"
          [disabled]="disabled()"
          (click)="toggleAlwaysOnTop()"
        >
          <span class="knob"></span>
        </button>
      </div>
    </div>

    @if (prefs.error(); as message) {
      <p class="pref-error" role="alert">{{ message }}</p>
    }

    <p class="pref-footnote">
      <app-info-tip
        [heading]="miniHelp.heading"
        [body]="miniHelp.body"
        [hint]="miniHelp.hint"
      />
      <span>Minimising from the clock card turns DeepWork into a mini widget.</span>
    </p>

    @if (!prefs.isDesktopApp) {
      <p class="pref-note">
        These two options control your computer, so they are available in the
        DeepWork desktop app. Everything else works the same here.
      </p>
    }
  `,
  styles: [`
    :host { display: block; }
    .prefs-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--color-text-muted);
      margin-bottom: var(--space-md, 16px); padding-bottom: var(--space-sm, 8px);
      border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    }
    .prefs-title svg { opacity: 0.5; }
    .prefs { display: flex; flex-direction: column; }
    .pref-row {
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px; padding: 10px 0;
      font-size: 0.85rem; color: var(--color-text-secondary);
      border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    }
    .pref-row:last-child { border-bottom: none; }
    .pref-label { display: inline-flex; align-items: center; gap: 7px; }

    .switch {
      flex: 0 0 auto;
      width: 42px; height: 22px; border-radius: 999px; cursor: pointer; padding: 0;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      position: relative; transition: background 0.2s, border-color 0.2s;
    }
    .switch .knob {
      position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
      border-radius: 50%; background: var(--color-text-muted, #a1a1aa);
      transition: transform 0.2s, background 0.2s;
    }
    .switch.on {
      background: rgba(139, 92, 246, 0.35);
      border-color: rgba(139, 92, 246, 0.6);
    }
    .switch.on .knob { transform: translateX(20px); background: #ede9fe; }
    .switch:disabled { opacity: 0.45; cursor: not-allowed; }
    .switch:focus-visible { outline: 2px solid rgba(139, 92, 246, 0.8); outline-offset: 2px; }

    .pref-error {
      margin: 10px 0 0; font-size: 0.75rem; line-height: 1.45;
      color: #fca5a5;
    }
    .pref-footnote {
      display: flex; align-items: center; gap: 7px;
      margin: 12px 0 0; font-size: 0.72rem; line-height: 1.45;
      color: var(--color-text-muted, #a1a1aa);
    }
    .pref-note {
      margin: 10px 0 0; font-size: 0.72rem; line-height: 1.5;
      color: var(--color-text-muted, #a1a1aa);
    }
  `],
})
export class DesktopPrefsPanelComponent {
  /** Optional card heading; omit for a bare list of switches. */
  readonly title = input<string>('');

  readonly prefs = inject(DesktopPrefsService);

  protected readonly startHelp = START_WITH_SYSTEM_HELP;
  protected readonly onTopHelp = ALWAYS_ON_TOP_HELP;
  protected readonly miniHelp = MINI_WIDGET_HELP;

  /** Switches are inert without a desktop shell. */
  disabled(): boolean {
    return !this.prefs.isDesktopApp || this.prefs.busy();
  }

  async toggleStartWithSystem(): Promise<void> {
    await this.prefs.setStartWithSystem(!this.prefs.startWithSystem());
  }

  async toggleAlwaysOnTop(): Promise<void> {
    await this.prefs.setAlwaysOnTop(!this.prefs.alwaysOnTop());
  }
}
