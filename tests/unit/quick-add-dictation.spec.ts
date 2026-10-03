import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { QuickAddComponent } from '../../src/app/shared/components/quick-add/quick-add.component';
import { SpeechService } from '../../src/app/core/services/speech.service';
import { TaskService } from '../../src/app/core/services/task.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { UiService } from '../../src/app/core/services/ui.service';

/**
 * The floating "add a task for today" form and its dictation.
 *
 * The report: “floating button form has a start speaking button; as I stop it,
 * it resets the form and clears it all”. It did — because the preview read the
 * *session's* transcript, and the session forgets it the moment the microphone
 * stops, so “Stop listening” emptied “You said”, the title and the description
 * together. What was heard is the user's to save, so the dialog keeps its own
 * copy: stopping must leave it there, and only new speech replaces it.
 */

const makeSpeech = () => ({
  listening: signal(false),
  owner: signal<unknown>(null),
  transcript: signal(''),
  pauseAfterWords: signal<number | null>(null),
  error: signal<string | null>(null),
  supported: signal(true),
  remedy: signal<{ label: string; command: string } | null>(null),
  start: vi.fn(async (owner: unknown) => {
    speech.listening.set(true);
    speech.owner.set(owner);
  }),
  stop: vi.fn(() => {
    speech.listening.set(false);
    speech.owner.set(null);
  }),
  engineReason: () => null,
  noEngineMessage: () => 'No speech engine here.',
});

let speech: ReturnType<typeof makeSpeech>;

const makeUi = () => ({
  isMiniMode: signal(false),
  focusMode: signal(false),
});

describe('QuickAddComponent — dictation survives “Stop listening”', () => {
  let fixture: ComponentFixture<QuickAddComponent>;
  let component: QuickAddComponent;

  beforeEach(() => {
    speech = makeSpeech();
    TestBed.configureTestingModule({
      imports: [QuickAddComponent],
      providers: [
        { provide: SpeechService, useValue: speech },
        { provide: UiService, useValue: makeUi() },
        { provide: TaskService, useValue: { createTask: vi.fn(), addToToday: vi.fn() } },
        { provide: NotificationService, useValue: { showToastMessage: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(QuickAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  /** What the engine does while the user speaks: live text, this dialog owning it. */
  function speak(text: string): void {
    speech.transcript.set(text);
    fixture.detectChanges();
  }

  function box(selector: string): string {
    return fixture.nativeElement.querySelector(selector)?.textContent?.trim() ?? '';
  }

  it('keeps the words and the preview after the microphone is stopped', async () => {
    component.openDialog();
    fixture.detectChanges();

    await component.toggleListening();
    fixture.detectChanges();
    expect(component.listening()).toBe(true);

    speak('Buy milk break two litres');
    expect(component.title()).toBe('Buy milk');
    expect(component.description()).toBe('two litres');

    // “Stop listening”: the session ends and the engine drops its transcript.
    await component.toggleListening();
    speech.transcript.set('');
    fixture.detectChanges();

    expect(component.listening()).toBe(false);
    expect(component.title()).toBe('Buy milk');
    expect(component.description()).toBe('two litres');
    expect(component.transcript()).toBe('Buy milk break two litres');
    expect(box('.qa-heard')).toContain('Buy milk break two litres');
  });

  it('shows the heard words in the fields the user can edit and save', async () => {
    component.openDialog();
    await component.toggleListening();
    speak('Call the plumber');
    await component.toggleListening();
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    expect(title.value).toBe('Call the plumber');
    expect(component.addLabel()).toBe('Add to Today');
  });

  it('lets new speech replace the last dictation, and keeps the typing until then', async () => {
    component.openDialog();
    await component.toggleListening();
    speak('Buy milk');
    await component.toggleListening();

    // Typed by hand while the microphone is off: the preview is the user's.
    component.onTitleInput({ target: { value: 'Buy oat milk' } } as unknown as Event);
    expect(component.title()).toBe('Buy oat milk');

    // Pressing the microphone again is a deliberate fresh capture, so the new
    // dictation takes the preview over — but the old text is not cleared first.
    await component.toggleListening();
    fixture.detectChanges();
    expect(component.title()).toBe('Buy oat milk');

    speak('Pay the electricity bill');
    expect(component.title()).toBe('Pay the electricity bill');
  });

  it('starts empty when the dialog is opened again', async () => {
    component.openDialog();
    await component.toggleListening();
    speak('Buy milk');
    await component.toggleListening();
    fixture.detectChanges();

    component.close();
    component.openDialog();
    fixture.detectChanges();

    expect(component.title()).toBe('');
    expect(component.description()).toBe('');
    expect(component.transcript()).toBe('');
  });
});
