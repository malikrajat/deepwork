import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TestBed } from '@angular/core/testing';
import { ContactComponent } from '../../src/app/pages/contact/contact.component';
import { ContactService } from '../../src/app/core/services/contact.service';
import { HCaptchaService } from '../../src/app/core/services/hcaptcha.service';
import { CONTACT_EMAIL } from '../../src/app/core/constants/about.constants';

const SOURCE = resolve(__dirname, '../../src/app/pages/contact/contact.component.ts');
const SOURCE_TEXT = readFileSync(SOURCE, 'utf8');

const send = vi.fn();

/**
 * The contact page has two jobs: make the developer reachable without a form,
 * and take a short message when someone would rather use one.
 *
 * The template is not rendered here. This project mandates signal inputs, and
 * Angular's JIT compiler — the only option under Vitest — cannot resolve them
 * (the constraint is documented in `settings.component.spec.ts`). The component
 * is therefore built inside an injection context and its form behaviour is
 * exercised directly; the template's copy and placeholders are asserted against
 * the source, as the other page tests in this suite do.
 *
 * Delivery itself is not attempted: `ContactService` is replaced with a stub, so
 * the suite never reaches Web3Forms.
 */
function setup(): { component: ContactComponent; captcha: HCaptchaService } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ContactService, useValue: { send } }],
  });
  const component = TestBed.runInInjectionContext(() => new ContactComponent());
  return { component, captcha: TestBed.inject(HCaptchaService) };
}

describe('ContactComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    send.mockReset();
    send.mockResolvedValue(undefined);
  });

  it('offers the developer email and the other ways to reach him', () => {
    const { component } = setup();

    expect(component.emailLink.value).toBe(CONTACT_EMAIL);
    expect(component.channels.map((link) => link.label)).toEqual([
      'Portfolio',
      'LinkedIn',
      'GitHub',
      'Medium',
    ]);
    expect(SOURCE_TEXT).toContain('{{ emailLink.value }}');
  });

  it('uses generic placeholders rather than a real person’s details', () => {
    expect(SOURCE_TEXT).toContain('placeholder="Your full name"');
    expect(SOURCE_TEXT).toContain('placeholder="you@example.com"');
    expect(SOURCE_TEXT).toContain('placeholder="+00 00000 00000"');
  });

  it('needs a name and a message, but not an email or a mobile number', () => {
    const { component } = setup();

    expect(component.contactForm().invalid()).toBe(true);

    component.contactModel.set({ name: 'Ada Lovelace', email: '', mobile: '', message: 'Hello' });

    expect(component.contactForm().invalid()).toBe(false);
  });

  it('rejects an email or mobile number that is filled in but malformed', () => {
    const { component } = setup();

    component.contactModel.set({
      name: 'Ada Lovelace',
      email: 'not-an-email',
      mobile: 'abc',
      message: 'Hello',
    });

    expect(component.contactForm.email().errors().length).toBeGreaterThan(0);
    expect(component.contactForm.mobile().errors().length).toBeGreaterThan(0);
  });

  it('will not send until the captcha has been solved', async () => {
    const { component } = setup();

    component.contactModel.set({ name: 'Ada Lovelace', email: '', mobile: '', message: 'Hello' });
    await component.submitForm(new Event('submit'));

    expect(send).not.toHaveBeenCalled();
    expect(component.sent()).toBe(false);
    expect(component.submitError()).toMatch(/captcha/i);
  });

  it('sends the message through Web3Forms and confirms delivery', async () => {
    const { component, captcha } = setup();

    component.contactModel.set({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      mobile: '+00 00000 00000',
      message: 'I would like to talk about a project.',
    });
    captcha.token.set('captcha-token');

    await component.submitForm(new Event('submit'));

    expect(send).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      mobile: '+00 00000 00000',
      message: 'I would like to talk about a project.',
      captchaToken: 'captcha-token',
    });
    expect(component.sent()).toBe(true);
    expect(component.contactModel()).toEqual({ name: '', email: '', mobile: '', message: '' });
    expect(captcha.token()).toBe(null);
    expect(SOURCE_TEXT).toContain('Your message has been delivered to the owner.');
  });

  it('keeps the message and explains the failure when delivery fails', async () => {
    const { component, captcha } = setup();
    send.mockRejectedValue(new Error('No connection to the message service.'));

    component.contactModel.set({ name: 'Ada', email: '', mobile: '', message: 'Hello' });
    captcha.token.set('captcha-token');

    await component.submitForm(new Event('submit'));

    expect(component.sent()).toBe(false);
    expect(component.submitError()).toBe('No connection to the message service.');
    expect(component.contactModel().message).toBe('Hello');
    expect(captcha.token()).toBe(null);
  });

  it('offers the form again after the confirmation', async () => {
    const { component, captcha } = setup();

    component.contactModel.set({ name: 'Ada', email: '', mobile: '', message: 'Hello' });
    captcha.token.set('captcha-token');
    await component.submitForm(new Event('submit'));
    component.writeAnother();

    expect(component.sent()).toBe(false);
    expect(component.submitError()).toBe(null);
    expect(SOURCE_TEXT).toContain('Send another message');
  });

  it('asks the page for a captcha when the form is first drawn', () => {
    expect(SOURCE_TEXT).toContain('#captchaHost');
    expect(SOURCE_TEXT).toContain('afterNextRender');
  });
});
