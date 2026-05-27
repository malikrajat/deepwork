import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ToastComponent } from '../../src/app/shared/components/toast/toast.component';
import { NotificationService } from '../../src/app/core/services/notification.service';

const makeMockNotifications = () => ({
  toast: signal<any>(null),
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
});
