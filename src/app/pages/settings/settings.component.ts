import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { form, FormField, min, max } from '@angular/forms/signals';
import {
  WATER_AMOUNT_OPTIONS,
  WATER_GOAL_OPTIONS,
  WATER_INTERVAL_OPTIONS,
} from '../../core/constants/water.constants';
import { ALERT_SHAKE_OPTIONS, formatShakeDuration } from '../../core/constants/alert.constants';
import { DbService } from '../../core/services/db.service';
import { SettingsService } from '../../core/services/settings.service';
import { ThemeService } from '../../core/services/theme.service';
import { InstallService } from '../../core/services/install.service';
import { ThemePreference } from '../../core/models/settings.model';
import { NotificationService } from '../../core/services/notification.service';
import { TaskService } from '../../core/services/task.service';
import { WaterReminderService } from '../../core/services/water-reminder.service';
import { formatMillilitres, parseTimeOfDay } from '../../core/utils/water.util';
import { DesktopPrefsPanelComponent } from '../../shared/components/desktop-prefs-panel/desktop-prefs-panel.component';
import { LogsPanelComponent } from '../../shared/components/logs-panel/logs-panel.component';
import { SettingsFormModel, createSettingsFormDefaults } from '../../shared/models/form.models';

@Component({
  selector: 'app-settings',
  imports: [FormField, DesktopPrefsPanelComponent, LogsPanelComponent],
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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <span>Timer</span>
        </div>
        <div class="setting-item">
          <span>Focus Duration</span>
          <div class="range-control">
            <input
              type="range"
              [formField]="settingsForm.workDuration"
              step="300"
              (change)="persist('workDuration')"
            />
            <span class="range-value">{{ settingsModel().workDuration / 60 }} min</span>
          </div>
        </div>
        <div class="setting-item">
          <span>Short Break</span>
          <div class="range-control">
            <input
              type="range"
              [formField]="settingsForm.shortBreak"
              step="60"
              (change)="persist('shortBreak')"
            />
            <span class="range-value">{{ settingsModel().shortBreak / 60 }} min</span>
          </div>
        </div>
        <div class="setting-item">
          <span>Long Break</span>
          <div class="range-control">
            <input
              type="range"
              [formField]="settingsForm.longBreak"
              step="60"
              (change)="persist('longBreak')"
            />
            <span class="range-value">{{ settingsModel().longBreak / 60 }} min</span>
          </div>
        </div>
        <div class="setting-item">
          <span>Sessions Until Long Break</span>
          <div class="range-control">
            <input
              type="range"
              [formField]="settingsForm.sessionsBeforeLongBreak"
              step="1"
              (change)="persist('sessionsBeforeLongBreak')"
            />
            <span class="range-value">{{ settingsModel().sessionsBeforeLongBreak }}</span>
          </div>
        </div>
      </div>

      <!-- Tasks -->
      <div class="setting-group">
        <div class="group-header">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M10 6h10M10 12h10M10 18h10" />
            <path d="M4 6l1 1 2-2.5" />
            <path d="M4 12l1 1 2-2.5" />
            <path d="M4 18l1 1 2-2.5" />
          </svg>
          <span>Tasks</span>
        </div>
        <div class="setting-item">
          <span>
            Carry forward unfinished tasks
            <small class="setting-note"
              >On, work you did not get to keeps its place and stays open. Off, a task is marked
              done once its own day has passed — a Tuesday task left unfinished is closed on
              Wednesday. Turning this off closes the past-due work you already have</small
            >
          </span>
          <div class="toggle-control">
            <button
              type="button"
              class="switch"
              role="switch"
              [attr.aria-checked]="settingsModel().carryForwardTasks"
              [class.on]="settingsModel().carryForwardTasks"
              (click)="toggleCarryForwardTasks()"
            >
              <span class="knob"></span>
            </button>
          </div>
        </div>
      </div>

      <!-- Notifications -->
      <div class="setting-group">
        <div class="group-header">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          <span>Notifications</span>
        </div>
        <div class="setting-item">
          <span>Sound</span>
          <div class="sound-control">
            <select
              [formField]="settingsForm.notificationSound"
              (change)="updateNotificationSound()"
            >
              <option value="bell">Bell</option>
              <option value="chime">Chime</option>
              <option value="ding">Ding</option>
              <option value="none">None</option>
            </select>
            <button
              type="button"
              class="action-btn preview-btn"
              (click)="previewNotificationSound()"
            >
              Preview
            </button>
          </div>
        </div>
        <div class="setting-item">
          <span>Repeat Reminder Every</span>
          <div class="range-control">
            <input
              type="range"
              [formField]="settingsForm.notificationRepeatInterval"
              step="30"
              (change)="persist('notificationRepeatInterval')"
            />
            <span class="range-value">{{ settingsModel().notificationRepeatInterval }} sec</span>
          </div>
        </div>
        <div class="setting-item">
          <span>
            Alert shake
            <small class="setting-note"
              >How long the mini widget shakes on every repeat of a finished session — long enough
              to outlast the tone</small
            >
          </span>
          <select [value]="settingsModel().alertShakeMs" (change)="setAlertShake($event)">
            @for (option of alertShakeOptions; track option) {
              <option [value]="option" [selected]="option === settingsModel().alertShakeMs">
                {{ formatShake(option) }}
              </option>
            }
          </select>
        </div>
      </div>

      <!-- Water: four questions, and every answer is a fixed choice -->
      <div class="setting-group">
        <div class="group-header">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 2.7 6.9 8.4a7 7 0 1 0 10.2 0z" />
          </svg>
          <span>Water Reminder</span>
        </div>
        <div class="setting-item">
          <span>
            Remind me to drink
            <small class="setting-note"
              >A quote and a question during your working hours, with your notification sound — only
              Yes or Not now closes it</small
            >
          </span>
          <div class="toggle-control">
            <button
              type="button"
              class="switch"
              role="switch"
              [attr.aria-checked]="settingsModel().waterReminders"
              [class.on]="settingsModel().waterReminders"
              (click)="toggleWaterReminders()"
            >
              <span class="knob"></span>
            </button>
            <button type="button" class="action-btn preview-btn" (click)="testWaterReminder()">
              Test
            </button>
          </div>
        </div>
        <div class="setting-item">
          <span>Working hours from</span>
          <input
            type="time"
            [value]="settingsModel().waterStart"
            [disabled]="!settingsModel().waterReminders"
            (change)="setWaterTime('waterStart', $event)"
          />
        </div>
        <div class="setting-item">
          <span>Working hours to</span>
          <input
            type="time"
            [value]="settingsModel().waterEnd"
            [disabled]="!settingsModel().waterReminders"
            (change)="setWaterTime('waterEnd', $event)"
          />
        </div>
        <div class="setting-item">
          <span>
            Remind me every
            <small class="setting-note"
              >Every quarter hour to every three hours — nothing to type</small
            >
          </span>
          <select
            [value]="settingsModel().waterIntervalMinutes"
            [disabled]="!settingsModel().waterReminders"
            (change)="setWaterOption('waterIntervalMinutes', $event)"
          >
            @for (option of waterIntervalOptions; track option) {
              <option [value]="option" [selected]="option === settingsModel().waterIntervalMinutes">
                {{ option }} min
              </option>
            }
          </select>
        </div>
        <div class="setting-item">
          <span>
            One drink counts as
            <small class="setting-note">A sip at 30 ml up to a full bottle at 1 L</small>
          </span>
          <select
            [value]="settingsModel().waterAmountMl"
            [disabled]="!settingsModel().waterReminders"
            (change)="setWaterOption('waterAmountMl', $event)"
          >
            @for (option of waterAmountOptions; track option) {
              <option [value]="option" [selected]="option === settingsModel().waterAmountMl">
                {{ formatWater(option) }}
              </option>
            }
          </select>
        </div>
        <div class="setting-item">
          <span>Daily target</span>
          <select
            [value]="settingsModel().waterGoalMl"
            [disabled]="!settingsModel().waterReminders"
            (change)="setWaterOption('waterGoalMl', $event)"
          >
            @for (option of waterGoalOptions; track option) {
              <option [value]="option" [selected]="option === settingsModel().waterGoalMl">
                {{ formatWater(option) }}
              </option>
            }
          </select>
        </div>
        <div class="setting-item">
          <span>
            While minimised
            <small class="setting-note"
              >Ring and count the drink above instead of asking — the mini widget is left where it
              is, so the full window never jumps back over your work</small
            >
          </span>
          <div class="toggle-control">
            <button
              type="button"
              class="switch"
              role="switch"
              [attr.aria-checked]="settingsModel().waterAutoLogWhenMinimized"
              [class.on]="settingsModel().waterAutoLogWhenMinimized"
              [disabled]="!settingsModel().waterReminders"
              (click)="toggleWaterAutoLogWhenMinimized()"
            >
              <span class="knob"></span>
            </button>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div class="setting-group">
        <div class="group-header">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            />
          </svg>
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
        @if (installService.canInstall()) {
          <div class="setting-item">
            <span>Install as desktop app</span>
            <button class="action-btn install-app-btn" (click)="installService.install()">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Install App
            </button>
          </div>
        }
        @if (
          !installService.isDesktopApp &&
          !installService.canInstall() &&
          !installService.isInstalled()
        ) {
          <div class="setting-item install-hint-item">
            <span>Install as desktop app</span>
            <span class="install-hint">
              Look for the
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                style="display:inline;vertical-align:text-bottom"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              icon in the address bar, or open browser menu → <em>Install DeepWork…</em>
            </span>
          </div>
        }
        @if (installService.isInstalled()) {
          <div class="setting-item">
            <span>Install as desktop app</span>
            <span class="installed-badge">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <polyline points="20,6 9,17 4,12" />
              </svg>
              Installed
            </span>
          </div>
        }
      </div>
      <!-- Desktop behaviour: start with system + always on top -->
      <div class="setting-group">
        <app-desktop-prefs-panel title="Desktop Behaviour" />
      </div>

      <div class="setting-group">
        <div class="group-header">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Data</span>
        </div>
        <div class="setting-item">
          <span>Export all data</span>
          <button class="action-btn" (click)="exportData()">Export JSON</button>
        </div>
        <div class="setting-item">
          <span>Import data</span>
          <button class="action-btn" (click)="importData()">Import</button>
          <input
            #fileInput
            type="file"
            accept=".json"
            style="display:none"
            (change)="onFileSelected($event)"
          />
        </div>
      </div>

      <!-- Where DeepWork writes down what went wrong, and how to open it -->
      <div class="setting-group">
        <app-logs-panel />
      </div>

      <!-- Shortcuts -->
      <div class="setting-group">
        <div class="group-header">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h.01M18 16h.01M10 16h4" />
          </svg>
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
  styles: [
    `
      :host {
        display: block;
      }
      .page-header {
        margin-bottom: var(--space-xl);
      }
      .page-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .page-subtitle {
        color: var(--color-text-muted);
        margin-top: 4px;
        font-size: 14px;
      }
      .settings-grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
        max-width: 560px;
      }
      .setting-group {
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.08);
        border-radius: 16px;
        padding: var(--space-lg);
        transition: border-color 0.3s;
      }
      .setting-group:hover {
        border-color: rgba(139, 92, 246, 0.15);
      }
      .group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted);
        margin-bottom: var(--space-md);
        padding-bottom: var(--space-sm);
        border-bottom: 1px solid var(--glass-border);
      }
      .group-header svg {
        opacity: 0.5;
      }
      .setting-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid var(--glass-border);
        font-size: 14px;
        color: var(--color-text-secondary);
      }
      .setting-item:last-child {
        border-bottom: none;
      }

      .range-control {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .sound-control {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .toggle-control {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .setting-note {
        display: block;
        font-size: 10px;
        color: var(--color-text-muted);
        margin-top: 2px;
      }
      .switch {
        width: 42px;
        height: 22px;
        border-radius: 999px;
        cursor: pointer;
        padding: 0;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid var(--glass-border);
        position: relative;
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .switch .knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--color-text-muted);
        transition:
          transform 0.2s,
          background 0.2s;
      }
      .switch.on {
        background: rgba(139, 92, 246, 0.35);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .switch.on .knob {
        transform: translateX(20px);
        background: #ede9fe;
      }
      .switch:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .range-value {
        font-weight: 600;
        color: var(--color-text-primary);
        min-width: 52px;
        text-align: right;
        padding: 4px 10px;
        background: rgba(139, 92, 246, 0.08);
        border-radius: 6px;
        font-size: 13px;
      }
      input[type='range'] {
        width: 120px;
        accent-color: rgb(139, 92, 246);
        cursor: pointer;
      }
      select {
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid rgba(139, 92, 246, 0.2);
        background: var(--control-bg);
        color: var(--color-text-primary);
        font-size: 13px;
      }
      select:focus {
        outline: none;
        border-color: rgba(139, 92, 246, 0.5);
      }
      .action-btn {
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid rgba(139, 92, 246, 0.2);
        background: rgba(139, 92, 246, 0.06);
        color: var(--color-text-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .action-btn:hover {
        background: rgba(139, 92, 246, 0.12);
        border-color: rgba(139, 92, 246, 0.4);
      }
      .install-app-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(139, 92, 246, 0.1);
        border-color: rgba(139, 92, 246, 0.35);
      }
      .install-app-btn:hover {
        background: rgba(139, 92, 246, 0.22);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .install-hint-item {
        flex-wrap: wrap;
        gap: 6px;
      }
      .install-hint {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--color-text-muted);
        font-style: italic;
      }
      .installed-badge {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        color: var(--color-success);
        padding: 4px 10px;
        border-radius: 6px;
        background: rgba(52, 211, 153, 0.1);
        border: 1px solid rgba(52, 211, 153, 0.2);
      }
      kbd {
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        font-family: 'JetBrains Mono', monospace;
      }
      .theme-switcher {
        display: flex;
        gap: 4px;
        background: rgba(255, 255, 255, 0.04);
        padding: 3px;
        border-radius: 10px;
        border: 1px solid rgba(139, 92, 246, 0.12);
      }
      .theme-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        line-height: 1;
      }
      .theme-btn:hover {
        background: rgba(139, 92, 246, 0.1);
        color: var(--color-text-primary);
      }
      .theme-btn.active {
        background: rgba(139, 92, 246, 0.18);
        color: var(--color-accent-primary);
        box-shadow: 0 0 12px rgba(139, 92, 246, 0.15);
      }
    `,
  ],
})
export class SettingsComponent implements OnInit {
  settingsService = inject(SettingsService);
  protected readonly installService = inject(InstallService);
  private readonly db = inject(DbService);
  private readonly theme = inject(ThemeService);
  private readonly notifications = inject(NotificationService);
  private readonly waterReminder = inject(WaterReminderService);
  private readonly taskService = inject(TaskService);

  /** The fixed choices the water reminder offers. */
  protected readonly waterIntervalOptions = WATER_INTERVAL_OPTIONS;
  protected readonly waterAmountOptions = WATER_AMOUNT_OPTIONS;
  protected readonly waterGoalOptions = WATER_GOAL_OPTIONS;
  protected readonly formatWater = formatMillilitres;

  /** The fixed choices the alert's shake offers, and how they read. */
  protected readonly alertShakeOptions = ALERT_SHAKE_OPTIONS;
  protected readonly formatShake = formatShakeDuration;

  readonly activeTheme = signal<ThemePreference>('system');
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
      alertShakeMs: s.alertShakeMs,
      trayBehavior: s.trayBehavior,
      theme: s.theme,
      waterReminders: s.waterReminders,
      waterStart: s.waterStart,
      waterEnd: s.waterEnd,
      waterIntervalMinutes: s.waterIntervalMinutes,
      waterAmountMl: s.waterAmountMl,
      waterGoalMl: s.waterGoalMl,
      waterAutoLogWhenMinimized: s.waterAutoLogWhenMinimized,
      carryForwardTasks: s.carryForwardTasks,
    });
  }

  /** Turns the water reminder on or off, and lets the loop re-plan at once. */
  async toggleWaterReminders(): Promise<void> {
    const next = !this.settingsModel().waterReminders;
    this.settingsModel.update((model) => ({ ...model, waterReminders: next }));
    await this.settingsService.updateField('waterReminders', next);
    await this.waterReminder.tick();
  }

  /** One end of the working hours. The value arrives as `HH:MM` from the picker. */
  async setWaterTime(key: 'waterStart' | 'waterEnd', event: Event): Promise<void> {
    const value = (event.target as HTMLInputElement).value;
    if (parseTimeOfDay(value) === null) return;

    this.settingsModel.update((model) => ({ ...model, [key]: value }));
    await this.settingsService.updateField(key, value);
    await this.waterReminder.tick();
  }

  /**
   * One of the three fixed-number answers (cadence, glass, target).
   *
   * A value that is not one of the offered options — a stale page, a fought-with
   * DOM — is ignored rather than stored, so those three can only ever hold a
   * number the app knows how to use.
   */
  async setWaterOption(
    key: 'waterIntervalMinutes' | 'waterAmountMl' | 'waterGoalMl',
    event: Event,
  ): Promise<void> {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!allowedWaterValues(key).includes(value)) return;

    this.settingsModel.update((model) => ({ ...model, [key]: value }));
    await this.settingsService.updateField(key, value);
    await this.waterReminder.tick();
  }

  /** Sends the reminder now — the one button that proves it works. */
  async testWaterReminder(): Promise<void> {
    await this.waterReminder.remindNow();
  }

  /**
   * Whether a reminder that lands while the window is minimised counts the drink
   * by itself — see `WaterReminderService`.
   */
  async toggleWaterAutoLogWhenMinimized(): Promise<void> {
    const next = !this.settingsModel().waterAutoLogWhenMinimized;
    this.settingsModel.update((model) => ({ ...model, waterAutoLogWhenMinimized: next }));
    await this.settingsService.updateField('waterAutoLogWhenMinimized', next);
    await this.waterReminder.tick();
  }

  /**
   * Carry-forward: whether unfinished work survives the day it was for.
   *
   * Turning it off sweeps straight away rather than at tomorrow's start, because
   * the switch is the user saying "not this" about the backlog in front of them —
   * waiting a day would leave the old work exactly where they just said it should
   * not be. Turning it back on only stops the closing; tasks already closed stay
   * closed, which is the honest kind of undo (reopen them on the Tasks page).
   */
  async toggleCarryForwardTasks(): Promise<void> {
    const next = !this.settingsModel().carryForwardTasks;
    this.settingsModel.update((model) => ({ ...model, carryForwardTasks: next }));
    await this.settingsService.updateField('carryForwardTasks', next);
    await this.taskService.closeExpiredTasks();
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    this.activeTheme.set(theme);
    await this.settingsService.updateField('theme', theme);
  }

  async persist(key: string): Promise<void> {
    const value = (this.settingsModel() as any)[key];
    await this.settingsService.updateField(key as any, value);
  }

  async updateNotificationSound(): Promise<void> {
    const sound = this.settingsModel().notificationSound;
    this.notifications.previewSound(sound);
    await this.settingsService.updateField('notificationSound', sound);
  }

  /**
   * Sets how long the alert's shake lasts.
   *
   * Guarded against the fixed list for the same reason the water numbers are: a
   * `<select>` is the only thing that calls this today, and a value that is not
   * on the list would be a stray string from a stale template rather than a
   * choice anyone made.
   */
  async setAlertShake(event: Event): Promise<void> {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!ALERT_SHAKE_OPTIONS.includes(value)) return;

    this.settingsModel.update((model) => ({ ...model, alertShakeMs: value }));
    await this.settingsService.updateField('alertShakeMs', value);
  }

  previewNotificationSound(): void {
    this.notifications.previewSound(this.settingsModel().notificationSound);
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
        alertShakeMs: s.alertShakeMs,
        theme: s.theme,
        trayBehavior: s.trayBehavior,
        waterReminders: s.waterReminders,
        waterStart: s.waterStart,
        waterEnd: s.waterEnd,
        waterIntervalMinutes: s.waterIntervalMinutes,
        waterAmountMl: s.waterAmountMl,
        waterGoalMl: s.waterGoalMl,
        waterAutoLogWhenMinimized: s.waterAutoLogWhenMinimized,
        carryForwardTasks: s.carryForwardTasks,
      });
      alert('Import complete! All data has been restored.');
    } catch {
      alert('Failed to parse import file.');
    } finally {
      (event.target as HTMLInputElement).value = '';
    }
  }
}

/** The fixed list one of the three water numbers is allowed to come from. */
function allowedWaterValues(
  key: 'waterIntervalMinutes' | 'waterAmountMl' | 'waterGoalMl',
): readonly number[] {
  switch (key) {
    case 'waterIntervalMinutes':
      return WATER_INTERVAL_OPTIONS;
    case 'waterAmountMl':
      return WATER_AMOUNT_OPTIONS;
    default:
      return WATER_GOAL_OPTIONS;
  }
}
