import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { UpdatePromptComponent } from '../../src/app/shared/components/update-prompt/update-prompt.component';
import { UpdatePromptService } from '../../src/app/core/services/update-prompt.service';

/**
 * The card that offers the update. It is the actionable half of the flow — a
 * desktop notification can say a release exists, but only a button inside the
 * app can install it — so what it says and what it does per state is the point.
 */

/** The parts of the prompt service the card reads, all live signals. */
function fakePrompt(overrides: Record<string, unknown> = {}) {
  const setup = {
    name: 'DeepWork_2.1.0_x64-setup.exe',
    size: 2_072_863,
    downloadUrl: 'https://example.com/setup.exe',
  };

  return {
    visible: signal(true),
    version: signal<string | null>('v2.1.0'),
    state: signal<'idle' | 'downloading' | 'installing' | 'started' | 'error'>('idle'),
    busy: signal(false),
    percent: signal(0),
    error: signal<string | null>(null),
    note: signal<string | null>(null),
    isDesktopApp: true,
    installAsset: signal<{ name: string; size: number; downloadUrl: string } | null>(setup),
    downloadAsset: signal<{ name: string; size: number; downloadUrl: string } | null>(setup),
    releasesUrl: 'https://github.com/malikrajat/deepwork/releases',
    install: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn(),
    skip: vi.fn(),
    ...overrides,
  };
}

function mount(prompt: ReturnType<typeof fakePrompt>): ComponentFixture<UpdatePromptComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UpdatePromptComponent],
    providers: [{ provide: UpdatePromptService, useValue: prompt }],
  });
  const fixture = TestBed.createComponent(UpdatePromptComponent);
  fixture.detectChanges();
  return fixture;
}

/** `busy` follows `state` in the real service; keep the fake just as consistent. */
function withState(
  prompt: ReturnType<typeof fakePrompt>,
  state: 'idle' | 'downloading' | 'installing' | 'started' | 'error',
) {
  prompt.state.set(state);
  prompt.busy.set(state === 'downloading' || state === 'installing');
  return prompt;
}

describe('UpdatePromptComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => TestBed.resetTestingModule());

  it('renders nothing while there is no newer release', () => {
    const prompt = fakePrompt();
    prompt.visible.set(false);

    const fixture = mount(prompt);

    expect(fixture.nativeElement.querySelector('.update-prompt')).toBeNull();
  });

  it('names the version and offers to install it', () => {
    const prompt = fakePrompt();

    const fixture = mount(prompt);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.prompt-title')?.textContent).toContain('v2.1.0');
    expect(element.querySelector('.prompt-btn.primary')?.textContent?.trim()).toBe('Update');
  });

  it('starts the install when Update is pressed', () => {
    const prompt = fakePrompt();

    const fixture = mount(prompt);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-btn.primary')
      ?.click();

    expect(prompt.install).toHaveBeenCalledTimes(1);
  });

  it('offers a plain download when the app cannot install it itself', () => {
    const prompt = fakePrompt({ isDesktopApp: false });

    const fixture = mount(prompt);
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a.prompt-btn.primary',
    );

    expect(link?.getAttribute('href')).toBe('https://example.com/setup.exe');
    expect(link?.textContent?.trim()).toBe('Download');
  });

  it('offers the portable build as a download and says why it is not an update', () => {
    // A release with no setup in it: no Update button, and a Download that goes
    // to the portable archive rather than nowhere.
    const portable = {
      name: 'deepwork-windows-x64.zip',
      size: 9_341_896,
      downloadUrl: 'https://example.com/deepwork-windows-x64.zip',
    };
    const prompt = fakePrompt({
      installAsset: signal(null),
      downloadAsset: signal(portable),
    });

    const fixture = mount(prompt);
    const element = fixture.nativeElement as HTMLElement;
    const link = element.querySelector<HTMLAnchorElement>('a.prompt-btn.primary');

    expect(element.querySelector('.prompt-btn.primary')?.textContent?.trim()).toBe('Download');
    expect(link?.getAttribute('href')).toBe('https://example.com/deepwork-windows-x64.zip');
    expect(element.querySelector('.prompt-detail')?.textContent).toContain('no installer');
  });

  it('falls back to the release page when the release carries no file at all', () => {
    const prompt = fakePrompt({
      installAsset: signal(null),
      downloadAsset: signal(null),
    });

    const fixture = mount(prompt);
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a.prompt-btn.primary',
    );

    expect(link?.getAttribute('href')).toBe('https://github.com/malikrajat/deepwork/releases');
  });

  it('shows how far the download has got', () => {
    const prompt = withState(fakePrompt(), 'downloading');
    prompt.percent.set(42);

    const fixture = mount(prompt);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.prompt-detail')?.textContent).toContain('42%');
    expect(element.querySelector<HTMLElement>('.prompt-progress-fill')?.style.width).toBe('42%');
    expect(element.querySelector<HTMLButtonElement>('.prompt-btn.primary')?.disabled).toBe(true);
  });

  it('reports what the OS did with the installer', () => {
    const prompt = withState(fakePrompt(), 'started');
    prompt.note.set('The disk image is open. Drag DeepWork into Applications.');

    const fixture = mount(prompt);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.prompt-detail')?.textContent).toContain('Drag DeepWork');
    expect(element.querySelector('.prompt-btn.primary')).toBeNull();
    expect(element.querySelectorAll('.prompt-btn').length).toBe(1);
  });

  it('says so when the update could not be installed', () => {
    const prompt = withState(fakePrompt(), 'error');
    prompt.error.set('The download failed (it took too long).');

    const fixture = mount(prompt);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.prompt-error')?.textContent).toContain('it took too long');
    // And the way out when the automatic path is broken.
    expect(
      Array.from(element.querySelectorAll('a.prompt-btn')).some((link) =>
        link.textContent?.includes('Release page'),
      ),
    ).toBe(true);
  });

  it('lets the user ask to be reminded later', () => {
    const prompt = fakePrompt();

    const fixture = mount(prompt);
    const later = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.prompt-btn'),
    ).find((button) => button.textContent?.trim() === 'Remind me later');
    later?.click();

    expect(prompt.dismiss).toHaveBeenCalledTimes(1);
    expect(later?.getAttribute('title')).toContain('comes back');
  });

  it('lets the user skip this version for good', () => {
    const prompt = fakePrompt();

    const fixture = mount(prompt);
    const skip = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.prompt-btn'),
    ).find((button) => button.textContent?.trim() === 'Skip this version');
    skip?.click();

    // The two ways out are different answers — skipping must not be the same
    // call as waving the card away, or the version would come back tomorrow.
    expect(prompt.skip).toHaveBeenCalledTimes(1);
    expect(prompt.dismiss).not.toHaveBeenCalled();
    expect(skip?.getAttribute('title')).toContain('Never offer this version again');
  });

  it('closes the card from its corner without answering it', () => {
    const prompt = fakePrompt();

    const fixture = mount(prompt);
    const close = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.prompt-close',
    );
    close?.click();

    expect(close?.getAttribute('aria-label')).toBe('Close the update notice');
    expect(prompt.dismiss).toHaveBeenCalledTimes(1);
    expect(prompt.skip).not.toHaveBeenCalled();
  });

  it('keeps the close button on a card that has already started installing', () => {
    // The card outlives its buttons — once the installer is running only Hide is
    // left — but the corner stays, so the notice can always be put away.
    const prompt = withState(fakePrompt(), 'started');

    const fixture = mount(prompt);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.prompt-close')).not.toBeNull();
    expect(element.querySelectorAll('.prompt-btn').length).toBe(1);
  });
});
