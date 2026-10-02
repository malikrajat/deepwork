import { Injectable, computed, inject, signal } from '@angular/core';
import { WaterEntry } from '../models/water.model';
import { localDayStart, sanitiseAmount } from '../utils/water.util';
import { DbService } from './db.service';
import { SettingsService } from './settings.service';

/**
 * Today's water: what has been drunk, and what that means against the target.
 *
 * The table keeps every drink as its own row, but this service only ever holds
 * **today's** rows, and it holds them as a signal of plain objects. There is no
 * timer, no subscription, no listener and no DOM here — reading, adding and
 * removing a drink are the whole service — so there is nothing that can keep
 * growing while the app is open, and nothing to release when it closes.
 *
 * Everything downstream is `computed` from that one list, which is why the
 * dashboard, the reminder and the notification can never disagree about the
 * total.
 */
@Injectable({ providedIn: 'root' })
export class WaterService {
  private readonly db = inject(DbService);
  private readonly settingsService = inject(SettingsService);

  /** Today's drinks, oldest first. Replaced, never appended to in place. */
  readonly entries = signal<readonly WaterEntry[]>([]);

  /** True once today has been read from storage at least once. */
  readonly loaded = signal(false);

  /** The day the current list belongs to, so a new day reloads rather than adds. */
  private loadedDay: string | null = null;

  /** How much has been drunk today, in millilitres. */
  readonly totalMl = computed(() =>
    this.entries().reduce((sum, entry) => sum + sanitiseAmount(entry.amountMl), 0),
  );

  /** How many drinks that is. */
  readonly drinkCount = computed(() => this.entries().length);

  /** The day's target, from the settings. */
  readonly goalMl = computed(() => this.settingsService.settings().waterGoalMl);

  /** The glass size a quick add uses, from the settings. */
  readonly glassMl = computed(() => this.settingsService.settings().waterAmountMl);

  /** How far into the target today is, as a whole percentage (0–100). */
  readonly percent = computed(() => {
    const goal = this.goalMl();
    if (goal <= 0) return 0;
    return Math.min(100, Math.round((this.totalMl() / goal) * 100));
  });

  /** What is still to drink; zero once the target is met or passed. */
  readonly remainingMl = computed(() => Math.max(0, this.goalMl() - this.totalMl()));

  /** True when the day's target has been reached. */
  readonly goalReached = computed(() => this.totalMl() >= this.goalMl() && this.totalMl() > 0);

  /** When the last drink was logged, ISO 8601, or null if none today. */
  readonly lastAt = computed<string | null>(() => {
    const list = this.entries();
    return list.length ? list[list.length - 1].loggedAt : null;
  });

  /** Reads today's drinks, replacing whatever was held before. */
  async load(): Promise<void> {
    const day = localDayStart();
    const rows = await this.db.getWaterIntakeSince(day.toISOString());

    this.loadedDay = day.toISOString();
    this.entries.set(rows);
    this.loaded.set(true);
  }

  /**
   * Reads today again when the calendar day has moved on.
   *
   * Called by the reminder loop that is already running and by anything about to
   * add a drink, so an app left open overnight starts the new day at zero
   * instead of adding to yesterday.
   */
  async ensureToday(): Promise<void> {
    if (this.loadedDay === localDayStart().toISOString()) return;
    await this.load();
  }

  /**
   * Records a drink, defaulting to the configured glass size.
   *
   * The entry is written first and the list updated only when the write
   * succeeded, so what is on screen is what is stored.
   */
  async log(amountMl?: number): Promise<void> {
    const amount = sanitiseAmount(amountMl ?? this.settingsService.settings().waterAmountMl);
    if (amount <= 0) return;

    await this.ensureToday();

    const entry: WaterEntry = {
      id: crypto.randomUUID(),
      amountMl: amount,
      loggedAt: new Date().toISOString(),
    };
    await this.db.addWaterEntry(entry);

    this.entries.update((list) => [...list, entry]);
  }

  /** Removes the last drink of the day, for the one logged by mistake. */
  async undoLast(): Promise<void> {
    const last = this.entries().at(-1);
    if (!last) return;

    await this.db.deleteWaterEntry(last.id);
    this.entries.update((list) => list.filter((entry) => entry.id !== last.id));
  }
}
