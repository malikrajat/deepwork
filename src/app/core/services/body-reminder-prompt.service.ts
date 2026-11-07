import { Injectable, Injector, OnDestroy, inject } from '@angular/core';
import {
  BODY_PROMPT_ACTIONS,
  BODY_PROMPT_REPEAT_MINUTES,
  FIRST_BODY_PROMPT_DELAY_MINUTES,
  MOVEMENT_SETUP_PROMPTS,
  SETUP_CONFIRMATION_TITLES,
  SETUP_PROMPTS_STOPPED,
  WATER_SETUP_PROMPTS,
  type BodyPromptCopy,
} from '../constants/body-reminder-prompt.constants';
import type { AppSettings } from '../models/settings.model';
import { formatMillilitres, isWithinHours, minuteOfDay, parseTimeOfDay } from '../utils/water.util';
import { AttentionService } from './attention.service';
import { DesktopPrefsService } from './desktop-prefs.service';
import { LaunchPromptService } from './launch-prompt.service';
import { LogService } from './log.service';
import type { NotificationAction, ToastAction } from './notification.service';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';
import { WaterReminderService } from './water-reminder.service';

/** The two features this service offers. */
type BodyFeature = 'water' | 'movement';

/** How often the offer's clock is checked. */
const TICK_MS = 60_000;

/** Where the offer's own clock and the user's answers are remembered. */
const STATE_KEY = 'deepwork.bodyPrompt.v1';

/** One feature's place in the offer cadence. */
interface PromptRecord {
  /** When the next offer may arrive, or null while the feature is on. */
  nextAt: number | null;
  /** True after **Stop asking**; no offer is made again. */
  optedOut: boolean;
  /** How many offers have been delivered, so the copy can rotate. */
  count: number;
}

/** Both records, as one stored object. */
interface PromptState {
  water: PromptRecord;
  movement: PromptRecord;
}

/**
 * Offers the two body reminders while they are switched off.
 *
 * Both reminders start off — a focus app that rings every hour uninvited is
 * working against the focus it exists to protect — but a feature nobody can find
 * is not a feature. This service is the other half of that decision: while a
 * reminder is off, it offers it every two hours inside the reminder's own working
 * window, in the app and on the desktop, and stops the moment the user says yes,
 * says stop, or turns the feature on from anywhere else.
 *
 * Four rules shape it.
 *
 * - **The offer is a question, not an announcement.** It carries **Set up** and
 *   **Stop asking**, and the card also has its close cross; nothing else answers
 *   it. **Set up** writes the same `waterReminders` / `movementReminders` field
 *   the Dashboard, Settings and the schedulers read, then confirms the defaults
 *   the reminder will actually use.
 * - **It stays until the user deals with it.** The system notification is posted
 *   with `sticky`, and the in-app card has no timeout, so a prompt that arrives
 *   while the user is heads-down is still there when they look up. A *new* offer
 *   is only posted after the two-hour cadence, and the repeat replaces the
 *   previous one under the feature's own handle rather than stacking.
 * - **It never speaks during a pause.** A pause means none of this, and the offer
 *   is part of "this". The clock simply holds while the pause lasts, so the offer
 *   is not lost — it arrives when the user asks the app to speak again.
 * - **Only one offer is raised per pass.** The two features are staggered by an
 *   hour on a fresh install, and a long absence that puts both due together
 *   delivers one now and the other on the next pass, instead of two cards
 *   fighting for the same corner of the window.
 *
 * The offers are deliberately not stored in the settings table: they are not a
 * preference the user edits, they are this service's own delivery record, and the
 * same state lives in localStorage for the existing launch and taskbar reminders.
 * The one user choice here — **Stop asking** — is stored with them.
 */
@Injectable({ providedIn: 'root' })
export class BodyReminderPromptService implements OnDestroy {
  private readonly settings = inject(SettingsService);
  private readonly notifications = inject(NotificationService);
  private readonly attention = inject(AttentionService);
  private readonly launchPrompt = inject(LaunchPromptService);
  private readonly desktopPrefs = inject(DesktopPrefsService);
  private readonly water = inject(WaterReminderService);
  private readonly injector = inject(Injector);
  private readonly log = inject(LogService, { optional: true });

  /** The one timer this service holds. */
  private ticker: ReturnType<typeof setInterval> | null = null;

  /** True between `start()` and `stop()`. */
  private running = false;

  /** The stored cadence and answers, read once at construction. */
  private state: PromptState = this.loadState();

  /** The last time each feature was seen, to notice it being switched on. */
  private readonly wasEnabled: Record<BodyFeature, boolean | null> = {
    water: null,
    movement: null,
  };

  /** Removes the two notification-button handlers when this service goes away. */
  private readonly unlistenActions: (() => void)[] = [];

  /** Starts the offer cadence. Safe to call repeatedly. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.listenForAnswers();
    this.ensureFirstDeadlines();
    void this.tick();
    this.ticker = setInterval(() => void this.tick(), TICK_MS);
  }

  /** Stops the cadence and releases every handler it holds. */
  stop(): void {
    this.running = false;
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /**
   * One pass of the offer clock.
   *
   * Public and clock-injectable so the rules can be tested without waiting out
   * two hours, and so the app could ask for a fresh evaluation after a setting
   * changes.
   */
  async tick(now: Date = new Date()): Promise<void> {
    if (!this.running) return;

    try {
      if (this.attention.paused()) return;
      if (this.dialogsAreOpen()) return;

      // One offer per pass: the next feature is considered on the next tick.
      for (const feature of ['water', 'movement'] as const) {
        if (await this.consider(feature, now)) return;
      }
    } catch (error) {
      this.log?.warn('system', `body reminder prompt tick failed: ${describe(error)}`);
    }
  }

  /**
   * Turns one reminder on from its offer, then says what configuration was set.
   *
   * The confirmation is a second message rather than part of the button's label
   * because the user asked for exactly this: the offer explains the feature, and
   * pressing **Set up** reports the working window, cadence and glass size that
   * are now in force. It is posted under the same handle as the offer, so the
   * question is replaced by its answer instead of both staying on screen.
   *
   * Public because the notification's own **Set up** button and the card's button
   * are the same answer, and a test should be able to press it.
   */
  async setUp(feature: BodyFeature): Promise<void> {
    const record = this.state[feature];
    record.optedOut = false;
    record.nextAt = null;
    this.saveState();

    try {
      await this.settings.updateField(this.fieldFor(feature), true);
      // This service made the change, so the next tick must not mistake it for
      // the user turning the feature on somewhere else and take the confirmation
      // back down as though an unanswered offer were still on screen.
      this.wasEnabled[feature] = true;
      // The question has been answered; take it down before posting the answer.
      await this.notifications.dismissSystemNotification(this.tagFor(feature));
      await this.tickReminder(feature);
      await this.confirm(feature);
    } catch (error) {
      // A write that failed leaves the feature where it was; the offer is not
      // lost either, because the next pass starts a fresh delay. Say so in the
      // log rather than throwing at the button that pressed it.
      this.log?.warn('system', `${feature} setup could not be applied: ${describe(error)}`);
    }
  }

  /**
   * **Stop asking**: ends the offers for one feature without turning it on.
   *
   * The reminder stays off and can still be switched on from the Dashboard; this
   * only ends the app's own asking. It is the one click the user is promised when
   * an offer repeats, and it is remembered across launches.
   */
  async stopAsking(feature: BodyFeature): Promise<void> {
    const record = this.state[feature];
    record.optedOut = true;
    record.nextAt = null;
    this.saveState();

    try {
      await this.notifications.dismissSystemNotification(this.tagFor(feature));
      const copy = SETUP_PROMPTS_STOPPED[feature];
      this.notifications.showToastMessage(
        copy.title,
        copy.body,
        'work',
        this.notifications.nextQuote('desktop'),
      );
      this.log?.info('flow', `${feature} setup offers stopped by the user`);
    } catch (error) {
      // The answer is already stored, so the offers stay stopped even if taking
      // the notification down failed.
      this.log?.warn('system', `${feature} setup offers could not be closed: ${describe(error)}`);
    }
  }

  /**
   * The state of one feature's offer, for tests and for a future Settings row.
   *
   * A copy rather than the record itself, so reading the cadence cannot change
   * it by accident.
   */
  offerState(feature: BodyFeature): { nextAt: number | null; optedOut: boolean; count: number } {
    return { ...this.state[feature] };
  }

  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Decides what one feature needs on this pass.
   *
   * Returns true when an offer was delivered, so the caller can stop and leave
   * the other feature for the next tick.
   */
  private async consider(feature: BodyFeature, now: Date): Promise<boolean> {
    const settings = this.settings.settings();
    const enabled = feature === 'water' ? settings.waterReminders : settings.movementReminders;
    const record = this.state[feature];

    if (enabled) {
      const was = this.wasEnabled[feature];
      this.wasEnabled[feature] = true;

      // Turning the feature on anywhere — the Dashboard, Settings, the first-run
      // setup — has answered the offer. Take back a prompt that is still on
      // screen and stop counting; if it is switched off again later, a fresh
      // two-hour delay starts from that moment.
      if (record.nextAt !== null) {
        record.nextAt = null;
        this.saveState();
      }
      if (was === false) await this.dismissOffer(feature);
      return false;
    }

    this.wasEnabled[feature] = false;

    if (record.optedOut) {
      if (record.nextAt !== null) {
        record.nextAt = null;
        this.saveState();
      }
      return false;
    }

    if (record.nextAt === null) {
      record.nextAt = now.getTime() + this.firstDelayMs(feature);
      this.saveState();
      return false;
    }

    if (now.getTime() < record.nextAt) return false;
    // Outside the reminder's own working window the offer waits rather than
    // arriving at 03:00; the deadline stays due, so it comes in at the start of
    // the window.
    if (!this.withinHours(feature, settings, now)) return false;

    await this.offer(feature, now);
    return true;
  }

  /** Raises one offer in the app and on the desktop. */
  private async offer(feature: BodyFeature, now: Date): Promise<void> {
    const record = this.state[feature];
    record.nextAt = now.getTime() + BODY_PROMPT_REPEAT_MINUTES * 60_000;
    record.count += 1;
    this.saveState();

    const copy = this.copyFor(feature, record.count - 1);
    const quote = this.notifications.nextQuote(feature === 'water' ? 'water' : 'move');
    const tag = this.tagFor(feature);

    await this.notifications.announce(copy.title, copy.system, {
      quote,
      tag,
      sticky: true,
      actions: this.systemActions(),
    });

    // A pause can land while the post is in flight. It was the user asking for
    // none of this before the offer was on screen, so take it back rather than
    // letting the first ask through.
    if (this.attention.paused()) {
      await this.notifications.dismissSystemNotification(tag);
      return;
    }

    // The desktop's quiet state silences the card, not the system notification:
    // the OS that asked for quiet is the same OS that decides what to do with a
    // notification. The offer is still there to be answered when the user looks.
    if (!this.attention.quietNow()) {
      this.notifications.showToastMessage(
        copy.title,
        copy.body,
        'work',
        quote,
        this.cardActions(feature),
        tag,
      );
    }

    this.log?.info(
      'flow',
      `${feature} setup offer #${record.count} · next in ${BODY_PROMPT_REPEAT_MINUTES} min`,
    );
  }

  /** Reports the defaults the reminder was switched on with. */
  private async confirm(feature: BodyFeature): Promise<void> {
    const settings = this.settings.settings();
    const title = SETUP_CONFIRMATION_TITLES[feature];
    const body =
      feature === 'water'
        ? `On from ${settings.waterStart} to ${settings.waterEnd} — one ${formatMillilitres(
            settings.waterAmountMl,
          )} every ${settings.waterIntervalMinutes} minutes. Turn it off any time from the Dashboard.`
        : `On from ${settings.movementStart} to ${settings.movementEnd} — a reminder every ${settings.movementIntervalMinutes} minutes. Turn it off any time from the Dashboard.`;
    const quote = this.notifications.nextQuote(feature === 'water' ? 'water' : 'move');

    await this.notifications.announce(title, body, {
      quote,
      tag: this.tagFor(feature),
      sticky: true,
    });

    if (this.attention.paused()) {
      await this.notifications.dismissSystemNotification(this.tagFor(feature));
      return;
    }

    if (!this.attention.quietNow()) {
      this.notifications.showToastMessage(title, body, 'work', quote, [], this.tagFor(feature));
    }

    this.log?.info('flow', `${feature} reminders switched on from the setup offer`);
  }

  /** Starts the reminder the user just switched on. */
  private async tickReminder(feature: BodyFeature): Promise<void> {
    if (feature === 'water') {
      await this.water.tick();
      return;
    }

    // Loaded on demand: the stand-and-walk feature is its own chunk, and this
    // service must not pull it back into the first paint just to start it once.
    const { MovementReminderService } = await import('./movement-reminder.service');
    await this.injector.get(MovementReminderService).tick();
  }

  /** Takes back an offer that is no longer true. */
  private async dismissOffer(feature: BodyFeature): Promise<void> {
    await this.notifications.dismissSystemNotification(this.tagFor(feature));
  }

  /** True while a first-run dialog owns the screen. */
  private dialogsAreOpen(): boolean {
    if (this.launchPrompt.dialogOpen()) return true;
    // The browser build has no desktop setup dialog, and `prompted` stays false
    // there by design — so the check only applies where the dialog can appear.
    return this.desktopPrefs.isDesktopApp && !this.desktopPrefs.prompted();
  }

  /** True when `now` is inside the reminder's own window. */
  private withinHours(feature: BodyFeature, settings: AppSettings, now: Date): boolean {
    const start = feature === 'water' ? settings.waterStart : settings.movementStart;
    const end = feature === 'water' ? settings.waterEnd : settings.movementEnd;
    const startMinute = parseTimeOfDay(start);
    const endMinute = parseTimeOfDay(end);
    if (startMinute === null || endMinute === null || startMinute === endMinute) return false;
    return isWithinHours(minuteOfDay(now), startMinute, endMinute);
  }

  /** The first offer's delay: two hours for water, three for movement. */
  private firstDelayMs(feature: BodyFeature): number {
    return FIRST_BODY_PROMPT_DELAY_MINUTES[feature] * 60_000;
  }

  /** Fills in a deadline for any feature that has never been offered. */
  private ensureFirstDeadlines(): void {
    const now = Date.now();
    for (const feature of ['water', 'movement'] as const) {
      const record = this.state[feature];
      if (record.optedOut) continue;
      if (record.nextAt === null) record.nextAt = now + this.firstDelayMs(feature);
    }
    this.saveState();
  }

  /** The copy variant for this delivery. */
  private copyFor(feature: BodyFeature, index: number): BodyPromptCopy {
    const deck = feature === 'water' ? WATER_SETUP_PROMPTS : MOVEMENT_SETUP_PROMPTS;
    return deck[index % deck.length];
  }

  /** The two answers a system notification offers. */
  private systemActions(): NotificationAction[] {
    return [
      { id: 'setup', label: BODY_PROMPT_ACTIONS.setup },
      { id: 'stop', label: BODY_PROMPT_ACTIONS.stop },
    ];
  }

  /** The same two answers on the in-app card. */
  private cardActions(feature: BodyFeature): ToastAction[] {
    return [
      {
        label: BODY_PROMPT_ACTIONS.setup,
        primary: true,
        run: () => this.setUp(feature),
      },
      {
        label: BODY_PROMPT_ACTIONS.stop,
        run: () => this.stopAsking(feature),
      },
    ];
  }

  /** Wires the notification's two buttons to the same answers the card gives. */
  private listenForAnswers(): void {
    if (this.unlistenActions.length) return;
    for (const feature of ['water', 'movement'] as const) {
      this.unlistenActions.push(
        this.notifications.onToastAction(this.tagFor(feature), (action) => {
          if (action === 'setup') void this.setUp(feature);
          else if (action === 'stop') void this.stopAsking(feature);
        }),
      );
    }
  }

  private fieldFor(feature: BodyFeature): 'waterReminders' | 'movementReminders' {
    return feature === 'water' ? 'waterReminders' : 'movementReminders';
  }

  private tagFor(feature: BodyFeature): string {
    return feature === 'water'
      ? NotificationService.WATER_SETUP_NOTIFICATION_TAG
      : NotificationService.MOVEMENT_SETUP_NOTIFICATION_TAG;
  }

  private loadState(): PromptState {
    const blank = (): PromptState => ({
      water: { nextAt: null, optedOut: false, count: 0 },
      movement: { nextAt: null, optedOut: false, count: 0 },
    });

    try {
      const raw = globalThis.localStorage?.getItem(STATE_KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw) as Partial<PromptState> | null;
      return {
        water: readRecord(parsed?.water),
        movement: readRecord(parsed?.movement),
      };
    } catch {
      return blank();
    }
  }

  private saveState(): void {
    try {
      globalThis.localStorage?.setItem(STATE_KEY, JSON.stringify(this.state));
    } catch {
      // A cadence that cannot be stored costs one early or late offer, never a
      // lost answer to the feature itself.
    }
  }

  ngOnDestroy(): void {
    this.stop();
    for (const unlisten of this.unlistenActions.splice(0)) unlisten();
  }
}

/** One line from whatever went wrong. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One stored record, repaired to the shape the service expects. */
function readRecord(value: unknown): PromptRecord {
  const record = value as Partial<PromptRecord> | null | undefined;
  return {
    nextAt:
      typeof record?.nextAt === 'number' && Number.isFinite(record.nextAt) ? record.nextAt : null,
    optedOut: record?.optedOut === true,
    count:
      typeof record?.count === 'number' && Number.isFinite(record.count)
        ? Math.max(0, Math.floor(record.count))
        : 0,
  };
}
