import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { TimerService } from './timer.service';
import { AttentionService } from './attention.service';
import { NotificationService } from './notification.service';
import { UiService } from './ui.service';
import { LogService } from './log.service';
import { muteConfirmation } from '../constants/nudge.constants';

/**
 * The app's own "be quiet for a while" controls, in one place.
 *
 * Pause and mute used to be reachable only from the system tray. That is fine on
 * Windows and macOS, where a tray is part of the desktop, and it is not fine
 * anywhere else: a Linux session whose desktop does not draw tray icons has no
 * way to pause the app at all, and a browser tab or a phone has never had one.
 * The state itself was always cross-platform — `AttentionService` keeps it and
 * every notifier asks it — but the *way in* was not, which is the same thing as
 * the feature not existing.
 *
 * So this service owns the action, and the tray, the sidebar, the mobile top bar
 * and Settings are all just callers. One implementation means Windows cannot
 * disagree with Linux about what "Pause for 30 minutes" does:
 *
 * - the timer stops (and a timed pause starts it again when it ends),
 * - every reminder is held — the cards, the system notifications and the tone,
 * - a mute silences the tone alone, with an end, because a mute with no end is
 *   a setting nobody remembers turning on.
 *
 * Focus mode belongs here for the same reason. It is the app's own
 * "do not put anything in front of me" shape, it is UI-only, and it works
 * identically in every build because there is nothing platform-specific in it.
 */
@Injectable({ providedIn: 'root' })
export class QuietService implements OnDestroy {
  private readonly timer = inject(TimerService);
  private readonly attention = inject(AttentionService);
  private readonly notifications = inject(NotificationService);
  private readonly ui = inject(UiService);
  private readonly log = inject(LogService, { optional: true });

  /** True while the controls are on screen, wherever they were opened from. */
  readonly panelOpen = signal(false);

  /** True while the timer and the reminders are paused. */
  readonly paused = this.attention.paused;

  /** True while only the reminder tone is muted. */
  readonly muted = this.attention.soundMuted;

  /** True while the app is in its distraction-free view. */
  readonly focusMode = this.ui.focusMode;

  /**
   * True when anything is currently holding the app back.
   *
   * The one value the buttons read for their dot and their pressed state: a
   * paused app, a muted app and a focused app all mean "some of this is already
   * on", and three separate dots on one button would be noise.
   */
  readonly active = computed(() => this.paused() || this.muted() || this.focusMode());

  /**
   * The one-line answer to "what is the app doing to me right now?".
   *
   * Written for the button's tooltip and for the panel's header, so the two can
   * never describe the same state differently.
   */
  readonly statusLabel = computed(() => {
    if (this.paused()) return `Paused ${this.attention.pauseLabel()}`;
    if (this.muted()) return `Sound muted until ${this.attention.muteLabel()}`;
    if (this.focusMode()) return 'Focus mode on';
    return 'Reminders on';
  });

  /** True when the current pause is what stopped a running timer. */
  private timerWasPaused = false;
  private resumeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // ── The panel ──────────────────────────────────────────────────────────────

  open(): void {
    this.panelOpen.set(true);
  }

  close(): void {
    this.panelOpen.set(false);
  }

  togglePanel(): void {
    this.panelOpen.update((open) => !open);
  }

  // ── Pause ──────────────────────────────────────────────────────────────────

  /**
   * Pauses the timer and every reminder the app can raise.
   *
   * `minutes` is a length of time, or null for "until I resume". The timer only
   * restarts by itself for the timed one; the reminders are told either way, so
   * a pause the user asked for holds the startup suggestions too. What was held
   * is not lost: the reminder the app could not deliver is counted, and the
   * attention banner says so when the pause ends.
   */
  pause(minutes: number | null): void {
    this.timerWasPaused = this.timer.isRunning();
    this.timer.pause();
    this.attention.pauseFor(minutes);
    // A session that had already finished and was ringing is part of what the
    // user asked to stop — otherwise Pause would only silence the *next* alert
    // and the current one would repeat for as long as the pause lasts.
    this.notifications.stopAlert();
    this.clearScheduledResume();

    if (minutes !== null && this.timerWasPaused) this.scheduleResume(minutes);

    this.notifications.showToastMessage(
      minutes === null ? 'Paused' : `Paused for ${minutes} min`,
      minutes === null
        ? 'Timer and reminders are paused until you resume. Every surface has the same Resume.'
        : `Back at ${this.attention.pauseLabel()}. Reminders are held until then.`,
      this.timer.timerType(),
      this.notifications.nextQuote('pause'),
    );
    this.log?.info('flow', `pause · ${minutes === null ? 'until resumed' : `${minutes} min`}`);
  }

  /** Ends a timed or indefinite pause and says so. */
  resume(): void {
    this.clearScheduledResume();
    const wasPaused = this.attention.paused();
    // Nothing to undo: no pause of ours is running, and no timer of ours is
    // waiting to be handed back. Calling Resume twice must not talk twice.
    if (!wasPaused) {
      this.timerWasPaused = false;
      return;
    }
    const held = this.attention.heldNudges();
    this.attention.resume();
    // Only a timer this pause stopped is resumed: "Resume" must not start a
    // session the user had not started before they asked for quiet.
    if (this.timerWasPaused) this.timer.resume();
    this.timerWasPaused = false;

    // One card, not two: the second would replace the first within the same
    // blink, and the held count is part of the same answer anyway.
    const body =
      held > 0
        ? `Back to ${this.timer.timerType() === 'work' ? 'focus' : 'break'}. ${held} held reminder${held === 1 ? '' : 's'} will arrive with the next one.`
        : `Back to ${this.timer.timerType() === 'work' ? 'focus' : 'break'}.`;
    this.notifications.showToastMessage(
      'Resumed',
      body,
      this.timer.timerType(),
      this.notifications.nextQuote('resume'),
    );
  }

  // ── Mute ───────────────────────────────────────────────────────────────────

  /** Mutes the sound only, for a length of time that ends by itself. */
  mute(minutes: number | 'today'): void {
    this.attention.muteFor(minutes);
    this.notifications.showToastMessage(
      'Reminder sound muted',
      muteConfirmation(this.attention.muteLabel()),
      'work',
      this.notifications.nextQuote('mute'),
    );
    this.log?.info('flow', `reminder sound muted until ${this.attention.muteLabel()}`);
  }

  /** Puts the reminder sound back on. */
  unmute(): void {
    this.attention.unmute();
    this.notifications.showToastMessage(
      'Sound is back on',
      'Reminders will ring again when they arrive.',
      'work',
      this.notifications.nextQuote('unmute'),
    );
  }

  // ── Focus ──────────────────────────────────────────────────────────────────

  /**
   * Turns the distraction-free view on or off.
   *
   * Deliberately *not* a pause: a focus session is exactly when the timer's
   * completion alert matters most, so focus mode hides the navigation and the
   * surrounding furniture and leaves every reminder running. Someone who wants
   * silence as well has Pause on the same panel, one row above.
   */
  toggleFocus(): void {
    this.ui.toggleFocusMode();
    this.log?.info('flow', `focus mode ${this.ui.focusMode() ? 'on' : 'off'}`);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private scheduleResume(minutes: number): void {
    this.clearScheduledResume();
    this.resumeTimeoutId = setTimeout(() => {
      this.resumeTimeoutId = null;
      this.attention.resume();
      this.timer.resume();
      this.timerWasPaused = false;
      this.notifications.showToastMessage(
        'Timer resumed',
        `Pause over — back to ${this.timer.timerType() === 'work' ? 'focus' : 'break'}.`,
        this.timer.timerType(),
        this.notifications.nextQuote('resume'),
      );
    }, minutes * 60_000);
  }

  private clearScheduledResume(): void {
    if (this.resumeTimeoutId) {
      clearTimeout(this.resumeTimeoutId);
      this.resumeTimeoutId = null;
    }
  }

  ngOnDestroy(): void {
    this.clearScheduledResume();
  }
}
