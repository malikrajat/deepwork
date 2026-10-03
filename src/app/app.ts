import { Component, signal, inject, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { InstallBannerComponent } from './shared/components/install-banner/install-banner.component';
import { WelcomePrefsDialogComponent } from './shared/components/welcome-prefs-dialog/welcome-prefs-dialog.component';
import { MiniWidgetComponent } from './shared/components/mini-widget/mini-widget.component';
import { QuickAddComponent } from './shared/components/quick-add/quick-add.component';
import { UpdatePromptComponent } from './shared/components/update-prompt/update-prompt.component';
import { WaterNudgeComponent } from './shared/components/water-nudge/water-nudge.component';
import { TimerService } from './core/services/timer.service';
import { UiService } from './core/services/ui.service';
import { SettingsService } from './core/services/settings.service';
import { DbService } from './core/services/db.service';
import { UpdatePromptService } from './core/services/update-prompt.service';
import { NotificationService } from './core/services/notification.service';

const PAGE_ROUTES = [
  '',
  'today',
  'matrix',
  'calendar',
  'tasks',
  'analytics',
  'habits',
  'journal',
  'settings',
  'about',
];

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    SidebarComponent,
    ToastComponent,
    InstallBannerComponent,
    WelcomePrefsDialogComponent,
    MiniWidgetComponent,
    QuickAddComponent,
    UpdatePromptComponent,
    WaterNudgeComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'handleKeyboard($event)',
  },
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly timer = inject(TimerService);
  private readonly settingsService = inject(SettingsService);
  private readonly db = inject(DbService);
  private readonly updatePrompt = inject(UpdatePromptService);
  private readonly notifications = inject(NotificationService);
  ui = inject(UiService);

  sidebarCollapsed = signal(false);

  ngOnInit(): void {
    this.db.init().then(async () => {
      await this.settingsService.loadSettings();
    });
    // Asked for once, at the app's own startup rather than on one page's: a
    // finished session has to be able to reach the desktop from wherever the
    // user happens to be, and that includes the pages that never asked.
    void this.notifications.init();
    // Asks GitHub whether a newer release exists, once per check interval, and
    // tells the user if there is something to install. Not awaited: a slow
    // network must never hold up the window.
    void this.updatePrompt.start();
  }

  toggleSidebar() {
    this.sidebarCollapsed.update((v) => !v);
  }

  handleKeyboard(event: KeyboardEvent) {
    if (this.handleEscape(event)) return;
    if (this.handleFocusToggle(event)) return;
    if (this.handlePageNavigation(event)) return;
    this.handleSpaceTimer(event);
  }

  private handleEscape(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    // The widget is reachable from every page — the system minimise button does
    // not care which route is open — so it has to answer to Esc from here.
    if (this.ui.isMiniMode()) {
      event.preventDefault();
      void this.ui.exitMiniMode();
      return true;
    }
    if (this.ui.focusMode()) {
      event.preventDefault();
      this.ui.exitFocusMode();
      return true;
    }
    return false;
  }

  private handleFocusToggle(event: KeyboardEvent): boolean {
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      this.ui.toggleFocusMode();
      return true;
    }
    return false;
  }

  private handlePageNavigation(event: KeyboardEvent): boolean {
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      const num = Number.parseInt(event.key);
      if (num >= 1 && num <= PAGE_ROUTES.length) {
        event.preventDefault();
        this.router.navigate(['/' + PAGE_ROUTES[num - 1]]);
        return true;
      }
    }
    return false;
  }

  private handleSpaceTimer(event: KeyboardEvent): void {
    if (event.code !== 'Space' || this.isInputFocused(event)) return;
    const url = this.router.url;
    if (url === '/' || url === '/dashboard' || url === '') {
      event.preventDefault();
      if (this.timer.isRunning()) {
        this.timer.pause();
      } else {
        this.timer.start();
      }
    }
  }

  private isInputFocused(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
  }
}
