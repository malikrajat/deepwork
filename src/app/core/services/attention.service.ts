import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { LogService } from './log.service';

/** The operating system's answer to "would a notification be welcome now?". */
export type QuietState = 'normal' | 'quiet' | 'busy' | 'away' | 'unknown';

/** Where a timed mute is remembered across a restart. */
const MUTE_KEY = 'deepwork.attention.muteUntil.v1';

/** Where a timed pause is remembered across a restart. */
const PAUSE_KEY = 'deepwork.attention.pauseUntil.v1';

/** How often the clock is read, so a mute or a pause expires by itself. */
const TICK_MS = 15_000;

/** How often the desktop is asked whether now is a quiet moment. */
const POLL_MS = 60_000;

/** True when running inside the packaged desktop app (Tauri). */
const IN_TAURI = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

/**
 * Whether now is a moment to interrupt, and for how much longer it will not be.
 *
 * Every reminder in the app that is not a finished timer — the startup and
 * taskbar suggestions, and anything added later that is a *suggestion* rather
 * than news — asks this one service before it speaks. That is the whole point:
 * one place decides, so the tray's pause, the timed mute, the user's focus mode
 * and Windows' own quiet hours cannot disagree with each other or with the
 * sound.
 *
 * Three independent things can hold a reminder:
 *
 * - **A pause.** Started from the tray, with or without an end. It is the
 *   user's own "not now" and it covers the timer's sound, the app's cards and
 *   the desktop notifications alike: a pause that still let a toast through
 *   would not be a pause.
 * - **A timed mute.** Sound only, and always with an end. This is the difference
 *   the feature exists for: a mute that has no end is a setting the user forgets
 *   they changed, so the mute here is a number of minutes or "until tomorrow",
 *   and the app puts the sound back by itself. Cards are still drawn while it is
 *   on, because the user asked for quiet, not for blindness.
 * - **The operating system's quiet state.** Windows answers with quiet hours, a
 *   fullscreen game, presentation mode, a locked screen or a normal desktop.
 *   The app's own focus mode is its own page, but *this* is the machine's, and
 *   the reminder respects it rather than fighting it: the in-app card is held,
 *   and the desktop notification is still posted, because the OS that asked for
 *   quiet is the same OS that decides what DND does with it. Holding both would
 *   turn a user's forgotten focus mode into an app that never speaks again.
 */
@Injectable({ providedIn: 'root' })
export class AttentionService implements OnDestroy {
  private readonly log = inject(LogService, { optional: true });

  /** A clock that moves on its own, so the computed values below expire. */
  readonly now = signal(Date.now());

  /** When the timed mute ends, or null when sound is on. */
  private readonly muteUntil = signal<number | null>(null);

  /** When the timed pause ends, or null. */
  private readonly pauseUntil = signal<number | null>(null);

  /** True while the pause has no end and only **Resume** clears it. */
  private readonly pauseForever = signal(false);

  /** What the desktop last said about interrupting. */
  readonly quiet = signal<QuietState>('normal');

  /**
   * How many suggestions were held back since the last time the user looked.
   *
   * Counted rather than stored per reminder, because what the banner says is
   * "some reminders are waiting", and the exact number is the one thing that
   * would make it feel like an inbox.
   */
  readonly heldNudges = signal(0);

  private ticker: ReturnType<typeof setInterval> | null = null;
  private poller: ReturnType<typeof setInterval> | null = null;
  private started = false;

  /** True while the reminder sound is muted. */
  readonly soundMuted = computed(() => {
    const until = this.muteUntil();
    return until !== null && until > this.now();
  });

  /** True while the user has paused the app's own reminders. */
  readonly paused = computed(
    () => this.pauseForever() || (this.pauseUntil() !== null && this.pauseUntil()! > this.now()),
  );

  /** True while the desktop says a card would land badly. */
  readonly quietNow = computed(() => this.quiet() !== 'normal' && this.quiet() !== 'unknown');

  constructor() {
    this.restore();
    // Only if a mute or a pause was restored: an idle app has nothing to expire
    // and does not need a timer to notice it.
    if (this.muteUntil() !== null || this.pauseUntil() !== null) this.ensureClock();
  }

  /**
   * Connects the service to the desktop and to the passing of time.
   *
   * Safe to call more than once, and inert outside the desktop app: a browser
   * tab has no quiet hours to ask about, and guessing would either silence
   * every reminder or none.
   */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // An indefinite pause is a pause for *this* session: the next launch is a
    // fresh decision, and a pause nobody remembers setting would keep the app
    // silent for as long as the user kept opening it.
    if (this.pauseForever()) {
      this.pauseForever.set(false);
      this.persistPause();
    }

    if (!IN_TAURI) return;
    // A mute or a pause restored from the last session still has an end, so the
    // clock that notices it starts with them rather than with the poll.
    this.ensureClock();
    await this.refreshQuiet();
    this.poller = setInterval(() => void this.refreshQuiet(), POLL_MS);
  }

  /** Asks the desktop, once, whether now is a quiet moment. */
  async refreshQuiet(): Promise<void> {
    if (!IN_TAURI) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const answer = await invoke<{ state?: string }>('nudges_quiet_state');
      const state = answer?.state;
      if (
        state === 'normal' ||
        state === 'quiet' ||
        state === 'busy' ||
        state === 'away' ||
        state === 'unknown'
      ) {
        this.quiet.set(state);
      }
    } catch {
      // A desktop layer that cannot answer is not a reason to stop reminding:
      // the user's own settings still decide, which is what `normal` means.
      this.quiet.set('normal');
    }
  }

  /**
   * Mutes the reminder sound for a while.
   *
   * `minutes` is how long, or `'today'` for the rest of the calendar day. The
   * alternative the app deliberately does not offer is "forever": the sound is
   * the one part of a reminder that reaches someone looking elsewhere, and a
   * mute with no end is how that ends up off for a month. Cards keep arriving
   * while it is on — this mutes the bell, not the app.
   */
  muteFor(minutes: number | 'today'): Date {
    const until =
      minutes === 'today'
        ? nextMidnight(new Date(this.now()))
        : new Date(this.now() + minutes * 60_000);
    this.muteUntil.set(until.getTime());
    this.persistMute();
    this.ensureClock();
    this.log?.info('flow', `reminder sound muted until ${until.toISOString()}`);
    return until;
  }

  /** Puts the sound back on, whatever had muted it. */
  unmute(): void {
    if (this.muteUntil() === null) return;
    this.muteUntil.set(null);
    this.persistMute();
    this.stopClockIfIdle();
    this.log?.info('flow', 'reminder sound on');
  }

  /**
   * Pauses reminders and the timer's sound, with or without an end.
   *
   * `null` means "until I say resume". The pause covers everything the app
   * would otherwise say: the alert tone, the in-app cards and the desktop
   * notification. What it does not do is stop the timer — that is the caller's
   * job, and the tray does both in the same action.
   */
  pauseFor(minutes: number | null): Date | null {
    if (minutes === null) {
      this.pauseUntil.set(null);
      this.pauseForever.set(true);
      this.persistPause();
      // An indefinite pause has no instant to watch for, so the clock is not
      // started for it; resuming is the only way out and it stops the clock.
      return null;
    }
    const until = new Date(this.now() + minutes * 60_000);
    this.pauseUntil.set(until.getTime());
    this.pauseForever.set(false);
    this.persistPause();
    this.ensureClock();
    return until;
  }

  /** Ends a pause, however it was started. */
  resume(): void {
    if (!this.paused()) return;
    this.pauseUntil.set(null);
    this.pauseForever.set(false);
    this.persistPause();
    this.stopClockIfIdle();
    this.log?.info('flow', 'reminders resumed');
  }

  /** Records a suggestion that was due while the app had to stay quiet. */
  holdNudge(): void {
    this.heldNudges.update((count) => count + 1);
  }

  /** Empties the held counter and returns what it was. */
  releaseHeld(): number {
    const held = this.heldNudges();
    if (held !== 0) this.heldNudges.set(0);
    return held;
  }

  /** `14:30`, or "tomorrow" when the mute outlasts today. */
  muteLabel(): string {
    const until = this.muteUntil();
    if (until === null) return '';
    return clock(until, this.now());
  }

  /** The same for a pause, with the indefinite case spelled out. */
  pauseLabel(): string {
    if (this.pauseForever()) return 'until you resume';
    const until = this.pauseUntil();
    return until === null ? '' : clock(until, this.now());
  }

  private startClock(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      const at = Date.now();
      this.now.set(at);
      this.expire(at);
    }, TICK_MS);
  }

  /**
   * Starts the clock only when there is something for it to end.
   *
   * A ticker that runs from the moment the app opens is a timer every test and
   * every idle session pays for; this one is created by a mute or a pause and
   * gives itself back when the last of them runs out. What it exists for is
   * expiry, and expiry only matters while something is set to expire.
   */
  private ensureClock(): void {
    this.startClock();
  }

  private stopClockIfIdle(): void {
    if (this.muteUntil() !== null || this.pauseUntil() !== null || this.pauseForever()) return;
    if (!this.ticker) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }

  /** Lets a mute or a pause that has run out actually end. */
  private expire(at: number): void {
    const mute = this.muteUntil();
    if (mute !== null && mute <= at) {
      this.muteUntil.set(null);
      this.persistMute();
      this.log?.info('flow', 'timed mute ended: reminder sound on');
    }

    const pause = this.pauseUntil();
    if (pause !== null && pause <= at) {
      this.pauseUntil.set(null);
      this.persistPause();
      this.log?.info('flow', 'timed pause ended: reminders resumed');
    }

    this.stopClockIfIdle();
  }

  private restore(): void {
    try {
      const mute = Number(globalThis.localStorage?.getItem(MUTE_KEY));
      if (Number.isFinite(mute) && mute > Date.now()) this.muteUntil.set(mute);
    } catch {
      // No storage: the mute simply starts off, which is the safe direction.
    }
    try {
      const raw = globalThis.localStorage?.getItem(PAUSE_KEY);
      if (raw === 'forever') {
        // Remembered so the banner can say why, and cleared by `init` on the
        // next launch: a pause is for the session it was asked for.
        this.pauseForever.set(true);
      } else {
        const pause = Number(raw);
        if (Number.isFinite(pause) && pause > Date.now()) this.pauseUntil.set(pause);
      }
    } catch {
      // Same as the mute: no storage means no pause, not a permanent one.
    }
  }

  private persistMute(): void {
    try {
      const until = this.muteUntil();
      if (until === null) globalThis.localStorage?.removeItem(MUTE_KEY);
      else globalThis.localStorage?.setItem(MUTE_KEY, String(until));
    } catch {
      // A mute that cannot be remembered only ends earlier than asked.
    }
  }

  private persistPause(): void {
    try {
      if (this.pauseForever()) globalThis.localStorage?.setItem(PAUSE_KEY, 'forever');
      else if (this.pauseUntil() === null) globalThis.localStorage?.removeItem(PAUSE_KEY);
      else globalThis.localStorage?.setItem(PAUSE_KEY, String(this.pauseUntil()));
    } catch {
      // A pause that cannot be remembered is one that ends at the next launch.
    }
  }

  ngOnDestroy(): void {
    if (this.ticker) clearInterval(this.ticker);
    if (this.poller) clearInterval(this.poller);
    this.ticker = null;
    this.poller = null;
  }
}

/** The next local midnight, which is what "until tomorrow" means. */
function nextMidnight(at: Date): Date {
  const midnight = new Date(at);
  midnight.setHours(24, 0, 0, 0);
  return midnight;
}

/**
 * A time of day for a moment later today, or "tomorrow" when it is not today.
 *
 * Deliberately short: this is read inside a toast, where "14:30" is enough and
 * a full date is noise.
 */
function clock(until: number, now: number): string {
  const target = new Date(until);
  const today = new Date(now);
  const sameDay = target.toDateString() === today.toDateString();
  const time = `${`${target.getHours()}`.padStart(2, '0')}:${`${target.getMinutes()}`.padStart(2, '0')}`;
  return sameDay ? time : `tomorrow ${time}`;
}
