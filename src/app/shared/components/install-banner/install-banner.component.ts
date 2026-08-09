import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { InstallService } from '../../../core/services/install.service';

@Component({
  selector: 'app-install-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!install.isInstalled() && !install.isDismissed()) {
      <div class="install-banner" role="banner" aria-label="Install DeepWork as an app">
        <div class="banner-content">
          <svg class="banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          @if (install.canInstall()) {
            <span class="banner-text">
              Install <strong>DeepWork</strong> as an app for faster access and full offline use
            </span>
          } @else {
            <span class="banner-text">
              Install <strong>DeepWork</strong> as an app — click the
              <svg class="inline-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              icon in your browser's address bar, or open browser menu → <strong>Install DeepWork…</strong>
            </span>
          }
        </div>
        <div class="banner-actions">
          @if (install.canInstall()) {
            <button class="btn-install" (click)="install.install()">Install</button>
          }
          <button class="btn-dismiss" (click)="install.dismiss()" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .install-banner {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 20px;
      background: linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(6,182,212,0.12) 100%);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(139,92,246,0.25);
      box-shadow: 0 2px 20px rgba(0,0,0,0.3);
      animation: slide-down 0.3s ease-out both;
    }
    @keyframes slide-down {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
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
      font-size: 0.82rem;
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
      border: 1px solid rgba(139,92,246,0.5);
      background: rgba(139,92,246,0.2);
      color: var(--color-text-primary);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-install:hover {
      background: rgba(139,92,246,0.35);
      border-color: rgba(139,92,246,0.7);
    }
    .btn-dismiss {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px; height: 26px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-dismiss:hover {
      background: rgba(255,255,255,0.08);
      color: var(--color-text-secondary);
    }
  `]
})
export class InstallBannerComponent {
  protected readonly install = inject(InstallService);
}
