import { Injectable, inject, effect } from '@angular/core';
import { SettingsService } from './settings.service';
import { ThemePreference } from '../models/settings.model';

export type EffectiveTheme = 'light' | 'dark';

/**
 * Resolves and applies the effective theme (system / light / dark) to the
 * document root. When set to `system`, follows the OS preference live.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly settings = inject(SettingsService);

  private readonly media: MediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  constructor() {
    this.apply();
    effect(() => this.apply());
    this.media?.addEventListener('change', () => this.apply());
  }

  apply(): void {
    if (typeof document === 'undefined') return;

    const choice: ThemePreference = this.settings.settings().theme;
    const effective: EffectiveTheme =
      choice === 'light' || choice === 'dark'
        ? choice
        : this.media?.matches
          ? 'dark'
          : 'light';

    const root = document.documentElement;
    root.classList.toggle('theme-light', effective === 'light');
    root.classList.toggle('theme-dark', effective === 'dark');
    root.style.colorScheme = effective;
  }
}
