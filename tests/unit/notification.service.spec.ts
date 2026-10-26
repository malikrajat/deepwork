import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { AttentionService } from '../../src/app/core/services/attention.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';
import {
  BREAK_QUOTES,
  FOCUS_QUOTES,
  TASK_QUOTES,
} from '../../src/app/core/constants/alert.constants';

/**
 * The desktop shell and its notification plugin, as the service finds them.
 *
 * Both are reached through `import()` inside the service, because the browser
 * build has neither — so the mocks are module mocks rather than injected
 * services. `invoke` starts out refusing, which is what a browser tab sees, and
 * the tests that care about the desktop toast say so.
 */
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  sendNotification: vi.fn(),
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue('granted'),
}));

const makeMockSettings = () => ({
  settings: signal({ ...DEFAULT_SETTINGS }),
});

/**
 * The four answers the completion alert offers, as both surfaces draw them.
 *
 * Spelled out here rather than read off the service: the ids are what a pressed
 * button reports back, so the test should fail if one is renamed, not agree with
 * whatever the code now says.
 */
const ALERT_ANSWERS = [
  { id: 'pause', label: 'Pause' },
  { id: 'skip', label: 'Skip current' },
  { id: 'start', label: 'Start' },
  { id: 'silent', label: 'Silent' },
];

describe('NotificationService', () => {
  let svc: NotificationService;
  let mockSettings: ReturnType<typeof makeMockSettings>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // A mute is remembered across a launch, so one test's mute must not follow
    // the next test's service into silence.
    localStorage.clear();
    mockSettings = makeMockSettings();
    TestBed.configureTestingModule({
      providers: [NotificationService, { provide: SettingsService, useValue: mockSettings }],
    });
    svc = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('toast signal initializes as null', () => {
    expect(svc.toast()).toBeNull();
  });

  it('dismiss() clears the toast', () => {
    (svc as any).toast.set({
      id: 1,
      title: 'Done!',
      body: 'Take a break.',
      type: 'work',
      visible: true,
    });
    expect(svc.toast()).not.toBeNull();
    svc.dismiss();
    expect(svc.toast()).toBeNull();
  });

  it('dismiss() is safe to call when toast is already null', () => {
    expect(() => svc.dismiss()).not.toThrow();
    expect(svc.toast()).toBeNull();
  });

  it('shares one start-up, so no post can race past the button listener', async () => {
    // The app asks for `init()` at startup and the water reminder asks for it
    // again before its first post. A boolean set before the permission answer
    // and the listener would let the second caller through while the first was
    // still in flight — and a toast posted then has buttons nobody is listening
    // for. One in-flight promise means both wait for the same, complete start-up.
    const plugin = await import('@tauri-apps/plugin-notification');

    await Promise.all([svc.init(), svc.init(), svc.init()]);

    expect(plugin.isPermissionGranted).toHaveBeenCalledTimes(1);
  });

  it('publishes the alert as ringing until it is answered', async () => {
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();

    expect(svc.ringing()).toBe(false);
    await svc.fireTimerComplete('work');
    expect(svc.ringing()).toBe(true);

    svc.dismiss();
    expect(svc.ringing()).toBe(false);
  });

  it('stays completely silent while the app is paused', async () => {
    // Pause is the user asking for none of this: no tone, no card and no
    // notification. A session can still finish during a pause — one started
    // after it was set — and it must end without saying anything.
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();
    const attention = TestBed.inject(AttentionService);
    attention.pauseFor(22 * 60);

    await svc.fireTimerComplete('work');
    vi.advanceTimersByTime(60);

    expect(svc.ringing()).toBe(false);
    expect(svc.toast()).toBeNull();
    expect((svc as any).sendNotification).not.toHaveBeenCalled();
    expect((svc as any).playSound).not.toHaveBeenCalled();
    expect((svc as any).startRepeatLoop).not.toHaveBeenCalled();
  });

  it('ends an alert that was already ringing when the pause is set', async () => {
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();

    await svc.fireTimerComplete('work');
    vi.advanceTimersByTime(60);
    expect(svc.ringing()).toBe(true);
    expect(svc.toast()).not.toBeNull();

    TestBed.inject(AttentionService).pauseFor(22 * 60);
    svc.stopAlert();

    expect(svc.ringing()).toBe(false);
    expect(svc.toast()).toBeNull();
  });

  it('does not ring, pulse or re-post on a tick that lands after the pause', async () => {
    const originalWorker = globalThis.Worker;
    (globalThis as any).Worker = undefined;
    try {
      (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
      (svc as any).playSound = vi.fn();
      await svc.fireTimerComplete('work');
      const pulse = svc.alertPulse();

      TestBed.inject(AttentionService).pauseFor(22 * 60);
      (svc as any).onRepeatTick();

      expect((svc as any).playSound).toHaveBeenCalledTimes(1);
      expect(svc.alertPulse()).toBe(pulse);
      expect(svc.ringing()).toBe(false);
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });

  it('pulses once per tone, so both surfaces can move on the beat of the sound', async () => {
    // The tone is heard, but an alert that has to be seen repeating needs a
    // count: one edge per raise drives the widget's shake, the card's shake and
    // the palette colour both of them take, so what is heard and what is seen
    // share one count instead of running on two clocks that slowly drift apart.
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();

    expect(svc.alertPulse()).toBe(0);

    await svc.fireTimerComplete('work');
    expect(svc.alertPulse()).toBe(1);

    (svc as any).onRepeatTick();
    (svc as any).onRepeatTick();
    expect(svc.alertPulse()).toBe(3);

    // Answering stops the pulses with the ringing; the count itself is an edge,
    // so it is left where it stopped rather than being rewound.
    svc.dismiss();
    (svc as any).onRepeatTick();
    expect(svc.alertPulse()).toBe(3);
  });

  it('re-posts the system notice on every repeat, counting as it goes', async () => {
    // Half of this alert is that the user is somewhere else, so a repeat that
    // only sounded in the app would be a repeat the desktop never saw. It goes
    // back under the alert's own handle, which is what makes it one notification
    // that re-raises itself rather than one copy per interval — and the count in
    // the body is what makes each post say something new.
    const sendNotification = ((svc as any).sendNotification = vi.fn().mockResolvedValue(undefined));
    (svc as any).playSound = vi.fn();
    const showToast = vi.spyOn(svc as any, 'showToast');

    await svc.fireTimerComplete('work');
    expect(showToast).toHaveBeenCalledTimes(1);
    // The raise itself is not a repeat: it is the alert, not a reminder of one.
    // It carries the first line of the focus list, as a quote of its own rather
    // than as the message's last sentence — and the four answers, which travel
    // with every post so a repeat can never strip them from the toast.
    expect(sendNotification).toHaveBeenLastCalledWith(
      'Task is over.',
      'Great work! Time for a short break.',
      0,
      { quote: FOCUS_QUOTES[0], actions: ALERT_ANSWERS, sticky: true },
    );

    (svc as any).onRepeatTick();
    (svc as any).onRepeatTick();

    expect(sendNotification).toHaveBeenCalledTimes(3);
    // A repeat says something new ("Reminder 2 · …") and quotes the same line:
    // the sentence belongs to the alert, not to the tone that re-announces it.
    expect(sendNotification).toHaveBeenLastCalledWith(
      'Task is over.',
      'Great work! Time for a short break.',
      2,
      { quote: FOCUS_QUOTES[0], actions: ALERT_ANSWERS, sticky: true },
    );
    expect(showToast).toHaveBeenCalledTimes(3);
    expect((svc as any).playSound).toHaveBeenCalledTimes(3);
  });

  it('counts the repeats from one again for the next alert', async () => {
    const sendNotification = ((svc as any).sendNotification = vi.fn().mockResolvedValue(undefined));
    (svc as any).playSound = vi.fn();

    await svc.fireTimerComplete('work');
    (svc as any).onRepeatTick();
    (svc as any).onRepeatTick();
    svc.dismiss();

    await svc.fireTimerComplete('short-break');
    (svc as any).onRepeatTick();

    expect(sendNotification).toHaveBeenLastCalledWith(
      'Break is over!',
      'Ready to focus again?',
      1,
      // The first break of the run, so the first line of the break deck — each
      // deck has a position of its own.
      { quote: BREAK_QUOTES[0], actions: ALERT_ANSWERS, sticky: true },
    );
  });

  it('gives a finished session a line of its own to read', async () => {
    // The alert's own sentence is the news; the quote is the encouragement, and
    // the two are drawn apart everywhere they are shown. A focus session sends
    // the user away from the desk and a break calls them back, so which list the
    // line comes from follows what just finished — and the list is walked one
    // entry per session rather than one per repeat.
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();

    await svc.fireTimerComplete('work');
    vi.runAllTimers();
    expect(svc.toast()?.body).toBe('Great work! Time for a short break.');
    expect(svc.toast()?.quote).toBe(FOCUS_QUOTES[0]);

    svc.dismiss();
    await svc.fireTimerComplete('work');
    vi.runAllTimers();
    // The next session gets the next line rather than the same one again.
    expect(svc.toast()?.quote).toBe(FOCUS_QUOTES[1]);

    svc.dismiss();
    await svc.fireTimerComplete('short-break');
    vi.runAllTimers();
    // A finished break draws from the other list — about coming back rather than
    // about stepping away — and its own deck starts at its own first line.
    expect(svc.toast()?.quote).toBe(BREAK_QUOTES[0]);
    // And never glued onto the message it arrived with.
    expect(svc.toast()?.body).not.toContain(BREAK_QUOTES[0]);
  });

  it('gives a finished task a line of its own, walked one per task', () => {
    // The card is a receipt rather than an alert: no tone, no repeat, and no
    // desktop notification — so nothing here stubs a sound or a repeat loop, and
    // the test fails loudly if one is ever wired in.
    svc.announceTaskCompleted('Write the release notes');
    vi.runAllTimers();

    expect(svc.toast()?.title).toBe('Task completed');
    expect(svc.toast()?.body).toBe('Write the release notes');
    expect(svc.toast()?.quote).toBe(TASK_QUOTES[0]);

    svc.dismiss();
    svc.announceTaskCompleted('Ship the patch');
    vi.runAllTimers();

    // The next task gets the next line rather than the same one again, from the
    // one list kept for finished work — not from the session lists.
    expect(svc.toast()?.quote).toBe(TASK_QUOTES[1]);
    expect(FOCUS_QUOTES).not.toContain(TASK_QUOTES[1]);
    // The news and the encouragement are two things, drawn apart.
    expect(svc.toast()?.body).not.toContain(TASK_QUOTES[1]);
  });

  it('posts the alert as a tagged desktop toast where the shell can', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const plugin = await import('@tauri-apps/plugin-notification');
    vi.mocked(invoke).mockResolvedValue(undefined as never);

    await (svc as any).sendNotification('Task is over.', 'Great work! Time for a short break.', 3);

    // The tag is the whole point of going through the shell's own command: it is
    // what Windows replaces rather than stacking a second toast beside, and the
    // count in the body is what makes the replacement something new to read.
    expect(invoke).toHaveBeenCalledWith('alert_notify', {
      title: 'Task is over.',
      body: 'Reminder 3 · Great work! Time for a short break.',
      tag: 'deepwork-alert',
      // A bare post has no quote of its own, and it repeats on its own clock, so
      // it asks for neither the extra line nor the wait. The completion alert
      // itself does pass its four answers — see the next test — so what this
      // pins down is the shape of a post that was given nothing.
      quote: null,
      sticky: false,
      actions: [],
    });
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });

  it('posts the alert’s four answers as buttons on the desktop toast', async () => {
    // The toast is where the user is looking, so the clock's controls belong on
    // it: Pause, Skip current and Start act, and Silent closes the alert without
    // touching the clock. Windows is the only platform whose toast reports a
    // press, and the id — not the label — is what comes back.
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue(undefined as never);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();

    await svc.fireTimerComplete('work');

    expect(invoke).toHaveBeenCalledWith(
      'alert_notify',
      expect.objectContaining({
        tag: 'deepwork-alert',
        quote: FOCUS_QUOTES[0],
        // A waiting toast: it stays on screen until one of the four answers is
        // pressed, which is the point of the alert being a question rather than
        // a banner that slides away while the user is elsewhere.
        sticky: true,
        actions: ALERT_ANSWERS,
      }),
    );
  });

  it('posts the completion alert as a toast that waits for an answer', async () => {
    const sendNotification = ((svc as any).sendNotification = vi.fn().mockResolvedValue(true));
    (svc as any).canAnswerOnNotification = true;
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();

    await svc.fireTimerComplete('work');

    expect(sendNotification).toHaveBeenCalledWith(
      'Task is over.',
      'Great work! Time for a short break.',
      0,
      { quote: FOCUS_QUOTES[0], actions: ALERT_ANSWERS, sticky: true },
    );
    // The platform can keep it there, so the repeat loop will leave it alone.
    expect((svc as any).alertIsSticky).toBe(true);
  });

  it('leaves a sticky toast alone on every tone, but still re-posts where it cannot stick', () => {
    const sendNotification = ((svc as any).sendNotification = vi.fn().mockResolvedValue(true));
    const pending = {
      title: 'Task is over.',
      body: 'Great work! Time for a short break.',
      type: 'work' as const,
      quote: FOCUS_QUOTES[0],
      actions: ALERT_ANSWERS,
    };
    (svc as any).pendingRepeat = pending;
    (svc as any).playSound = vi.fn();
    (svc as any).showAlertToast = vi.fn();
    // The constructor effect re-arms the loop whenever it sees a pending alert;
    // these tests drive the tick themselves and do not want a second clock.
    (svc as any).startRepeatLoop = vi.fn();

    // A sticky toast is already the question on screen; replacing it every tone
    // would turn it into a banner, and a banner is what the user learns to swipe.
    (svc as any).alertIsSticky = true;
    (svc as any).onRepeatTick();
    (svc as any).onRepeatTick();
    expect(sendNotification).not.toHaveBeenCalled();

    // A surface that cannot hold it gets the old repeat-every-tone behaviour.
    (svc as any).alertIsSticky = false;
    (svc as any).onRepeatTick();
    expect(sendNotification).toHaveBeenCalledWith(pending.title, pending.body, 3, {
      quote: pending.quote,
      actions: ALERT_ANSWERS,
      sticky: true,
    });
  });

  it('asks again three minutes after its toast is crossed, and stops when answered', async () => {
    // Crossing a notification is not one of the four answers. The question comes
    // back after three minutes, and keeps coming back until a button is pressed.
    const sendNotification = ((svc as any).sendNotification = vi.fn().mockResolvedValue(true));
    const pending = {
      title: 'Task is over.',
      body: 'Great work! Time for a short break.',
      type: 'work' as const,
      quote: FOCUS_QUOTES[0],
      actions: ALERT_ANSWERS,
    };
    (svc as any).ringing.set(true);
    (svc as any).pendingRepeat = pending;
    (svc as any).startRepeatLoop = vi.fn();

    (svc as any).scheduleAlertReminder();
    await vi.advanceTimersByTimeAsync(3 * 60_000 - 1);
    expect(sendNotification).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sendNotification).toHaveBeenCalledWith(pending.title, pending.body, 0, {
      quote: pending.quote,
      actions: ALERT_ANSWERS,
      sticky: true,
    });

    // Crossing the re-posted toast schedules the next one.
    (svc as any).scheduleAlertReminder();
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(sendNotification).toHaveBeenCalledTimes(2);

    // Any answer — here Silent — ends the asking.
    (svc as any).runAlertAction('silent');
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('answers the alert from a pressed button, then lets the clock act', () => {
    // A press on the toast and a press on the card are one answer: both go
    // through `runAlertAction`, so the alert closes either way and only the
    // clock's three answers are forwarded to whoever holds the clock.
    const handler = vi.fn();
    svc.onAlertAction(handler);

    (svc as any).runAlertAction('start');

    expect(svc.ringing()).toBe(false);
    expect(handler).toHaveBeenCalledWith('start');
  });

  it('closes the alert on Silent without asking the clock anything', () => {
    const handler = vi.fn();
    svc.onAlertAction(handler);

    (svc as any).runAlertAction('silent');

    expect(svc.ringing()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('raises the card with the same four answers, answered the same way', async () => {
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();
    const handler = vi.fn();
    svc.onAlertAction(handler);

    await svc.fireTimerComplete('work');
    vi.runAllTimers();

    expect(svc.toast()?.actions?.map((action) => action.label)).toEqual(
      ALERT_ANSWERS.map((answer) => answer.label),
    );

    // The card's own answer takes the same path as the toast's — Start begins the
    // session that is waiting, and the alert is closed on the way.
    await svc.toast()?.actions?.[2].run();
    expect(handler).toHaveBeenCalledWith('start');
    expect(svc.toast()).toBeNull();
  });

  it('posts a quote as a line of its own, and asks for a toast that waits', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue(undefined as never);

    await svc.announce('Drink water — 500 ml', 'Time for 500 ml. Today: 1.0 L of 2.0 L.', {
      quote: 'Small sips, all day. That is the whole trick.',
      tag: NotificationService.WATER_NOTIFICATION_TAG,
      sticky: true,
      actions: [
        { id: 'yes', label: 'Yes, drank' },
        { id: 'no', label: 'Not now' },
      ],
    });

    // The quote is its own field, not the message's last sentence: the shell
    // gives it a smaller line of its own, and the thread posting it is the one
    // the user will not lose behind another window. The buttons travel with it
    // as ids and labels — the ids are what `onToastAction` hands back.
    expect(invoke).toHaveBeenCalledWith('alert_notify', {
      title: 'Drink water — 500 ml',
      body: 'Time for 500 ml. Today: 1.0 L of 2.0 L.',
      tag: 'deepwork-water',
      quote: 'Small sips, all day. That is the whole trick.',
      sticky: true,
      actions: [
        { id: 'yes', label: 'Yes, drank' },
        { id: 'no', label: 'Not now' },
      ],
    });
  });

  it('reports a question as answered-only where its buttons can be pressed', async () => {
    // The caller of `announce` needs to know the difference between "the words
    // were shown" and "the question can be answered here". The tagged shell is
    // the one surface that carries the buttons; the plugin and the browser show
    // the words and nothing else.
    const { invoke } = await import('@tauri-apps/api/core');
    const plugin = await import('@tauri-apps/plugin-notification');
    const asked = {
      tag: NotificationService.WATER_NOTIFICATION_TAG,
      sticky: true,
      actions: [
        { id: 'yes', label: 'Yes, drank' },
        { id: 'no', label: 'Not now' },
      ],
    };

    vi.mocked(invoke).mockResolvedValue(undefined as never);
    await expect(svc.announce('Drink water', 'Time for a glass.', asked)).resolves.toBe(true);

    vi.mocked(invoke).mockRejectedValue(new Error('command alert_notify not found'));
    await expect(svc.announce('Drink water', 'Time for a glass.', asked)).resolves.toBe(false);
    // It still reached the desktop; it just cannot ask there.
    expect(plugin.sendNotification).toHaveBeenCalled();
  });

  it('reports a plain message as delivered wherever it was posted', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const plugin = await import('@tauri-apps/plugin-notification');

    vi.mocked(invoke).mockRejectedValue(new Error('command alert_notify not found'));
    vi.mocked(plugin.sendNotification).mockResolvedValue(undefined as never);

    // Nothing to answer, so the plugin's inability to draw buttons is irrelevant.
    await expect(svc.announce('Update available', 'A newer release exists.')).resolves.toBe(true);
  });

  it('separates the quote from the message on the surfaces that take one string', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const plugin = await import('@tauri-apps/plugin-notification');
    // A desktop whose shell has no tagged toast, so the plugin is what posts it.
    vi.mocked(invoke).mockRejectedValue(new Error('command alert_notify not found'));

    await svc.announce('Drink water — 500 ml', 'Time for 500 ml.', {
      quote: 'Refill the bottle and the habit refills itself.',
    });

    expect(plugin.sendNotification).toHaveBeenCalledWith({
      id: 7301,
      title: 'Drink water — 500 ml',
      body: 'Time for 500 ml.\n\nRefill the bottle and the habit refills itself.',
    });
  });

  it('falls back to the notification plugin when the shell has no tagged toast', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const plugin = await import('@tauri-apps/plugin-notification');
    // What a non-Windows desktop, or a shell older than the command, reports.
    vi.mocked(invoke).mockRejectedValue(new Error('command alert_notify not found'));

    await (svc as any).sendNotification('Task is over.', 'Great work! Time for a short break.', 2);

    // The plugin path has no tag to post under, so the id it does take is the
    // only handle there is, and the count is what keeps repeats distinguishable.
    expect(plugin.sendNotification).toHaveBeenCalledWith({
      id: 7301,
      title: 'Task is over.',
      body: 'Reminder 2 · Great work! Time for a short break.',
    });
  });

  it('stops repeating once the alert is answered, and stays quiet afterwards', async () => {
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();

    // A real repeat loop, on the fallback path (no Worker in jsdom).
    const originalWorker = globalThis.Worker;
    (globalThis as any).Worker = undefined;
    try {
      mockSettings.settings.set({ ...DEFAULT_SETTINGS, notificationRepeatInterval: 30 });
      await svc.fireTimerComplete('work');
      // The toast is raised on a 50ms timeout; the repeat interval must not be
      // run to exhaustion here, so step past it rather than draining all timers.
      vi.advanceTimersByTime(50);
      expect(svc.ringing()).toBe(true);

      vi.advanceTimersByTime(30_000);
      expect((svc as any).playSound).toHaveBeenCalledTimes(2);

      svc.dismiss();
      expect(svc.ringing()).toBe(false);

      vi.advanceTimersByTime(120_000);
      expect((svc as any).playSound).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });

  it('fireTimerComplete() sets a toast notification for work type', async () => {
    // Suppress actual notifications/audio
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();
    await svc.fireTimerComplete('work');
    vi.runAllTimers(); // flush the 50ms setTimeout inside showToast
    expect(svc.toast()).not.toBeNull();
    expect(svc.toast()?.type).toBe('work');
    expect(svc.toast()?.title).toBeTruthy();
  });

  it('fireTimerComplete() sets a toast notification for short-break type', async () => {
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();
    await svc.fireTimerComplete('short-break');
    vi.runAllTimers();
    expect(svc.toast()?.type).toBe('short-break');
  });

  it('uses the selected notification sound', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    const playChime = vi.spyOn(svc as any, 'playChime');
    const playDing = vi.spyOn(svc as any, 'playDing');
    (svc as any).audioContext = { close: vi.fn() };

    mockSettings.settings.set({ ...DEFAULT_SETTINGS, notificationSound: 'chime' });
    (svc as any).playSound();

    expect(playBell).not.toHaveBeenCalled();
    expect(playChime).toHaveBeenCalledWith((svc as any).audioContext);
    expect(playDing).not.toHaveBeenCalled();
  });

  it('previews the selected sound even while reminders are muted', () => {
    const playDing = vi.spyOn(svc as any, 'playDing');
    (svc as any).audioContext = { close: vi.fn() };
    TestBed.inject(AttentionService).muteFor(30);

    svc.previewSound('ding');

    expect(playDing).toHaveBeenCalledWith((svc as any).audioContext);
  });

  it('chime() rings the tone the user chose', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    (svc as any).audioContext = { close: vi.fn() };

    svc.chime();

    expect(playBell).toHaveBeenCalledWith((svc as any).audioContext);
  });

  it('does not announce a finished task while the app is paused', () => {
    TestBed.inject(AttentionService).pauseFor(60);

    svc.announceTaskCompleted('Write the report');
    vi.advanceTimersByTime(60);

    expect(svc.toast()).toBeNull();
  });

  it('chime() stays silent while the app is paused', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    (svc as any).audioContext = { close: vi.fn() };
    TestBed.inject(AttentionService).pauseFor(60);

    svc.chime();

    expect(playBell).not.toHaveBeenCalled();
  });

  it('chime() stays silent while the timed mute is on', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    (svc as any).audioContext = { close: vi.fn() };
    TestBed.inject(AttentionService).muteFor(30);

    svc.chime();

    expect(playBell).not.toHaveBeenCalled();
  });

  it('rings again once the timed mute is over', () => {
    // The point of the timed mute: it ends by itself, and nothing has to
    // remember to turn the sound back on.
    const playBell = vi.spyOn(svc as any, 'playBell');
    (svc as any).audioContext = { close: vi.fn() };
    const attention = TestBed.inject(AttentionService);
    attention.muteFor(30);

    vi.advanceTimersByTime(30 * 60_000 + 20_000);

    expect(attention.soundMuted()).toBe(false);
    svc.chime();
    expect(playBell).toHaveBeenCalled();
  });

  it('chime() stays silent when the chosen sound is none', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    (svc as any).audioContext = { close: vi.fn() };
    mockSettings.settings.set({ ...DEFAULT_SETTINGS, notificationSound: 'none' });

    svc.chime();

    expect(playBell).not.toHaveBeenCalled();
  });

  it('uses the configured reminder interval when starting repeats', () => {
    const onRepeatTick = vi.spyOn(svc as any, 'onRepeatTick');
    const originalWorker = globalThis.Worker;
    (globalThis as any).Worker = undefined;
    try {
      mockSettings.settings.set({ ...DEFAULT_SETTINGS, notificationRepeatInterval: 120 });
      (svc as any).startRepeatLoop('Done', 'Take a break', 'work');
      vi.advanceTimersByTime(119_999);
      expect(onRepeatTick).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onRepeatTick).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });
});
