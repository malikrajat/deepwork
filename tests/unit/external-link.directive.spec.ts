import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ExternalLinkDirective } from '../../src/app/shared/directives/external-link.directive';
import { ExternalLinkService } from '../../src/app/core/services/external-link.service';

/**
 * Outward links have two very different lives.
 *
 * In a browser the anchor is left alone: `target="_blank"`, middle-click and
 * "copy link address" all work, and the directive must not get in the way. In
 * the desktop webview a new window is denied, so the click has to be handed to
 * the app — otherwise "visit my website" is a button that does nothing.
 */

@Component({
  standalone: true,
  imports: [ExternalLinkDirective],
  template: `
    <a appExternalLink href="https://rajatmalik.dev/" target="_blank" rel="noopener">Website</a>
    <a appExternalLink="mailto:mr.rajatmalik@gmail.com" href="mailto:mr.rajatmalik@gmail.com"
      >Email</a
    >
    <a appExternalLink href="#in-page">In-page link</a>
  `,
})
class TestHostComponent {}

describe('ExternalLinkDirective', () => {
  let open: ReturnType<typeof vi.fn>;
  let isDesktopApp = false;
  let fixture: ComponentFixture<TestHostComponent>;

  function anchors(): HTMLAnchorElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'));
  }

  function click(anchor: HTMLAnchorElement, init: MouseEventInit = {}): MouseEvent {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    anchor.dispatchEvent(event);
    return event;
  }

  /**
   * Stops jsdom from acting on a click it is not supposed to act on.
   *
   * jsdom refuses to navigate — it prints "Not implemented: navigation" — and
   * the anchor's own default action is exactly what these tests are leaving
   * alone. Swallowing it on the document, in the bubble phase, runs *after* the
   * directive has decided, so what is being tested is unchanged.
   */
  function swallowNavigation(): () => void {
    const swallow = (event: Event) => event.preventDefault();
    document.addEventListener('click', swallow);
    return () => document.removeEventListener('click', swallow);
  }

  beforeEach(() => {
    isDesktopApp = false;
    // The service only claims to have handled the click where it can: the
    // desktop build hands the URL to the OS, a browser leaves the anchor alone.
    open = vi.fn(async () => isDesktopApp);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        {
          provide: ExternalLinkService,
          useValue: {
            get isDesktopApp() {
              return isDesktopApp;
            },
            open,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves an ordinary click to the browser', async () => {
    // An in-page link, because that is one default action jsdom itself can
    // follow: the point is that the directive consumes nothing here, and a
    // browser is left to do what it would have done anyway.
    const [, , inPage] = anchors();

    const event = click(inPage);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('hands the link to the app in the desktop build', async () => {
    isDesktopApp = true;
    const [website] = anchors();

    const event = click(website);
    await vi.waitFor(() => expect(open).toHaveBeenCalled());

    expect(open).toHaveBeenCalledWith('https://rajatmalik.dev/');
    expect(event.defaultPrevented).toBe(true);
  });

  it('uses the value given to it when there is one', async () => {
    isDesktopApp = true;
    const [, email] = anchors();

    click(email);
    await vi.waitFor(() => expect(open).toHaveBeenCalled());

    expect(open).toHaveBeenCalledWith('mailto:mr.rajatmalik@gmail.com');
  });

  it('promises new-tab clicks to the browser', async () => {
    isDesktopApp = true;
    const [website] = anchors();
    const stopSwallowing = swallowNavigation();

    click(website, { ctrlKey: true });
    click(website, { metaKey: true });
    click(website, { shiftKey: true });
    await Promise.resolve();
    stopSwallowing();

    expect(open).not.toHaveBeenCalled();
  });

  it('treats a middle click as a click, because the webview does nothing with it', async () => {
    isDesktopApp = true;
    const [website] = anchors();

    const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    website.dispatchEvent(event);
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('https://rajatmalik.dev/'));

    expect(event.defaultPrevented).toBe(true);
  });

  it('does not fight a click something else has already handled', async () => {
    isDesktopApp = true;
    const [website] = anchors();
    // A handler earlier in the chain (an ancestor in the capture phase, say)
    // has already dealt with this click.
    const earlier = (event: Event) => event.preventDefault();
    document.addEventListener('click', earlier, { capture: true });

    click(website);
    await Promise.resolve();
    document.removeEventListener('click', earlier, { capture: true });

    expect(open).not.toHaveBeenCalled();
  });
});
