import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { form, FormField, min, max } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
import { SettingsService } from '../../core/services/settings.service';
import { InstallService } from '../../core/services/install.service';
import { SettingsFormModel, createSettingsFormDefaults } from '../../shared/models/form.models';

@Component({
  selector: 'app-settings',
  imports: [FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <h1 class="gradient-text page-title">Settings</h1>
      <p class="page-subtitle">Configure your experience</p>
    </div>
    <div class="settings-grid animate-fade-in-delay-1">
      <!-- Timer -->
      <div class="setting-group">
        <div class="group-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          <span>Timer</span>
        </div>
        <div class="setting-item">
          <span>Focus Duration</span>
          <div class="range-control">
            <input type="range" [formField]="settingsForm.workDuration" step="300" (change)="persist('workDuration')" />
            <span class="range-value">{{ settingsModel().workDuration / 60 }} min</span>
          </div>
        </div>
        <div class="setting-item">
          <span>Short Break</span>
          <div class="range-control">
            <input type="range" [formField]="settingsForm.shortBreak" step="60" (change)="persist('shortBreak')" />
            <span class="range-value">{{ settingsModel().shortBreak / 60 }} min</span>
          </div>
        </div>
        <div class="setting-item">
          <span>Long Break</span>
          <div class="range-control">
            <input type="range" [formField]="settingsForm.longBreak" step="60" (change)="persist('longBreak')" />
            <span class="range-value">{{ settingsModel().longBreak / 60 }} min</span>
          </div>
        </div>
        <div class="setting-item">
          <span>Sessions Until Long Break</span>
          <div class="range-control">
            <input type="range" [formField]="settingsForm.sessionsBeforeLongBreak" step="1" (change)="persist('sessionsBeforeLongBreak')" />
            <span class="range-value">{{ settingsModel().sessionsBeforeLongBreak }}</span>
          </div>
        </div>
      </div>

      <!-- Notifications -->
      <div class="setting-group">
        <div class="group-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          <span>Notifications</span>
        </div>
        <div class="setting-item">
          <span>Sound</span>
          <select [formField]="settingsForm.notificationSound" (change)="persist('notificationSound')">
            <option value="bell">Bell</option>
            <option value="chime">Chime</option>
            <option value="ding">Ding</option>
            <option value="none">None</option>
          </select>
        </div>
        <div class="setting-item">
          <span>Repeat Reminder Every</span>
          <div class="range-control">
            <input type="range" [formField]="settingsForm.notificationRepeatInterval" step="30" (change)="persist('notificationRepeatInterval')" />
            <span class="range-value">{{ settingsModel().notificationRepeatInterval }} sec</span>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div class="setting-group">
        <div class="group-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          <span>Appearance</span>
        </div>
        <div class="setting-item">
          <span>Theme</span>
          <div class="theme-switcher">
            <button class="theme-btn" [class.active]="activeTheme() === 'light'" (click)="setTheme('light')" title="Light">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
              Light
            </button>
            <button class="theme-btn" [class.active]="activeTheme() === 'dark'" (click)="setTheme('dark')" title="Dark">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              Dark
            </button>
            <button class="theme-btn" [class.active]="activeTheme() === 'auto'" (click)="setTheme('auto')" title="Follow system">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Auto
            </button>
          </div>
        </div>
        @if (installService.canInstall()) {
          <div class="setting-item">
            <span>Install as desktop app</span>
            <button class="action-btn install-app-btn" (click)="installService.install()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Install App
            </button>
          </div>
        }
        @if (!installService.canInstall() && !installService.isInstalled()) {
          <div class="setting-item install-hint-item">
            <span>Install as desktop app</span>
            <span class="install-hint">
              Look for the
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:text-bottom"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              icon in the address bar, or open browser menu → <em>Install DeepWork…</em>
            </span>
          </div>
        }
        @if (installService.isInstalled()) {
          <div class="setting-item">
            <span>Install as desktop app</span>
            <span class="installed-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
              Installed
            </span>
          </div>
        }
      </div>
      <div class="setting-group">
        <div class="group-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Data</span>
        </div>
        <div class="setting-item">
          <span>Export all data</span>
          <button class="action-btn" (click)="exportData()">Export JSON</button>
        </div>
        <div class="setting-item">
          <span>Import data</span>
          <button class="action-btn" (click)="importData()">Import</button>
          <input #fileInput type="file" accept=".json" style="display:none" (change)="onFileSelected($event)" />
        </div>
      </div>

      <!-- Shortcuts -->
      <div class="setting-group">
        <div class="group-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h.01M18 16h.01M10 16h4"/></svg>
          <span>Keyboard Shortcuts</span>
        </div>
        <div class="setting-item"><span>Start/Pause Timer</span><kbd>Space</kbd></div>
        <div class="setting-item"><span>Toggle Focus Mode</span><kbd>Ctrl+Shift+F</kbd></div>
        <div class="setting-item"><span>Quick Add Task</span><kbd>Ctrl+N</kbd></div>
        <div class="setting-item"><span>Navigate Pages</span><kbd>Ctrl+1–8</kbd></div>
        <div class="setting-item"><span>Exit Focus / Close</span><kbd>Esc</kbd></div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page-header { margin-bottom: var(--space-xl); }
    .page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.85rem; }
    .settings-grid { display: flex; flex-direction: column; gap: var(--space-md); max-width: 560px; }
    .setting-group {
      background: rgba(255,255,255,0.02); backdrop-filter: blur(16px);
      border: 1px solid rgba(139,92,246,0.08); border-radius: 16px;
      padding: var(--space-lg); transition: border-color 0.3s;
    }
    .setting-group:hover { border-color: rgba(139,92,246,0.15); }
    .group-header {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--color-text-muted);
      margin-bottom: var(--space-md); padding-bottom: var(--space-sm);
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .group-header svg { opacity: 0.5; }
    .setting-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
      font-size: 0.85rem; color: var(--color-text-secondary);
    }
    .setting-item:last-child { border-bottom: none; }

    .range-control { display: flex; align-items: center; gap: 10px; }
    .range-value {
      font-weight: 600; color: var(--color-text-primary); min-width: 52px; text-align: right;
      padding: 4px 10px; background: rgba(139,92,246,0.08); border-radius: 6px; font-size: 0.8rem;
    }
    input[type="range"] {
      width: 120px; accent-color: rgb(139,92,246); cursor: pointer;
    }
    select {
      padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(139,92,246,0.2);
      background: rgba(255,255,255,0.03); color: var(--color-text-primary); font-size: 0.8rem;
    }
    select:focus { outline: none; border-color: rgba(139,92,246,0.5); }
    .action-btn {
      padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(139,92,246,0.2);
      background: rgba(139,92,246,0.06); color: var(--color-text-primary);
      font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s;
    }
    .action-btn:hover { background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.4); }
    .install-app-btn {
      display: flex; align-items: center; gap: 6px;
      background: rgba(139,92,246,0.10); border-color: rgba(139,92,246,0.35);
    }
    .install-app-btn:hover { background: rgba(139,92,246,0.22); border-color: rgba(139,92,246,0.6); }
    .install-hint-item { flex-wrap: wrap; gap: 6px; }
    .install-hint {
      display: flex; align-items: center; gap: 4px;
      font-size: 0.75rem; color: var(--color-text-muted);
      font-style: italic;
    }
    .installed-badge {
      display: flex; align-items: center; gap: 5px;
      font-size: 0.75rem; font-weight: 600;
      color: var(--color-success);
      padding: 4px 10px; border-radius: 6px;
      background: rgba(52,211,153,0.10);
      border: 1px solid rgba(52,211,153,0.2);
    }
    kbd {
      padding: 3px 8px; border-radius: 5px; font-size: 0.7rem; font-weight: 600;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
      color: var(--color-text-muted); font-family: 'JetBrains Mono', monospace;
    }
    .theme-switcher {
      display: flex; gap: 4px;
      background: rgba(255,255,255,0.04); padding: 3px; border-radius: 10px;
      border: 1px solid rgba(139,92,246,0.12);
    }
    .theme-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 12px; border-radius: 7px; border: none;
      background: transparent; color: var(--color-text-secondary);
      font-size: 0.75rem; font-weight: 500; cursor: pointer;
      transition: all 0.2s; line-height: 1;
    }
    .theme-btn:hover { background: rgba(139,92,246,0.10); color: var(--color-text-primary); }
    .theme-btn.active {
      background: rgba(139,92,246,0.18); color: var(--color-accent-primary);
      box-shadow: 0 0 12px rgba(139,92,246,0.15);
    }
  `]
})
export class SettingsComponent implements OnInit {
  settingsService = inject(SettingsService);
  protected readonly installService = inject(InstallService);
  private readonly db = inject(DbService);

  readonly activeTheme = signal<'dark' | 'light' | 'auto'>('dark');
  readonly settingsModel = signal<SettingsFormModel>(createSettingsFormDefaults());
  readonly settingsForm = form(this.settingsModel, (s) => {
    // Timer duration ranges (in seconds)
    min(s.workDuration, 300, { message: 'Minimum 5 minutes' });
    max(s.workDuration, 5400, { message: 'Maximum 90 minutes' });
    min(s.shortBreak, 60, { message: 'Minimum 1 minute' });
    max(s.shortBreak, 1800, { message: 'Maximum 30 minutes' });
    min(s.longBreak, 300, { message: 'Minimum 5 minutes' });
    max(s.longBreak, 3600, { message: 'Maximum 60 minutes' });
    min(s.sessionsBeforeLongBreak, 2, { message: 'Minimum 2 sessions' });
    max(s.sessionsBeforeLongBreak, 8, { message: 'Maximum 8 sessions' });
    min(s.notificationRepeatInterval, 30, { message: 'Minimum 30 seconds' });
    max(s.notificationRepeatInterval, 300, { message: 'Maximum 5 minutes' });
  });

  ngOnInit(): void {
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    await this.db.init();
    await this.settingsService.loadSettings();
    // Sync the service settings into our form model
    const s = this.settingsService.settings();
    this.activeTheme.set(s.theme ?? 'dark');
    this.settingsModel.set({
      workDuration: s.workDuration,
      shortBreak: s.shortBreak,
      longBreak: s.longBreak,
      sessionsBeforeLongBreak: s.sessionsBeforeLongBreak,
      notificationSound: s.notificationSound,
      notificationRepeatInterval: s.notificationRepeatInterval,
      trayBehavior: s.trayBehavior,
      theme: s.theme ?? 'dark',
    });
  }

  async setTheme(theme: 'dark' | 'light' | 'auto'): Promise<void> {
    this.activeTheme.set(theme);
    await this.settingsService.updateField('theme', theme);
  }

  async persist(key: string): Promise<void> {
    const value = (this.settingsModel() as any)[key];
    await this.settingsService.updateField(key as any, value);
  }

  async exportData(): Promise<void> {
    const [sessions, tasks, habits, habitEntries, journal, settings] = await Promise.all([
      this.db.getAllSessions(),
      this.db.getTasks(),
      this.db.getHabits(),
      this.db.getAllHabitEntries(),
      this.db.getJournalEntries(),
      this.db.getSettings(),
    ]);
    const data = { version: 1, exportedAt: new Date().toISOString(), sessions, tasks, habits, habitEntries, journal, settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepwork-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importData(): void {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input?.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!data.version || !data.sessions) {
        alert('Invalid DeepWork export file.');
        return;
      }
      if (!confirm('This will overwrite your current data. Continue?')) return;
      // Import sessions
      for (const s of data.sessions ?? []) {
        await this.db.saveSession(s);
      }
      // Import settings
      if (data.settings) {
        await this.db.saveSettings(data.settings);
        await this.settingsService.loadSettings();
      }
      alert('Import complete! Restart app for full effect.');
    } catch {
      alert('Failed to parse import file.');
    }
  }
}
