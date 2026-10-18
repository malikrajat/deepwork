import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DesktopPrefsService } from '../../../core/services/desktop-prefs.service';
import { InstallService } from '../../../core/services/install.service';
import { FloatingTimerService } from '../../../core/services/floating-timer.service';
import { InfoTipComponent } from '../info-tip/info-tip.component';
import {
  ALWAYS_ON_TOP_HELP,
  CLOSE_TO_TRAY_HELP,
  MINI_WIDGET_HELP,
  PIN_TO_TASKBAR_HELP,
  START_WITH_SYSTEM_HELP,
} from '../../../core/constants/desktop-prefs.constants';

/**
 * The three desktop switches — "Start with system", "Always on top" and
 * "Keep running in the tray" — and, where Windows can do it, the pin row.
 *
 * Deliberately one component shown in several places (Settings, the dashboard,
 * and the first-run dialog) so the wording, the behaviour and the error handling
 * cannot drift apart. The system tray offers the desktop switches from Rust as
 * well, and its own **Exit** is what the close behaviour depends on.
 *
 * The pin row is not a switch because pinning is not the app's to give: it asks
 * the shell, the shell asks the user, and the row then reports what the shell
 * said. It is absent — not disabled — where Windows has no way to answer.
 */
@Component({
  selector: 'app-desktop-prefs-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InfoTipComponent],
  template: `
    @if (title()) {
      <div class="prefs-title">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M8 20h8" />
        </svg>
        <span>{{ title() }}</span>
      </div>
    }

    @if (prefs.isDesktopApp) {
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
            [disabled]="disabled() || !prefs.alwaysOnTopSupported()"
            (click)="toggleAlwaysOnTop()"
          >
            <span class="knob"></span>
          </button>
        </div>

        @if (!prefs.alwaysOnTopSupported()) {
          <p class="pref-note">
            This desktop does not let an app stay above other windows — Wayland leaves the stacking
            order to the compositor. The mini widget asks for it and the desktop decides; running
            DeepWork through X11 (<code>WAYLAND_DISPLAY=</code>) makes it work.
          </p>
        }

        <div class="pref-row">
          <span class="pref-label">
            Keep running in the tray
            <app-info-tip
              [heading]="closeHelp.heading"
              [body]="closeHelp.body"
              [hint]="closeHelp.hint"
            />
          </span>
          <button
            type="button"
            class="switch"
            role="switch"
            [class.on]="prefs.closeToTray()"
            [attr.aria-checked]="prefs.closeToTray()"
            [attr.aria-label]="closeHelp.heading"
            [disabled]="disabled()"
            (click)="toggleCloseToTray()"
          >
            <span class="knob"></span>
          </button>
        </div>
      @if (prefs.pinSupported()) {
        <div class="pref-row">
          <span class="pref-label">
            Pin to taskbar
            <app-info-tip
              [heading]="pinHelp.heading"
              [body]="pinHelp.body"
              [hint]="pinHelp.hint"
            />
          </span>
          @if (prefs.pinned()) {
            <span class="pref-state">Pinned</span>
          } @else {
            <button
              type="button"
              class="pin-button"
              [disabled]="disabled() || prefs.pinBusy()"
              (click)="askToPin()"
            >
              {{ prefs.pinBusy() ? 'Waiting…' : 'Pin' }}
            </button>
          }
        </div>
      }

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
          [disabled]="disabled() || !prefs.alwaysOnTopSupported()"
          (click)="toggleAlwaysOnTop()"
        >
          <span class="knob"></span>
        </button>
      </div>

      @if (prefs.error(); as message) {
        <p class="pref-error" role="alert">{{ message }}</p>
      }

      <p class="pref-footnote">
        <app-info-tip [heading]="miniHelp.heading" [body]="miniHelp.body" [hint]="miniHelp.hint" />
        <span>Minimising the window turns DeepWork into a mini widget.</span>
      </p>
    } @else if (install.isInstalled()) {
      <!-- ===== Installed web app =====
           The browser owns the login item and the window stack. What the app can
           do is say where those settings are, and offer the one "on top" a web
           page is allowed: a floating timer window, where the browser has the API
           for it. -->
      <div class="prefs">
        <div class="pref-row">
          <span class="pref-label">
            {{ install.isMobile() ? 'Open from the home screen' : 'Start with ' + computerWord() }}
            <app-info-tip
              [heading]="startHelp.heading"
              [body]="startHelp.body"
              [hint]="'Installed web apps cannot add their own login item, so the app explains where the setting is.'"
            />
          </span>
          <button type="button" class="pref-action" (click)="install.openDialog('startup')">
            How
          </button>
        </div>
        <p class="pref-note">
          @if (install.isMobile()) {
            Phones do not start apps when you unlock them. DeepWork opens from its home-screen icon,
            full screen, and your timer keeps its place while you use other apps.
          } @else {
            {{ install.osName }} keeps login items in a system setting, not in the app. The dialog
            shows the exact steps — it takes one minute and is done once.
          }
        </p>

        <div class="pref-row">
          <span class="pref-label">
            Always on top
            <app-info-tip
              [heading]="onTopHelp.heading"
              [body]="onTopHelp.body"
              [hint]="'A browser will not raise a page above other applications; a separate floating window is the one exception.'"
            />
          </span>
          @if (install.canFloatOnTop) {
            <button
              type="button"
              class="pref-action"
              [class.on]="floating.isOpen()"
              (click)="toggleFloat()"
            >
              {{ floating.isOpen() ? 'Close floating timer' : 'Float timer' }}
            </button>
          } @else {
            <span class="pref-unavailable">Not in this browser</span>
          }
        </div>
        <p class="pref-note">
          @if (install.canFloatOnTop) {
            The floating timer is a small window that stays above other applications, with the
            countdown and a pause button. The rest of DeepWork stays in its normal window.
          } @else {
            This browser cannot keep a window above other applications. The DeepWork desktop app
            can, with its <strong>Always on top</strong> switch; here, the mini widget stays on top
            of this tab.
          }
        </p>
      </div>

      <p class="pref-footnote">
        <app-info-tip [heading]="miniHelp.heading" [body]="miniHelp.body" [hint]="miniHelp.hint" />
        <span>The browser's own window controls and menus still apply; nothing is hidden from them.</span>
      </p>
    } @else {
      <!-- ===== A tab =====
           Nothing here can be honoured until the page is an installed app, so
           the card is one question — install it — with the reason attached. -->
      <div class="prefs">
        <div class="pref-row">
          <span class="pref-label">Installation</span>
          <button type="button" class="pref-action primary" (click)="install.openDialog('install')">
            {{ install.canInstall() ? 'Install DeepWork' : 'How to install' }}
          </button>
        </div>
      </div>
      <p class="pref-note">
        Installing gives DeepWork a window and an icon of its own, offline use, and the two settings
        below. Until then the browser owns them — it will not let this page start with the computer
        or stay above other windows.
      </p>
      <ul class="pref-list">
        <li><span class="pref-list-name">Start with system</span> after installation</li>
        <li><span class="pref-list-name">Always on top</span> in the desktop app, or as a floating timer here</li>
      </ul>
      @if (install.isDismissed()) {
        <p class="pref-footnote">
          <button type="button" class="pref-link" (click)="install.showAgain()">
            Show the install prompt again
          </button>
        </p>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .prefs-title {
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
      .prefs-title svg {
        opacity: 0.5;
      }
      .prefs {
        display: flex;
        flex-direction: column;
      }
      .pref-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        font-size: 14px;
        color: var(--color-text-secondary);
        border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      }
      .pref-row:last-child {
        border-bottom: none;
      }
      .pref-label {
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }

      .switch {
        flex: 0 0 auto;
        width: 42px;
        height: 22px;
        border-radius: 999px;
        cursor: pointer;
        padding: 0;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
        position: relative;
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .switch .knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--color-text-muted, #a1a1aa);
        transition:
          transform 0.2s,
          background 0.2s;
      }
      .switch.on {
        background: rgba(139, 92, 246, 0.35);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .switch.on .knob {
        transform: translateX(20px);
        background: #ede9fe;
      }
      .switch:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .switch:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.8);
        outline-offset: 2px;
      }

      /* The right-hand side of a row the app cannot switch: a button that
         explains, or a plain statement that this browser has no such thing. */
      .pref-action {
        flex: 0 0 auto;
        min-height: 32px;
        padding: 5px 12px;
        border-radius: var(--radius-sm, 8px);
        border: 1px solid rgba(139, 92, 246, 0.3);
        background: rgba(139, 92, 246, 0.08);
        color: var(--color-text-primary);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      /* The pin row's action. A pill rather than a switch, because it is a
         request the shell answers rather than a setting the app keeps. */
      .pin-button {
        flex: 0 0 auto;
        padding: 5px 14px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        color: #ede9fe;
        background: rgba(139, 92, 246, 0.28);
        border: 1px solid rgba(139, 92, 246, 0.55);
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .pref-action:hover {
        background: rgba(139, 92, 246, 0.18);
        border-color: rgba(139, 92, 246, 0.55);
      }
      .pref-action.primary {
        background: rgba(139, 92, 246, 0.2);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .pref-action.on {
        background: rgba(6, 182, 212, 0.16);
        border-color: rgba(6, 182, 212, 0.5);
      }
      .pref-unavailable {
        flex: 0 0 auto;
        font-size: 11px;
        font-style: italic;
        color: var(--color-text-muted);
      .pin-button:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.42);
      }
      .pin-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .pin-button:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.8);
        outline-offset: 2px;
      }
      .pref-state {
        flex: 0 0 auto;
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-muted, #a1a1aa);
      }

      .pref-error {
        margin: 10px 0 0;
        font-size: 12px;
        line-height: 1.45;
        color: #fca5a5;
      }
      .pref-footnote {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 12px 0 0;
        font-size: 12px;
        line-height: 1.45;
        color: var(--color-text-muted, #a1a1aa);
      }
      .pref-note {
        margin: 10px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted, #a1a1aa);
      }
      .pref-list {
        list-style: none;
        margin: 10px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 12px;
        color: var(--color-text-muted, #a1a1aa);
      }
      .pref-list li::before {
        content: '·';
        margin-right: 7px;
        color: var(--color-accent-primary, #a78bfa);
      }
      .pref-list-name {
        color: var(--color-text-secondary, #b6b2d0);
        font-weight: 600;
      }
      .pref-link {
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 12px;
        color: var(--color-accent-primary, #a78bfa);
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
      }

      /* ===== Narrow layout =====
         Below 900px the info tip stops being the anchor for its own popover — a
         272px card hung off an 18px button is off the left of a narrow screen —
         and the popover spans whichever positioned box it is drawn in instead.
         This is the other half of that: the row and the footnote the tips are
         opened from become that box, so the explanation lands as a band under the
         setting it belongs to. 'position: relative' with no offsets draws nothing
         and moves nothing; it only says what the popover is measured against. */
      @media (max-width: 900px) {
        .pref-row,
        .pref-footnote {
          position: relative;
        }
      }

      /* ===== Phone layout =====
         A thumb is not a mouse. The switch keeps the 42x22 pill it is drawn as —
         a taller box would leave its 16px knob in the corner of the track rather
         than on it — and takes the 44px a finger needs from an invisible box
         around the switch instead. A row whose right-hand side is a button wraps
         rather than crushing its label: an "Install DeepWork" button beside a
         two-word label on a 320px screen is nine characters of label. */
      @media (max-width: 640px) {
        .pref-row {
          padding: 12px 0;
          flex-wrap: wrap;
          row-gap: 8px;
        }
        .pref-label {
          min-width: 0;
        }
        .switch::before {
          content: '';
          position: absolute;
          inset: -11px;
        }
        .pref-action {
          flex: 1 1 100%;
          min-height: 44px;
        }
      }
    `,
  ],
})
export class DesktopPrefsPanelComponent {
  /** Optional card heading; omit for a bare list of switches. */
  readonly title = input<string>('');

  readonly prefs = inject(DesktopPrefsService);
  readonly install = inject(InstallService);
  readonly floating = inject(FloatingTimerService);

  protected readonly startHelp = START_WITH_SYSTEM_HELP;
  protected readonly pinHelp = PIN_TO_TASKBAR_HELP;
  protected readonly onTopHelp = ALWAYS_ON_TOP_HELP;
  protected readonly closeHelp = CLOSE_TO_TRAY_HELP;
  protected readonly miniHelp = MINI_WIDGET_HELP;

  /** The word for the machine this copy is running on. */
  protected computerWord(): string {
    // "Start with Linux" is not something anybody says; on the two platforms
    // whose name is a product name, it is, and everywhere else the sentence is
    // about the user's computer.
    if (this.install.os === 'windows') return 'Windows';
    if (this.install.os === 'macos') return 'macOS';
    return 'your computer';
  }

  /** Switches are inert without a desktop shell. */
  disabled(): boolean {
    return !this.prefs.isDesktopApp || this.prefs.busy();
  }

  async toggleStartWithSystem(): Promise<void> {
    await this.prefs.setStartWithSystem(!this.prefs.startWithSystem());
  }

  /** Puts the pin question on the desktop; the answer comes back as a button press. */
  async askToPin(): Promise<void> {
    await this.prefs.askToPin();
  }

  async toggleAlwaysOnTop(): Promise<void> {
    await this.prefs.setAlwaysOnTop(!this.prefs.alwaysOnTop());
  }

  async toggleCloseToTray(): Promise<void> {
    await this.prefs.setCloseToTray(!this.prefs.closeToTray());
  }

  async toggleFloat(): Promise<void> {
    await this.floating.toggle();
  }
}
