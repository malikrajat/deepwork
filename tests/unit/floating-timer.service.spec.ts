import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FloatingTimerService } from '../../src/app/core/services/floating-timer.service';
import { TimerService } from '../../src/app/core/services/timer.service';
import { LogService } from '../../src/app/core/services/log.service';

/**
 * The browser's half of "always on top".
 *
 * The API it uses — Document Picture-in-Picture — exists in Chromium desktops
 * and nowhere else, so the two things worth pinning down are that the service
 * never pretends otherwise, and that closing is safe whether or not a window was
 * ever opened. The drawing itself is a hand-written document, not an Angular
 * template; it is checked by opening it in a real browser, which is what the
 * e2e suite does.
 */
function make() {
  const timer = {
    displayTime: signal('25:00'),
    progress: signal(0),
    isRunning: signal(false),
    timerType: signal<'work' | 'short-break' | 'long-break'>('work'),
    start: vi.fn(),
    pause: vi.fn(),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TimerService, useValue: timer },
      { provide: LogService, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
    ],
  });
  return { floating: TestBed.runInInjectionContext(() => new FloatingTimerService()), timer };
}

describe('FloatingTimerService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('reports that a browser without the API cannot float anything', async () => {
    const { floating } = make();

    expect(floating.supported).toBe(false);
    await floating.open();

    expect(floating.isOpen()).toBe(false);
  });

  it('says what the button does in each state', async () => {
    const { floating } = make();

    expect(floating.label()).toBe('Float timer on top');
    // There is no window to open here, so the label stays on the invitation.
    await floating.toggle();
    expect(floating.label()).toBe('Float timer on top');
  });

  it('closes safely when nothing was ever open', () => {
    const { floating } = make();

    floating.close();

    expect(floating.isOpen()).toBe(false);
  });

  it('reports support when the browser exposes the API', () => {
    vi.stubGlobal('documentPictureInPicture', { requestWindow: vi.fn() });
    const { floating } = make();

    expect(floating.supported).toBe(true);
  });
});
