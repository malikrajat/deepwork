import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiService {
  focusMode = signal(false);

  toggleFocusMode(): void {
    this.focusMode.update(v => !v);
  }

  enterFocusMode(): void {
    this.focusMode.set(true);
  }

  exitFocusMode(): void {
    this.focusMode.set(false);
  }
}
