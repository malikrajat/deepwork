import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/** A request that never answers must not leave the button spinning forever. */
const REQUEST_TIMEOUT_MS = 15_000;

/** What the contact form collects. Email and mobile are optional. */
export interface ContactMessage {
  name: string;
  email: string;
  mobile: string;
  message: string;
  /** The hCaptcha token the widget produced for this submission. */
  captchaToken: string;
}

/**
 * The parts of Web3Forms' reply this app reads.
 *
 * A failure carries its explanation either at the top level or under `body`;
 * both shapes are documented, so both are accepted.
 */
interface Web3FormsReply {
  success?: boolean;
  message?: string;
  body?: { message?: string };
}

/**
 * Sends a contact-form message to the owner's inbox through Web3Forms.
 *
 * The app has no backend of its own, so Web3Forms is the one place the contact
 * form talks to. Nothing here is awaited at startup and nothing throws during
 * rendering: a send is a deliberate press, and a failure is a sentence the page
 * shows beside the button.
 */
@Injectable({ providedIn: 'root' })
export class ContactService {
  async send(message: ContactMessage): Promise<void> {
    const name = message.name.trim();
    const email = message.email.trim();
    const mobile = message.mobile.trim();

    const payload = {
      access_key: environment.contact.accessKey,
      subject: `${environment.contact.subject} — ${name}`,
      from_name: 'DeepWork contact form',
      name,
      message: message.message.trim(),
      'h-captcha-response': message.captchaToken,
      // Web3Forms' honeypot: a real person never fills it in. The captcha is the
      // protection that matters; this costs nothing.
      botcheck: false,
      ...(email ? { email } : {}),
      ...(mobile ? { mobile } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(environment.contact.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const reply = await readReply(response);
      if (!response.ok || reply.success === false) {
        throw new Error(reply.message || `The message service answered ${response.status}.`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('The message service did not answer in time. Please try again.', {
          cause: error,
        });
      }
      // A blocked request surfaces as a TypeError ("Failed to fetch").
      if (error instanceof TypeError) {
        throw new Error(
          'No connection to the message service. Please check your network and try again.',
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Reads Web3Forms' own explanation out of a reply, or an empty one if it has none. */
async function readReply(response: Response): Promise<Web3FormsReply> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return {};

    const reply = body as Web3FormsReply;
    const nested = reply.body && typeof reply.body === 'object' ? reply.body.message : undefined;
    return { success: reply.success, message: nested || reply.message };
  } catch {
    // A page that is not JSON (a proxy error page, for instance) still has its
    // status to report.
    return {};
  }
}
