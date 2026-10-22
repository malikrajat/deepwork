import { computed, effect, Injectable, inject, signal, OnDestroy } from '@angular/core';
import { TimerType } from '../models/session.model';
import { SettingsService } from './settings.service';
import { AttentionService } from './attention.service';
import { NotificationSound } from '../models/settings.model';
import { BREAK_QUOTES, FOCUS_QUOTES, TASK_QUOTES, quoteAt } from '../constants/alert.constants';

/**
 * A button on a card.
 *
 * Some of what the app has to say is not a message but a question — "start with
 * Windows?", "want DeepWork on the taskbar?" — and a question whose only control
 * is a close button can only ever be answered "not now". An action is a label
 * and what it does; the card runs it, and the action itself decides whether the
 * card stays up.
 */
export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
  /** Drawn as the filled button; at most one action should set it. */
  primary?: boolean;
}

/** True when running inside the packaged desktop app (Tauri). */
const IN_TAURI = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

/**
 * How long a question waits before it is asked again after being dismissed.
 *
 * A toast that stays on screen until it is answered is the first half of "do not
 * lose the question"; this is the other half. The user may cross it because they
 * are in the middle of something — a demo, a call, a sentence — and crossing is
 * not an answer. Three minutes is long enough not to fight them for the same
 * minute and short enough that the glass, the break or the next session is not
 * forgotten.
 */
export const UNANSWERED_NOTIFICATION_REMINDER_MS = 3 * 60_000;

/**
 * What the shell reports when a toast's button is pressed.
 *
 * Mirrors `ToastActionEvent` in `src-tauri/src/lib.rs`: the tag says which
 * message was answered, and the action is the button's own id rather than its
 * label.
 */
interface ToastActionPayload {
  tag: string;
  action: string;
}

/**
 * What the shell reports when a toast goes away without an answer.
 *
 * Mirrors `ToastDismissedEvent` in `src-tauri/src/lib.rs`. `reason` is the
 * shell's own word — `user`, `timeout`, `activated` — and the page treats them
 * the same: the question is unanswered and may be asked again.
 */
interface ToastDismissedPayload {
  tag: string;
  reason: string;
}

export interface ToastNotification {
  id: number;
  title: string;
  body: string;
  /**
   * A motivational line that arrives with the message, or null.
   *
   * It is a field of its own rather than a second sentence glued onto `body`,
   * because the two are read differently: the message is the news, the quote is
   * the encouragement. Keeping them apart is what lets every surface draw them
   * apart — the card, the Windows toast and the plain-text fallbacks each put
   * the quote on a line of its own (see `ToastComponent` and `alert_notify`).
   */
  quote: string | null;
  /**
   * The buttons the card offers, in order. Empty for a plain message.
   *
   * Optional so a card written by an older caller — or by a test that only
   * cares about the words — still draws; the template treats a missing list as
   * no buttons at all.
   */
  actions?: ToastAction[];
  /**
   * The handle this card belongs to, when it is a question rather than news.
   *
   * The same tag its OS notification is posted under. It is what lets
   * {@link NotificationService.dismissSystemNotification} take the card down
   * when the question was answered on the desktop — without touching a
   * completion alert that happens to be showing at the same moment.
   */
  tag?: string;
  type: TimerType;
  visible: boolean;
}

/**
 * One button a system notification offers.
 *
 * `id` is what the handler is given when the button is pressed — the app's own
 * vocabulary (`yes`, `no`, `pin`, `cancel`) rather than the sentence the button
 * wears, so a label can be reworded without its handler changing. `label` is
 * what the button says.
 */
export interface NotificationAction {
  id: string;
  label: string;
}

/** What a notification asks of the shell, beyond the words it says. */
export interface NotificationOptions {
  /** The motivational line to show apart from the message, if there is one. */
  quote?: string | null;
  /**
   * The handle the post replaces rather than stacking beside.
   *
   * Defaults to the completion alert's, which is what makes an alert's repeats
   * one notification instead of one per interval. A caller whose message is its
   * own — the water reminder, the update notice — passes its own handle, so two
   * of the app's messages cannot take each other's place in the notification
   * centre.
   */
  tag?: string;
  /**
   * Ask the OS to keep it on screen until the user deals with it.
   *
   * Windows answers this with a `reminder` toast that waits rather than sliding
   * away after a few seconds (see `alert_notify`); the other platforms post it
   * as they always do.
   */
  sticky?: boolean;
  /**
   * What a click does, where the platform supports one.
   *
   * The page's own Notification API is the surface this reaches: the install
   * suggestion uses it to bring the user back to the banner that explains what
   * to do. A desktop shell owns its notification once posted and is given no
   * handler — clicking it brings the app forward, which is the same first step.
   */
  onClick?: () => void;
  /**
   * Buttons to put on the notification, in the order they should appear.
   *
   * Windows only: the toast schema is the one surface here that has a button a
   * desktop app can hear. Everywhere else the options are ignored and the
   * notification is the plain one it has always been, which is why a message
   * that *needs* an answer must always have another way of being answered (the
   * water reminder's card, the Settings row for pinning).
   *
   * A press is reported through {@link NotificationService.onToastAction}, by
   * the tag the notification was posted under.
   */
  actions?: NotificationAction[];
}

/**
 * How a completion alert is delivered — and it is a deliberate pair.
 *
 * The **system notification** is the OS-level half, posted through the desktop
 * shell (or the page's own Notification API outside it) so it is on screen even
 * when DeepWork is not. On Windows it is posted as a `reminder` toast that waits
 * on screen until it is dealt with, so the question is still there whenever the
 * user looks up. A toast that is crossed instead is asked again after three
 * minutes — see {@link UNANSWERED_NOTIFICATION_REMINDER_MS} — because a crossing
 * is not an answer. Where the platform cannot keep a toast (`sticky` is a Windows
 * toast behaviour), the system notification is re-posted on every repeat, and the
 * handle it is posted under is what keeps that from burying the desktop in
 * duplicates: Windows replaces a toast whose tag it already holds, and the
 * Notification API replaces one with the same `tag`, so the repeats re-raise
 * **one** notification rather than stacking a copy per interval. The body carries
 * the count ("Reminder 3 · …") so the repeat is visible even where the platform
 * ignores the handle — see {@link sendNotification}.
 *
 * The **in-app half** is what insists. The chosen alert tone, the card in the
 * full window and the mini widget's own alert all come back every
 * `notificationRepeatInterval` seconds until the user answers, because a Pomodoro
 * that finishes while the user is reading somewhere else should not be missed.
 * Anything that counts as an answer — the toast's close button in the full
 * window, one of the four answers on the card or on the Windows toast
 * (**Pause**, **Next**, **Resume**, **Hold up**), or any of the mini widget's
 * controls while the window is shrunk — ends the ring.
 *
 * Everything that repeats hangs off one signal, {@link alertPulse}: the tone, the
 * card, the widget's shake and the colour both surfaces take for that repeat. One
 * count means the user hears, sees and reads the same event instead of four
 * clocks that slowly drift apart.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  /**
   * What the alert's system notification is posted under, on every repeat.
   *
   * A toast is not identified by its text — Windows keys the notification centre
   * on the tag (and the browser's Notification API on `tag`), so posting the same
   * alert again under the same handle *replaces* the one still sitting there and
   * raises it again, which is exactly what a repeat is meant to look like. A new
   * handle per repeat would instead leave one message per interval.
   *
   * The number is what the plugin's desktop path can carry (`id` must be a 32-bit
   * integer); the string is what the tagged Windows toast and the web build use.
   */
  private static readonly ALERT_NOTIFICATION_TAG = 'deepwork-alert';
  private static readonly ALERT_NOTIFICATION_ID = 7301;

  /**
   * The four answers the completion alert offers, in the order they are drawn.
   *
   * They travel as ids and labels because that is what a toast can carry: the
   * id is what comes back when a button is pressed, the label is the sentence it
   * wears, so rewording a button never changes what it does. The same list is
   * posted to Windows and drawn on the card, which is what keeps the two
   * surfaces one question instead of two that happen to agree.
   *
   * The clock comes first and the way out last: **Pause**, **Next** and
   * **Resume** each answer the alert and then act on the timer — **Next** moves
   * to the next session and starts it, so the answer carries on by itself — and
   * **Hold up** is the "not now" — it closes the alert and leaves the clock
   * exactly as it was. See {@link runAlertAction}.
   */
  private static readonly ALERT_ACTIONS: NotificationAction[] = [
    { id: 'pause', label: 'Pause' },
    { id: 'next', label: 'Next' },
    { id: 'resume', label: 'Resume' },
    { id: 'hold', label: 'Hold up' },
  ];

  /**
   * The handles the app's other messages are posted under.
   *
   * A tagged post replaces the one before it, so two messages sharing a handle
   * would overwrite each other in the Action Center — a water reminder taking
   * the place of an unanswered completion alert, say. The alert keeps the handle
   * its repeats depend on; these are the ones the one-off messages use.
   */
  static readonly WATER_NOTIFICATION_TAG = 'deepwork-water';
  static readonly UPDATE_NOTIFICATION_TAG = 'deepwork-update';
  /**
   * The two suggestions. Handles of their own so a reminder can be replaced by
   * the next one of its kind without touching the water question, the update
   * notice or an unanswered completion alert — which on Windows would otherwise
   * be the notification a startup reminder quietly took the place of.
   */
  static readonly STARTUP_NOTIFICATION_TAG = 'deepwork-startup';
  static readonly PIN_NOTIFICATION_TAG = 'deepwork-pin';

  private readonly settingsService = inject(SettingsService);
  /**
   * The one place that decides whether the app may speak.
   *
   * The sound used to answer to a switch of its own, which is how a mute with no
   * end became possible. It now asks this service, which knows about the timed
   * mute, the tray's pause and the desktop's quiet state, so the bell and the
   * cards cannot disagree about whether now is a good moment.
   */
  private readonly attention = inject(AttentionService);

  /**
   * True where the operating system's notification can carry buttons that report
   * a press back to the app.
   *
   * Windows is that platform, through `alert_notify`, which keeps the toast
   * object alive so its **Activated** event reaches `deepwork:toast-action`. The
   * notification plugin, the browser's Notification API and the other desktops
   * all ignore an action list, so a message that *needs* an answer must not rely
   * on its buttons there. The water reminder reads this to decide whether the
   * mini widget can be left alone while its question is answered from the
   * desktop — see `WaterReminderService.asksOnDesktop`.
   */
  readonly canAnswerOnNotification =
    IN_TAURI && /Windows/i.test(globalThis.navigator?.userAgent ?? '');

  private repeatWorker: Worker | null = null;
  private repeatFallbackId: ReturnType<typeof setInterval> | null = null;
  private toastTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private permissionGranted = false;
  /** The one start-up in flight — see {@link init}. */
  private initPromise: Promise<void> | null = null;
  private pendingRepeat: {
    title: string;
    body: string;
    type: TimerType;
    quote: string | null;
    /** The buttons every repeat re-posts with; empty for a plain message. */
    actions: NotificationAction[];
  } | null = null;
  /** How many repeats of the current alert have been delivered. */
  private alertRepeats = 0;
  /**
   * How many alerts have been raised, which is the index the quote list is
   * walked by — one line per finished session rather than one per tone.
   */
  private alertCount = 0;
  /**
   * How many finished tasks have been announced, which is the index `TASK_QUOTES`
   * is walked by.
   *
   * Counted here rather than in the page that raises the card, so a task closed
   * from the matrix, from a board or from anywhere else added later draws from one
   * list in one order — and two tasks in a row never get the same sentence.
   */
  private completedTaskCount = 0;

  /** Toast state — consumed by the toast component */
  readonly toast = signal<ToastNotification | null>(null);
  private toastCounter = 0;

  /**
   * Whoever answers a toast's buttons, by the tag that toast was posted under.
   *
   * A tag is the notification's identity, so it is also the right key here: the
   * water reminder answers `deepwork-water`, the pin prompt answers
   * `deepwork-pin`, and neither can fire the other's handler. One handler per
   * tag, because two would be two answers to the same question.
   */
  private readonly actionHandlers = new Map<string, (action: string) => void>();

  /**
   * Whoever should be told that a toast went away unanswered, by its tag.
   *
   * The same key as {@link actionHandlers}, for the same reason: crossing the
   * water reminder must not start a reminder for the completion alert. It is a
   * second map rather than a flag because "answered" and "dismissed" are two
   * different events on the same question, and a service may want only one.
   */
  private readonly dismissHandlers = new Map<string, () => void>();

  /**
   * The timer that asks the unanswered completion alert again, if one is set.
   *
   * A sticky toast waits on screen until it is dealt with, but a user who
   * crosses it has not dealt with it. Three minutes later the question comes
   * back, and keeps coming back until a button is pressed — see
   * {@link UNANSWERED_NOTIFICATION_REMINDER_MS}.
   */
  private alertReminderId: ReturnType<typeof setTimeout> | null = null;

  /**
   * True when the alert's current toast is one the OS will keep on screen.
   *
   * Only the tagged Windows toast can do that. While it is true the alert does
   * not re-post the notification on every tone — the toast is already there, and
   * a sticky toast that is replaced every minute is a banner, not a question.
   * It goes false when the shell falls back to a surface that ignores `sticky`,
   * and then the old repeat-every-tone behaviour returns.
   */
  private alertIsSticky = false;

  /**
   * Who moves the clock when the alert's **Pause**, **Next** or **Resume** is
   * pressed, if anyone.
   *
   * `TimerService` registers this in its constructor. It is a callback rather
   * than a dependency because the edge already runs the other way — the timer
   * tells this service that a session finished — and two root services that
   * each need the other cannot both be injected into the other.
   */
  private alertActionHandler: ((action: string) => void) | null = null;

  /**
   * True while a completion alert is still unanswered — and therefore still
   * ringing, and still repeating.
   *
   * Published rather than kept private to the toast because the toast is not
   * always on screen: shrinking the window is exactly how the user ends up in
   * the mini widget, and that is where the alert has to be answerable too (see
   * `MiniWidgetComponent`). It goes false the moment anything answers.
   */
  readonly ringing = signal(false);

  /**
   * Bumped every time the alert is *raised* — once when the session ends and
   * again on every repeat of the tone.
   *
   * The tone is heard; the alert also has to be *seen* repeating, and this is the
   * one count every visible part of it reads: the widget shakes and takes a new
   * colour from `ALERT_COLOURS`, and the full window's card does the same, so
   * what the user hears, what moves and what changes colour are one event rather
   * than several clocks that happen to run at the same speed and slowly drift
   * apart.
   *
   * Not reset by {@link dismiss}: a pulse is an edge, not a state. Both surfaces
   * stop reading it the moment `ringing` goes false.
   */
  readonly alertPulse = signal(0);

  /**
   * How long the alert's shake lasts, in milliseconds, as the user chose it.
   *
   * The mini widget is the surface that reads it. The card in the full window
   * keeps the short shake it has always had: it is in front of someone who is
   * already looking at the screen, while the widget is out on the desktop among
   * other windows and is the one that has to outlast the tone to be seen at all.
   */
  readonly alertShakeMs = computed(() => this.settingsService.settings().alertShakeMs);

  constructor() {
    // The alert's own tag, answered by this service: the notification is posted
    // here and taken back here, so the four buttons land where the message was
    // written rather than in whichever service happens to be listening. Pause,
    // Next and Resume are then handed to the clock — see `onAlertAction`.
    this.onToastAction(NotificationService.ALERT_NOTIFICATION_TAG, (action) =>
      this.runAlertAction(action),
    );
    // A toast that is crossed is not an answer: the question comes back in three
    // minutes, and the ring is left exactly as it is.
    this.onToastDismissed(NotificationService.ALERT_NOTIFICATION_TAG, () =>
      this.scheduleAlertReminder(),
    );

    effect(() => {
      const intervalSeconds = this.settingsService.settings().notificationRepeatInterval;
      if (this.pendingRepeat) {
        const { title, body, type, quote, actions } = this.pendingRepeat;
        this.startRepeatLoop(title, body, type, quote, actions, intervalSeconds);
      }
    });
  }

  /**
   * Initialises once, and makes every caller wait for the *whole* of it.
   *
   * The permission answer and the button listener are one start-up: a toast
   * posted between them would carry buttons the shell has nobody listening for,
   * and the press would disappear. So the in-flight promise is shared rather
   * than a boolean being set before the work is done — the second caller waits
   * for the first instead of racing past it.
   */
  async init(): Promise<void> {
    this.initPromise ??= this.initialize();
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const { isPermissionGranted, requestPermission } =
        await import('@tauri-apps/plugin-notification');
      this.permissionGranted = await isPermissionGranted();
      if (!this.permissionGranted) {
        const permission = await requestPermission();
        this.permissionGranted = permission === 'granted';
      }
    } catch {
      // Browser fallback - use Notification API
      if ('Notification' in globalThis && Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        this.permissionGranted = result === 'granted';
      } else {
        this.permissionGranted = Notification.permission === 'granted';
      }
    }

    // Before any toast is posted, because the shell only tells a session about
    // a press it was already listening for. See `listenForToastActions`.
    await this.listenForToastActions();
  }

  /**
   * Answers a button on the notification posted under `tag`.
   *
   * The handler receives the button's id (`yes`, `pin`, …) rather than its
   * label, so the wording of a button is free to change. Registering a second
   * handler for the same tag replaces the first: a question has one answerer.
   *
   * Returns a function that unregisters it, for the services that hold one for
   * their lifetime and want it gone with them.
   */
  onToastAction(tag: string, handler: (action: string) => void): () => void {
    this.actionHandlers.set(tag, handler);
    return () => {
      if (this.actionHandlers.get(tag) === handler) this.actionHandlers.delete(tag);
    };
  }

  /**
   * Tells a service when the notification posted under `tag` went away without
   * one of its buttons being pressed.
   *
   * Registered by the services that ask a question, because "dismissed" is not
   * "answered": the water reminder has to ask again for a glass that was not
   * drunk, and the completion alert has to ask again for a session that was not
   * started. The handler is registered per tag for the same reason
   * {@link onToastAction} is — one question, one answerer.
   *
   * Returns a function that unregisters it.
   */
  onToastDismissed(tag: string, handler: () => void): () => void {
    this.dismissHandlers.set(tag, handler);
    return () => {
      if (this.dismissHandlers.get(tag) === handler) this.dismissHandlers.delete(tag);
    };
  }

  /**
   * Answers the alert's **Pause**, **Next** and **Resume** with the clock.
   *
   * `TimerService` registers this once, in its constructor, and that is the
   * whole of the wiring: the alert does not know what a session is, and the
   * timer does not have to know where its buttons are drawn. **Hold up** never
   * reaches the handler — closing the alert is this service's own job, and a
   * message that could outlive its own "not now" would be one nobody trusts.
   *
   * Registering a second handler replaces the first, for the same reason
   * {@link onToastAction} does: one alert, one clock.
   *
   * Returns a function that unregisters it.
   */
  onAlertAction(handler: (action: string) => void): () => void {
    this.alertActionHandler = handler;
    return () => {
      if (this.alertActionHandler === handler) this.alertActionHandler = null;
    };
  }

  /**
   * Answers the completion alert from one of its own buttons, whichever surface
   * the press arrived on.
   *
   * **Every** button answers it: the user has dealt with the message, so the
   * ring stops, the card goes and the toast is taken back — a reminder that
   * stays on screen after it was answered is one the user learns to ignore, the
   * same rule the water reminder follows. What differs is the clock: **Hold up**
   * leaves it exactly as it was, which is what makes it the "not now" answer,
   * while Pause, Next and Resume are handed to {@link onAlertAction}.
   *
   * The buttons can be pressed long after the alert was raised — a toast lives
   * in the notification centre until the user clears it — so Pause still pauses
   * a session the user started since, and Resume starts the next one. That is
   * the point of answering from there rather than going to find the window.
   */
  private runAlertAction(action: string): void {
    this.dismiss();
    void this.dismissSystemNotification(NotificationService.ALERT_NOTIFICATION_TAG);
    if (action === 'hold') return;
    this.alertActionHandler?.(action);
  }

  /**
   * Raises the completion alert: the tone, the card, the widget's shake and the
   * system notification, all on the one pulse.
   *
   * The **quote** belongs to the alert rather than to a repeat of it. A focus
   * session sends the user away from the desk and a break calls them back, so the
   * list it is drawn from depends on what just finished — and it is picked once,
   * here, so the sentence does not change under the user mid-read while the tone
   * keeps coming back. See `FOCUS_QUOTES` and `BREAK_QUOTES`.
   */
  async fireTimerComplete(type: TimerType, nextType?: TimerType): Promise<void> {
    let title: string;
    let body: string;

    if (type === 'work') {
      if (nextType === 'long-break') {
        title = 'Cycle complete!';
        body = 'Great work! Time for a long break.';
      } else {
        title = 'Focus session complete!';
        body = 'Great work! Time for a short break.';
      }
    } else if (type === 'long-break') {
      title = 'Long break is over!';
      body = 'Feeling refreshed? Ready for a new cycle!';
    } else {
      title = 'Break is over!';
      body = 'Ready to focus again?';
    }

    const quote = quoteAt(type === 'work' ? FOCUS_QUOTES : BREAK_QUOTES, this.alertCount);
    this.alertCount += 1;

    // The four answers belong to the alert rather than to one post: the toast is
    // re-posted on every repeat under the alert's own tag, and Windows replaces
    // the notification it is already holding, so a repeat that omitted them
    // would quietly take the buttons away mid-question.
    const actions = NotificationService.ALERT_ACTIONS;

    // Deliberately set before anything is delivered: the widget reads it to show
    // the alert, and there is no frame in which the alert is ringing unseen.
    this.ringing.set(true);
    this.alertPulse.update((pulse) => pulse + 1);
    this.alertRepeats = 0;
    this.clearAlertReminder();
    // `sticky` is the first half of "do not lose the question": on Windows the
    // toast waits on screen instead of sliding away after a few seconds. The
    // return value says whether the tagged toast that understands it is what
    // posted; if the shell fell back to another surface, the repeat loop re-posts
    // as it always did. The platform gate matters because the non-Windows
    // `alert_notify` command succeeds through the plugin, which has no `sticky`.
    // The post is always made — the gate only decides how repeats treat it.
    const posted = await this.sendNotification(title, body, 0, {
      quote,
      actions,
      sticky: true,
    });
    this.alertIsSticky = this.canAnswerOnNotification && posted;
    this.playSound();
    this.showAlertToast(title, body, type, quote);
    this.startRepeatLoop(title, body, type, quote, actions);
  }

  /**
   * Answers the alert: the ring stops, the card goes, and the cadence is
   * forgotten. Safe to call when nothing is ringing.
   *
   * The system notification is not withdrawn by a plain dismissal — the close
   * cross stops the ring without choosing one of the four answers — so clearing
   * it in the notification centre stays the behaviour the user expects from every
   * other app. One of the alert's own buttons does take the toast back as well,
   * because it answers the question the toast is still asking. See
   * {@link runAlertAction}.
   */
  dismiss(): void {
    this.ringing.set(false);
    this.clearAlertReminder();
    this.alertIsSticky = false;
    this.stopRepeatLoop();
    this.toast.set(null);
  }

  /**
   * Brings an unanswered alert back after it was crossed.
   *
   * The toast is sticky, so the ordinary state of an unanswered alert is "still
   * on screen". This is the other state: the user swiped it away, or the shell
   * timed it out. Neither is an answer, so the question is posted again — once
   * three minutes have passed, and again three minutes after every further
   * dismissal, until one of the four buttons is pressed. Pressing one stops it
   * through {@link dismiss}.
   */
  private scheduleAlertReminder(): void {
    this.clearAlertReminder();
    if (!this.ringing() || !this.pendingRepeat) return;

    this.alertReminderId = setTimeout(() => {
      this.alertReminderId = null;
      void this.repostAlert();
    }, UNANSWERED_NOTIFICATION_REMINDER_MS);
  }

  /**
   * Puts the crossed alert back on the desktop.
   *
   * The tone keeps its own cadence; this post only puts the question back where
   * the user can answer it. If the tagged toast cannot be posted this time, the
   * repeat loop takes over again — the alert must not go quiet because the one
   * re-post failed.
   */
  private async repostAlert(): Promise<void> {
    if (!this.ringing() || !this.pendingRepeat) return;
    const { title, body, quote, actions } = this.pendingRepeat;
    const posted = await this.sendNotification(title, body, this.alertRepeats, {
      quote,
      actions,
      sticky: true,
    });
    this.alertIsSticky = this.canAnswerOnNotification && posted;
  }

  /** Drops a pending "ask again" without touching the alert itself. */
  private clearAlertReminder(): void {
    if (this.alertReminderId) {
      clearTimeout(this.alertReminderId);
      this.alertReminderId = null;
    }
  }

  /**
   * Shows a one-off card, and optionally the buttons it is asking with.
   *
   * Used by the tray's own confirmations (a resumed timer, a mute that ends by
   * itself later) and by the two reminders that ask for a desktop favour. The
   * actions are closures rather than ids because the card is a view of a
   * decision already made by the service that raised it — there is no router
   * between the two, and there is nothing to serialise.
   */
  showToastMessage(
    title: string,
    body: string,
    type: TimerType,
    quote: string | null = null,
    actions: ToastAction[] = [],
    tag?: string,
  ): void {
    this.showToast(title, body, type, quote, actions, tag);
  }

  /**
   * Announces a task the user has just finished: the news, and a line to go
   * with it.
   *
   * Deliberately **not** an alert — no tone, no repeat, no desktop notification.
   * Finishing a task is a small thing that happens many times a day, and the
   * completion alert's machinery (a tone every minute until it is answered) would
   * be the fastest way to get the sound turned off. What it borrows is the shape
   * the alert already established: the message is the news, the encouragement is
   * a line of its own under it, and the two are never glued into one sentence —
   * see `ToastComponent`, which draws them apart.
   *
   * The line is drawn from {@link TASK_QUOTES}, walked one entry per finished
   * task rather than sampled at random, so the same sentence does not come back
   * twice in a row.
   */
  announceTaskCompleted(title: string): void {
    const quote = quoteAt(TASK_QUOTES, this.completedTaskCount);
    this.completedTaskCount += 1;
    this.showToast('Task completed', title, 'work', quote);
  }

  /**
   * A one-off system notification, with no sound and no in-app toast.
   *
   * The update check uses this: the OS tells the user a newer release exists,
   * and the page they are on does not need a card on top of what they are doing.
   * The water reminder uses it too, and passes the two options that suit a
   * question: its own handle, and `sticky` — a nudge that disappears while the
   * user is heads-down is a nudge that was never delivered.
   *
   * Returns whether the message was posted somewhere its `actions` can actually
   * be pressed. For a message with no actions that is "was it posted at all";
   * for one that asks a question it is the narrower "can the question be
   * answered where it was shown" — the plugin and browser fallbacks ignore the
   * action list, so they report `false` even though they did show the words.
   * The water reminder uses that to tell whether leaving the mini widget alone
   * would leave its question unanswerable — see `WaterReminderService.remind`.
   */
  async announce(title: string, body: string, options: NotificationOptions = {}): Promise<boolean> {
    await this.init();
    return this.sendNotification(title, body, 0, options);
  }

  /**
   * Takes back a system notification the app posted with buttons.
   *
   * A question posted as a `reminder` toast waits on screen until it is dealt
   * with, which is the point — but once it *has* been answered, in the app or on
   * the toast, leaving it there would ask the user a question they have already
   * answered. Windows is the only platform where this can do anything: the app
   * keeps the toast object it posted (see `ToastHandles` in `lib.rs`), and the
   * shell will close it on request. Elsewhere the notification belongs to the OS
   * from the moment it is posted, and a no-op is the honest answer.
   *
   * A tag with no live toast is not an error, so this never throws.
   */
  async dismissSystemNotification(tag: string): Promise<void> {
    // The card is the same question asked in the app, so it goes too — but only
    // when it is this question's card. A completion alert ringing at the same
    // moment is somebody else's message and must not be silenced by an answer to
    // this one.
    if (this.toast()?.tag === tag) this.toast.set(null);
    if (!IN_TAURI) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('toast_dismiss', { tag });
    } catch {
      // A shell from before the command existed. The toast will be dismissed by
      // the user (or by Windows) instead; nothing in the app depends on it.
    }
  }

  /** Plays the chosen sound from a user interaction without changing settings. */
  previewSound(sound: NotificationSound): void {
    this.playSound(sound, true);
  }

  /**
   * Rings the alert tone the user chose, once.
   *
   * The water reminder calls this when it asks its question: a notification
   * should sound like the app's other notifications, and answer to the same two
   * controls — the **Notification sound** list in Settings (where `none` means
   * silent) and the tray's timed mute — instead of inventing a tone of its own.
   */
  chime(): void {
    this.playSound();
  }

  /**
   * Starts listening for a pressed toast button — and for a toast that goes away
   * without one.
   *
   * One listener for the whole app rather than one per notification: the shell
   * does not know who "owns" a toast — it reports the press to the process —
   * and the tag on the event is what sorts it out afterwards. Registered from
   * {@link init} so it is in place before the first toast that carries a button
   * is posted: the shell only tells a session about a press it was already
   * listening for.
   *
   * A dismissal is the same wiring with a different question: the tag says which
   * message went away, and the service that asked it decides whether the
   * unanswered state deserves another reminder.
   */
  private async listenForToastActions(): Promise<void> {
    if (!IN_TAURI) return;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<ToastActionPayload>('deepwork:toast-action', (event) => {
        const { tag, action } = event.payload ?? {};
        if (typeof tag !== 'string' || typeof action !== 'string') return;
        this.actionHandlers.get(tag)?.(action);
      });
      await listen<ToastDismissedPayload>('deepwork:toast-dismissed', (event) => {
        const { tag } = event.payload ?? {};
        if (typeof tag !== 'string') return;
        this.dismissHandlers.get(tag)?.();
      });
    } catch {
      // A shell from before the events existed: the buttons are still drawn, they
      // just cannot answer. The in-app surface is the fallback in that case.
    }
  }

  /**
   * Raises the alert's card with its four answers.
   *
   * The card asks the same question the notification does — the same ids, in the
   * same order, wearing the same words — and it carries the alert's tag, which
   * is what lets an answer on either surface take the other one down (see
   * {@link dismissSystemNotification}).
   */
  private showAlertToast(
    title: string,
    body: string,
    type: TimerType,
    quote: string | null,
  ): void {
    const actions: ToastAction[] = NotificationService.ALERT_ACTIONS.map((action) => ({
      label: action.label,
      // Both surfaces go through `runAlertAction`, so a button on the card can
      // never come to mean something different from the same button on the toast.
      run: () => this.runAlertAction(action.id),
    }));
    this.showToast(title, body, type, quote, actions, NotificationService.ALERT_NOTIFICATION_TAG);
  }

  private showToast(
    title: string,
    body: string,
    type: TimerType,
    quote: string | null = null,
    actions: ToastAction[] = [],
    tag?: string,
  ): void {
    // Set null first to force Angular to destroy and re-create the element (re-triggers animation)
    this.toast.set(null);
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    this.toastTimeoutId = setTimeout(() => {
      this.toastCounter++;
      this.toast.set({
        id: this.toastCounter,
        title,
        body,
        quote,
        actions,
        tag,
        type,
        visible: true,
      });
      this.toastTimeoutId = null;
    }, 50);
  }

  /**
   * Posts the alert to the operating system, re-raising the alert's own
   * notification rather than adding another one.
   *
   * Three routes, in order, because the desktop is the one that matters and the
   * others are what is left when it is not there:
   *
   * 1. `alert_notify` in the desktop shell — the tagged Windows toast, which is
   *    the only route that can post under a handle the OS will replace. The
   *    notification plugin cannot: its desktop path goes through `notify-rust`,
   *    which has no tag to post under, so every repeat through it would be a
   *    second toast. See `src-tauri/src/lib.rs`.
   * 2. The notification plugin, for a shell from before that command existed and
   *    for every non-Windows desktop.
   * 3. The page's own Notification API, for the browser build, where `tag` gives
   *    the same replacement behaviour the shell gives on Windows.
   *
   * `repeats` is how many tones have already played for this alert; the count
   * goes into the body, so the notification says something new on every repeat
   * even on a platform that shows each post separately.
   *
   * The quote travels as a field of its own rather than a line appended to the
   * body, because the two are drawn apart wherever there is something to draw
   * with: the Windows toast gives it its own, smaller text line, and the plugin
   * and browser fallbacks — which can only take one string — get a blank line
   * before it.
   */
  private async sendNotification(
    title: string,
    body: string,
    repeats = 0,
    options: NotificationOptions = {},
  ): Promise<boolean> {
    const text = repeats > 0 ? `Reminder ${repeats} · ${body}` : body;
    const quote = options.quote ?? null;
    // A question is only delivered when the surface can carry its answers; the
    // two fallbacks below cannot, so they report `false` for one. See `announce`.
    const asks = (options.actions?.length ?? 0) > 0;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('alert_notify', {
        title,
        body: text,
        tag: options.tag ?? NotificationService.ALERT_NOTIFICATION_TAG,
        quote,
        sticky: options.sticky ?? false,
        actions: options.actions ?? [],
      });
      return true;
    } catch {
      // Not the desktop shell, a shell without the command, or a toast the shell
      // refused to post: the plugin is what is left, and it still reaches the
      // desktop (under the same id, without the tag). See `alert_notify`.
    }
    try {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      // Web Audio below is the single source for the user-selected alert tone.
      // Requesting the platform's default sound here would always add a bell.
      await sendNotification({
        id: NotificationService.ALERT_NOTIFICATION_ID,
        title,
        body: withQuote(text, quote),
      });
      return !asks;
    } catch {
      // Outside the desktop shell, or refused by it: fall through to the page's
      // own Notification API below.
    }
    try {
      if (this.permissionGranted && 'Notification' in globalThis) {
        // `requireInteraction` is the browser's version of "stay until answered",
        // which is the rule this whole service is built around, and `tag` is its
        // version of the handle that makes a repeat replace rather than stack.
        const posted = new Notification(title, {
          body: withQuote(text, quote),
          tag: options.tag ?? NotificationService.ALERT_NOTIFICATION_TAG,
          requireInteraction: true,
        });
        // A click on a browser notification is all the user gets: it should do
        // what clicking a desktop toast does — bring them to the app — plus
        // whatever the caller wants to happen once they are there.
        posted.onclick = () => {
          globalThis.focus?.();
          options.onClick?.();
          posted.close();
        };
        // The browser's Notification API has no buttons either.
        return !asks;
      }
    } catch {
      // No notification surface here at all — the tone and the card still run.
    }
    return false;
  }

  private playSound(
    sound = this.settingsService.settings().notificationSound,
    ignoreMute = false,
  ): void {
    // The timed mute lives in `AttentionService`; it silences the tone only,
    // which is what the tray's mute has always meant and now also says when it
    // will end.
    if (this.attention.soundMuted() && !ignoreMute) return;
    if (sound === 'none') return;

    try {
      this.audioContext ??= new AudioContext();
      const ctx = this.audioContext;

      // A tone scheduled on a suspended context is silent — and a reminder that
      // fires while the user is working in another app is exactly when the
      // browser's autoplay policy may have left the context suspended. Ask it to
      // run before anything is scheduled on it.
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

      switch (sound) {
        case 'chime':
          this.playChime(ctx);
          break;
        case 'ding':
          this.playDing(ctx);
          break;
        case 'bell':
        default:
          this.playBell(ctx);
          break;
      }
    } catch {
      // Audio not available
    }
  }

  private playBell(ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(830, ctx.currentTime);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);
  }

  private playChime(ctx: AudioContext): void {
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.2);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.2 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.8);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.8);
    });
  }

  private playDing(ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  }

  private startRepeatLoop(
    title: string,
    body: string,
    type: TimerType,
    quote: string | null = null,
    actions: NotificationAction[] = [],
    intervalSeconds = this.settingsService.settings().notificationRepeatInterval,
  ): void {
    this.stopRepeatLoop();
    this.pendingRepeat = { title, body, type, quote, actions };
    const intervalMs = intervalSeconds * 1000;

    // Use Web Worker for repeat timer — workers are NOT throttled when app is
    // minimized/background, so OS notifications fire reliably on Windows/Mac/Linux
    try {
      this.repeatWorker = new Worker(
        new URL('../workers/notification-repeat.worker', import.meta.url),
        { type: 'module' },
      );
      this.repeatWorker.onmessage = () => this.onRepeatTick();
      this.repeatWorker.postMessage({ command: 'start', intervalMs });
    } catch {
      // Fallback to setInterval if Worker fails (e.g. dev server)
      this.repeatFallbackId = setInterval(() => this.onRepeatTick(), intervalMs);
    }
  }

  /**
   * One repeat of an unanswered alert: the tone again, and the card again.
   *
   * The system notification is handled separately now. A sticky toast is already
   * on screen until it is dealt with, and replacing it every minute would turn a
   * question into a banner — so while the OS is holding it, nothing is re-posted.
   * If the user crosses it, {@link scheduleAlertReminder} puts it back after three
   * minutes. Where the shell cannot keep a toast (the plugin and browser
   * surfaces), the old behaviour stands: every repeat re-posts the notification,
   * because that is the only way it is seen again.
   */
  private onRepeatTick(): void {
    if (!this.pendingRepeat) return;
    const { title, body, type, quote, actions } = this.pendingRepeat;
    this.alertRepeats += 1;
    // Everything visual hangs off this: one shake and one new colour per tone,
    // in the widget and on the card alike.
    this.alertPulse.update((pulse) => pulse + 1);
    if (!this.alertIsSticky) {
      void this.sendNotification(title, body, this.alertRepeats, {
        quote,
        actions,
        sticky: true,
      });
    }
    this.playSound();
    this.showAlertToast(title, body, type, quote);
  }

  private stopRepeatLoop(): void {
    this.pendingRepeat = null;
    // The count belongs to the alert that just ended; the next one starts at 1.
    this.alertRepeats = 0;
    if (this.repeatWorker) {
      this.repeatWorker.postMessage({ command: 'stop' });
      this.repeatWorker.terminate();
      this.repeatWorker = null;
    }
    if (this.repeatFallbackId) {
      clearInterval(this.repeatFallbackId);
      this.repeatFallbackId = null;
    }
  }

  ngOnDestroy(): void {
    this.stopRepeatLoop();
    this.clearAlertReminder();
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
      this.toastTimeoutId = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * The message and its quote as one string, for the surfaces that take one.
 *
 * The plugin and the page's Notification API both carry a single `body`, so the
 * separation the toast gets from a second `<text>` line is a blank line here.
 */
function withQuote(body: string, quote: string | null): string {
  return quote ? `${body}\n\n${quote}` : body;
}
