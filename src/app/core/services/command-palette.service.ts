import { Injectable, signal } from '@angular/core';

/**
 * The one switch for the app-wide quick-jump palette.
 *
 * The dashboard has had a command palette of its own since the redesign; every
 * other page still made the user walk the sidebar. The state lives here so the
 * shell (Ctrl/Cmd+K), the sidebar's "Jump to anything" row and the palette
 * component itself can open the same surface without owning each other.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly openState = signal(false);

  /** True while the palette is on screen. */
  readonly open = this.openState.asReadonly();

  show(): void {
    this.openState.set(true);
  }

  hide(): void {
    this.openState.set(false);
  }

  toggle(): void {
    this.openState.update((value) => !value);
  }
}
