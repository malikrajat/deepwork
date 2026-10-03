import { computed, effect, Injectable, inject, signal, OnDestroy } from '@angular/core';
import { TimerType } from '../models/session.model';
import { SettingsService } from './settings.service';
import { NotificationSound } from '../models/settings.model';
import { BREAK_QUOTES, FOCUS_QUOTES, TASK_QUOTES, quoteAt } from '../constants/alert.constants';

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
  type: TimerType;
  visible: boolean;
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
}

/**
 * How a completion alert is delivered — and it is a deliberate pair.
 *
 * The **system notification** is the OS-level half, posted through the desktop
 * shell (or the page's own Notification API outside it) so it is on screen even
 * when DeepWork is not — and it is posted again on every repeat, because half of
 * this alert is that the user is somewhere else. What keeps that from burying the
 * desktop in duplicates is the handle it is posted under: Windows replaces a
 * toast whose tag it already holds, and the New Notification API replaces one
 * with the same `tag`, so the repeats re-raise **one** notification rather than
 * stacking a copy per interval. The body carries the count ("Reminder 3 · …") so
 * the repeat is visible even where the platform ignores the handle — see
 * {@link sendNotification}.
 *
 * The **in-app half** is what insists. The chosen alert tone, the card in the
 * full window and the mini widget's own alert all come back every
 * `notificationRepeatInterval` seconds until the user answers, because a Pomodoro
 * that finishes while the user is reading somewhere else should not be missed.
 * Anything that counts as an answer — the toast's close button in the full
 * window, or any of the mini widget's controls while the window is shrunk — ends
 * the ring.
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
   * The handles the app's other messages are posted under.
   *
   * A tagged post replaces the one before it, so two messages sharing a handle
   * would overwrite each other in the Action Center — a water reminder taking
   * the place of an unanswered completion alert, say. The alert keeps the handle
   * its repeats depend on; these are the ones the one-off messages use.
   */
  static readonly WATER_NOTIFICATION_TAG = 'deepwork-water';
  static readonly UPDATE_NOTIFICATION_TAG = 'deepwork-update';

  private readonly settingsService = inject(SettingsService);

  private repeatWorker: Worker | null = null;
  private repeatFallbackId: ReturnType<typeof setInterval> | null = null;
  private toastTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private permissionGranted = false;
  private _initialized = false;
  private pendingRepeat: {
    title: string;
    body: string;
    type: TimerType;
    quote: string | null;
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

  /** Mutes the reminder sound (toggled from the system tray) */
  readonly muted = signal(false);

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
    effect(() => {
      const intervalSeconds = this.settingsService.settings().notificationRepeatInterval;
      if (this.pendingRepeat) {
        const { title, body, type, quote } = this.pendingRepeat;
        this.startRepeatLoop(title, body, type, quote, intervalSeconds);
      }
    });
  }

  async init(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
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

    // Deliberately set before anything is delivered: the widget reads it to show
    // the alert, and there is no frame in which the alert is ringing unseen.
    this.ringing.set(true);
    this.alertPulse.update((pulse) => pulse + 1);
    this.alertRepeats = 0;
    await this.sendNotification(title, body, 0, { quote });
    this.playSound();
    this.showToast(title, body, type, quote);
    this.startRepeatLoop(title, body, type, quote);
  }

  /**
   * Answers the alert: the ring stops, the card goes, and the cadence is
   * forgotten. Safe to call when nothing is ringing.
   *
   * The system notification is not withdrawn — on Windows and macOS the OS owns
   * it from the moment it is posted, and letting the user clear it in the
   * notification centre is the behaviour they expect from every other app.
   */
  dismiss(): void {
    this.ringing.set(false);
    this.stopRepeatLoop();
    this.toast.set(null);
  }

  /** Shows a one-off toast (used by tray actions like timer auto-resume) */
  showToastMessage(
    title: string,
    body: string,
    type: TimerType,
    quote: string | null = null,
  ): void {
    this.showToast(title, body, type, quote);
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
   */
  async announce(title: string, body: string, options: NotificationOptions = {}): Promise<void> {
    await this.init();
    await this.sendNotification(title, body, 0, options);
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
   * silent) and the tray's **Mute Reminder Sound** switch — instead of inventing
   * a tone of its own.
   */
  chime(): void {
    this.playSound();
  }

  private showToast(
    title: string,
    body: string,
    type: TimerType,
    quote: string | null = null,
  ): void {
    // Set null first to force Angular to destroy and re-create the element (re-triggers animation)
    this.toast.set(null);
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    this.toastTimeoutId = setTimeout(() => {
      this.toastCounter++;
      this.toast.set({ id: this.toastCounter, title, body, quote, type, visible: true });
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
  ): Promise<void> {
    const text = repeats > 0 ? `Reminder ${repeats} · ${body}` : body;
    const quote = options.quote ?? null;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('alert_notify', {
        title,
        body: text,
        tag: options.tag ?? NotificationService.ALERT_NOTIFICATION_TAG,
        quote,
        sticky: options.sticky ?? false,
      });
      return;
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
      return;
    } catch {
      // Outside the desktop shell, or refused by it: fall through to the page's
      // own Notification API below.
    }
    try {
      if (this.permissionGranted && 'Notification' in globalThis) {
        // `requireInteraction` is the browser's version of "stay until answered",
        // which is the rule this whole service is built around, and `tag` is its
        // version of the handle that makes a repeat replace rather than stack.
        new Notification(title, {
          body: withQuote(text, quote),
          tag: options.tag ?? NotificationService.ALERT_NOTIFICATION_TAG,
          requireInteraction: true,
        });
      }
    } catch {
      // No notification surface here at all — the tone and the card still run.
    }
  }

  private playSound(
    sound = this.settingsService.settings().notificationSound,
    ignoreMute = false,
  ): void {
    if (this.muted() && !ignoreMute) return;
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
    intervalSeconds = this.settingsService.settings().notificationRepeatInterval,
  ): void {
    this.stopRepeatLoop();
    this.pendingRepeat = { title, body, type, quote };
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
   * One repeat of an unanswered alert: the tone again, the system notification
   * again, and the card again.
   *
   * The system notification is re-posted rather than left where it was: a toast
   * that is already in the notification centre is one the user has stopped
   * seeing, and this alert's whole job at this point is to reach someone who is
   * working in another window. It goes back under the alert's own handle, so what
   * re-appears is the same notification saying something new ("Reminder 2 · …"),
   * not a second copy of it.
   */
  private onRepeatTick(): void {
    if (!this.pendingRepeat) return;
    const { title, body, type, quote } = this.pendingRepeat;
    this.alertRepeats += 1;
    // Everything visual hangs off this: one shake and one new colour per tone,
    // in the widget and on the card alike.
    this.alertPulse.update((pulse) => pulse + 1);
    void this.sendNotification(title, body, this.alertRepeats, { quote });
    this.playSound();
    this.showToast(title, body, type, quote);
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
