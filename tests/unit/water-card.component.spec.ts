import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { WaterCardComponent } from '../../src/app/shared/components/water-card/water-card.component';
import { WaterService } from '../../src/app/core/services/water.service';
import { WaterReminderService } from '../../src/app/core/services/water-reminder.service';

/**
 * The dashboard card: it must say what has been drunk today, and one press must
 * log a glass — the two things a user will actually do with it.
 */

describe('WaterCardComponent', () => {
  let fixture: ComponentFixture<WaterCardComponent>;
  let totalMl: WritableSignal<number>;
  let goalMl: WritableSignal<number>;
  let drinkCount: WritableSignal<number>;
  let percent: WritableSignal<number>;
  let lastAt: WritableSignal<string | null>;
  let goalReached: WritableSignal<boolean>;
  const water = {
    load: vi.fn(async () => undefined),
    log: vi.fn(async () => undefined),
    undoLast: vi.fn(async () => undefined),
  };
  const reminder = { status: signal('Water reminders are off') };

  function mount(): ComponentFixture<WaterCardComponent> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [WaterCardComponent],
      providers: [
        provideRouter([]),
        {
          provide: WaterService,
          useValue: {
            ...water,
            totalMl,
            goalMl,
            glassMl: signal(500),
            drinkCount,
            percent,
            lastAt,
            goalReached,
          },
        },
        { provide: WaterReminderService, useValue: reminder },
      ],
    });
    const created = TestBed.createComponent(WaterCardComponent);
    created.detectChanges();
    return created;
  }

  beforeEach(() => {
    totalMl = signal(1500);
    goalMl = signal(2000);
    drinkCount = signal(3);
    percent = signal(75);
    lastAt = signal(new Date(2026, 8, 26, 14, 5).toISOString());
    goalReached = signal(false);
    water.load.mockClear();
    water.log.mockClear();
    water.undoLast.mockClear();
    fixture = mount();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('reads out what has been drunk against the target', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('1.5 L of 2 L today');
    expect(text).toContain('75%');
    expect(text).toContain('3');
  });

  it('shows the progress bar at the same percentage', () => {
    const bar = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.water-track');

    expect(bar?.getAttribute('aria-valuenow')).toBe('75');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.water-fill')?.style.width,
    ).toBe('75%');
  });

  it('logs a glass at the size the user chose', () => {
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.water-btn.primary',
    );

    expect(button?.textContent).toContain('500 ml');
    button?.click();
    expect(water.log).toHaveBeenCalledTimes(1);
  });

  it('offers to undo the last one', () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.water-btn'),
    );
    const undo = buttons.find((button) => button.textContent?.includes('Undo'));

    expect(undo?.disabled).toBe(false);
    undo?.click();
    expect(water.undoLast).toHaveBeenCalledTimes(1);
  });

  it('has nothing to undo on a day with no drinks', () => {
    drinkCount.set(0);
    fixture.detectChanges();

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.water-btn'),
    );
    const undo = buttons.find((button) => button.textContent?.includes('Undo'));

    expect(undo?.disabled).toBe(true);
  });

  it('says when the last drink was, and when there has been none', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('14:05');

    lastAt.set(null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('—');
  });

  it('shows what the reminder is doing', () => {
    reminder.status.set('Next reminder at 15:00');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Next reminder at 15:00');
  });

  it('reads today from storage once, when it appears', () => {
    expect(water.load).toHaveBeenCalledTimes(1);
  });

  it('links to the reminder settings', () => {
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a.water-link',
    );

    expect(link?.getAttribute('href')).toBe('/settings');
  });
});
