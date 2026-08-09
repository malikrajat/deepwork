import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { form, FormField, min, max } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
import { SettingsService } from '../../core/services/settings.service';
import { ThemeService } from '../../core/services/theme.service';
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <span>Appearance</span>
        </div>
        <div class="setting-item">
          <span>Theme</span>
          <select [formField]="settingsForm.theme" (change)="persist('theme')">
            <option value="system">System (Auto)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <!-- Data -->
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
      background: var(--glass-bg); backdrop-filter: blur(16px);
      border: 1px solid rgba(139,92,246,0.08); border-radius: 16px;
      padding: var(--space-lg); transition: border-color 0.3s;
    }
    .setting-group:hover { border-color: rgba(139,92,246,0.15); }
    .group-header {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--color-text-muted);
      margin-bottom: var(--space-md); padding-bottom: var(--space-sm);
      border-bottom: 1px solid var(--glass-border);
    }
    .group-header svg { opacity: 0.5; }
    .setting-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 0; border-bottom: 1px solid var(--glass-border);
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
      background: var(--control-bg); color: var(--color-text-primary); font-size: 0.8rem;
    }
    select:focus { outline: none; border-color: rgba(139,92,246,0.5); }
    .action-btn {
      padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(139,92,246,0.2);
      background: rgba(139,92,246,0.06); color: var(--color-text-primary);
      font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s;
    }
    .action-btn:hover { background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.4); }
    kbd {
      padding: 3px 8px; border-radius: 5px; font-size: 0.7rem; font-weight: 600;
      background: var(--glass-bg); border: 1px solid var(--glass-border);
      color: var(--color-text-muted); font-family: 'JetBrains Mono', monospace;
    }
  `]
})
export class SettingsComponent implements OnInit {
  settingsService = inject(SettingsService);
  private readonly db = inject(DbService);
  private readonly theme = inject(ThemeService);

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
    this.settingsModel.set({
      workDuration: s.workDuration,
      shortBreak: s.shortBreak,
      longBreak: s.longBreak,
      sessionsBeforeLongBreak: s.sessionsBeforeLongBreak,
      notificationSound: s.notificationSound,
      notificationRepeatInterval: s.notificationRepeatInterval,
      theme: s.theme,
    });
  }

  async persist(key: string): Promise<void> {
    const value = (this.settingsModel() as any)[key];
    await this.settingsService.updateField(key as any, value);
  }

  async exportData(): Promise<void> {
    const data = await this.db.exportAll();
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
      if (!data.version || (!Array.isArray(data.sessions) && !Array.isArray(data.tasks))) {
        alert('Invalid DeepWork export file.');
        return;
      }
      if (!confirm('This will overwrite your current data. Continue?')) return;
      await this.db.importBackup(data);
      await this.settingsService.loadSettings();
      this.theme.apply();
      const s = this.settingsService.settings();
      this.settingsModel.set({
        workDuration: s.workDuration,
        shortBreak: s.shortBreak,
        longBreak: s.longBreak,
        sessionsBeforeLongBreak: s.sessionsBeforeLongBreak,
        notificationSound: s.notificationSound,
        notificationRepeatInterval: s.notificationRepeatInterval,
        theme: s.theme,
      });
      alert('Import complete! All data has been restored.');
    } catch {
      alert('Failed to parse import file.');
    } finally {
      (event.target as HTMLInputElement).value = '';
    }
  }
}
