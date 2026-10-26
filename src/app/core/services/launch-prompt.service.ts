import { computed, effect, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { DesktopPrefsService } from './desktop-prefs.service';
import { NotificationService } from './notification.service';
import type { NotificationAction, ToastAction } from './notification.service';
import { AttentionService } from './attention.service';
import { LogService } from './log.service';
import {
  STARTUP_NUDGES,
  TASKBAR_PIN_MANUAL,
  TASKBAR_PIN_NUDGES,
} from '../constants/nudge.constants';
import { dueNudge, localDayKey, minutesOfDay, nudgePlanFor } from '../utils/nudge-schedule.util';
import type { NudgePlan } from '../utils/nudge-schedule.util';

/** Where today's delivered reminders are remembered. */
const FIRED_KEY = 'deepwork.nudges.fired.v1';

/** How often the day's plan is checked. */
const TICK_MS = 60_000;

/**
 * How long the app stays quiet after the first-run dialog is dismissed.
 *
 * The dialog can be closed at 10:04 and the day's first reminder can be planned
 * for 10:05; that is not a reminder, it is the same question asked twice in a
 * minute. An hour and a quarter is long enough to cover the slot it was closed
 * in without pushing the first reminder out of the working day.
 */
const AFTER_DECLINE_QUIET_MINUTES = 75;

/** True when running inside the packaged desktop app (Tauri). */
const IN_TAURI = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

/** How many reminders have been delivered for a plan. */
interface FiredCounts {
  day: string;
  startup: number;
  pin: number;
}

/** What the desktop says about the taskbar. */
export interface TaskbarPinState {
  pinned: boolean;
  supported: boolean;
  /**
   * Whether Windows will accept a pin request from this app at all.
   *
   * False on a normal unpackaged Windows 11 install; the reminder then offers to
   * open the app list rather than a **Yes** that cannot finish.
   */
  allowed: boolean;
}

/**
 * The first-run offer to start with the computer, and the quieter reminders that
 * follow a "not now".
 *
 * The flow has four states and no more:
 *
 * 1. **First run.** `launchPrompted` is false and start-with-system is off, so a
 *    full dialog asks the question once. It is a dialog rather than a toast
 *    because it is the only moment the app can explain the benefit before the
 *    user has decided anything about it.
 * 2. **Answered yes.** The OS entry is written, the question is retired, and
 *    nothing else is ever shown about it.
 * 3. **Answered not now.** The question is retired, but not forgotten: a few
 *    short reminders arrive each working day, in the app and on the desktop,
 *    until the setting is on.
 * 4. **Turned off for good.** The Settings switch ends the reminders, which is
 *    the only ending that should exist for something that repeats.
 *
 * The pin reminder is the same shape with two differences: it is asked only
 * after the launch question has been dealt with, and its answer is not a setting
 * the app can write — Windows will not let an app pin itself, so the app checks
 * the taskbar and stops asking the moment the shortcut is there.
 */
@Injectable({ providedIn: 'root' })
export class LaunchPromptService implements OnDestroy {
  private readonly settings = inject(SettingsService);
  private readonly prefs = inject(DesktopPrefsService);
  private readonly notifications = inject(NotificationService);
  private readonly attention = inject(AttentionService);
  private readonly log = inject(LogService, { optional: true });

  /** True while the first-run dialog is asking its question. */
  readonly dialogOpen = signal(false);

  /** Whether DeepWork is on the taskbar, as of the last check. */
  readonly pin = signal<TaskbarPinState>({
    pinned: false,
    supported: IN_TAURI,
    allowed: false,
  });

  /** The last failure from the settings side, shown inside the dialog. */
  readonly error = signal<string | null>(null);

  /**
   * The dialog is shown only once the preferences it needs are loaded, only
   * after the older preferences dialog has been dealt with, and never when the
   * answer is already yes.
   *
   * The two dialogs both appear on a first run, and two modals on top of each
   * other is a first impression nobody asked for. The preferences dialog is the
   * one that explains the switches; once it has been dismissed — with **Done**
   * or **Not now** — this question is the next thing to ask, and the wait costs
   * nothing because the answer is read on every change.
   */
  readonly visible = computed(
    () =>
      this.dialogOpen() &&
      this.prefs.ready() &&
      this.prefs.prompted() &&
      !this.prefs.startWithSystem(),
  );

  private plan: NudgePlan = nudgePlanFor(localDayKey(new Date()));
  private fired: FiredCounts = this.loadFired();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private quietUntil = 0;

  /**
   * Removes the two toast-button handlers, one per reminder tag.
   *
   * Registered once, in {@link init}, and kept for the life of the service: the
   * OS notification can be answered at any moment — including long after the
   * card has gone — and a handler that only existed while a post was in flight
   * would miss exactly those answers.
   */
  private readonly unlistenActions: (() => void)[] = [];

  constructor() {
    // "Start with system" can also be switched on from the preferences dialog,
    // the Settings page or the tray while this question is still open. When it
    // is, the question has been answered whatever this service was about to ask,
    // so it is retired rather than left on screen asking something already true.
    effect(() => {
      if (!this.prefs.startWithSystem()) return;
      if (this.dialogOpen()) this.dialogOpen.set(false);
      if (!this.settings.settings().launchPrompted) void this.markPrompted();
    });
  }

  /**
   * Decides whether the dialog is needed and starts the day's planning.
   *
   * Order matters: the desktop preferences are loaded first, because "already
   * marked" is a fact about the operating system and not about the settings
   * file, and the dialog must not appear in front of someone who turned the
   * setting on before this version existed.
   */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.prefs.init();
    await this.refreshPin();
    this.ensurePlan();
    this.listenForAnswers();
    await this.restoreSetupAfterInstall();

    if (!this.settings.settings().launchPrompted) {
      if (!this.prefs.isDesktopApp) {
        // There is no login item to turn on in a browser tab, so there is
        // nothing to ask and nothing to remind about.
        await this.markPrompted();
      } else {
        // A database from before the preferences dialog became a setup step has
        // already dismissed it, but was never shown the newer offers (the
        // taskbar row, the startup question). Closing a dialog is not an answer
        // to a question that had not been added yet, so the setup is offered
        // once more — preferences first, and the startup question after it in
        // the order a fresh install sees them. This happens even when startup is
        // already on: the first-run dialog also carries the taskbar offer and
        // the explanation of the tray and the widget.
        if (this.prefs.prompted()) await this.prefs.reopenFirstRun();
        if (this.prefs.startWithSystem()) {
          // The question's answer is already yes; it is retired rather than
          // asked again once the setup dialog has been dealt with.
          await this.markPrompted();
        } else {
          this.dialogOpen.set(true);
        }
      }
    }

    this.ticker = setInterval(() => void this.tick(), TICK_MS);
  }

  /**
   * Offers the setup again on the first launch after an install.
   *
   * The flags that retire the setup live in the database, which a reinstall
   * deliberately keeps — that is where the user's tasks are. The installer
   * leaves one marker beside it (`installer-hooks.nsh`), the shell hands it over
   * once and deletes it, and this puts the two "already offered" flags back. It
   * touches nothing else: not the reminders, not the switches, not a single task.
   *
   * A silent update from the app's own updater leaves no marker, so updating
   * never interrupts with a setup the user did not ask for.
   */
  private async restoreSetupAfterInstall(): Promise<void> {
    if (!this.prefs.isDesktopApp) return;

    let freshInstall: boolean;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // `=== true`, because the invoke boundary is not typed at runtime and a
      // shell from before this command answers with an error, not a boolean.
      freshInstall = (await invoke<boolean>('first_run_take_marker')) === true;
    } catch {
      return;
    }
    if (!freshInstall) return;

    await this.prefs.reopenFirstRun();
    if (this.settings.settings().launchPrompted) {
      await this.settings.updateField('launchPrompted', false);
    }
    this.quietUntil = 0;
    this.log?.info('system', 'fresh install: first-run setup offered again');
  }

  /** **Start with Windows**: the dialog's primary answer and the toast's button. */
  async acceptStartWithSystem(): Promise<boolean> {
    this.error.set(null);
    await this.prefs.setStartWithSystem(true);
    if (!this.prefs.startWithSystem()) {
      this.error.set(this.prefs.error() ?? 'Your computer would not accept the change.');
      return false;
    }

    await this.markPrompted();
    this.dialogOpen.set(false);
    // The question has been answered, so the notification that asked it must not
    // stay on screen as though it had not.
    await this.notifications.dismissSystemNotification(
      NotificationService.STARTUP_NOTIFICATION_TAG,
    );
    // Answering the question is not an invitation to be reminded about the next
    // one in the same minute: every slot already behind the clock is counted as
    // dealt with, and the pin reminder waits for the next one.
    this.skipDueNow(0);
    this.notifications.showToastMessage(
      'DeepWork will start with your computer',
      'It opens at sign-in and waits out of the way, so the timer is there when you are.',
      'work',
      this.notifications.nextQuote('desktop'),
    );
    return true;
  }

  /** **Not now**: retire the dialog, and keep the reminders for later. */
  async decline(): Promise<void> {
    await this.markPrompted();
    this.dialogOpen.set(false);
    await this.notifications.dismissSystemNotification(
      NotificationService.STARTUP_NOTIFICATION_TAG,
    );
    this.quietUntil = Date.now() + AFTER_DECLINE_QUIET_MINUTES * 60_000;
    // A reminder that was already due is not delivered on the way out of the
    // dialog: the user has just read the whole explanation, and repeating it
    // within the hour is the one thing that would make the feature hated.
    this.skipDueNow(AFTER_DECLINE_QUIET_MINUTES);
  }

  /**
   * Offers the whole first-run setup again, from Settings.
   *
   * The setup is deliberately once-only, which is also what makes it impossible
   * to show someone a second time. This is the deliberate door back in: both
   * flags are put back, so the preferences dialog appears first and this question
   * follows it, exactly as on a fresh install.
   */
  async reopenSetup(): Promise<void> {
    if (!this.prefs.isDesktopApp) return;
    this.quietUntil = 0;
    this.dialogOpen.set(false);
    this.notifications.dismiss();
    await this.prefs.reopenFirstRun();
    if (this.settings.settings().launchPrompted) {
      await this.settings.updateField('launchPrompted', false);
    }
    this.fired = { ...this.fired, startup: 0, pin: 0 };
    this.saveFired();
    this.dialogOpen.set(true);
  }

  /** **Don't remind me again**: the dialog's quiet, permanent answer. */
  async neverRemind(): Promise<void> {
    await this.markPrompted();
    await this.setNudge('startupNudge', false);
    this.dialogOpen.set(false);
    this.notifications.showToastMessage(
      'No more startup reminders',
      'You can turn them back on in Settings → Desktop.',
      'work',
      this.notifications.nextQuote('desktop'),
    );
  }

  /** Ends the startup reminders for good, from a toast or from Settings. */
  async stopStartupNudges(): Promise<void> {
    await this.notifications.dismissSystemNotification(
      NotificationService.STARTUP_NOTIFICATION_TAG,
    );
    await this.setNudge('startupNudge', false);
    this.notifications.showToastMessage(
      'Startup reminder off',
      'Settings → Desktop has the switch if you want it back.',
      'work',
      this.notifications.nextQuote('desktop'),
    );
  }

  /**
   * The Settings switch, so turning a reminder back on starts from the next
   * planned one rather than from the one that came round while it was off.
   */
  async setStartupNudge(enabled: boolean): Promise<void> {
    await this.setNudge('startupNudge', enabled);
    if (enabled) await this.tick();
  }

  /** The same for the pin reminder. */
  async setPinNudge(enabled: boolean): Promise<void> {
    await this.setNudge('taskbarPinNudge', enabled);
    if (enabled) {
      await this.refreshPin();
      await this.tick();
    }
  }

  /** Ends the pin reminders for good. */
  async stopPinNudges(): Promise<void> {
    await this.notifications.dismissSystemNotification(NotificationService.PIN_NOTIFICATION_TAG);
    await this.setNudge('taskbarPinNudge', false);
    this.notifications.showToastMessage(
      'Taskbar reminder off',
      'You can pin DeepWork any time from the Start menu.',
      'work',
      this.notifications.nextQuote('desktop'),
    );
  }

  /** Re-reads the taskbar, for Settings and after an answer. */
  async refreshPin(): Promise<void> {
    if (!this.prefs.isDesktopApp) {
      this.pin.set({ pinned: true, supported: false, allowed: false });
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const state = await invoke<{
        pinned?: boolean;
        supported?: boolean;
        allowed?: boolean;
      }>('nudges_taskbar_pin_state');
      this.pin.set({
        pinned: state?.pinned === true,
        supported: state?.supported !== false,
        allowed: state?.allowed === true,
      });
    } catch (error) {
      // A desktop that cannot answer gets the answer that does not nag: the
      // reminder is only worth having if the app can tell when it is done.
      this.log?.warn('system', `taskbar pin state unavailable: ${describe(error)}`);
      this.pin.set({ pinned: true, supported: false, allowed: false });
    }
  }

  /**
   * One pass of the day's plan.
   *
   * Public so a test can drive it with a fixed clock, and so Settings can ask
   * for an immediate re-evaluation after a switch is flipped.
   */
  async tick(now: Date = new Date()): Promise<void> {
    this.ensurePlan(now);
    const settings = this.settings.settings();
    if (!settings.launchPrompted || this.dialogOpen() || !this.prefs.isDesktopApp) return;
    if (now.getTime() < this.quietUntil) return;

    const minute = minutesOfDay(now);

    // The startup question comes first: it is the one the app was installed to
    // ask, and a pin reminder arriving first would be a different favour asked
    // before the first one was answered.
    if (settings.startupNudge && !this.prefs.startWithSystem()) {
      const due = dueNudge(this.plan.startup, this.fired.startup, minute);
      this.advance('startup', due.fired);
      if (due.dueIndex !== null) {
        this.advance('startup', due.dueIndex + 1);
        await this.deliverStartup(due.dueIndex);
        return;
      }
    }

    if (settings.taskbarPinNudge) {
      const due = dueNudge(this.plan.pin, this.fired.pin, minute);
      this.advance('pin', due.fired);
      if (due.dueIndex !== null) {
        this.advance('pin', due.dueIndex + 1);
        await this.deliverPin(due.dueIndex);
      }
    }
  }

  /** Raises one startup reminder, in whichever of the two places is allowed. */
  private async deliverStartup(index: number): Promise<void> {
    const copy = STARTUP_NUDGES[index % STARTUP_NUDGES.length];
    await this.deliver(
      copy.title,
      copy.body,
      copy.system,
      NotificationService.STARTUP_NOTIFICATION_TAG,
      [
        { id: 'yes', label: 'Yes, start with Windows' },
        { id: 'no', label: 'Not now' },
      ],
      this.startupActions(),
    );
  }

  /** Checks the taskbar first, then raises one pin reminder. */
  private async deliverPin(index: number): Promise<void> {
    await this.refreshPin();
    const state = this.pin();
    if (!state.supported || state.pinned) return;

    const copy = TASKBAR_PIN_NUDGES[index % TASKBAR_PIN_NUDGES.length];
    // On a Windows that refuses programmatic pinning, the reminder still asks —
    // but its Yes opens the list where the two clicks live instead of promising
    // a pin the shell will reject.
    const allowed = state.allowed;
    await this.deliver(
      copy.title,
      allowed ? copy.body : TASKBAR_PIN_MANUAL.body,
      allowed ? copy.system : TASKBAR_PIN_MANUAL.system,
      NotificationService.PIN_NOTIFICATION_TAG,
      [
        { id: 'yes', label: allowed ? 'Yes, pin it' : TASKBAR_PIN_MANUAL.action },
        { id: 'no', label: 'Not now' },
      ],
      this.pinActions(allowed),
    );
  }

  /**
   * Posts one suggestion to the desktop and, when the moment allows, to the app.
   *
   * The two halves answer to different questions. A **pause** silences both:
   * the user asked for none of this. The desktop's **quiet state** silences only
   * the card, and the system notification is still posted — the OS that asked
   * for quiet is the same OS that decides what DND does with a notification,
   * so holding that too would turn a focus mode someone forgot to leave into an
   * app that never speaks again. What the user gets in either case is the
   * banner's one line saying reminders are waiting, which is the prompt the
   * request asked for rather than silence with no explanation.
   *
   * Both halves now ask the question the same way. The notification is posted
   * **sticky** with the same two answers the card has — `yes` and `no` — because
   * a suggestion that slides away while the user is heads-down is one that was
   * never delivered, and an answer that requires finding the app first is an
   * answer that waits. The ids are the app's own vocabulary, so the label can be
   * reworded without the handler changing; the tag is what tells the two
   * questions apart when a button is pressed (see {@link listenForAnswers}).
   */
  private async deliver(
    title: string,
    body: string,
    systemBody: string,
    tag: string,
    systemActions: NotificationAction[],
    toastActions: ToastAction[],
  ): Promise<void> {
    if (this.attention.paused()) {
      this.attention.holdNudge();
      this.log?.info('flow', `reminder held while paused: ${title}`);
      return;
    }

    await this.notifications.announce(title, systemBody, {
      quote: this.notifications.nextQuote('desktop'),
      tag,
      sticky: true,
      actions: systemActions,
    });

    if (this.attention.quietNow()) {
      this.attention.holdNudge();
      this.log?.info('flow', `reminder held for the desktop's quiet state: ${title}`);
      return;
    }

    this.notifications.showToastMessage(
      title,
      body,
      'work',
      this.notifications.nextQuote('desktop'),
      toastActions,
      tag,
    );
  }

  /**
   * Wires the startup reminder's two answers to the same work its card's buttons
   * do. The pin reminder's buttons belong to `DesktopPrefsService`, which owns
   * pinning and answers under the same tag — one question, one answerer.
   */
  private listenForAnswers(): void {
    if (this.unlistenActions.length) return;
    this.unlistenActions.push(
      this.notifications.onToastAction(NotificationService.STARTUP_NOTIFICATION_TAG, (action) => {
        void this.answerStartup(action);
      }),
    );
  }

  /**
   * **Yes** or **Not now** on a startup reminder's notification.
   *
   * The notification is taken down first, whichever answer it was: leaving a
   * question on screen after it has been answered is the one thing that makes a
   * sticky reminder feel broken. **Yes** performs the setting change the dialog
   * would have made; **No** is "not now", not "never" — the reminder's own card
   * still offers **Stop asking** for that, and the cadence already knows this
   * slot has been delivered.
   */
  private async answerStartup(action: string): Promise<void> {
    await this.notifications.dismissSystemNotification(
      NotificationService.STARTUP_NOTIFICATION_TAG,
    );

    if (action === 'yes') {
      await this.acceptStartWithSystem();
      return;
    }
    if (action === 'no') {
      this.quietUntil = Date.now() + AFTER_DECLINE_QUIET_MINUTES * 60_000;
    }
  }

  /** The two answers a startup reminder offers on its card. */
  private startupActions(): ToastAction[] {
    return [
      {
        label: 'Turn on',
        primary: true,
        run: async () => {
          const accepted = await this.acceptStartWithSystem();
          if (!accepted) {
            this.notifications.showToastMessage(
              'Could not change the startup setting',
              this.error() ?? 'Try Settings → Desktop.',
              'work',
              this.notifications.nextQuote('desktop'),
            );
          }
        },
      },
      {
        label: 'Stop asking',
        run: () => this.stopStartupNudges(),
      },
    ];
  }

  /**
   * The two answers a pin reminder offers on its card.
   *
   * **Pin now** is the answer the notification's **Yes** gives too — when the
   * shell will take the request. Where it will not, the same button is labelled
   * **Show me** and opens the installed-app list, because a button that ends in
   * "Windows did not pin DeepWork" is worse than one that says where the button
   * is. **Stop asking** ends the reminders either way.
   */
  private pinActions(allowed: boolean): ToastAction[] {
    return [
      {
        label: allowed ? 'Pin now' : TASKBAR_PIN_MANUAL.card,
        primary: true,
        run: async () => {
          await this.notifications.dismissSystemNotification(
            NotificationService.PIN_NOTIFICATION_TAG,
          );
          if (allowed) {
            await this.prefs.pinNow();
          } else {
            await this.prefs.showPinHelper();
          }
          await this.refreshPin();
        },
      },
      {
        label: 'Stop asking',
        run: () => this.stopPinNudges(),
      },
    ];
  }

  private advance(kind: 'startup' | 'pin', to: number): void {
    const limited = Math.min(
      to,
      kind === 'startup' ? this.plan.startup.length : this.plan.pin.length,
    );
    if (limited === this.fired[kind]) return;
    this.fired[kind] = Math.max(this.fired[kind], limited);
    this.saveFired();
  }

  /** Counts every reminder that has already come round as dealt with. */
  private skipDueNow(withinMinutes: number): void {
    const minute = minutesOfDay(new Date()) + withinMinutes;
    this.fired.startup = Math.max(
      this.fired.startup,
      this.plan.startup.filter((time) => time <= minute).length,
    );
    this.fired.pin = Math.max(
      this.fired.pin,
      this.plan.pin.filter((time) => time <= minute).length,
    );
    this.saveFired();
  }

  private ensurePlan(now: Date = new Date()): void {
    const day = localDayKey(now);
    if (this.plan.day === day) return;
    this.plan = nudgePlanFor(day);
    this.fired = { day, startup: 0, pin: 0 };
    this.saveFired();
  }

  private loadFired(): FiredCounts {
    const today = localDayKey(new Date());
    try {
      const parsed = JSON.parse(
        globalThis.localStorage?.getItem(FIRED_KEY) ?? 'null',
      ) as Partial<FiredCounts> | null;
      if (parsed?.day === today) {
        return {
          day: today,
          startup: Number(parsed.startup) || 0,
          pin: Number(parsed.pin) || 0,
        };
      }
    } catch {
      // An unreadable store means today starts from its first reminder.
    }
    return { day: today, startup: 0, pin: 0 };
  }

  private saveFired(): void {
    try {
      globalThis.localStorage?.setItem(FIRED_KEY, JSON.stringify(this.fired));
    } catch {
      // A counter that cannot be saved only costs one repeated reminder.
    }
  }

  private async markPrompted(): Promise<void> {
    if (this.settings.settings().launchPrompted) return;
    await this.settings.updateField('launchPrompted', true);
  }

  private async setNudge(
    field: 'startupNudge' | 'taskbarPinNudge',
    enabled: boolean,
  ): Promise<void> {
    if (this.settings.settings()[field] === enabled) return;
    await this.settings.updateField(field, enabled);
    if (field === 'startupNudge') this.fired.startup = 0;
    else this.fired.pin = 0;
    // Turning one back on is not a reason to be reminded this minute: every slot
    // already behind the clock is counted as dealt with, and the next one is the
    // one the user will actually meet.
    if (enabled) this.skipDueNow(0);
    this.saveFired();
  }

  ngOnDestroy(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    for (const unlisten of this.unlistenActions.splice(0)) unlisten();
  }
}

/** One line from whatever went wrong. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
