import { Component, signal, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  sidebarCollapsed = signal(false);

  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    // Ctrl+Shift+F = Focus Mode (placeholder)
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
    }
    // Ctrl+1-8 = Navigate to pages
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      const num = parseInt(event.key);
      if (num >= 1 && num <= 8) {
        event.preventDefault();
      }
    }
  }
}
