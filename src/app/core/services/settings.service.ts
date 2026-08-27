import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { AppSettings, DEFAULT_SETTINGS, ThemePreference } from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly db = inject(DbService);

  settings = signal<AppSettings>({ ...DEFAULT_SETTINGS });

  async loadSettings(): Promise<void> {
    const s = await this.db.getSettings();
    if (s) {
      this.settings.set(s);
      // this.applyTheme(s.theme);
    }
  }

  async saveSettings(s: AppSettings): Promise<void> {
    this.settings.set(s);
    this.applyTheme(s.theme);
    await this.db.saveSettings(s);
  }

  async updateField<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    const current = this.settings();
    const updated = { ...current, [key]: value };
    await this.saveSettings(updated);
  }

  applyTheme(theme: ThemePreference): void {
    document.documentElement.dataset['theme'] = theme;
    try { localStorage.setItem('deepwork_theme', theme); } catch { /* private/storage-full */ }
  }
}
