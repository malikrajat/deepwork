import { Component, signal, inject, ChangeDetectionStrategy, OnInit, AfterViewInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { InstallBannerComponent } from './shared/components/install-banner/install-banner.component';
import { TimerService } from './core/services/timer.service';
import { UiService } from './core/services/ui.service';
import { SettingsService } from './core/services/settings.service';
import { DbService } from './core/services/db.service';

const PAGE_ROUTES = ['', 'tasks', 'matrix', 'today', 'analytics', 'habits', 'journal', 'settings'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SidebarComponent, ToastComponent, InstallBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'handleKeyboard($event)'
  }
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly timer = inject(TimerService);
  private readonly settingsService = inject(SettingsService);
  private readonly db = inject(DbService);
  ui = inject(UiService);

  sidebarCollapsed = signal(true);

  ngOnInit(): void {
    this.db.init().then(async () => {
      await this.settingsService.loadSettings();
    });
  }


  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }

  handleKeyboard(event: KeyboardEvent) {
    if (this.handleEscape(event)) return;
    if (this.handleFocusToggle(event)) return;
    if (this.handleQuickAdd(event)) return;
    if (this.handlePageNavigation(event)) return;
    this.handleSpaceTimer(event);
  }

  private handleEscape(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.ui.focusMode()) {
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

  private handleQuickAdd(event: KeyboardEvent): boolean {
    if (event.ctrlKey && !event.shiftKey && event.key === 'n') {
      event.preventDefault();
      this.router.navigate(['/tasks'], { queryParams: { add: 1 } });
      return true;
    }
    return false;
  }

  private handlePageNavigation(event: KeyboardEvent): boolean {
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      const num = Number.parseInt(event.key);
      if (num >= 1 && num <= 8) {
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
