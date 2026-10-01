import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ToastComponent } from '../../src/app/shared/components/toast/toast.component';
import { NotificationService } from '../../src/app/core/services/notification.service';

const makeMockNotifications = () => ({
  toast: signal<any>(null),
  /** Unanswered alert in progress; the card wears the alert palette while it is. */
  ringing: signal(false),
  alertPulse: signal(0),
  dismiss: vi.fn(),
});

describe('ToastComponent', () => {
  let fixture: ComponentFixture<ToastComponent>;
  let mockNotifications: ReturnType<typeof makeMockNotifications>;

  beforeEach(() => {
    mockNotifications = makeMockNotifications();
    TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [{ provide: NotificationService, useValue: mockNotifications }],
    });
    fixture = TestBed.createComponent(ToastComponent);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders without errors', () => {
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('shows no toast container when notification signal is null', () => {
    expect(fixture.nativeElement.querySelector('.toast-container')).toBeNull();
  });

  it('renders toast container when notification is set', () => {
    mockNotifications.toast.set({
      id: 1, title: 'Focus Done!', body: 'Take a break.', type: 'work', visible: true,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast-container')).not.toBeNull();
  });

  it('displays correct title text in the toast', () => {
    mockNotifications.toast.set({
      id: 2, title: 'Break Over!', body: 'Ready to focus?', type: 'short-break', visible: true,
    });
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.toast-title');
    expect(title?.textContent?.trim()).toBe('Break Over!');
  });

  it('applies .work class for work type notification', () => {
    mockNotifications.toast.set({ id: 3, title: 'T', body: 'B', type: 'work', visible: true });
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.toast-container');
    expect(container?.classList.contains('work')).toBe(true);
  });

  it('applies .break class for short-break type notification', () => {
    mockNotifications.toast.set({ id: 4, title: 'T', body: 'B', type: 'short-break', visible: true });
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.toast-container');
    expect(container?.classList.contains('break')).toBe(true);
  });

  it('calls notifications.dismiss() when dismiss button is clicked', () => {
    mockNotifications.toast.set({ id: 5, title: 'T', body: 'B', type: 'work', visible: true });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.toast-dismiss');
    btn?.click();
    expect(mockNotifications.dismiss).toHaveBeenCalledTimes(1);
  });

  it('hides toast when signal is set back to null', () => {
    mockNotifications.toast.set({ id: 6, title: 'T', body: 'B', type: 'work', visible: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast-container')).not.toBeNull();
    mockNotifications.toast.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast-container')).toBeNull();
  });

  it('leaves a one-off message in the session colours', () => {
    // Task added, task completed, timer auto-resumed: the card is used for those
    // too, and they are news, not an alert waiting to be answered.
    mockNotifications.toast.set({ id: 7, title: 'Task added', body: 'B', type: 'work', visible: true });
    fixture.detectChanges();

    const container = fixture.nativeElement.querySelector('.toast-container');
    expect(container?.classList.contains('alerting')).toBe(false);
    expect(container?.style.getPropertyValue('--alert-accent')).toBe('');
  });

  it('puts a quote on its own line, apart from the message', () => {
    // The message is the news and the quote is the encouragement, so the quote
    // is an element of its own rather than the message's last sentence — the
    // same pair the water card draws (`WaterNudgeComponent`).
    mockNotifications.toast.set({
      id: 10,
      title: 'Drink water — 500 ml',
      body: 'Time for 500 ml. Today: 1.0 L of 2.0 L.',
      quote: 'Small sips, all day. That is the whole trick.',
      type: 'short-break',
      visible: true,
    });
    fixture.detectChanges();

    const body = fixture.nativeElement.querySelector('.toast-body');
    const quote = fixture.nativeElement.querySelector('.toast-quote');
    expect(body?.textContent?.trim()).toBe('Time for 500 ml. Today: 1.0 L of 2.0 L.');
    expect(quote?.textContent?.trim()).toBe('Small sips, all day. That is the whole trick.');
    // No second copy of the quote glued onto the message.
    expect(body?.textContent).not.toContain('Small sips');
  });

  it('draws no quote block when the message has no quote', () => {
    mockNotifications.toast.set({
      id: 11,
      title: 'Task added to Today',
      body: 'Write the release notes',
      quote: null,
      type: 'work',
      visible: true,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.toast-quote')).toBeNull();
  });

  it('wears the alert palette, and walks it, while an alert is unanswered', () => {
    // The full window's card and the mini widget are the same alert seen from two
    // places, so they show the same colour for the same repeat — the count comes
    // from the service's pulse, which is also what the tone repeats on.
    mockNotifications.ringing.set(true);
    mockNotifications.alertPulse.set(1);
    mockNotifications.toast.set({ id: 8, title: 'Focus Done!', body: 'B', type: 'work', visible: true });
    fixture.detectChanges();

    const container = fixture.nativeElement.querySelector('.toast-container');
    expect(container?.classList.contains('alerting')).toBe(true);
    expect(container?.style.getPropertyValue('--alert-accent')).toBe('#7dd3fc');
    expect(container?.style.getPropertyValue('--alert-surface')).toBe('#0d1b2a');

    // One more tone, one entry along the palette.
    mockNotifications.alertPulse.set(2);
    mockNotifications.toast.set({ id: 9, title: 'Focus Done!', body: 'B', type: 'work', visible: true });
    fixture.detectChanges();
    expect(container?.style.getPropertyValue('--alert-accent')).toBe('#5eead4');
  });
});
