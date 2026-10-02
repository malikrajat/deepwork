import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import { TimerService } from '../../../core/services/timer.service';
import { UiService } from '../../../core/services/ui.service';
import { TimerType } from '../../../core/models/session.model';
import { alertTheme } from '../../../core/constants/alert.constants';

/**
 * Countdown ring geometry.
 *
 * The SVG is 60x60 CSS pixels and its viewBox is the same 60 units, so one unit
 * is one pixel and nothing is resampled on the way to the screen. (The ring used
 * to be drawn in a 100-unit box and scaled down to 60px — the browser then
 * refilters the circle, which is part of why it looked soft.) The radius (24)
 * leaves room for the 10px halo inside the 60px box, and the 6px stroke is an
 * even number, so both of its edges land on a whole pixel instead of half of one.
 */
const RING_SIZE = 60;
const RING_RADIUS = 24;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * One swing of the alert's shake, in milliseconds.
 *
 * The shake is a vibration, and what makes a vibration is the tempo rather than
 * the distance: about eight swings a second is fast enough to read as "this,
 * again" from across a desk, and slow enough to see as motion rather than as a
 * blur on a 60Hz screen. The length the user chose is *divided* into swings of
 * this size — see {@link MiniWidgetComponent.shake} — so choosing four seconds
 * buys four seconds of the same quick shake, not one long lean.
 */
const SHAKE_SWING_MS = 120;

/**
 * One gradient per session type, so focus and breaks stay tellable apart at a
 * glance — and stay bright against the widget's dark background.
 */
const RING_GRADIENT: Record<TimerType, string> = {
  work: 'url(#mini-ring-work)',
  'short-break': 'url(#mini-ring-short)',
  'long-break': 'url(#mini-ring-long)',
};

/**
 * The mini widget: the whole of DeepWork once the window has been shrunk.
 *
 * It is chrome-free by design — the native title bar (and with it minimise,
 * maximise and close) is switched off while it is open, so what the user sees is
 * only the timer, a colourful countdown ring that fills as the session runs,
 * and the controls that matter: start/pause, skip, stop and expand.
 *
 * Those last two are not decoration. While the window is the widget the user is
 * working somewhere else, so this is the *only* place a finished session can be
 * answered — the full window's toast is not on screen to be closed, and the
 * alert rings on its tone until something answers it. So every control here
 * counts as that answer, and while an alert is ringing the ring pulses and the
 * one button that silences it without touching the timer sits inside the circle
 * — see `NotificationService.ringing`.
 *
 * Every part of the surface is picked for sharpness rather than glow:
 *
 * - The surface fills its window edge to edge **and is rounded, in every build**.
 *   That combination is what makes the corners empty rather than painted: the
 *   window is created transparent (`tauri.conf.json`), `UiService` clears the page
 *   behind it while the widget is up, so the desktop shows through the four
 *   corners exactly as it does behind the browser build's floating panel. The
 *   radius is deliberately on the *surface* and not on what it holds —
 *   `overflow: hidden` clips the ring, the bell and the buttons to the rounded
 *   frame rather than rounding four separate things.
 *
 *   (It used to fill a square window on purpose: rounding the card then left the
 *   desktop at the corners *inside* the hairline Windows draws around every
 *   window, which read as a rounded widget wearing a square outline — the one
 *   shape worse than either. That hairline is now removed while the widget is up,
 *   see the border bullet below, so the corners are empty again and the radius
 *   belongs to the widget itself rather than only to the browser's panel.)
 * - No border and no outer glow: the only edge is a 1px inset hairline, so
 *   nothing draws a second rectangle around the ring.
 * - The window's own border is taken away while the widget is up, not painted
 *   around it: Windows draws a hairline frame around every top-level window and
 *   colours it from the OS, which on a light setup came out as a white outline —
 *   and an outline is exactly what a rounded card cannot have, since it squares
 *   off the four corners the radius just opened. `UiService` has the shell drop
 *   that band and ask Windows 11 for rounded window corners of its own — see
 *   `window_paint_widget_frame` in `src-tauri/src/lib.rs`.
 * - A finished session turns the whole widget one colour (`alerting`) — surface,
 *   ring, bell and buttons — and settles back to the default over 450ms when the
 *   user answers: an alert worth stopping whatever you are doing has to be
 *   visible from across the desk, not only to someone already looking at a 136x76
 *   rectangle. The colour is not fixed: it walks `ALERT_COLOURS`, one entry per
 *   repeat, because an alert that wears the same colour again is an alert the
 *   eye can stop seeing. See `alertTheme`.
 * - The alert also *moves*, once per tone, and it is the **whole widget** that
 *   moves: the surface, the ring and all four buttons shake together on the beat
 *   of the sound the user is hearing, which is the one thing a colour cannot do —
 *   re-announce itself where they are already looking. Moving the whole window's
 *   worth of surface rather than the ring inside it is what makes the repeat
 *   visible from across the desk rather than only from in front of it. See
 *   `shakeB` and `alert-shake-a` / `alert-shake-b`.
 * - The ring is drawn at its own size with a wide, faint halo stroke instead of
 *   an SVG Gaussian-blur filter, which softened the ring, its colours and the
 *   square filter region it was painted into.
 * - The countdown is a whole 12px with tabular figures, so the digits sit on the
 *   pixel grid and do not shift sideways while they count.
 */
@Component({
  selector: 'app-mini-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:mousemove)': 'onDrag($event)',
    '(window:mouseup)': 'onDragEnd()',
  },
  template: `
    <div
      class="mini-widget"
      [class.floating]="!isTauri"
      [class.alerting]="ringing()"
      [class.shake-a]="ringing() && !shakeB()"
      [class.shake-b]="ringing() && shakeB()"
      [style]="alertVars()"
      [style.left.px]="isTauri ? null : pos().x"
      [style.top.px]="isTauri ? null : pos().y"
      role="group"
      [attr.aria-label]="ariaLabel()"
      (mousedown)="beginDrag($event)"
    >
      <div class="ring-wrap" [class.ringing]="ringing()">
        <svg
          class="mini-ring"
          [attr.viewBox]="viewBox"
          [attr.width]="ringSize"
          [attr.height]="ringSize"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id="mini-ring-work" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c4b5fd" />
              <stop offset="45%" stop-color="#8b5cf6" />
              <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
            <linearGradient id="mini-ring-short" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#a5f3fc" />
              <stop offset="50%" stop-color="#06b6d4" />
              <stop offset="100%" stop-color="#34d399" />
            </linearGradient>
            <linearGradient id="mini-ring-long" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#6ee7b7" />
              <stop offset="55%" stop-color="#34d399" />
              <stop offset="100%" stop-color="#a78bfa" />
            </linearGradient>
          </defs>

          <!-- Halo first: the arc's own dash, drawn wider and faint behind it.
               A wide solid stroke keeps a hard edge where a blur filter fuzzed
               everything it touched. -->
          <circle
            class="ring-halo"
            cx="30" cy="30"
            [attr.r]="radius"
            [attr.stroke]="ringStroke()"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="ringOffset()"
          />
          <circle class="ring-track" cx="30" cy="30" [attr.r]="radius" />
          <circle
            class="ring-arc"
            cx="30" cy="30"
            [attr.r]="radius"
            [attr.stroke]="ringStroke()"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="ringOffset()"
          />
        </svg>
        @if (ringing()) {
          <!-- The alert, where the user is already looking: the whole ring face
               is the control, so one press silences the tone and leaves the
               timer exactly as it is. -->
          <button
            type="button"
            class="alert-silence"
            aria-label="Silence the alert"
            title="Session finished — silence the alert"
            (click)="silence()"
            (mousedown)="$event.stopPropagation()"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              <path d="M18 8a6 6 0 0 0-8.6-5.4" />
              <path d="M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h13" />
              <line x1="3" y1="3" x2="21" y2="21" />
            </svg>
          </button>
        } @else {
          <span class="mini-time">{{ timer.displayTime() }}</span>
        }
      </div>

      <div class="widget-actions">
        <button
          type="button"
          class="widget-btn"
          [attr.aria-label]="timer.isRunning() ? 'Pause timer' : 'Start timer'"
          [title]="timer.isRunning() ? 'Pause' : 'Start'"
          (click)="toggleTimer()"
          (mousedown)="$event.stopPropagation()"
        >
          @if (timer.isRunning()) {
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          } @else {
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 5.5 L19 12 L7 18.5 Z" />
            </svg>
          }
        </button>

        <button
          type="button"
          class="widget-btn"
          aria-label="Skip to the next session"
          title="Skip to the next session"
          (click)="skipTimer()"
          (mousedown)="$event.stopPropagation()"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6 5 L15.5 12 L6 19 Z" />
            <rect x="16.5" y="5" width="2.5" height="14" rx="1" />
          </svg>
        </button>

        <button
          type="button"
          class="widget-btn"
          aria-label="Stop the timer"
          title="Stop the timer"
          (click)="stopTimer()"
          (mousedown)="$event.stopPropagation()"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5.5" y="5.5" width="13" height="13" rx="3" />
          </svg>
        </button>

        <button
          type="button"
          class="widget-btn"
          aria-label="Restore the full window"
          title="Back to the full window"
          (click)="restore()"
          (mousedown)="$event.stopPropagation()"
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <polyline points="15,3 21,3 21,9" />
            <polyline points="9,21 3,21 3,15" />
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* The widget: the same rounded card in both builds.

       The shrunken window *is* the widget, edge to edge, and it is round
       cornered — the window is transparent and the page behind it is cleared
       while the widget is up (html.widget-transparent), so outside each corner
       is the desktop, exactly as outside the browser build's floating panel.
       overflow: hidden below is what keeps the rounding the frame's: the
       content is clipped by the rounded surface instead of being rounded itself.

       It is the surface that is rounded, and nothing inside it: the ring, the
       bell and the four buttons are clipped by this frame, so the widget reads as
       one rounded object rather than as round-cornered controls in a square box. */
    .mini-widget {
      position: fixed;
      inset: 0;
      z-index: 9999;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: 18px;
      /* Opaque, so nothing behind it can tint the surface: the corner radius is
         meant to let the desktop through *at the four corners* and nothing else,
         and a translucent panel would show whatever is behind it through the
         widget itself as well. */
      background: #0c0918;
      /* A hairline along the edge reads as an edge. The old 1px border plus
         inset glow drew a bright square around the circle instead. */
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
      /* The alert changes the surface itself, and it changes it *slowly* — one
         property, one curve, nothing stacked behind the content. */
      transition: background-color 450ms ease, box-shadow 450ms ease;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      overflow: hidden;
    }
    .mini-widget:active { cursor: grabbing; }

    /* A finished session takes the surface over until it is answered: visible
       from across the desk without being looked at, and slow enough to read as
       the widget changing state rather than flashing. The two colours arrive as
       custom properties — the repeat's entry from ALERT_COLOURS — so the whole
       alert, surface and answers together, is one palette entry rather than a
       per-surface list of them. */
    .mini-widget.alerting {
      background: var(--alert-surface);
      box-shadow: inset 0 0 0 1px var(--alert-edge);
    }
    /* The answers wear the alert's colour too, so the widget reads as one thing
       rather than a cool panel with purple buttons in it. */
    .mini-widget.alerting .widget-btn {
      border-color: var(--alert-border);
      background: var(--alert-fill);
      color: var(--alert-accent);
    }
    .mini-widget.alerting .widget-btn:hover {
      background: var(--alert-fill-strong);
      border-color: var(--alert-border-strong);
      color: #ffffff;
    }

    /* Browser build: a floating panel instead of a native window. It floats over
       the app rather than filling a window, so it needs its own size, its own
       depth and its own blur — the radius it shares with the native widget is
        already on .mini-widget, because the two are meant to look like the same
       object. */
    .mini-widget.floating {
      inset: auto;
      width: 136px;
      height: 76px;
      backdrop-filter: blur(20px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.09);
    }
    /* The panel keeps its depth while it alerts — the alert's edge replaces only
       the hairline, not the shadow that lifts it off the page. */
    .mini-widget.floating.alerting {
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), inset 0 0 0 1px var(--alert-edge);
    }

    .ring-wrap {
      position: relative;
      flex: 0 0 auto;
      width: 60px;
      height: 60px;
      display: grid;
      place-items: center;
    }
    /* Deliberately not called "ring": Tailwind reads bare class names out of the
       source, and that one collides with its own ring utility. */
    .mini-ring {
      position: absolute;
      inset: 0;
      /* The ring is a curve, not a chart line: smooth geometry instead of edges
         snapped to the pixel grid. */
      shape-rendering: geometricPrecision;
    }
    .ring-track {
      fill: none;
      stroke: rgba(255, 255, 255, 0.12);
      stroke-width: 6;
    }
    .ring-arc {
      fill: none;
      stroke-width: 6;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: 50% 50%;
      /* One second per tick, so the ring fills smoothly instead of jumping —
         the same transition the Dashboard clock's arc uses. */
      transition: stroke-dashoffset 1s linear, stroke 0.4s ease;
    }
    /* The halo fills with the arc — it is the same dash, 10px wide and dim. */
    .ring-halo {
      fill: none;
      stroke-width: 10;
      stroke-linecap: round;
      opacity: 0.18;
      transform: rotate(-90deg);
      transform-origin: 50% 50%;
      transition: stroke-dashoffset 1s linear, stroke 0.4s ease;
    }
    .mini-time {
      position: relative;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0;
      color: #f5f3ff;
      /* 1px with no blur: legible over the ring without softening the digits. */
      text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
    }

    .widget-actions {
      /* Four 24px controls on a 2x2 grid: the widget grew by the 16px this needs
         (120 -> 136) rather than the buttons shrinking below a comfortable
         target. Row 1 is the timer's own verbs — run, skip — and row 2 ends the
         cycle on the left and leaves the widget on the right, where "get out"
         belongs. */
      display: grid;
      grid-template-columns: repeat(2, 24px);
      gap: 4px;
      margin-left: auto;
    }
    .widget-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid rgba(139, 92, 246, 0.34);
      border-radius: 8px;
      background: rgba(139, 92, 246, 0.16);
      color: #e9e5ff;
      cursor: pointer;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    }
    .widget-btn:hover {
      background: rgba(139, 92, 246, 0.32);
      border-color: rgba(139, 92, 246, 0.6);
      color: #ffffff;
    }
    .widget-btn:focus-visible {
      outline: 2px solid rgba(167, 139, 250, 0.85);
      outline-offset: 1px;
    }

    /* The alert state. A finished session is the news, so the ring's own halo
       breathes instead of anything glowing: opacity on a 6px stroke leaves the
       edge exactly as hard as the rest of the widget, where a filter would have
       smudged it. */
    .ring-wrap.ringing .ring-halo {
      animation: alert-pulse 1.6s ease-in-out infinite;
    }
    @keyframes alert-pulse {
      0%, 100% { opacity: 0.18; }
      50% { opacity: 0.6; }
    }

    /* The shake, once per tone.

       The tone is the half of the alert the user hears wherever they are, and
       the widget shakes on that same beat: it throws itself off centre and
       settles while the sound is playing, then holds still until the next tone
       — see NotificationService.alertPulse.

       It runs for as long as the user asked it to — "Alert shake" in Settings —
       and *fast* for all of it: the length is divided into swings of
       SHAKE_SWING_MS each, so a four-second alert is four seconds of the same
       quick shake rather than one slow lean with four seconds to fill. Both
       numbers arrive as custom properties (--alert-shake-swings and
       --alert-shake-swing-ms); the fallbacks are the 2.2s default divided the
       same way.

       The tempo matters because the shake is the repeat made visible: the tones
       run from six tenths of a second to the bell's one and a half, and a nudge
       that is over — or moving slowly enough to read as a lean — before the sound
       is not a repeat. Speed is what carries across a desk; travel is not.

       What moves is the **whole widget** — surface, ring, bell and all four
       buttons — and not the ring inside it. The alert is meant to be caught by
       someone working in another window, and from there a 60px circle leaning
       3px inside an unmoved panel is invisible, while a 136x76 panel that
       leaves its own edge is not.

       alert-shake-a and alert-shake-b are identical on purpose: a CSS animation
       only restarts when its *name* changes, so the widget alternates between
       the two instead of trying to rewind one. shake-a / shake-b on the element
       are that alternation.

       The motion is a translate plus a small rotation, and never a scale: the
       ring is drawn at its own size so that nothing resamples it, and scaling
       the surface the circle sits on would undo exactly that. The rotation is
       what makes the shake read as the whole thing being jogged rather than
       sliding, and it stays under a degree and a half so the corners never
       swing far enough to read as a different shape. */
    .mini-widget.alerting.shake-a {
      animation: alert-shake-a var(--alert-shake-swing-ms, 122ms) ease-in-out
        var(--alert-shake-swings, 18);
    }
    .mini-widget.alerting.shake-b {
      animation: alert-shake-b var(--alert-shake-swing-ms, 122ms) ease-in-out
        var(--alert-shake-swings, 18);
    }
    /* One full swing, repeated once per --alert-shake-swings: left, right, back
       to rest. The amplitude is the same on every repetition on purpose — a
       decaying shake is one that is still going when the widget has stopped
       saying anything. */
    @keyframes alert-shake-a {
      0%, 100% { transform: translateX(0) rotate(0deg); }
      25% { transform: translateX(-5px) rotate(-1.3deg); }
      75% { transform: translateX(5px) rotate(1.3deg); }
    }
    @keyframes alert-shake-b {
      0%, 100% { transform: translateX(0) rotate(0deg); }
      25% { transform: translateX(-5px) rotate(-1.3deg); }
      75% { transform: translateX(5px) rotate(1.3deg); }
    }

    /* The one control that answers the alert — and it is the whole 60px face,
       not a small button wedged inside the ring: the countdown has stopped, so
       the biggest target on the widget is the one that stops the noise. In the
       alert's accent, because this is not the timer's own action: the session
       stays exactly where it is and only the tone stops. */
    .alert-silence {
      position: relative;
      display: grid;
      place-items: center;
      width: 60px;
      height: 60px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--alert-accent);
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .alert-silence:hover {
      background: var(--alert-fill);
      color: #ffffff;
    }
    .alert-silence:focus-visible {
      outline: 2px solid var(--alert-focus);
      outline-offset: 1px;
    }

    /* Anyone who asked their system for less motion keeps the colour change,
       which is the alert itself, and loses the shake, which is only the nudge. */
    @media (prefers-reduced-motion: reduce) {
      .mini-widget.alerting.shake-a,
      .mini-widget.alerting.shake-b {
        animation: none;
      }
    }
  `],
})
export class MiniWidgetComponent {
  readonly timer = inject(TimerService);
  private readonly ui = inject(UiService);
  private readonly notifications = inject(NotificationService);

  /**
   * True while a finished session is still unanswered.
   *
   * This is the widget's alert state: the ring pulses, the time gives way to the
   * silence button, and every control in the widget doubles as an answer — which
   * is the whole point, because the full window's toast is not on screen while
   * the window is this widget.
   */
  readonly ringing = this.notifications.ringing;

  /**
   * Which of the two identical shake animations the widget wears for the tone
   * that just played.
   *
   * The alert re-announces itself every time the tone repeats, and the widget
   * has to move again each time it does — a colour that is already on screen
   * cannot say "this, again", and neither can a widget that is standing still.
   * A CSS animation only restarts when its name changes, so the two names
   * alternate on every pulse the service publishes and the shake replays on the
   * exact beat of the sound.
   */
  readonly shakeB = computed(() => this.notifications.alertPulse() % 2 === 1);

  /**
   * The colour the alert wears right now: one entry of `ALERT_COLOURS` per
   * tone, handed to the stylesheet as custom properties.
   *
   * A repeat that only moved would be a repeat the user can miss by looking away;
   * a repeat that only changed colour would be a repeat they can miss by looking
   * at it a moment too late. Both come off the same pulse — the one the service
   * raises with the tone — so what is heard, what moves and what changes colour
   * are one event rather than three clocks that slowly drift apart.
   */
  readonly alertTheme = computed(() => alertTheme(this.notifications.alertPulse()));

  /**
   * The palette variables — or nothing at all when there is no alert to paint.
   *
   * Handing a surface the alert's colours only while it is alerting keeps the
   * colours a property of the state rather than of the element: an idle widget
   * carries no `--alert-accent` for a later rule to pick up by accident.
   */
  readonly alertVars = computed(() =>
    this.ringing()
      ? {
          ...this.alertTheme().cssVars,
          // How the shake is played, from Settings. It rides with the colours
          // because it is the same kind of thing: a property of the alert the
          // stylesheet cannot work out on its own.
          '--alert-shake-swings': String(this.shake().swings),
          '--alert-shake-swing-ms': `${this.shake().swingMs}ms`,
        }
      : null
  );

  /**
   * The shake divided into fast swings.
   *
   * The length is the user's (`Alert shake` in Settings); the *tempo* is not,
   * because a slow shake is not the thing the setting is about. So the length is
   * cut into whole swings of {@link SHAKE_SWING_MS} — rounded to a whole number
   * of them, then re-spread so the total is the chosen length to the millisecond
   * — and the stylesheet repeats one swing that many times. 0.7s is six fast
   * swings; 4s is thirty-three of the same.
   */
  readonly shake = computed(() => {
    const total = Math.max(1, this.notifications.alertShakeMs());
    const swings = Math.max(1, Math.round(total / SHAKE_SWING_MS));
    return { swings, swingMs: Number((total / swings).toFixed(2)) };
  });

  /** The native build owns the window; the browser build moves a floating panel. */
  readonly isTauri = this.ui.isTauriEnv;

  readonly radius = RING_RADIUS;
  readonly circumference = RING_CIRCUMFERENCE;
  /** ViewBox and rendered size agree, so the ring is never resampled. */
  readonly ringSize = RING_SIZE;
  readonly viewBox = `0 0 ${RING_SIZE} ${RING_SIZE}`;

  /** Browser-only position of the floating panel. */
  readonly pos = signal({ x: 20, y: 20 });
  private dragging = false;
  private dragOffset = { x: 0, y: 0 };

  /**
   * Ring fill: 0 offset means a complete circle, the full circumference means
   * none of it is drawn yet.
   *
   * Exactly the Dashboard clock's arc, from exactly the same value
   * (`TimerService.progress`): empty when a session starts, whole when the time
   * is up, filling clockwise at the same speed as the full window's clock. The
   * ring used to count the other way, which made the widget look like it was
   * running backwards next to the app.
   */
  readonly ringOffset = computed(
    () => RING_CIRCUMFERENCE * (1 - this.timer.progress())
  );

  readonly ringGradient = computed(() => RING_GRADIENT[this.timer.timerType()]);

  /**
   * What the ring is painted with: the session's own gradient, or the alert's
   * accent while a finished session is unanswered.
   *
   * The ring's colour is how the widget says *which* session is running, and it
   * goes back to saying that the moment the alert is answered — see `alertTheme`
   * for why the alert takes it over in the meantime, and why the colour it takes
   * it over with changes on every repeat. The stroke's own 0.4s transition
   * crossfades between the two.
   */
  readonly ringStroke = computed(() =>
    this.ringing() ? this.alertTheme().accent : this.ringGradient()
  );

  readonly ariaLabel = computed(() => {
    const label = this.timer.timerType() === 'work' ? 'Focus timer' : 'Break timer';
    if (this.ringing()) {
      return `${label}, ${this.timer.displayTime()} remaining, alert ringing`;
    }
    const state = this.timer.isRunning() ? 'running' : 'paused';
    return `${label}, ${this.timer.displayTime()} remaining, ${state}`;
  });

  /**
   * Start or pause without having to expand back to the full window.
   *
   * Pressing it while a session has just finished is also how the next one
   * begins, so it answers the alert on the way: the user has clearly heard it.
   */
  toggleTimer(): void {
    this.notifications.dismiss();
    if (this.timer.isRunning()) this.timer.pause();
    else this.timer.start();
  }

  /** Jump to the next session type — another answer to a finished session. */
  skipTimer(): void {
    this.notifications.dismiss();
    this.timer.skip();
  }

  /** End the session cycle — the answer for "that is enough for now". */
  stopTimer(): void {
    this.notifications.dismiss();
    this.timer.stop();
  }

  /**
   * Stop the tone without touching the timer.
   *
   * The one thing the widget could not do before: a user who has heard the alert
   * and wants silence — not a started break, not a skipped session — had to
   * bring the whole window back just to close the card.
   */
  silence(): void {
    this.notifications.dismiss();
  }

  /**
   * Hand the window back to the full app.
   *
   * Deliberately *not* an answer to the alert: this is the user coming to the
   * app, and what they should find there is the card they came to read — with its
   * own way to dismiss it — rather than a ring that stopped for no visible
   * reason.
   */
  async restore(): Promise<void> {
    await this.ui.exitMiniMode();
  }

  /** Drags the native window, or slides the browser panel. */
  async beginDrag(event: MouseEvent): Promise<void> {
    if (event.button !== 0) return;
    // Buttons handle their own clicks; dragging starts from the widget body only.
    if ((event.target as HTMLElement | null)?.closest('button')) return;

    if (this.isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().startDragging();
      } catch (e) {
        console.warn('Tauri startDragging failed', e);
      }
      return;
    }

    this.dragging = true;
    this.dragOffset = { x: event.clientX - this.pos().x, y: event.clientY - this.pos().y };
  }

  onDrag(event: MouseEvent): void {
    if (!this.dragging) return;
    this.pos.set({ x: event.clientX - this.dragOffset.x, y: event.clientY - this.dragOffset.y });
  }

  onDragEnd(): void {
    this.dragging = false;
  }
}
