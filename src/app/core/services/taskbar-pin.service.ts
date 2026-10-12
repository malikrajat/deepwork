import { Injectable, computed, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { DesktopPrefsService } from './desktop-prefs.service';
import { SettingsService } from './settings.service';
import {
  PIN_AWAITING,
  PIN_AWAITING_TITLE,
  PIN_BODY,
  PIN_CONFIRM,
  PIN_DISMISS,
  PIN_EYEBROW,
  PIN_MANUAL_FALLBACK,
  PIN_TITLE,
} from '../constants/pin.constants';
import type { PinOutcome, PinStatus, PinTarget } from '../models/pin.model';

/** True when running inside the packaged desktop app (Tauri). */
const IN_TAURI = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

/** Lazily resolves Tauri's `invoke` so browser builds never import it. */
async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** A pause that the poll loop can be written as a straight line with. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The one-time offer to keep DeepWork somewhere it can be reached in one click.
 *
 * The question is a card rather than a shell dialog, and that is the point: an
 * installer cannot ask it (the app is not running yet, and a fresh unsigned
 * installer writing per-user OS state is what antivirus heuristics call
 * persistence — see `src-tauri/src/autostart.rs`), and a silent pin is not the
 * app's to make. So the app asks, once, from inside itself, with two answers.
 *
 * Nothing here guesses what the desktop will say. The Rust side is asked what
 * pinning *means* on this machine and — on Windows, where the shell can be
 * asked — whether DeepWork is already on the taskbar. That last answer is what
 * keeps the offer honest on an upgrade: a user who pinned DeepWork months ago is
 * never asked again, whatever this build remembers.
 *
 * Three things are deliberately *not* the same as "yes":
 *
 * - **"Not now"** is recorded and never asked again. A prompt that returns on
 *   every launch is the nagging kind of reminder, and this app has a Settings
 *   page and a tray menu; the deliberate route back is what `reoffer()` exists
 *   for.
 * - **A refusal by the desktop** turns the card into the instruction that
 *   replaces the call. macOS and Linux do not let an app pin itself, and Windows
 *   can refuse on policy — the user is told where the menu is instead of being
 *   left with a button that did nothing.
 * - **The browser build** is not offered anything. There is no taskbar to pin a
 *   tab to, and the install banner is the browser's own version of this question.
 */
@Injectable({ providedIn: 'root' })
export class TaskbarPinService {
  private readonly db = inject(DbService);
  private readonly settings = inject(SettingsService);
  private readonly prefs = inject(DesktopPrefsService);

  /** What this desktop calls the pinned location and whether it can be asked. */
  readonly status = signal<PinStatus>({ target: 'taskbar', canAutoPin: false, pinned: false });

  /** True once every question this service needs answered has been answered. */
  readonly ready = signal(false);

  /**
   * True once this desktop has actually answered about pinning.
   *
   * The card is only offered on a real answer, and this is the difference between
   * "this desktop will not pin apps itself" — macOS, Linux, and a Windows with
   * pinning turned off by policy, all of which get the manual instruction — and
   * "this desktop could not be reached at all". The second is a broken desktop
   * layer or a failed call, and putting a "Pin to taskbar" button in front of a
   * user because of it would be offering them a control that cannot work.
   */
  readonly reached = signal(false);

  /** True while the desktop is being asked to pin. */
  readonly busy = signal(false);

  /**
   * True while the shell's own prompt is up and unanswered.
   *
   * A third state, and the reason the card says something different here: the
   * request has been made and the *desktop* is asking now, so the card stops
   * offering to ask again and says where to look. It is also what the poll loop
   * is waiting on — see {@link pin}.
   */
  readonly awaitingAnswer = signal(false);

  /** True once the user has answered the card — either way — in this session. */
  private readonly answered = signal(false);

  /**
   * True while the *confirmation* is up.
   *
   * The card is one surface with three faces, and the confirmation is the only
   * one that leaves on its own: it has nothing to ask, and a "Pinned" card that
   * waited to be dismissed would be a modal for a piece of good news. It goes
   * back to the service's own `visible` once the timer is out.
   */
  readonly settled = signal(false);

  /**
   * How long the confirmation stays up before the card takes itself away.
   *
   * Long enough to read one line and look at the taskbar, short enough not to be
   * something to get rid of.
   */
  private static readonly SETTLED_MS = 6_000;

  /** How often the shell is asked whether it has an answer yet. */
  private static readonly POLL_MS = 250;

  /**
   * How many times it is asked before the card gives up and shows the manual
   * route.
   *
   * 400 × 250ms is 100 seconds — comfortably longer than the Rust side's own
   * 45-second bound plus the time to collect the answer, so the frontend is never
   * the thing that decides a request has failed while the shell is still thinking.
   */
  private static readonly POLL_ATTEMPTS = 400;

  private settledTimer?: ReturnType<typeof setTimeout>;

  /**
   * Bumped whenever what is being waited for changes identity.
   *
   * A poll loop compares the generation it started with against this, so a
   * dismissal — or a second attempt — retires the old loop instead of it writing
   * its answer over whatever the user has since chosen. Without it, "Not now"
   * followed by the shell resolving a second later would put the confirmation
   * back on screen for a question already answered.
   */
  private generation = 0;

  /**
   * The instruction shown when the desktop would not pin DeepWork itself.
   *
   * Set from the backend's own sentence — it is the side that met the refusal —
   * and never cleared while the card is up: the card stays in this state until
   * the user acknowledges it, so the instruction cannot be missed by a card that
   * vanished a second later.
   */
  readonly help = signal<string | null>(null);

  readonly target = computed<PinTarget>(() => this.status().target);
  readonly eyebrow = computed(() => PIN_EYEBROW[this.target()]);
  readonly title = computed(() => (this.awaitingAnswer() ? PIN_AWAITING_TITLE : PIN_TITLE));
  readonly body = computed(() =>
    this.awaitingAnswer() ? PIN_AWAITING[this.target()] : PIN_BODY[this.target()],
  );
  readonly confirmLabel = computed(() => PIN_CONFIRM[this.target()]);
  readonly dismissLabel = PIN_DISMISS;

  /**
   * True while the card is on screen.
   *
   * The welcome dialog is waited for rather than raced: two cards arriving at
   * the same moment is one card the user does not read, and the first-run dialog
   * is the one that explains the app. Once it is answered, this one asks.
   */
  readonly visible = computed(
    () =>
      IN_TAURI &&
      this.ready() &&
      this.reached() &&
      (this.settled() ||
        (!this.answered() &&
          !this.status().pinned &&
          !this.settings.settings().taskbarPinPrompted &&
          this.prefs.prompted())),
  );

  private initialized = false;

  /**
   * Asks the desktop what pinning means here. Safe to call more than once.
   *
   * Deliberately before the window is shown asking anything: on Windows the
   * answer decides whether the card is worth putting up at all.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (!IN_TAURI) {
      this.ready.set(true);
      return;
    }

    try {
      const status = await invokeCmd<PinStatus>('taskbar_pin_status');
      this.adopt(status);
    } catch (err) {
      // A desktop that cannot be asked is a desktop that cannot be offered
      // anything: the card would be a button with nothing behind it. `reached`
      // stays false, which is what keeps it away — see that signal.
      console.warn('TaskbarPinService: the desktop could not be asked', err);
    } finally {
      this.ready.set(true);
    }
  }

  /**
   * The user said yes: ask this desktop to pin DeepWork.
   *
   * Two steps, and they are two steps because of a bug this app shipped once. The
   * command that *asks* returns as soon as the request is in — the shell's own
   * confirmation is on screen and nobody has answered it — so the answer is
   * *polled* from here rather than waited for inside the call. The version that
   * waited blocked the window's message loop for as long as the dialog was up,
   * which is what left the card's buttons dead and the whole app ignoring clicks.
   *
   * `busy` is set for the asking and cleared the moment the request is away: the
   * shell's dialog belongs to the shell, and a card whose button stays greyed out
   * while a Windows prompt is on screen reads as a hang.
   */
  async pin(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.awaitingAnswer.set(false);

    // Anything a previous attempt left behind belongs to that attempt.
    const generation = ++this.generation;

    try {
      const outcome = await invokeCmd<PinOutcome>('taskbar_pin_request');

      // A finished answer on the first call: the pin was already there, or the
      // shell refused before showing anything.
      if (outcome.message || outcome.pinned) {
        this.busy.set(false);
        await this.settleOn(outcome);
        return;
      }

      // `pinned: false` with no message is "the prompt is up, unanswered".
      this.busy.set(false);
      this.awaitingAnswer.set(true);
      await this.awaitPinResult(generation);
    } catch (err) {
      this.busy.set(false);
      this.awaitingAnswer.set(false);
      this.help.set(this.describe(err));
    }
  }

  /**
   * Polls for the shell's verdict while its prompt is up.
   *
   * Polling rather than a subscription because the request is not an event: it is
   * one question the shell was asked and has not answered yet. `generation` is
   * compared every time round, so a dismissal — or a second attempt — ends this
   * loop instead of it writing over whatever the user has since chosen.
   *
   * The loop is bounded by the Rust side's own timeout (45 seconds) plus room to
   * collect the answer, so a Windows that never resolves cannot leave a poll
   * running forever.
   */
  private async awaitPinResult(generation: number): Promise<void> {
    for (let attempt = 0; attempt < TaskbarPinService.POLL_ATTEMPTS; attempt++) {
      await delay(TaskbarPinService.POLL_MS);
      if (generation !== this.generation) return;

      let outcome: PinOutcome | null;
      try {
        outcome = await invokeCmd<PinOutcome | null>('taskbar_pin_result');
      } catch {
        // A poll that cannot be answered is not a failure worth showing: the next
        // one may well work, and the fallback below says so if none of them do.
        continue;
      }

      if (generation !== this.generation) return;
      if (outcome) {
        this.awaitingAnswer.set(false);
        await this.settleOn(outcome);
        return;
      }
    }

    if (generation !== this.generation) return;
    this.awaitingAnswer.set(false);
    this.help.set(PIN_MANUAL_FALLBACK);
  }

  /**
   * Acts on the shell's verdict, whichever call produced it.
   *
   * Shared by the immediate answer and the polled one so the two cannot drift:
   * "pinned" means the confirmation and the end of the question, and anything else
   * means the instruction, carrying the shell's own sentence where there is one.
   */
  private async settleOn(outcome: PinOutcome): Promise<void> {
    if (outcome.pinned) {
      this.status.update((status) => ({ ...status, pinned: true }));
      this.answered.set(true);
      this.settle();
      // Recorded as well as answered: the shell's own answer is what ends the
      // question on Windows, and this is what ends it everywhere else — and what
      // stops it returning if the user ever unpins the app.
      await this.remember();
      return;
    }
    // Not pinned. The card becomes the instruction rather than closing: the user
    // asked for this, so they get to see what to do instead.
    this.help.set(outcome.message ?? PIN_MANUAL_FALLBACK);
  }

  /**
   * The user said no thanks — or has finished reading what to do by hand.
   *
   * Also the escape hatch, which is why it bumps the generation: whatever is being
   * waited for stops being waited for, and a shell prompt answered after this
   * cannot put the card back on screen.
   */
  async dismiss(): Promise<void> {
    this.generation++;
    this.awaitingAnswer.set(false);
    this.clearSettled();
    this.answered.set(true);
    await this.remember();
  }

  /**
   * Lets the offer be made again, for a user who said "Not now" and changed
   * their mind.
   *
   * The deliberate route back, and the reason the flag recorded on "Not now" is
   * not a dead end: nothing in the app calls this on its own.
   */
  async reoffer(): Promise<void> {
    this.clearSettled();
    this.answered.set(false);
    this.help.set(null);
    const current = this.settings.settings();
    await this.settings.saveSettings({ ...current, taskbarPinPrompted: false });
  }

  /**
   * Shows the confirmation, and takes it away again on its own.
   *
   * The timer is the card's only self-dismissal anywhere in this service, and it
   * is deliberate: "Pinned" has nothing to ask, so leaving it up until it is
   * dismissed would turn good news into a chore. Every other face waits for an
   * answer.
   */
  private settle(): void {
    this.settled.set(true);
    this.clearSettledTimer();
    this.settledTimer = setTimeout(() => {
      this.settledTimer = undefined;
      this.settled.set(false);
    }, TaskbarPinService.SETTLED_MS);
  }

  /** Takes the confirmation down early, so a dismissal cannot be raced by it. */
  private clearSettled(): void {
    this.clearSettledTimer();
    this.settled.set(false);
  }

  private clearSettledTimer(): void {
    if (this.settledTimer === undefined) return;
    clearTimeout(this.settledTimer);
    this.settledTimer = undefined;
  }

  /** Stores the answer, so the question is asked once. */
  private async remember(): Promise<void> {
    const current = this.settings.settings();
    if (current.taskbarPinPrompted) return;
    await this.settings.saveSettings({ ...current, taskbarPinPrompted: true });
  }

  /**
   * Adopts what the backend reported.
   *
   * An already-pinned app is recorded as prompted in the same breath: the
   * question has been answered by the desktop, and leaving the flag false would
   * put the card up for anyone who unpins DeepWork later — asking about a choice
   * they had already made once.
   */
  private adopt(status: PinStatus): void {
    this.status.set(status);
    this.reached.set(true);
    if (!status.pinned) return;
    // The database has to be open before a preference can be written to it, and
    // this runs from the app's own startup where it may not be yet.
    void this.db.init().then(() => this.remember());
  }

  private describe(err: unknown): string {
    if (typeof err === 'string' && err.trim()) return err;
    if (err instanceof Error && err.message) return err.message;
    return PIN_MANUAL_FALLBACK;
  }
}
