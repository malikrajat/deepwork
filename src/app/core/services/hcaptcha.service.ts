import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * The hCaptcha script, in explicit-render mode.
 *
 * `render=explicit` is what lets Angular decide *when* and *where* the widget
 * appears; `recaptchacompat=off` stops the script from also writing its token
 * into a `g-recaptcha-response` field, because this app sends the token itself.
 */
const SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off';

/** The subset of hCaptcha's browser API this app uses. */
interface HCaptchaApi {
  render(container: HTMLElement, options: HCaptchaRenderOptions): string | number;
  reset(widgetId?: string | number): void;
}

interface HCaptchaRenderOptions {
  sitekey: string;
  theme: 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

/** The script's global, if it has loaded. */
function captchaApi(): HCaptchaApi | undefined {
  return (globalThis as unknown as { hcaptcha?: HCaptchaApi }).hcaptcha;
}

/**
 * The theme in force, so the widget is not a white box on the app's dark
 * surface. The app marks the effective theme on the document root as a class;
 * anything else is treated as dark, which is the app's default.
 */
function themeForDocument(): 'light' | 'dark' {
  const root = globalThis.document?.documentElement;
  return root?.classList.contains('theme-light') ? 'light' : 'dark';
}

/**
 * Draws the captcha and keeps the token it produces.
 *
 * The widget solves a proof-of-humanity and hands back a one-use token. That
 * token is what Web3Forms verifies on its own side, so it is held here — not in
 * the form model, which is reset as soon as the message is sent — and cleared
 * the moment the widget expires, errors or is reset after a submission.
 *
 * The script is loaded once per page. A failure (an ad blocker, a blocked
 * request, a network that is down) is reported in `error` so the page can say
 * so instead of silently disabling its own send button.
 */
@Injectable({ providedIn: 'root' })
export class HCaptchaService {
  /** The token the widget last produced, or null when it is unsolved or expired. */
  readonly token = signal<string | null>(null);

  /** True when a token is in hand and a submission may carry it. */
  readonly solved = computed(() => this.token() !== null);

  /** Why the widget could not be drawn, in a sentence for the page, or null. */
  readonly error = signal<string | null>(null);

  private widgetId: string | number | null = null;
  private loading: Promise<HCaptchaApi> | null = null;

  /** Draw the widget inside `container`, replacing any widget drawn before. */
  async render(container: HTMLElement): Promise<void> {
    this.error.set(null);

    try {
      const api = await this.load();
      this.widgetId = api.render(container, {
        sitekey: environment.contact.hcaptchaSiteKey,
        theme: themeForDocument(),
        callback: (token) => this.token.set(token),
        'expired-callback': () => this.token.set(null),
        'error-callback': () => {
          this.token.set(null);
          this.error.set('The captcha could not be completed. Please try again.');
        },
      });
    } catch (cause) {
      this.token.set(null);
      this.error.set(cause instanceof Error ? cause.message : 'The captcha could not be loaded.');
      // A script that failed to load gets one more chance the next time the
      // page asks for a widget.
      this.loading = null;
    }
  }

  /** Clear the token and reset the widget so the next message needs a new one. */
  reset(): void {
    this.token.set(null);
    const api = captchaApi();
    if (!api || this.widgetId === null) return;

    try {
      api.reset(this.widgetId);
    } catch {
      // The container is gone (the form was replaced); there is nothing to reset.
    }
  }

  /** Load the script exactly once, and share the in-flight request. */
  private load(): Promise<HCaptchaApi> {
    const existing = captchaApi();
    if (existing) return Promise.resolve(existing);
    if (this.loading) return this.loading;

    this.loading = new Promise<HCaptchaApi>((resolve, reject) => {
      const document_ = globalThis.document;
      if (!document_) {
        reject(new Error('There is no page to draw the captcha in.'));
        return;
      }

      const script = document_.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => {
        const api = captchaApi();
        if (api) resolve(api);
        else reject(new Error('The captcha did not start. Please reload the page.'));
      });
      script.addEventListener('error', () =>
        reject(
          new Error(
            'The captcha could not be loaded — an ad blocker or a blocked request is the usual reason.',
          ),
        ),
      );
      document_.head.appendChild(script);
    });

    return this.loading;
  }
}
