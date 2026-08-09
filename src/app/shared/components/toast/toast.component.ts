import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notifications.toast(); as t) {
      <div class="toast-container" [class.work]="t.type === 'work'" [class.break]="t.type !== 'work'" [attr.data-id]="t.id">
        <div class="toast-icon">
          @if (t.type === 'work') {
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
            </svg>
          } @else {
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
            </svg>
          }
        </div>
        <div class="toast-content">
          <span class="toast-title">{{ t.title }}</span>
          <span class="toast-body">{{ t.body }}</span>
        </div>
        <button class="toast-dismiss" (click)="dismiss()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <div class="toast-pulse-ring"></div>
      </div>
    }
  `,
  styles: [`
    :host {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      pointer-events: none;
    }
    .toast-container {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      border-radius: 14px;
      backdrop-filter: blur(20px);
      pointer-events: all;
      animation: toast-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      overflow: hidden;
      min-width: 280px;
      max-width: 360px;
      box-shadow: var(--glass-shadow), 0 0 0 1px var(--glass-border);
    }
    .toast-container.work {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, var(--toast-bg) 100%);
      border: 1px solid rgba(139, 92, 246, 0.3);
    }
    .toast-container.break {
      background: linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, var(--toast-bg) 100%);
      border: 1px solid rgba(6, 182, 212, 0.3);
    }

    .toast-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      animation: icon-bounce 0.6s ease 0.3s both;
    }
    .work .toast-icon {
      background: rgba(139, 92, 246, 0.2);
      color: var(--timer-work-color);
    }
    .break .toast-icon {
      background: rgba(6, 182, 212, 0.2);
      color: var(--timer-break-color);
    }

    .toast-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .toast-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-text-primary, #fff);
      animation: text-fade 0.4s ease 0.2s both;
    }
    .toast-body {
      font-size: 0.7rem;
      color: var(--color-text-secondary, #aaa);
      animation: text-fade 0.4s ease 0.35s both;
    }

    .toast-dismiss {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      color: var(--color-text-muted, #888);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s;
    }
    .toast-dismiss:hover {
      background: var(--glass-bg-hover);
      color: var(--color-text-primary, #fff);
      transform: scale(1.1);
    }

    /* Pulsing ring for attention */
    .toast-pulse-ring {
      position: absolute;
      inset: -2px;
      border-radius: 16px;
      pointer-events: none;
      animation: pulse-ring 2s ease-in-out infinite;
    }
    .work .toast-pulse-ring {
      border: 2px solid rgba(139, 92, 246, 0.4);
    }
    .break .toast-pulse-ring {
      border: 2px solid rgba(6, 182, 212, 0.4);
    }

    @keyframes toast-in {
      0% {
        opacity: 0;
        transform: translateX(100%) scale(0.8);
      }
      100% {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }
    @keyframes icon-bounce {
      0% { transform: scale(0); }
      60% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }
    @keyframes text-fade {
      0% { opacity: 0; transform: translateY(6px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse-ring {
      0%, 100% { opacity: 0; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.02); }
    }
  `]
})
export class ToastComponent {
  readonly notifications = inject(NotificationService);

  dismiss(): void {
    this.notifications.dismiss();
  }
}
