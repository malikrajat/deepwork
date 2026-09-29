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

  it('paints the ring the alert colour while a finished session is unanswered', () => {
    // One colour across surface, ring, bell and buttons: the alternative is a
    // teal session gradient sitting on a blue surface, which is the clash the
    // alert colour exists to avoid. The session's own colour comes back with the
    // answer.
    expect(widget.ringStroke()).toContain('mini-ring-work');

    notifications.ringing.set(true);
    expect(widget.ringStroke()).toBe('#7dd3fc');

    notifications.ringing.set(false);
    expect(widget.ringStroke()).toContain('mini-ring-work');
  });

  it('rocks the ring on every tone the alert repeats, not on a clock of its own', () => {
    // The alert has to say "this, again" every time the tone plays, and a colour
    // that is already on screen cannot. The two names alternate because a CSS
    // animation only restarts when its name changes.
    notifications.ringing.set(true);
    expect(widget.rockB()).toBe(false);

    notifications.pulse();
    expect(widget.rockB()).toBe(true);

    notifications.pulse();
    expect(widget.rockB()).toBe(false);
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

  it('cools the whole surface while the alert rings, and settles back', () => {
    // An unanswered alert has to be visible from across the desk, so it changes
    // the surface rather than adding a badge — slowly, and only while it is
    // unanswered: answering is what puts the widget's own colour back.
    expect(src).toContain('[class.alerting]="ringing()"');
    expect(src).toMatch(/\.mini-widget\.alerting \{[\s\S]*?background: #0d1b2a;/);
    expect(src).toMatch(/\.mini-widget \{[\s\S]*?transition: background-color 450ms ease/);
  });

  it('rocks the ring once per tone, and stops asking for less motion', () => {
    // The motion is the alert's repeat made visible: one rock per tone, on the
    // beat of the same sound the user is hearing, and nothing at all for anyone
    // whose system asks for reduced motion — they keep the colour, which is the
    // part that carries the meaning.
    expect(src).toContain('[class.rock-a]="ringing() && !rockB()"');
    expect(src).toContain('[class.rock-b]="ringing() && rockB()"');
    expect(src).toMatch(/\.ring-wrap\.ringing\.rock-a \{ animation: alert-rock-a 0\.7s/);
    expect(src).toMatch(/\.ring-wrap\.ringing\.rock-b \{ animation: alert-rock-b 0\.7s/);
    // Two keyframe sets, identical in everything but their name: the name is
    // what restarts the animation, the motion is deliberately the same rock.
    const keyframesBlock = (name: string): string => {
      const start = src.indexOf(`@keyframes ${name} {`);
      return src.slice(start, src.indexOf('\n    }', start));
    };
    const rockA = keyframesBlock('alert-rock-a');
    const rockB = keyframesBlock('alert-rock-b');
    expect(rockA).not.toBe('');
    expect(rockA.replace('alert-rock-a', '')).toBe(rockB.replace('alert-rock-b', ''));
    // The rock moves the ring; it never scales it, which would resample the
    // circle the widget is careful to draw at its own size.
    for (const keyframes of [rockA, rockB]) {
      expect(keyframes).toContain('translateX');
      expect(keyframes).not.toContain('scale(');
    }
    expect(src).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.ring-wrap\.ringing\.rock-a,[\s\S]*?animation: none;/
    );
  });

  it('has no title-bar controls of its own', () => {
    // The native title bar is switched off in UiService.enterMiniMode; the widget
    // must not grow its own minimise/maximise/close buttons in its place.
    expect(src).not.toMatch(/minimise button|maximise button|close button/i);
    expect(src).not.toMatch(/<header/i);
  });
});
