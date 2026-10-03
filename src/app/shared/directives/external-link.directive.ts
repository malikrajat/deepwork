import { Directive, ElementRef, inject, input } from '@angular/core';
import { ExternalLinkService } from '../../core/services/external-link.service';

/**
 * Makes an anchor work in the desktop app.
 *
 * ```html
 * <a appExternalLink href="https://rajatmalik.dev/" target="_blank" rel="noopener">…</a>
 * ```
 *
 * The anchor stays a real anchor, so the browser build needs nothing from this
 * directive: `target="_blank"`, middle-click, "copy link address" and hover
 * preview all keep working exactly as the browser intends. Only the desktop
 * webview — where a new window is denied and the click would go nowhere — is
 * intercepted, and the URL is opened in the user's own browser instead.
 */
@Directive({
  selector: 'a[appExternalLink]',
  host: {
    '(click)': 'onClick($event)',
    '(auxclick)': 'onAuxClick($event)',
  },
})
export class ExternalLinkDirective {
  /**
   * Optional URL to open. Without it the anchor's own `href` is used, which is
   * the normal case — the directive is then invisible in the markup.
   */
  appExternalLink = input<string>('');

  private readonly links = inject(ExternalLinkService);
  private readonly host = inject<ElementRef<HTMLAnchorElement>>(ElementRef);

  async onClick(event: MouseEvent): Promise<void> {
    // A browser opens the link itself, and should: `target="_blank"`, the middle
    // click above, "copy link address" and the hover preview all already work.
    if (!this.links.isDesktopApp) return;

    // Ctrl/Cmd-click, shift-click and modified clicks belong to the browser:
    // the user asked for a new tab or window, not for the app to open a browser.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const url = this.urlOf();
    if (!url) return;

    // Cancelled here, synchronously, *before* the URL is handed to the app: a
    // default action is decided when the event finishes dispatching, so a
    // `preventDefault` after an `await` would arrive too late and the webview
    // would try to follow the link as well.
    event.preventDefault();
    await this.links.open(url);
  }

  /**
   * Middle-click: in a browser that opens a background tab. Inside the webview
   * nothing happens at all, so it is routed like a normal click.
   */
  async onAuxClick(event: MouseEvent): Promise<void> {
    if (event.button !== 1 || !this.links.isDesktopApp) return;
    const url = this.urlOf();
    if (!url) return;

    event.preventDefault();
    await this.links.open(url);
  }

  private urlOf(): string {
    return this.appExternalLink() || this.host.nativeElement.href;
  }
}
