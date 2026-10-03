import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computed, signal } from '@angular/core';
import { MiniWidgetComponent } from '../../src/app/shared/components/mini-widget/mini-widget.component';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { TimerService } from '../../src/app/core/services/timer.service';
import { UiService } from '../../src/app/core/services/ui.service';
import { TimerType } from '../../src/app/core/models/session.model';
import { ALERT_COLOURS } from '../../src/app/core/constants/alert.constants';

const SESSION_SECONDS = 25 * 60;

const makeMockTimer = () => {
  const remaining = signal(SESSION_SECONDS);
  const total = signal(SESSION_SECONDS);
  const running = signal(false);
  const type = signal<TimerType>('work');

  return {
    remainingSeconds: remaining,
    totalDuration: total,
    isRunning: running,
    timerType: type,
    displayTime: computed(() =>
      `${Math.floor(remaining() / 60).toString().padStart(2, '0')}:${(remaining() % 60)
        .toString()
        .padStart(2, '0')}`
    ),
    // Mirrors TimerService.progress: 0 at the start, 1 when time is up. The
    // widget reads the same value the Dashboard clock does, so the two cannot
    // disagree about which way a session is running.
    progress: computed(() => {
      const duration = total();
      if (duration <= 0) return 0;
      return Math.min(1, Math.max(0, 1 - remaining() / duration));
    }),
    start: vi.fn(() => running.set(true)),
    pause: vi.fn(() => running.set(false)),
    skip: vi.fn(),
    stop: vi.fn(),
  };
};

const makeMockUi = () => ({
  isTauriEnv: false,
  exitMiniMode: vi.fn().mockResolvedValue(undefined),
});

const makeMockNotifications = () => {
  const ringing = signal(false);
  const alertPulse = signal(0);
  return {
    ringing,
    alertPulse,
    /** How long the shake lasts, from Settings. */
    alertShakeMs: signal(2200),
    /** One more tone — the alert re-announcing itself, as the service does it. */
    pulse: () => alertPulse.update(pulse => pulse + 1),
    dismiss: vi.fn(() => ringing.set(false)),
  };
};

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/mini-widget/mini-widget.component.ts'
);

/**
 * The widget is the only thing on screen while the window is shrunk, so its two
 * jobs — draining the countdown ring and getting the user back out — are worth
 * pinning down.
 *
 * NOTE: as with the other component specs in this project, the template itself is
 * not rendered (Vitest's JIT compiler cannot resolve signal inputs), so behaviour
 * is exercised on an instance built inside an injection context and the template's
 * affordances are asserted against the source.
 */
describe('MiniWidgetComponent', () => {
  let timer: ReturnType<typeof makeMockTimer>;
  let ui: ReturnType<typeof makeMockUi>;
  let notifications: ReturnType<typeof makeMockNotifications>;
  let widget: MiniWidgetComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    timer = makeMockTimer();
    ui = makeMockUi();
    notifications = makeMockNotifications();
    TestBed.configureTestingModule({
      providers: [
        { provide: TimerService, useValue: timer },
        { provide: UiService, useValue: ui },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    widget = TestBed.runInInjectionContext(() => new MiniWidgetComponent());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('starts a session with an empty ring', () => {
    expect(widget.ringOffset()).toBe(widget.circumference);
  });

  it('fills the ring as time passes — the same way the full window fills', () => {
    timer.remainingSeconds.set(SESSION_SECONDS / 2);
    expect(widget.ringOffset()).toBeCloseTo(widget.circumference / 2, 5);
  });

  it('closes the ring once the time is up', () => {
    timer.remainingSeconds.set(0);
    expect(widget.ringOffset()).toBe(0);
  });

  it('starts the next session from empty, whatever the session type', () => {
    timer.remainingSeconds.set(0);
    timer.timerType.set('short-break');
    timer.remainingSeconds.set(5 * 60);
    timer.totalDuration.set(5 * 60);
    expect(widget.ringOffset()).toBe(widget.circumference);

    timer.timerType.set('long-break');
    timer.remainingSeconds.set(0);
    expect(widget.ringOffset()).toBe(0);
  });

  it('colours the ring by session type', () => {
    expect(widget.ringGradient()).toContain('mini-ring-work');
    timer.timerType.set('short-break');
    expect(widget.ringGradient()).toContain('mini-ring-short');
    timer.timerType.set('long-break');
    expect(widget.ringGradient()).toContain('mini-ring-long');
  });

  it('shakes fast for as long as the settings say', () => {
    notifications.ringing.set(true);

    // The length is the user's; the tempo is not. A shake that is still going
    // four seconds later has to still be shaking, so a longer setting buys more
    // swings rather than slower ones.
    notifications.alertShakeMs.set(700);
    expect(widget.shake().swings).toBe(6);

    notifications.alertShakeMs.set(2200);
    const short = widget.shake();
    expect(short.swings).toBe(18);
    expect(short.swingMs).toBeCloseTo(122.22, 1);

    notifications.alertShakeMs.set(4000);
    const long = widget.shake();
    expect(long.swings).toBe(33);
    expect(long.swingMs).toBeCloseTo(121.21, 1);
    expect(Math.abs(long.swingMs - short.swingMs)).toBeLessThan(5);

    // And the two numbers reach the stylesheet as the custom properties the one
    // swing is repeated with.
    expect(widget.alertVars()?.['--alert-shake-swings']).toBe('33');
    expect(widget.alertVars()?.['--alert-shake-swing-ms']).toBe('121.21ms');
    expect(widget.alertVars()?.['--alert-accent']).toBe(ALERT_COLOURS[0].accent);
  });

  it('paints the ring the alert colour while a finished session is unanswered', () => {
    // One colour across surface, ring, bell and buttons: the alternative is a
    // teal session gradient sitting on a coloured surface, which is the clash the
    // alert colour exists to avoid. The session's own colour comes back with the
    // answer.
    expect(widget.ringStroke()).toContain('mini-ring-work');

    notifications.ringing.set(true);
    expect(widget.ringStroke()).toBe('#7dd3fc');

    notifications.ringing.set(false);
    expect(widget.ringStroke()).toContain('mini-ring-work');
  });

  it('walks the alert palette on every tone, not on a clock of its own', () => {
    // A colour that is already on screen cannot say "this, again", so the alert
    // does not have one colour: each repeat moves to the next entry of the
    // palette, and the palette is wide enough that two in a row never look like
    // the same colour.
    notifications.ringing.set(true);
    // The raise is the first tone — the service rings it as it sets `ringing` —
    // and it opens on the blue the alert has always worn.
    notifications.pulse();
    expect(widget.alertTheme().accent).toBe(ALERT_COLOURS[0].accent);
    expect(widget.alertTheme().surface).toBe(ALERT_COLOURS[0].surface);

    notifications.pulse();
    expect(widget.alertTheme().accent).toBe(ALERT_COLOURS[1].accent);
    expect(widget.alertTheme().surface).toBe(ALERT_COLOURS[1].surface);

    notifications.pulse();
    expect(widget.alertTheme().accent).toBe(ALERT_COLOURS[2].accent);

    // ...and the whole palette is a cycle rather than a one-way trip.
    for (let i = 0; i < ALERT_COLOURS.length; i += 1) notifications.pulse();
    expect(widget.alertTheme().accent).toBe(ALERT_COLOURS[2].accent);
    // The ring is stroked with the same entry the surface is painted from.
    expect(widget.ringStroke()).toBe(widget.alertTheme().accent);
  });

  it('shakes the whole widget on every tone the alert repeats', () => {
    // The motion is what re-announces the alert where the user is already
    // looking, and it is the whole widget that moves — surface, ring and all four
    // buttons. The two names alternate because a CSS animation only restarts when
    // its name changes.
    notifications.ringing.set(true);
    expect(widget.shakeB()).toBe(false);

    notifications.pulse();
    expect(widget.shakeB()).toBe(true);

    notifications.pulse();
    expect(widget.shakeB()).toBe(false);
  });

  it('carries no alert palette at all while nothing is ringing', () => {
    expect(widget.alertVars()).toBeNull();

    notifications.ringing.set(true);
    expect(widget.alertVars()?.['--alert-accent']).toBe('#7dd3fc');

    notifications.ringing.set(false);
    expect(widget.alertVars()).toBeNull();
  });

  it('starts the timer from the widget when it is idle', () => {
    widget.toggleTimer();
    expect(timer.start).toHaveBeenCalled();
    expect(timer.pause).not.toHaveBeenCalled();
  });

  it('pauses the timer from the widget while it runs', () => {
    timer.isRunning.set(true);
    widget.toggleTimer();
    expect(timer.pause).toHaveBeenCalled();
    expect(timer.start).not.toHaveBeenCalled();
  });

  it('skips and stops the session from the widget', () => {
    widget.skipTimer();
    expect(timer.skip).toHaveBeenCalled();

    widget.stopTimer();
    expect(timer.stop).toHaveBeenCalled();
  });

  it('answers a ringing alert from every one of its controls', () => {
    // While the window *is* the widget the full window's toast is not on screen,
    // so the alert has to be answerable here or it rings until the user expands
    // the app and closes the card by hand.
    notifications.ringing.set(true);

    widget.toggleTimer();
    expect(notifications.dismiss).toHaveBeenCalledTimes(1);

    widget.skipTimer();
    widget.stopTimer();
    widget.silence();
    expect(notifications.dismiss).toHaveBeenCalledTimes(4);
    expect(notifications.ringing()).toBe(false);
  });

  it('silences an alert without changing the timer', () => {
    notifications.ringing.set(true);

    widget.silence();

    expect(timer.start).not.toHaveBeenCalled();
    expect(timer.pause).not.toHaveBeenCalled();
    expect(timer.skip).not.toHaveBeenCalled();
    expect(timer.stop).not.toHaveBeenCalled();
    expect(notifications.dismiss).toHaveBeenCalled();
  });

  it('leaves the alert ringing when the user expands the window', async () => {
    // Coming back to the app should find the card the alert was about, close
    // button and all — not a ring that stopped for no visible reason.
    notifications.ringing.set(true);

    await widget.restore();

    expect(ui.exitMiniMode).toHaveBeenCalled();
    expect(notifications.dismiss).not.toHaveBeenCalled();
  });

  it('shows the alert state and passes it on to everything that describes it', () => {
    expect(widget.ariaLabel()).toBe('Focus timer, 25:00 remaining, paused');

    notifications.ringing.set(true);
    expect(widget.ariaLabel()).toContain('alert ringing');
  });

  it('hands the window back to the app when asked to restore', async () => {
    await widget.restore();
    expect(ui.exitMiniMode).toHaveBeenCalled();
  });

  it('describes itself for screen readers', () => {
    timer.isRunning.set(true);
    expect(widget.ariaLabel()).toBe('Focus timer, 25:00 remaining, running');
  });
});

describe('MiniWidgetComponent (template affordances)', () => {
  const src = readFileSync(SOURCE, 'utf8');

  it('draws a gradient countdown ring around the running time', () => {
    expect(src).toContain('ring-track');
    expect(src).toContain('ring-arc');
    expect(src).toContain('[attr.stroke-dashoffset]="ringOffset()"');
    expect(src).toContain('{{ timer.displayTime() }}');
  });

  it('offers the four widget actions: run, skip, stop and get back out', () => {
    expect(src).toContain('aria-label="Restore the full window"');
    expect(src).toContain("timer.isRunning() ? 'Pause timer' : 'Start timer'");
    expect(src).toContain('(click)="skipTimer()"');
    expect(src).toContain('(click)="stopTimer()"');
  });

  it('puts the silence button inside the ring while the alert rings', () => {
    expect(src).toContain('[class.ringing]="ringing()"');
    expect(src).toContain('aria-label="Silence the alert"');
    expect(src).toContain('(click)="silence()"');
    // The alert replaces the countdown rather than sitting beside it: the widget
    // has room for one thing at a time in the 60px circle.
    expect(src).toMatch(/@if \(ringing\(\)\)[\s\S]*@else \{\s*<span class="mini-time">/);
  });

  it('takes one alert colour over the whole surface, and settles back', () => {
    // An unanswered alert has to be visible from across the desk, so it changes
    // the surface rather than adding a badge — slowly, and only while it is
    // unanswered: answering is what puts the widget's own colour back. The colour
    // itself arrives from the palette (see ALERT_COLOURS) as custom properties,
    // so the surface and the answers cannot drift apart from it.
    expect(src).toContain('[class.alerting]="ringing()"');
    expect(src).toContain('[style]="alertVars()"');
    expect(src).toMatch(/\.mini-widget\.alerting \{[\s\S]*?background: var\(--alert-surface\);/);
    expect(src).toMatch(/\.mini-widget \{[\s\S]*?transition: background-color 450ms ease/);
  });

  it('shakes the whole widget once per tone, and stops asking for less motion', () => {
    // The motion is the alert's repeat made visible: one shake per tone, on the
    // beat of the same sound the user is hearing, and nothing at all for anyone
    // whose system asks for reduced motion — they keep the colour, which is the
    // part that carries the meaning.
    expect(src).toContain('[class.shake-a]="ringing() && !shakeB()"');
    expect(src).toContain('[class.shake-b]="ringing() && shakeB()"');
    // On the widget itself, not on the ring inside it: the whole 136x76 panel is
    // what has to be caught by someone looking at another window.
    expect(src).not.toContain('ring-wrap.ringing.rock-a');
    // How long the shake lasts is the user's call (`Alert shake` in Settings),
    // and how fast it moves is not: the length is divided into swings of about
    // 120ms, so the long settings are long *fast* shakes. Both numbers arrive as
    // custom properties, with the 2.2s default divided the same way as the
    // fallback.
    expect(src).toMatch(
      /\.mini-widget\.alerting\.shake-a \{\s*animation: alert-shake-a var\(--alert-shake-swing-ms, 122ms\) ease-in-out\s*var\(--alert-shake-swings, 18\)/
    );
    expect(src).toMatch(
      /\.mini-widget\.alerting\.shake-b \{\s*animation: alert-shake-b var\(--alert-shake-swing-ms, 122ms\) ease-in-out\s*var\(--alert-shake-swings, 18\)/
    );
    // Two keyframe sets, identical in everything but their name: the name is
    // what restarts the animation, the motion is deliberately the same shake.
    const keyframesBlock = (name: string): string => {
      const start = src.indexOf(`@keyframes ${name} {`);
      return src.slice(start, src.indexOf('\n    }', start));
    };
    const shakeA = keyframesBlock('alert-shake-a');
    const shakeB = keyframesBlock('alert-shake-b');
    expect(shakeA).not.toBe('');
    expect(shakeA.replace('alert-shake-a', '')).toBe(shakeB.replace('alert-shake-b', ''));
    // The shake moves the widget; it never scales it, which would resample the
    // circle the widget is careful to draw at its own size.
    for (const keyframes of [shakeA, shakeB]) {
      expect(keyframes).toContain('translateX');
      expect(keyframes).not.toContain('scale(');
    }
    expect(src).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.mini-widget\.alerting\.shake-a,[\s\S]*?animation: none;/
    );
  });

  it('has no title-bar controls of its own', () => {
    // The native title bar is switched off in UiService.enterMiniMode; the widget
    // must not grow its own minimise/maximise/close buttons in its place.
    expect(src).not.toMatch(/minimise button|maximise button|close button/i);
    expect(src).not.toMatch(/<header/i);
  });
});
