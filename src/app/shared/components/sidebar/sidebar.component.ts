import { Component, input, output, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { SafeHtmlPipe } from '../../pipes/safe-html.pipe';
import { UpdateService } from '../../../core/services/update.service';
import { QuietService } from '../../../core/services/quiet.service';
import { APP_VERSION } from '../../../core/constants/app-info.constants';
import { formatVersion } from '../../../core/utils/version.util';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, SafeHtmlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.mobile-open]': 'mobileOpen()' },
  template: `
    <nav
      id="app-navigation"
      class="sidebar"
      [class.collapsed]="collapsed()"
      aria-label="Main navigation"
    >
      <div class="sidebar-header">
        @if (!collapsed()) {
          <div class="brand">
            <div class="brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="url(#brand-grad)" stroke-width="2" />
                <path
                  d="M12 6v6l4 2"
                  stroke="url(#brand-grad)"
                  stroke-width="2"
                  stroke-linecap="round"
                />
                <defs>
                  <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#8b5cf6" />
                    <stop offset="100%" stop-color="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span class="app-title">DeepWork</span>
          </div>
        }
        <button
          class="toggle-btn"
          type="button"
          (click)="toggleCollapse.emit()"
          [attr.aria-label]="collapsed() ? 'Expand navigation' : 'Collapse navigation'"
          [attr.aria-expanded]="!collapsed()"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="15" y2="12" />
            <line x1="3" y1="18" x2="18" y2="18" />
          </svg>
        </button>
        <!-- The drawer's way out. On a wide window the collapse toggle above is
             the control that belongs there and this one is not laid out at all;
             inside the drawer there is nothing to collapse to, so the equivalent
             action is to close the drawer. -->
        <button
          class="close-btn"
          type="button"
          (click)="closeMobile.emit()"
          aria-label="Close navigation"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <ul class="nav-list">
        @for (item of navItems; track item.path) {
          <li>
            <a
              [routerLink]="'/' + item.path"
              [class.active]="isActive(item.path)"
              [attr.aria-current]="isActive(item.path) ? 'page' : null"
              class="nav-item"
              [title]="collapsed() ? item.label : ''"
              (click)="closeMobile.emit()"
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

      <div class="sidebar-footer">
        <!-- Pause, mute and focus, one tap from the navigation. It is also in the
             phone's top bar and Settings; this is the copy a desktop user meets
             without opening anything, and on a Linux session whose desktop does
             not draw tray icons it is the only one there is. -->
        <button
          type="button"
          class="quiet-btn"
          [class.active]="quiet.active()"
          [class.collapsed]="collapsed()"
          [attr.aria-label]="quiet.statusLabel()"
          [title]="quiet.statusLabel()"
          (click)="openQuiet()"
        >
          <span class="quiet-icon" aria-hidden="true">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
            @if (quiet.active()) {
              <span class="quiet-dot" aria-hidden="true"></span>
            }
          </span>
          @if (!collapsed()) {
            <span class="quiet-text">
              <span class="quiet-name">{{ quiet.statusLabel() }}</span>
              <span class="quiet-hint">Pause · mute · focus</span>
            </span>
          }
        </button>

        @if (!collapsed()) {
          <a
            class="version-badge"
            routerLink="/about"
            (click)="closeMobile.emit()"
            [attr.aria-label]="versionLabel + ' — about DeepWork and updates'"
            [title]="
              updates.hasUpdate()
                ? 'An update is available — open About'
                : 'About DeepWork and updates'
            "
          >
            <span>{{ versionLabel }}</span>
            @if (updates.hasUpdate()) {
              <span class="update-pill">Update</span>
            }
          </a>
        }
      </div>
    </nav>
  `,
  styles: [
    `
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
        background: linear-gradient(
          to bottom,
          rgba(139, 92, 246, 0.3) 0%,
          transparent 50%,
          rgba(6, 182, 212, 0.2) 100%
        );
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
        font-size: 18px;
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
        /* The sidebar is exactly as tall as the window and the list is taller
           than a short one: ten destinations plus the version badge do not fit
           in a 568px phone, and a flex item will not shrink below its content
           without this — the last two destinations simply slide off the bottom
           with nothing to scroll. Harmless on a tall window, where it never
           overflows and so never scrolls. */
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        -webkit-overflow-scrolling: touch;
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
        font-size: 14px;
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
        /* No glow on the glyph itself: a 4px drop-shadow turns an 18px stroke
           icon into a fuzzy shape. The accent colour already marks the row. */
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
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
        padding: var(--space-md) var(--space-sm);
        border-top: 1px solid var(--glass-border);
      }
      /* The quiet control is a row, not an icon floating in the footer: it is a
         state as much as a button, and "Paused until 14:30" has to be readable
         without opening it. Collapsed, it keeps its icon and its dot. */
      .quiet-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 40px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s,
          color 0.2s;
      }
      .quiet-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }
      .quiet-btn.active {
        border-color: var(--sidebar-active-border);
        background: var(--sidebar-active-bg);
        color: var(--color-text-primary);
      }
      .quiet-btn.collapsed {
        justify-content: center;
        padding: 8px;
      }
      .quiet-icon {
        position: relative;
        display: inline-flex;
        flex: 0 0 auto;
      }
      .quiet-dot {
        position: absolute;
        top: -2px;
        right: -3px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--color-accent-secondary);
        box-shadow: 0 0 0 2px var(--sidebar-bg);
      }
      .quiet-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.25;
      }
      .quiet-name {
        font-size: 12px;
        font-weight: 600;
        color: inherit;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .quiet-hint {
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .version-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 11px;
        color: var(--color-text-muted);
        padding: 4px 10px;
        background: var(--glass-bg);
        border-radius: 20px;
        border: 1px solid var(--glass-border);
        text-decoration: none;
        transition: all 0.2s;
      }
      .version-badge:hover {
        color: var(--color-text-primary);
        border-color: rgba(139, 92, 246, 0.35);
      }
      .update-pill {
        padding: 1px 7px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        color: #0b1020;
        background: var(--color-accent-secondary);
      }

      /* Not laid out on the desktop column, where the collapse toggle is the
         control that belongs. Declared before the mobile block on purpose: the
         two rules have the same specificity, so the last one in source order
         decides, and the drawer has to be able to turn this back on. */
      .close-btn {
        display: none;
      }

      /* ===== Mobile: the same sidebar, as an off-canvas drawer =====

         Below 900px a 240px column is a quarter of the window, so the sidebar
         leaves the row entirely and slides over the content instead. Nothing
         about *what* it does changes — the same nav items, the same active
         state, the same version badge — only where it is drawn.

         The host element is the layer. It is fixed to the window and spans it,
         so the drawer can be a full-height panel anchored to the left edge, but
         it is pointer-events: none so that everything except the panel itself
         falls through to the backdrop the shell puts underneath. */
      @media (max-width: 900px) {
        :host {
          position: fixed;
          inset: 0;
          /* One above the backdrop (85), and still below every page panel and
             dialog (100 and up) so a modal covers the navigation. */
          z-index: 90;
          display: block;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .sidebar,
        .sidebar.collapsed {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: min(288px, 86vw);
          /* 100% of the fixed host, not 100vh: the host is already the height
             of what the phone is actually showing. */
          height: 100%;
          padding: var(--space-lg) var(--space-md);
          padding-top: calc(var(--space-lg) + var(--safe-top));
          padding-bottom: calc(var(--space-lg) + var(--safe-bottom));
          padding-left: calc(var(--space-md) + var(--safe-left));
          /* Opaque, unlike the desktop column's translucent --sidebar-bg: this
             panel has the page's own cards directly behind it, and at 0.65
             alpha they read through it as text on top of text. */
          background: var(--surface-float);
          transform: translateX(-100%);
          pointer-events: auto;
          /* visibility rides along on the transform's own clock: the panel is
             hidden once it has finished leaving and visible the moment it
             starts arriving. Without it a closed drawer is still in the tab
             order and still read out by a screen reader — the inert attribute
             on the host is the second half of that promise, for the browsers
             that have it. */
          visibility: hidden;
          transition:
            transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
            visibility 0s linear 0.28s;
        }
        :host(.mobile-open) .sidebar {
          transform: translateX(0);
          visibility: visible;
          transition:
            transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
            visibility 0s linear 0s;
        }

        /* A thumb is not a mouse: the desktop rows are 14px text in a 40px row,
           which is under the 44px a touch target wants. */
        .nav-item {
          min-height: 46px;
          padding: 13px 14px;
          font-size: 15px;
        }
        .nav-label {
          font-size: 15px;
        }
        .nav-icon {
          width: 22px;
          height: 22px;
        }
        .sidebar-header {
          margin-bottom: var(--space-lg);
        }

        /* The quiet row is a control in the drawer, where the finger is, so it
           takes the same thumb-sized height as a navigation row. */
        .quiet-btn {
          min-height: 46px;
          padding: 10px 12px;
        }

        .toggle-btn {
          display: none;
        }
        .close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          margin-left: auto;
          padding: 0;
          border-radius: 10px;
          border: 1px solid var(--glass-border);
          background: var(--glass-bg);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .close-btn:hover {
          color: var(--color-text-primary);
          background: var(--glass-bg-hover);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .sidebar,
        .sidebar.collapsed,
        :host(.mobile-open) .sidebar,
        .sidebar.collapsed .nav-item,
        .nav-item,
        .close-btn,
        .version-badge {
          transition: none;
        }
      }
    `,
  ],
})
export class SidebarComponent {
  private readonly router = inject(Router);
  protected readonly updates = inject(UpdateService);
  protected readonly quiet = inject(QuietService);

  /**
   * Opens the quiet panel, closing the drawer underneath it.
   *
   * The drawer is a navigation surface and the panel is a modal over it; leaving
   * the drawer open would mean dismissing the panel lands back on a menu the
   * user had already finished with.
   */
  openQuiet(): void {
    this.closeMobile.emit();
    this.quiet.open();
  }

  /** The running version, shown at the foot of the sidebar and linked to About. */
  readonly versionLabel = formatVersion(APP_VERSION);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  isActive(path: string): boolean {
    const currentPath = this.currentUrl().split(/[?#]/)[0];
    if (path === '') return currentPath === '/' || currentPath === '/dashboard';
    return currentPath === '/' + path || currentPath.startsWith('/' + path + '/');
  }

  collapsed = input<boolean>(false);

  /**
   * True while the shell has the drawer open.
   *
   * Only ever set in the compact layout, where the shell also stops passing
   * `collapsed` — an icon rail inside a 288px drawer is unusable, so the drawer
   * always renders the full labels.
   */
  mobileOpen = input<boolean>(false);

  toggleCollapse = output<void>();

  /** Asks the shell to close the mobile drawer. Inert in the wide layout. */
  closeMobile = output<void>();

  navItems: NavItem[] = [
    {
      path: '',
      label: 'Dashboard',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    },
    {
      path: 'today',
      label: 'Today',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>',
    },
    {
      path: 'matrix',
      label: 'Matrix',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>',
    },
    {
      path: 'calendar',
      label: 'Calendar',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/></svg>',
    },
    {
      path: 'tasks',
      label: 'Tasks',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    },
    {
      path: 'analytics',
      label: 'Analytics',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    },
    {
      path: 'time',
      label: 'Time by Task',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.5"/><rect x="12" y="8" width="3" height="10" rx="0.5"/><rect x="17" y="5" width="3" height="13" rx="0.5"/></svg>',
    },
    {
      path: 'reminders',
      label: 'Reminders',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
    },
    {
      path: 'habits',
      label: 'Habits',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>',
    },
    {
      path: 'journal',
      label: 'Journal',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    },
    {
      path: 'settings',
      label: 'Settings',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    },
    {
      path: 'about',
      label: 'About',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    },
  ];
}
