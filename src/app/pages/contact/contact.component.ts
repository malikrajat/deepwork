import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  email,
  form,
  FormField,
  maxLength,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { CONTACT_LINKS, DEVELOPER } from '../../core/constants/about.constants';
import { ContactFormModel, createContactFormDefaults } from '../../shared/models/form.models';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { ExternalLinkDirective } from '../../shared/directives/external-link.directive';
import { noXss, trimmedRequired } from '../../shared/validators/form-validators';
import { ContactService } from '../../core/services/contact.service';
import { HCaptchaService } from '../../core/services/hcaptcha.service';

/** A mobile number is optional, so an empty value is allowed; a filled one has to look like one. */
const PHONE_PATTERN = /^[+()\d\s-]{6,20}$/;

const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 254;
const MESSAGE_MAX_LENGTH = 2000;

/**
 * Contact: the form, and every other way to reach the developer.
 *
 * The form is deliberately short — a name and a message, with email and mobile
 * optional — because the reason someone opens this page is to say something,
 * not to fill in a record. The direct channels sit beside it for people who
 * would rather use one of those.
 */
@Component({
  selector: 'app-contact',
  imports: [FormField, FormFieldWrapperComponent, RouterLink, ExternalLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <h1 class="gradient-text page-title">Contact</h1>
      <p class="page-subtitle">
        Questions, bug reports, a role, or a project — tell me what you have in mind.
      </p>
    </div>

    <div class="contact-layout animate-fade-in-delay-1">
      <section class="card" aria-labelledby="contact-form-title">
        @if (sent()) {
          <div class="sent" role="status" aria-live="polite">
            <span class="sent-icon" aria-hidden="true">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
              >
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </span>
            <h2 id="contact-form-title">Message sent</h2>
            <p class="sent-message">Your message has been delivered to the owner.</p>
            <p class="sent-note">{{ developer.replyNote }}</p>
            <button type="button" class="ghost-btn" (click)="writeAnother()">
              Send another message
            </button>
          </div>
        } @else {
          <div class="card-header">
            <h2 id="contact-form-title">Send a message</h2>
            <p class="card-subtitle">
              Your name and a message are all that is needed. Email and mobile are optional — add
              either if you would like a reply that way.
            </p>
          </div>
        }

        <form class="contact-form" [hidden]="sent()" novalidate (submit)="submitForm($event)">
          <app-form-field label="Name" [fieldState]="contactForm.name()">
            <input
              type="text"
              [formField]="contactForm.name"
              placeholder="Your full name"
              autocomplete="name"
            />
          </app-form-field>

          <div class="form-row">
            <app-form-field label="Email (optional)" [fieldState]="contactForm.email()">
              <input
                type="email"
                [formField]="contactForm.email"
                placeholder="you@example.com"
                autocomplete="email"
              />
            </app-form-field>

            <app-form-field label="Mobile number (optional)" [fieldState]="contactForm.mobile()">
              <input
                type="tel"
                inputmode="tel"
                [formField]="contactForm.mobile"
                placeholder="+00 00000 00000"
                autocomplete="tel"
              />
            </app-form-field>
          </div>

          <app-form-field label="Message" [fieldState]="contactForm.message()">
            <textarea
              [formField]="contactForm.message"
              rows="6"
              placeholder="Tell me what you have in mind — a role, a project, or something about the app."
            ></textarea>
          </app-form-field>

          <div class="captcha-row">
            <div #captchaHost class="captcha-host"></div>
            @if (captchaError()) {
              <p class="captcha-error" role="alert">{{ captchaError() }}</p>
            }
          </div>

          <div class="submit-row">
            <button
              type="submit"
              class="submit-btn"
              [disabled]="contactForm().invalid() || submitting()"
            >
              {{ submitting() ? 'Sending…' : 'Send message' }}
            </button>
            <span class="submit-note">No mailing list. Your details are only used to reply.</span>
          </div>
          @if (submitError()) {
            <p class="submit-error" role="alert" aria-live="polite">{{ submitError() }}</p>
          }
        </form>
      </section>

      <section class="card" aria-labelledby="direct-contact-title">
        <div class="card-header">
          <h2 id="direct-contact-title">Reach me directly</h2>
          <p class="card-subtitle">Prefer email or a chat? Use whichever is easiest.</p>
        </div>

        <div class="email-block">
          <span class="channel-label">Email</span>
          <a class="email-address" appExternalLink [href]="emailUrl">{{ emailLink.value }}</a>
          <p class="email-note">{{ developer.replyNote }}</p>
        </div>

        <ul class="channel-list">
          @for (link of channels; track link.url) {
            <li>
              <a appExternalLink [href]="link.url" target="_blank" rel="noopener noreferrer">
                <span class="channel-label">{{ link.label }}</span>
                <span class="channel-value">{{ link.value }}</span>
              </a>
            </li>
          }
        </ul>

        <p class="policy-note">
          Looking for the app’s policies?
          <a routerLink="/privacy">Privacy</a>
          <span aria-hidden="true">·</span>
          <a routerLink="/terms">Terms</a>
        </p>
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .page-header {
        margin-bottom: var(--space-lg);
        max-width: 820px;
      }
      .page-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .page-subtitle {
        color: var(--color-text-muted);
        margin-top: 4px;
        font-size: 14px;
        line-height: 1.6;
      }

      .contact-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.9fr);
        gap: var(--space-md);
        align-items: start;
        max-width: 1180px;
        padding-bottom: var(--space-xl);
      }
      .card {
        padding: var(--space-lg);
        border-radius: 16px;
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.08);
        transition: border-color 0.3s;
      }
      .card:hover {
        border-color: rgba(139, 92, 246, 0.15);
      }
      .card-header {
        margin-bottom: var(--space-md);
      }
      .card-header h2 {
        font-size: 16px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .card-subtitle {
        margin-top: 6px;
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-muted);
      }

      .contact-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
      }
      .contact-form[hidden] {
        display: none;
      }
      .form-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-md);
      }
      .submit-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding-top: 4px;
      }
      .submit-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 22px;
        border-radius: 10px;
        border: 1px solid rgba(139, 92, 246, 0.4);
        background: rgba(139, 92, 246, 0.16);
        color: var(--color-text-primary);
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s,
          opacity 0.2s;
      }
      .submit-btn:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.26);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .submit-btn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .submit-btn:focus-visible,
      .ghost-btn:focus-visible {
        outline: 2px solid var(--color-accent-secondary);
        outline-offset: 2px;
      }
      .submit-note {
        font-size: 11px;
        line-height: 1.5;
        color: var(--color-text-muted);
      }

      .captcha-row {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        /* The widget is about this tall; reserving it stops the button below
           from jumping down when the script arrives. */
        min-height: 78px;
      }
      .captcha-host {
        max-width: 100%;
        /* The widget is a fixed-width iframe; on a narrow phone it is a few
           pixels wider than the card, and clipping that empty edge is better
           than a page that scrolls sideways. */
        overflow: hidden;
      }
      .captcha-error,
      .submit-error {
        font-size: 12px;
        line-height: 1.5;
        color: #f87171;
      }
      .submit-error {
        margin-top: -4px;
      }

      .sent {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 18px 4px 8px;
      }
      .sent-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 58px;
        height: 58px;
        border-radius: 50%;
        color: var(--color-success);
        background: rgba(52, 211, 153, 0.12);
        border: 1px solid rgba(52, 211, 153, 0.3);
        box-shadow: 0 0 24px rgba(52, 211, 153, 0.18);
      }
      .sent h2 {
        margin-top: var(--space-md);
        font-size: 20px;
        font-weight: 800;
        color: var(--color-text-primary);
      }
      .sent-message {
        margin-top: 8px;
        font-size: 14px;
        line-height: 1.6;
        color: var(--color-text-primary);
      }
      .sent-note {
        margin-top: 6px;
        max-width: 46ch;
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-muted);
      }
      .ghost-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        margin-top: var(--space-lg);
        padding: 0 18px;
        border-radius: 10px;
        border: 1px solid rgba(139, 92, 246, 0.24);
        background: rgba(139, 92, 246, 0.06);
        color: var(--color-text-primary);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .ghost-btn:hover {
        background: rgba(139, 92, 246, 0.14);
        border-color: rgba(139, 92, 246, 0.4);
      }

      .email-block {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        border-radius: 12px;
        background: rgba(6, 182, 212, 0.07);
        border: 1px solid rgba(6, 182, 212, 0.25);
      }
      .email-address {
        font-size: 16px;
        font-weight: 700;
        color: var(--color-accent-secondary);
        text-decoration: none;
        overflow-wrap: anywhere;
      }
      .email-address:hover {
        text-decoration: underline;
      }
      .email-note {
        font-size: 11px;
        line-height: 1.55;
        color: var(--color-text-muted);
      }

      .channel-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        margin-top: var(--space-sm);
      }
      .channel-list li {
        border-bottom: 1px solid var(--glass-border);
      }
      .channel-list li:last-child {
        border-bottom: none;
      }
      .channel-list a {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 2px;
        text-decoration: none;
        border-radius: 8px;
        transition: background 0.2s;
      }
      .channel-list a:hover {
        background: rgba(139, 92, 246, 0.06);
      }
      .channel-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
      }
      .channel-value {
        min-width: 0;
        text-align: right;
        font-size: 12px;
        color: var(--color-text-secondary);
        overflow-wrap: anywhere;
      }

      .policy-note {
        margin-top: var(--space-md);
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-muted);
      }
      .policy-note a {
        color: var(--color-accent-secondary);
        text-decoration: none;
      }
      .policy-note a:hover {
        text-decoration: underline;
      }

      @media (max-width: 900px) {
        .contact-layout {
          grid-template-columns: minmax(0, 1fr);
          max-width: none;
        }
      }

      @media (max-width: 640px) {
        .card {
          padding: var(--space-md);
        }
        .form-row {
          grid-template-columns: minmax(0, 1fr);
        }
        .submit-row {
          align-items: stretch;
          flex-direction: column;
        }
        .submit-btn,
        .ghost-btn {
          min-height: 44px;
          width: 100%;
        }
        .channel-list a {
          min-height: 44px;
        }
        .email-address {
          font-size: 15px;
        }
      }

      @media (min-width: 2560px) {
        .contact-layout {
          max-width: 1320px;
        }
        .card-header h2 {
          font-size: 20px;
        }
        .card-subtitle,
        .email-note,
        .channel-value,
        .policy-note {
          font-size: 14px;
        }
        .sent-message {
          font-size: 16px;
        }
        .submit-btn,
        .ghost-btn {
          font-size: 14px;
        }
      }
    `,
  ],
})
export class ContactComponent {
  private readonly contactService = inject(ContactService);
  private readonly captcha = inject(HCaptchaService);

  readonly developer = DEVELOPER;
  readonly contacts = CONTACT_LINKS;
  readonly emailLink = CONTACT_LINKS.find((link) => link.kind === 'email')!;
  readonly channels = CONTACT_LINKS.filter((link) => link.kind !== 'email');
  readonly emailUrl = `mailto:${this.emailLink.value}`;

  private readonly captchaHost = viewChild<ElementRef<HTMLDivElement>>('captchaHost');

  /** Why the captcha could not be drawn, if it could not. */
  readonly captchaError = this.captcha.error;

  /** True while a message is on its way to Web3Forms. */
  readonly submitting = signal(false);

  /** Why the last attempt failed, in a sentence beside the button. */
  readonly submitError = signal<string | null>(null);

  constructor() {
    // The widget needs a real element, so it is drawn once the first paint has
    // produced the container it lives in.
    afterNextRender(() => {
      void this.mountCaptcha();
    });
  }

  readonly contactModel = signal<ContactFormModel>(createContactFormDefaults());
  readonly contactForm = form(this.contactModel, (s) => {
    required(s.name, { message: 'Please enter your name' });
    validate(s.name, trimmedRequired);
    validate(s.name, noXss);
    maxLength(s.name, NAME_MAX_LENGTH, {
      message: `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    });

    email(s.email, { message: 'Enter a valid email address' });
    maxLength(s.email, EMAIL_MAX_LENGTH, {
      message: `Email must be ${EMAIL_MAX_LENGTH} characters or fewer`,
    });

    pattern(s.mobile, PHONE_PATTERN, { message: 'Enter a valid mobile number' });

    required(s.message, { message: 'Please write a short message' });
    validate(s.message, trimmedRequired);
    validate(s.message, noXss);
    maxLength(s.message, MESSAGE_MAX_LENGTH, {
      message: `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer`,
    });
  });

  /** True once the form has been submitted; the confirmation replaces the form. */
  readonly sent = signal(false);

  async submitForm(event: Event): Promise<void> {
    event.preventDefault();
    if (this.submitting() || this.contactForm().invalid()) return;

    const captchaToken = this.captcha.token();
    if (!captchaToken) {
      this.submitError.set('Please complete the captcha before sending.');
      return;
    }

    this.submitError.set(null);
    this.submitting.set(true);

    try {
      const delivered = await submit(this.contactForm, async () => {
        await this.contactService.send({ ...this.contactModel(), captchaToken });
      });

      // `submit` answers false when the form was not valid; nothing was sent.
      if (!delivered) return;

      this.contactForm().reset(createContactFormDefaults());
      this.captcha.reset();
      this.sent.set(true);
    } catch (error) {
      this.submitError.set(
        error instanceof Error && error.message
          ? error.message
          : 'Your message could not be sent. Please try again.',
      );
      // A captcha token is single-use, so a retry needs a fresh one.
      this.captcha.reset();
    } finally {
      this.submitting.set(false);
    }
  }

  writeAnother(): void {
    this.sent.set(false);
    this.submitError.set(null);
    this.captcha.reset();
  }

  private async mountCaptcha(): Promise<void> {
    const host = this.captchaHost()?.nativeElement;
    if (!host) return;
    await this.captcha.render(host);
  }
}
