import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { InstallService } from '../../../core/services/install.service';
import { FloatingTimerService } from '../../../core/services/floating-timer.service';

/**
 * The one dialog that explains installation and, afterwards, starting at login.
 *
 * It is opened from three places — the banner's **How**, Settings, and by the
 * app itself when it has just been installed — and it says different things in
 * each of the two modes the web app has:
 *
 * - **Not installed.** How this particular browser installs a web app. Chromium
 *   offers a button, Safari installs from its File menu, a phone installs from
 *   the Share sheet, and Firefox cannot install one at all. One instruction for
 *   all four would send three readers looking for a control that is not there,
 *   so the sentence comes from `installSupport` and the layout follows it.
 * - **Installed.** A web app cannot write a login item or raise its own window
 *   above other applications — those belong to the browser and the OS. What it
 *   can do is say exactly where the setting is, and offer the one always-on-top
 *   it *can* have: a floating timer window, where the browser supports it.
 *
 * Every step of that is different on Windows, macOS, Linux and a phone, which is
 * why the steps are generated from `InstallService.os` rather than written once.
 */
@Component({
  selector: 'app-install-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @if (install.dialogOpen()) {
      <div class="install-backdrop" (click)="close()">
        <div
          class="install-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <button type="button" class="install-close" aria-label="Close" (click)="close()">
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

          <div class="install-icon" aria-hidden="true">
            @if (isInstallView()) {
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            } @else {
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            }
          </div>

          @if (isInstallView()) {
            <h2 id="install-dialog-title" class="install-title gradient-text">Install DeepWork</h2>
            <p class="install-subtitle">{{ installIntro() }}</p>

            <ul class="install-benefits">
              @for (benefit of benefits(); track benefit) {
                <li>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    aria-hidden="true"
                  >
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                  <span>{{ benefit }}</span>
                </li>
              }
            </ul>

            @if (install.canInstall()) {
              <button type="button" class="install-primary" (click)="install.install()">
                Install DeepWork
              </button>
              <p class="install-hint">
                Your browser will ask once. After that DeepWork opens from its own icon.
              </p>
            } @else {
              <div class="install-steps">
                <span class="install-steps-label">How to install in this browser</span>
                <p>{{ install.hint }}</p>
                @if (install.isMobile()) {
                  <p class="install-mobile-note">
                    On a phone, DeepWork installs to your home screen: it then opens full screen,
                    without the address bar, and works offline.
                  </p>
                }
              </div>
            }

            <p class="install-footnote">
              Nothing leaves this device. Installing only adds a window and an icon; your tasks and
              sessions stay where they are.
            </p>
          } @else {
            <h2 id="install-dialog-title" class="install-title gradient-text">
              DeepWork is installed
            </h2>
            <p class="install-subtitle">
              It opens from its own icon. Two things make it easier to keep to hand — and the app
              can only point at them, because a web app is not allowed to change them itself.
            </p>

            @if (showsStartupSteps()) {
              <section class="install-section">
                <h3>Start it with your computer</h3>
                <ol class="install-steps-list">
                  @for (step of startupSteps(); track step) {
                    <li>{{ step }}</li>
                  }
                </ol>
                <p class="install-note">
                  On {{ install.osName }}, that is where the setting lives. The desktop app can do it
                  with one switch instead; this copy cannot write a login item on its own.
                </p>
              </section>
            } @else {
              <section class="install-section">
                <h3>On your phone</h3>
                <p class="install-note">
                  Phones do not start apps when you unlock them. DeepWork opens from your home
                  screen, full screen, and your timer keeps its place while you use other apps.
                </p>
              </section>
            }

            <section class="install-section">
              <h3>Keep the timer above other windows</h3>
              @if (install.canFloatOnTop) {
                <p class="install-note">
                  A browser tab cannot stay above other applications, but Chromium can float a
                  small DeepWork timer window over them.
                </p>
                <button type="button" class="install-secondary" (click)="toggleFloat()">
                  {{ floating.label() }}
                </button>
              } @else {
                <p class="install-note">
                  This browser cannot float a window above other applications. The DeepWork desktop
                  app can — its <strong>Always on top</strong> switch keeps the whole window in
                  front. In a browser, the mini widget stays on top of this tab.
                </p>
              }
            </section>

            <div class="install-actions">
              <button type="button" class="install-secondary" (click)="close()">Done</button>
              @if (!install.startupAcknowledged()) {
                <button type="button" class="install-primary" (click)="acknowledge()">
                  Got it, don't ask again
                </button>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .install-backdrop {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(8, 6, 16, 0.68);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        animation: install-fade 0.2s ease-out;
      }
      .install-card {
        position: relative;
        width: 100%;
        max-width: 460px;
        padding: 26px 26px 20px;
        border-radius: var(--radius-2xl, 20px);
        background: var(--surface-float, rgba(15, 11, 31, 0.96));
        border: 1px solid rgba(139, 92, 246, 0.3);
        box-shadow: 0 26px 60px rgba(0, 0, 0, 0.5);
        animation: install-rise 0.24s ease-out;
      }
      .install-close {
        position: absolute;
        top: 14px;
        right: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: var(--radius-sm, 8px);
        background: transparent;
        color: var(--color-text-muted, #8b87ab);
        cursor: pointer;
      }
      .install-close:hover {
        background: rgba(255, 255, 255, 0.07);
        color: var(--color-text-primary, #f2f0ff);
      }
      .install-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        margin-bottom: 12px;
        border-radius: var(--radius-lg, 12px);
        color: var(--color-accent-primary, #a78bfa);
        background: rgba(139, 92, 246, 0.14);
        border: 1px solid rgba(139, 92, 246, 0.28);
      }
      .install-title {
        margin: 0;
        font-size: var(--text-3xl, 20px);
        font-weight: 800;
        letter-spacing: -0.3px;
      }
      .install-subtitle {
        margin: 6px 0 0;
        font-size: var(--text-base, 13px);
        line-height: 1.55;
        color: var(--color-text-muted, #8b87ab);
      }

      .install-benefits {
        list-style: none;
        margin: 16px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .install-benefits li {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        font-size: var(--text-base, 13px);
        line-height: 1.45;
        color: var(--color-text-secondary, #b6b2d0);
      }
      .install-benefits svg {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--color-success, #34d399);
      }

      .install-primary,
      .install-secondary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 9px 18px;
        border-radius: var(--radius-md, 10px);
        font: inherit;
        font-size: var(--text-base, 13px);
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .install-primary {
        width: 100%;
        margin-top: 18px;
        background: var(--color-accent-gradient, linear-gradient(135deg, #8b5cf6, #06b6d4));
        border: 1px solid transparent;
        color: #fff;
      }
      .install-secondary {
        background: transparent;
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
        color: var(--color-text-secondary, #b6b2d0);
      }
      .install-secondary:hover {
        background: rgba(255, 255, 255, 0.06);
        color: var(--color-text-primary, #f2f0ff);
      }
      .install-hint {
        margin: 8px 0 0;
        font-size: var(--text-xs, 11px);
        line-height: 1.5;
        color: var(--color-text-muted);
        text-align: center;
      }

      .install-steps {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: var(--radius-lg, 12px);
        background: var(--glass-bg, rgba(255, 255, 255, 0.05));
        border: var(--hairline, 1px solid rgba(255, 255, 255, 0.09));
      }
      .install-steps-label {
        display: block;
        margin-bottom: 4px;
        font-size: var(--text-2xs, 10px);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .install-steps p {
        margin: 0;
        font-size: var(--text-base, 13px);
        line-height: 1.55;
        color: var(--color-text-secondary, #b6b2d0);
      }
      .install-mobile-note {
        margin-top: 8px !important;
      }

      .install-section {
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid rgba(139, 92, 246, 0.14);
      }
      .install-section h3 {
        margin: 0 0 6px;
        font-size: var(--text-md, 14px);
        font-weight: 700;
        color: var(--color-text-primary, #f2f0ff);
      }
      .install-note {
        margin: 0 0 10px;
        font-size: var(--text-sm, 12px);
        line-height: 1.55;
        color: var(--color-text-muted, #8b87ab);
      }
      .install-steps-list {
        margin: 0 0 8px;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: var(--text-sm, 12px);
        line-height: 1.5;
        color: var(--color-text-secondary, #b6b2d0);
      }

      .install-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 20px;
      }

      .install-footnote {
        margin: 14px 0 0;
        font-size: var(--text-xs, 11px);
        line-height: 1.5;
        color: var(--color-text-muted);
      }

      @keyframes install-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes install-rise {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      /* ===== Phone layout ===== */
      @media (max-width: 640px) {
        .install-backdrop {
          padding: 12px;
          padding-top: calc(12px + var(--safe-top));
          padding-bottom: calc(12px + var(--safe-bottom));
          align-items: flex-start;
        }
        .install-card {
          padding: 20px 16px 16px;
          max-height: calc(100dvh - 24px - var(--safe-top) - var(--safe-bottom));
          overflow-y: auto;
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
        }
        .install-close {
          width: 44px;
          height: 44px;
          top: 8px;
          right: 8px;
        }
        .install-primary,
        .install-secondary {
          width: 100%;
          min-height: 44px;
        }
        .install-actions {
          flex-direction: column-reverse;
        }
      }
    `,
  ],
})
export class InstallDialogComponent {
  protected readonly install = inject(InstallService);
  protected readonly floating = inject(FloatingTimerService);

  protected readonly isInstallView = computed(
    () => this.install.dialogView() === 'install' && !this.install.isInstalled(),
  );

  /** The three reasons, filtered by what the device can actually do. */
  protected readonly benefits = computed(() => {
    if (this.install.isMobile()) {
      return [
        'A home-screen icon that opens full screen, without the browser bars.',
        'Works offline — the timer and your tasks do not need a connection.',
        'Your data stays on this device, as it does in the tab.',
      ];
    }
    return [
      'Its own window and its own icon, without a browser tab to find.',
      'Works offline — the timer and your tasks do not need a connection.',
      'Opens in a window you can keep beside the app you are working in.',
    ];
  });

  protected readonly installIntro = computed(() => {
    if (this.install.canInstall()) {
      return this.install.isMobile()
        ? 'One tap, and DeepWork sits on your home screen like any other app.'
        : 'One click, and DeepWork becomes an app on this computer.';
    }
    return this.install.support.supported
      ? `This browser installs web apps from its own menu.`
      : 'This browser cannot install web apps — the desktop app is the way to get an installed DeepWork.';
  });

  /** The login-item steps for this computer, or none on a phone. */
  protected readonly showsStartupSteps = computed(
    () => this.install.os === 'windows' || this.install.os === 'macos' || this.install.os === 'linux',
  );

  protected readonly startupSteps = computed<string[]>(() => {
    switch (this.install.os) {
      case 'windows':
        return [
          'Open the Start menu, find DeepWork, right-click it and choose “Open file location”.',
          'Press Win+R, type shell:startup and press Enter.',
          'Copy the DeepWork shortcut into the folder that opens.',
        ];
      case 'macos':
        return [
          'Open System Settings → General → Login Items.',
          'Click the + under “Open at Login”.',
          'Choose DeepWork (in Applications) and click Add.',
        ];
      case 'linux':
        return [
          'Open your desktop’s startup settings — Startup Applications in GNOME, Autostart in KDE.',
          'Add DeepWork as the command, or copy its .desktop launcher into ~/.config/autostart.',
        ];
      default:
        return [];
    }
  });

  async toggleFloat(): Promise<void> {
    await this.floating.toggle();
  }

  acknowledge(): void {
    this.install.acknowledgeStartup();
    this.close();
  }

  close(): void {
    this.install.closeDialog();
  }
}
