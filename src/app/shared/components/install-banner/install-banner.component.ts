import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { InstallService } from '../../../core/services/install.service';

@Component({
  selector: 'app-install-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (install.isVisible()) {
      <div class="install-banner" role="banner" aria-label="Install DeepWork as an app">
        <div class="banner-content">
          <svg
            class="banner-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          @if (install.canInstall()) {
            <span class="banner-text">
              Install <strong>DeepWork</strong> as an app for faster access and full offline use
            </span>
          } @else {
            <!-- One sentence from InstallService, because how to install
                 depends on the browser: Chromium has an address-bar icon,
                 Safari installs from its File menu, and Firefox cannot. -->
            <span class="banner-text">{{ install.hint }}</span>
          }
        </div>
        <div class="banner-actions">
          @if (install.canInstall()) {
            <button class="btn-install" (click)="install.install()">Install</button>
          }
          <button class="btn-dismiss" (click)="install.dismiss()" aria-label="Dismiss">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .install-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        /* One explicit height, shared with the app shell through the custom
         property: the shell holds exactly this much room open at the top, so the
         banner can never end up on top of the sidebar's collapse button. */
        height: var(--install-banner-height);
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        /* The band is '48px + --safe-top' (see that token), because on a phone
           with 'viewport-fit=cover' the strip iOS keeps for the status bar falls
           inside a banner pinned to 'top: 0'. The padding follows it down so the
           text and the buttons are laid out below that strip rather than centred
           across it, and it picks up the landscape cutout on the two sides the
           notch actually sits against. Every inset is 0px on a desktop, so this
           is the same 10px/20px it always was there. */
        padding-top: calc(10px + var(--safe-top));
        padding-right: calc(20px + var(--safe-right));
        padding-bottom: 10px;
        padding-left: calc(20px + var(--safe-left));
        background: linear-gradient(
          135deg,
          rgba(139, 92, 246, 0.18) 0%,
          rgba(6, 182, 212, 0.12) 100%
        );
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-bottom: 1px solid rgba(139, 92, 246, 0.25);
        box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
        animation: slide-down 0.3s ease-out both;
      }
      @keyframes slide-down {
        from {
          transform: translateY(-100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .banner-content {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
        min-width: 0;
      }
      .banner-icon {
        flex-shrink: 0;
        color: var(--color-accent-primary);
        opacity: 0.9;
      }
      .banner-text {
        font-size: 13px;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .banner-text strong {
        color: var(--color-text-primary);
        font-weight: 600;
      }
      .inline-icon {
        display: inline-block;
        vertical-align: text-bottom;
        color: var(--color-accent-primary);
      }
      .banner-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .btn-install {
        padding: 5px 16px;
        border-radius: 8px;
        border: 1px solid rgba(139, 92, 246, 0.5);
        background: rgba(139, 92, 246, 0.2);
        color: var(--color-text-primary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .btn-install:hover {
        background: rgba(139, 92, 246, 0.35);
        border-color: rgba(139, 92, 246, 0.7);
      }
      .btn-dismiss {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-dismiss:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--color-text-secondary);
      }

      /* ===== Phone layout =====

         The band is a fixed 48px plus the status-bar strip, and the shell
         reserves exactly that much room for it, so a phone cannot answer the 44px
         thumb target by making the banner taller — the page below would move under
         it. What is left of the 48px once 1px sits above the strip and 2px and
         the border below it is exactly 44px, so both controls are given the whole
         of it and the strip keeps its own space.

         The sentence is allowed a second line here for the same reason the
         buttons are as tall as the band: the hint that says how to install
         ("Tap the Share button, then Add to Home Screen") is the banner's entire
         purpose, and one ellipsised line at 320px keeps the first four words of
         it. */
      @media (max-width: 640px) {
        .install-banner {
          padding-top: calc(var(--safe-top) + 1px);
          padding-right: calc(12px + var(--safe-right));
          padding-bottom: 2px;
          padding-left: calc(12px + var(--safe-left));
        }
        .banner-text {
          white-space: normal;
          line-height: 1.25;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .btn-install {
          min-height: 44px;
          padding: 5px 14px;
        }
        .btn-dismiss {
          width: 44px;
          height: 44px;
        }
      }
    `,
  ],
})
export class InstallBannerComponent {
  protected readonly install = inject(InstallService);
}
