import { Component, input, output, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { SafeHtmlPipe } from '../../pipes/safe-html.pipe';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, SafeHtmlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="sidebar" [class.collapsed]="collapsed()">
      <div class="sidebar-header">
        @if (!collapsed()) {
          <div class="brand">
            <div class="brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="url(#brand-grad)" stroke-width="2"/>
                <path d="M12 6v6l4 2" stroke="url(#brand-grad)" stroke-width="2" stroke-linecap="round"/>
                <defs>
                  <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#8b5cf6"/>
                    <stop offset="100%" stop-color="#06b6d4"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span class="app-title">DeepWork</span>
          </div>
        }
        <button class="toggle-btn" (click)="toggleCollapse.emit()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="15" y2="12"/>
            <line x1="3" y1="18" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <ul class="nav-list">
        @for (item of navItems; track item.path) {
          <li>
            <a
              [routerLink]="'/' + item.path"
              [class.active]="isActive(item.path)"
              class="nav-item"
              [title]="collapsed() ? item.label : ''"
            >
              <span class="nav-icon" [innerHTML]="item.icon | safeHtml"></span>
              @if (!collapsed()) {
                <span class="nav-label">{{ item.label }}</span>
              }
              <span class="active-indicator"></span>
            </a>
          </li>
        }
      </ul>

      @if (!collapsed()) {
        <div class="sidebar-footer">
          <div class="version-badge">v0.1.0</div>
        </div>
      }
    </nav>
  `,
  styles: [`
    .sidebar {
      width: 240px;
      height: 100vh;
      background: var(--sidebar-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-right: 1px solid var(--glass-border);
      box-shadow: var(--glass-shadow);
      display: flex;
      flex-direction: column;
      padding: var(--space-lg) var(--space-md);
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      flex-shrink: 0;
      position: relative;
    }
    .sidebar::after {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 1px;
      height: 100%;
      background: linear-gradient(to bottom, rgba(139, 92, 246, 0.3) 0%, transparent 50%, rgba(6, 182, 212, 0.2) 100%);
    }
    .sidebar.collapsed {
      width: 68px;
      padding: var(--space-md) var(--space-sm);
    }
    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-sm) var(--space-sm);
      margin-bottom: var(--space-xl);
    }
    .collapsed .sidebar-header {
      justify-content: center;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }
    .brand-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--sidebar-hover-bg);
      border-radius: 10px;
      border: 1px solid rgba(139, 92, 246, 0.2);
    }
    .toggle-btn {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .toggle-btn:hover {
      color: var(--color-text-primary);
      background: rgba(139, 92, 246, 0.1);
    }
    .app-title {
      font-size: 1.1rem;
      font-weight: 700;
      white-space: nowrap;
      background: var(--color-accent-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .nav-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
    }
    .nav-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 12px;
      color: var(--color-text-secondary);
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
    }
    .collapsed .nav-item {
      padding: 12px;
      justify-content: center;
    }
    .nav-item:hover {
      color: var(--color-text-primary);
      background: var(--sidebar-hover-bg);
    }
    .nav-item.active {
      color: var(--color-text-primary);
      background: var(--sidebar-active-bg);
      border: 1px solid var(--sidebar-active-border);
      box-shadow: var(--glass-shadow-glow);
    }
    .nav-item.active .nav-icon {
      color: var(--color-accent-primary);
      filter: drop-shadow(0 0 4px var(--color-accent-glow));
    }
    .active-indicator {
      display: none;
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 16px;
      background: var(--color-accent-gradient);
      border-radius: 0 4px 4px 0;
    }
    .nav-item.active .active-indicator {
      display: block;
    }
    .nav-icon {
      display: flex;
      align-items: center;
      color: inherit;
      justify-content: center;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      transition: all 0.2s;
    }
    .nav-label {
      overflow: hidden;
    }
    .sidebar-footer {
      padding: var(--space-md) var(--space-sm);
      border-top: 1px solid var(--glass-border);
    }
    .version-badge {
      font-size: 0.7rem;
      color: var(--color-text-muted);
      padding: 4px 10px;
      background: var(--glass-bg);
      border-radius: 20px;
      text-align: center;
      border: 1px solid var(--glass-border);
    }
  `]
})
export class SidebarComponent {
  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  isActive(path: string): boolean {
    const url = this.currentUrl();
    if (path === '') return true; // Dashboard always active
    return url === '/' + path || url.startsWith('/' + path + '/');
  }

  collapsed = input<boolean>(false);
  toggleCollapse = output<void>();

  navItems: NavItem[] = [
    { path: '', label: 'Dashboard', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
    { path: 'tasks', label: 'Tasks', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' },
    { path: 'matrix', label: 'Matrix', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>' },
    { path: 'today', label: 'Today', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>' },
    { path: 'analytics', label: 'Analytics', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
    { path: 'habits', label: 'Habits', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>' },
    { path: 'journal', label: 'Journal', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>' },
    { path: 'settings', label: 'Settings', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' },
  ];
}
