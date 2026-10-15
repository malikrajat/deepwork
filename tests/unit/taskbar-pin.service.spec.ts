import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

/**
 * The service reads `__TAURI_INTERNALS__` at import time, so the desktop flag has
 * to be in place before the module is evaluated — hence `vi.hoisted` and a
 * dynamic import inside `load()`, rather than a top-level `import`. Loading it
 * without the flag is exercised by the last block in this file, under a distinct
 * module registry.
 */
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
// The browser-mode fallback in `DbService.init` imports the SQL plugin; mocking
// it keeps this spec from dragging a Tauri plugin into jsdom.
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn(), execute: vi.fn() }) },
}));

type ServiceModule = typeof import('../../src/app/core/services/taskbar-pin.service');

const makeMocks = (options: { prompted?: boolean; pinPrompted?: boolean } = {}) => {
  const settings = { taskbarPinPrompted: options.pinPrompted ?? false };
  return {
    settings: {
      settings: signal({ taskbarPinPrompted: settings.taskbarPinPrompted }),
      saveSettings: vi.fn().mockImplementation(async (next: { taskbarPinPrompted: boolean }) => {
        settings.taskbarPinPrompted = next.taskbarPinPrompted;
      }),
    },
    prefs: { prompted: signal(options.prompted ?? true) },
    db: { init: vi.fn().mockResolvedValue(undefined) },
  };
};

/**
 * The one-time offer to pin DeepWork where the user can reach it in one click.
 *
 * The behaviour that matters is what the card *does not* do: it is not shown in
 * the browser, not shown for an app the desktop says is already pinned, not shown
 * twice, and not shown before the first-run dialog has had its say. Everything
 * else here is the three faces of one card — ask, instruct, confirm.
 */
describe('TaskbarPinService', () => {
  let load: () => Promise<ServiceModule>;

  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
    load = () => import('../../src/app/core/services/taskbar-pin.service');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'];
  });

  const setup = async (options: Parameters<typeof makeMocks>[0] = {}) => {
    const mocks = makeMocks(options);
    const { TaskbarPinService } = await load();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: (await import('../../src/app/core/services/settings.service')).SettingsService,
          useValue: mocks.settings,
        },
        {
          provide: (await import('../../src/app/core/services/desktop-prefs.service'))
            .DesktopPrefsService,
          useValue: mocks.prefs,
        },
        {
          provide: (await import('../../src/app/core/services/db.service')).DbService,
          useValue: mocks.db,
        },
      ],
    });
    const pin = TestBed.runInInjectionContext(() => new TaskbarPinService());
    return { pin, mocks };
  };

  const status = (overrides: Record<string, unknown> = {}) => ({
    target: 'taskbar',
    canAutoPin: true,
    pinned: false,
    ...overrides,
  });

  // ── The question is asked at the right moment, or not at all ──────────────

  it('does not offer anything before the desktop has answered', async () => {
    const { pin } = await setup();
    expect(pin.visible()).toBe(false);
  });

  it('waits for the first-run dialog rather than racing it', async () => {
    invokeMock.mockResolvedValue(status());
    const { pin } = await setup({ prompted: false });

    await pin.init();

    expect(pin.visible()).toBe(false);
  });

  it('asks once the first-run dialog is out of the way', async () => {
    invokeMock.mockResolvedValue(status());
    const { pin } = await setup({ prompted: true });

    await pin.init();

    expect(pin.visible()).toBe(true);
  });

  it('never asks about an app the desktop says is already pinned', async () => {
    invokeMock.mockResolvedValue(status({ pinned: true }));
    const { pin } = await setup();

    await pin.init();

    expect(pin.visible()).toBe(false);
  });

  it('records an already-pinned app, so unpinning later does not re-ask', async () => {
    invokeMock.mockResolvedValue(status({ pinned: true }));
    const { pin, mocks } = await setup();

    await pin.init();
    // `adopt` writes the preference through the database, which is a promise.
    await vi.waitFor(() => expect(mocks.settings.saveSettings).toHaveBeenCalled());
    expect(mocks.settings.saveSettings.mock.calls[0][0].taskbarPinPrompted).toBe(true);
  });

  it('never asks again once the user has answered', async () => {
    invokeMock.mockResolvedValue(status());
    const { pin } = await setup();
    await pin.init();
    expect(pin.visible()).toBe(true);

    await pin.dismiss();

    expect(pin.visible()).toBe(false);
    expect(pin.dismissLabel).toBe('Not now');
  });

  it('shows nothing when the desktop cannot be asked at all', async () => {
    invokeMock.mockRejectedValue('the shell is not talking');
    const { pin } = await setup();

    await pin.init();

    // `ready` still settles, so the card is not left waiting on an answer that
    // will never arrive.
    expect(pin.ready()).toBe(true);
    expect(pin.visible()).toBe(false);
  });

  // ── Yes ───────────────────────────────────────────────────────────────────

  it('confirms, briefly, when the desktop did the pinning itself', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    invokeMock.mockResolvedValueOnce({ pinned: true, automatic: true, message: null });
    await pin.pin();

    expect(pin.settled()).toBe(true);
    expect(pin.help()).toBeNull();
    // The confirmation is the card, and only the card: it has no buttons.
    expect(pin.visible()).toBe(true);
  });

  it('turns into the instruction when the desktop refused outright', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    invokeMock.mockResolvedValueOnce({
      pinned: false,
      automatic: false,
      message: 'Right-click the DeepWork icon and choose Pin to taskbar.',
    });
    await pin.pin();

    expect(pin.settled()).toBe(false);
    expect(pin.help()).toBe('Right-click the DeepWork icon and choose Pin to taskbar.');
    // Still up: an instruction that vanishes while it is being read is not one.
    expect(pin.visible()).toBe(true);
  });

  // ── The request is answered by the desktop, later ─────────────────────────
  //
  // This is the shape a bug got wrong, and it is the heart of this spec: the
  // command that asks must *return* while the shell's own prompt is up, and the
  // verdict must arrive through polling. The version that waited inside the call
  // blocked the window's message loop, which left the card's own buttons dead and
  // the whole app ignoring clicks.

  it('reports that the desktop is asking, instead of waiting for it inside the call', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    // The request goes out and comes straight back: prompt up, no verdict.
    invokeMock.mockResolvedValueOnce({ pinned: false, automatic: false, message: null });
    // And the poll has nothing to report yet.
    invokeMock.mockResolvedValue(null);

    const asking = pin.pin();

    await vi.waitFor(() => expect(pin.awaitingAnswer()).toBe(true));
    // Not waiting inside the call is the point: `busy` is already off, so there is
    // no greyed-out button and nothing frozen.
    expect(pin.busy()).toBe(false);
    expect(pin.help()).toBeNull();

    // ...and it does not hang: dismissing retires the poll.
    await pin.dismiss();
    await asking;
  });

  it('confirms once the desktop finally says yes', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    invokeMock.mockResolvedValueOnce({ pinned: false, automatic: false, message: null });
    invokeMock.mockResolvedValueOnce({ pinned: true, automatic: true, message: null });

    await pin.pin();

    expect(pin.settled()).toBe(true);
    expect(pin.awaitingAnswer()).toBe(false);
    expect(pin.help()).toBeNull();
  });

  it('turns into the instruction when the desktop prompt is declined', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    invokeMock.mockResolvedValueOnce({ pinned: false, automatic: false, message: null });
    invokeMock.mockResolvedValueOnce({
      pinned: false,
      automatic: false,
      message: 'The taskbar did not pin DeepWork: the prompt was declined.',
    });

    await pin.pin();

    expect(pin.awaitingAnswer()).toBe(false);
    expect(pin.help()).toContain('declined');
    expect(pin.visible()).toBe(true);
  });

  it('stops polling on dismissal, so a late answer cannot reopen the card', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    invokeMock.mockResolvedValueOnce({ pinned: false, automatic: false, message: null });
    invokeMock.mockResolvedValue(null);

    const asking = pin.pin();
    await vi.waitFor(() => expect(pin.awaitingAnswer()).toBe(true));

    await pin.dismiss();
    expect(pin.awaitingAnswer()).toBe(false);
    expect(pin.visible()).toBe(false);

    // A poll that somehow still resolves must not put the card back on screen for
    // a question the user has already answered.
    invokeMock.mockResolvedValue({ pinned: true, automatic: true, message: null });
    await asking;

    expect(pin.settled()).toBe(false);
    expect(pin.visible()).toBe(false);
  });

  it('offers the manual route if the shell never answers at all', async () => {
    vi.useFakeTimers();
    try {
      invokeMock.mockResolvedValueOnce(status());
      const { pin } = await setup();
      await pin.init();

      invokeMock.mockResolvedValueOnce({ pinned: false, automatic: false, message: null });
      invokeMock.mockResolvedValue(null);

      const asking = pin.pin();
      // Past the poll budget without waiting 100 real seconds for it.
      await vi.advanceTimersByTimeAsync(300 * 401);
      await asking;

      expect(pin.awaitingAnswer()).toBe(false);
      expect(pin.help()).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('describes a thrown failure rather than losing it', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    invokeMock.mockRejectedValueOnce('the taskbar did not answer in time');
    await pin.pin();

    expect(pin.help()).toBe('the taskbar did not answer in time');
    expect(pin.busy()).toBe(false);
  });

  it('will not start a second request while one is in flight', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    let release: (value: unknown) => void = () => undefined;
    invokeMock.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));

    const first = pin.pin();
    const second = pin.pin();
    release({ pinned: true, automatic: true, message: null });
    await Promise.all([first, second]);

    // One request, not two: the second call returned on the busy flag.
    expect(invokeMock).toHaveBeenCalledTimes(2); // the status call, and one pin
  });

  // ── The deliberate route back ─────────────────────────────────────────────

  it('lets the offer be made again after a "Not now"', async () => {
    invokeMock.mockResolvedValue(status());
    const { pin, mocks } = await setup();
    await pin.init();
    await pin.dismiss();
    expect(pin.visible()).toBe(false);

    await pin.reoffer();

    expect(mocks.settings.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ taskbarPinPrompted: false }),
    );
    expect(pin.visible()).toBe(true);
  });

  // ── The desktop's own words ───────────────────────────────────────────────

  it('says where to look while the desktop has its own prompt up', async () => {
    invokeMock.mockResolvedValueOnce(status());
    const { pin } = await setup();
    await pin.init();

    invokeMock.mockResolvedValueOnce({ pinned: false, automatic: false, message: null });
    invokeMock.mockResolvedValue(null);

    const asking = pin.pin();
    await vi.waitFor(() => expect(pin.awaitingAnswer()).toBe(true));

    // The title and body change face: the app has stopped asking, and the desktop
    // is asking now — which the user has to be told, or the button looks broken.
    expect(pin.title()).not.toBe('Keep DeepWork one click away');
    expect(pin.body()).toContain('asking');

    await pin.dismiss();
    await asking;
  });

  it('uses the name this desktop gives the place an app is pinned', async () => {
    invokeMock.mockResolvedValue(status({ target: 'dock', canAutoPin: false }));
    const { pin } = await setup();

    await pin.init();

    expect(pin.eyebrow()).toBe('Dock');
    expect(pin.confirmLabel()).toBe('Keep in Dock');
    expect(pin.body()).toContain('Dock');
  });

  it('offers Linux the panel rather than a taskbar', async () => {
    invokeMock.mockResolvedValue(status({ target: 'panel', canAutoPin: false }));
    const { pin } = await setup();

    await pin.init();

    expect(pin.eyebrow()).toBe('Panel');
    expect(pin.confirmLabel()).toBe('Pin to panel');
  });
});

describe('TaskbarPinService (browser build)', () => {
  it('offers nothing and settles at once', async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'];
    const { TaskbarPinService } = await import('../../src/app/core/services/taskbar-pin.service');
    const pin = TestBed.runInInjectionContext(() => new TaskbarPinService());

    await pin.init();

    expect(pin.ready()).toBe(true);
    expect(pin.visible()).toBe(false);
  });
});
