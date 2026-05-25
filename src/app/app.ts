import { Component, signal, HostListener, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { TimerService } from './core/services/timer.service';

const PAGE_ROUTES = ['dashboard', 'tasks', 'matrix', 'today', 'analytics', 'habits', 'journal', 'settings'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private router = inject(Router);
  private timer = inject(TimerService);

  sidebarCollapsed = signal(false);

  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    // Ctrl+Shift+F = Focus Mode (placeholder)
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      return;
    }
    // Ctrl+1-8 = Navigate to pages
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      const num = parseInt(event.key);
      if (num >= 1 && num <= 8) {
        event.preventDefault();
        this.router.navigate(['/' + PAGE_ROUTES[num - 1]]);
        return;
      }
    }
    // Space = Start/Pause timer (only if not typing in an input)
    if (event.code === 'Space' && !this.isInputFocused(event)) {
      const url = this.router.url;
      if (url === '/dashboard' || url === '/') {
        event.preventDefault();
        if (this.timer.isRunning()) {
          this.timer.pause();
        } else {
          this.timer.start();
        }
      }
    }
  }

  private isInputFocused(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
  }
}
