import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { NotificationService } from './notification.service';
import { ScheduleService, dayKey, formatMinute } from './schedule.service';
import { SettingsService } from './settings.service';
import { TaskService } from './task.service';
import { CALENDAR_REMINDER_LEAD_MINUTES } from '../models/settings.model';
import { QUADRANT_CONFIG } from '../constants/theme.constants';

const FIRED_KEY = 'calendar_reminders_fired';
const TICK_MS = 20_000;
/** Keep firing a reminder this long after its moment passed (app in background). */
const GRACE_MINUTES = 2;

type ReminderKind = 'start' | 'end';

interface ReminderCandidate {
  key: string;
  taskId: string;
  kind: ReminderKind;
  /** Minute of day the reminder is due. */
  dueMinute: number;
  title: string;
  body: string;
}

/**
 * Calendar reminders: five minutes before a scheduled task starts and five
 * minutes before it ends, so a block never overruns unnoticed.
 *
 * The scheduler reads the same plan the Calendar page renders — pinned blocks
 * and the automatic flow — and fires each reminder once per day. Fired keys are
 * persisted, so restarting the app does not replay the morning's reminders.
 */
@Injectable({ providedIn: 'root' })
export class CalendarReminderService {
  private readonly schedule = inject(ScheduleService);
  private readonly taskService = inject(TaskService);
  private readonly notifications = inject(NotificationService);
  private readonly settingsService = inject(SettingsService);
  private readonly db = inject(DbService);

  private timerId: ReturnType<typeof setInterval> | null = null;
  private fired = new Map<string, number>();
  private loaded = false;
  private starting = false;

  /** Reminders fired today — surfaced in Settings so the feature is visible. */
  readonly firedToday = signal(0);

  async start(): Promise<void> {
    if (this.timerId || this.starting) return;
    this.starting = true;
    try {
      await this.schedule.load();
      await this.loadFired();
      if (!this.taskService.tasks().length) {
        await this.taskService.loadTasks();
      }
      this.timerId = setInterval(() => void this.tick(), TICK_MS);
      // Catch reminders that came due while the app was closed.
      void this.tick();
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
  }

  /** Exposed for the settings page ("send a test reminder"). */
  async preview(lead = CALENDAR_REMINDER_LEAD_MINUTES): Promise<void> {
    await this.notifications.fireReminder(
      'Calendar reminders are on',
      `You will be nudged ${lead} minutes before a scheduled task starts and before it ends.`
    );
  }

  private async loadFired(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const stored = await this.db.getAppState<Record<string, number>>(FIRED_KEY, {});
    const today = dayKey();
    for (const [key, at] of Object.entries(stored ?? {})) {
      // Drop anything from a previous day so the map cannot grow forever.
      if (key.startsWith(today)) this.fired.set(key, at);
    }
    this.firedToday.set(this.fired.size);
  }

  private async persistFired(): Promise<void> {
    const serialized = Object.fromEntries(this.fired.entries());
    await this.db.setAppState(FIRED_KEY, serialized);
    this.firedToday.set(this.fired.size);
  }

  /** Runs on a timer; kept public so it can be triggered from a test button. */
  async tick(now: Date = new Date()): Promise<void> {
    if (!this.settingsService.settings().calendarReminders) return;

    const date = dayKey(now);
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    const due = this.due(now, nowMinute);
    if (!due.length) return;

    let changed = false;
    for (const reminder of due) {
      if (this.fired.has(reminder.key)) continue;
      this.fired.set(reminder.key, Date.now());
      changed = true;
      await this.notifications.fireReminder(reminder.title, reminder.body);
    }

    if (changed) await this.persistFired();
  }

  /** Reminders whose moment has arrived (within the grace window). */
  private due(now: Date, nowMinute: number): ReminderCandidate[] {
    const lead = CALENDAR_REMINDER_LEAD_MINUTES;
    const date = dayKey(now);
    // Always today's plan, whatever day the Calendar page happens to show.
    const placements = this.schedule.scheduleFor(date).placements;
    const candidates: ReminderCandidate[] = [];

    for (const placement of placements) {
      const task = this.taskService.tasks().find(item => item.id === placement.taskId);
      if (!task || task.status === 'done') continue;

      const quadrant = task.quadrant ? ` · ${QUADRANT_CONFIG[task.quadrant].label}` : '';
      const windows: Array<{ kind: ReminderKind; minute: number }> = [
        { kind: 'start', minute: placement.startMin - lead },
        { kind: 'end', minute: placement.endMin - lead },
      ];

      for (const window of windows) {
        if (window.minute < 0) continue;
        const late = nowMinute - window.minute;
        if (late < 0 || late > GRACE_MINUTES) continue;

        const remaining = window.kind === 'start'
          ? placement.startMin - nowMinute
          : placement.endMin - nowMinute;
        if (remaining < 0) continue;

        candidates.push({
          key: `${date}:${placement.taskId}:${window.kind}`,
          taskId: placement.taskId,
          kind: window.kind,
          dueMinute: window.minute,
          title: window.kind === 'start'
            ? `Starting in ${Math.max(1, remaining)} min`
            : `Wrapping up in ${Math.max(1, remaining)} min`,
          body: window.kind === 'start'
            ? `${task.title} — ${formatMinute(placement.startMin)}–${formatMinute(placement.endMin)}${quadrant}`
            : `${task.title} ends at ${formatMinute(placement.endMin)}${quadrant}. Finish the thought and take your break.`,
        });
      }
    }

    return candidates;
  }
}
