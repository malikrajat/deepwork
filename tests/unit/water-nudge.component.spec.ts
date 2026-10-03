import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { WaterNudgeComponent } from '../../src/app/shared/components/water-nudge/water-nudge.component';
import { WaterReminderService } from '../../src/app/core/services/water-reminder.service';
import { UiService } from '../../src/app/core/services/ui.service';
import { WaterNudge } from '../../src/app/core/models/water.model';

/**
 * The card the user answers. Two things have to hold: it says what the reminder
 * asked (the glass, the day, the quote) and the only ways past it are its own
 * two buttons — so every test here either reads the card or presses one of them.
 */

function makeNudge(overrides: Partial<WaterNudge> = {}): WaterNudge {
  return {
    id: 1,
    amountMl: 500,
    glassLabel: '500 ml',
    title: 'Drink water — 500 ml',
    body: 'Time for 500 ml. Today: 1.5 L of 2 L.',
    quote: 'Small sips, all day. That is the whole trick.',
    ...overrides,
  };
}

describe('WaterNudgeComponent', () => {
  let fixture: ComponentFixture<WaterNudgeComponent>;
  let nudge: WritableSignal<WaterNudge | null>;
  let miniMode: WritableSignal<boolean>;
  const answerNudge = vi.fn(async () => undefined);
  const ui = {
    surfaceForNudge: vi.fn(async () => undefined),
    releaseNudgeSurface: vi.fn(async () => undefined),
  };

  function mount(): ComponentFixture<WaterNudgeComponent> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [WaterNudgeComponent],
      providers: [
        { provide: WaterReminderService, useValue: { nudge, answerNudge } },
        { provide: UiService, useValue: { ...ui, isMiniMode: miniMode } },
      ],
    });
    const created = TestBed.createComponent(WaterNudgeComponent);
    created.detectChanges();
    return created;
  }

  /** Puts a nudge on screen (or takes it away) and lets the component catch up. */
  async function show(next: WaterNudge | null): Promise<void> {
    nudge.set(next);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const card = (): HTMLElement | null => element().querySelector<HTMLElement>('.nudge-card');

  beforeEach(() => {
    nudge = signal<WaterNudge | null>(null);
    miniMode = signal(false);
    answerNudge.mockClear();
    ui.surfaceForNudge.mockClear();
    ui.releaseNudgeSurface.mockClear();
    fixture = mount();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows nothing at all until a reminder is asked', () => {
    expect(card()).toBeNull();
    expect(element().textContent).not.toContain('Drink water');
  });

  it('reads out the glass, the day so far and a quote', async () => {
    await show(makeNudge());

    const text = card()?.textContent ?? '';
    expect(text).toContain('Drink water — 500 ml');
    expect(text).toContain('Today: 1.5 L of 2 L');
    expect(text).toContain('Small sips, all day');
  });

  it('offers exactly two answers, and no way to dismiss it by waiting', async () => {
    await show(makeNudge());

    const buttons = Array.from(element().querySelectorAll<HTMLButtonElement>('.nudge-btn'));
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Yes, I drank 500 ml',
      'Not now',
    ]);
  });

  it('logs the glass when Yes is pressed', async () => {
    await show(makeNudge());

    element().querySelector<HTMLButtonElement>('.nudge-btn.primary')?.click();

    expect(answerNudge).toHaveBeenCalledTimes(1);
    expect(answerNudge).toHaveBeenCalledWith('yes');
  });

  it('closes without logging when Not now is pressed', async () => {
    await show(makeNudge());

    const notNow = Array.from(element().querySelectorAll<HTMLButtonElement>('.nudge-btn')).find(
      (button) => button.textContent?.includes('Not now'),
    );
    notNow?.click();

    expect(answerNudge).toHaveBeenCalledTimes(1);
    expect(answerNudge).toHaveBeenCalledWith('no');
  });

  it('disappears once the reminder behind it has been answered', async () => {
    await show(makeNudge());
    expect(card()).not.toBeNull();

    await show(null);

    expect(card()).toBeNull();
  });

  it('asks the window to come forward while the card is up, and back after', async () => {
    await show(makeNudge());
    expect(ui.surfaceForNudge).toHaveBeenCalledTimes(1);
    expect(ui.releaseNudgeSurface).not.toHaveBeenCalled();

    await show(null);
    expect(ui.releaseNudgeSurface).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way while the window is the mini widget', async () => {
    miniMode.set(true);
    fixture.detectChanges();

    await show(makeNudge());

    expect(card()).toBeNull();
    // It still asks the window to expand — the question is on its way, it just
    // has no room to be asked inside a 136x76 widget.
    expect(ui.surfaceForNudge).toHaveBeenCalledTimes(1);
  });
});
