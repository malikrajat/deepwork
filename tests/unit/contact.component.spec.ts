import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TestBed } from '@angular/core/testing';
import { ContactComponent } from '../../src/app/pages/contact/contact.component';
import { CONTACT_EMAIL } from '../../src/app/core/constants/about.constants';

const SOURCE = resolve(__dirname, '../../src/app/pages/contact/contact.component.ts');
const SOURCE_TEXT = readFileSync(SOURCE, 'utf8');

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
 */
function setup(): ContactComponent {
  TestBed.resetTestingModule();
  return TestBed.runInInjectionContext(() => new ContactComponent());
}

describe('ContactComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('offers the developer email and the other ways to reach him', () => {
    const component = setup();

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
    const component = setup();

    expect(component.contactForm().invalid()).toBe(true);

    component.contactModel.set({ name: 'Ada Lovelace', email: '', mobile: '', message: 'Hello' });

    expect(component.contactForm().invalid()).toBe(false);
  });

  it('rejects an email or mobile number that is filled in but malformed', () => {
    const component = setup();

    component.contactModel.set({
      name: 'Ada Lovelace',
      email: 'not-an-email',
      mobile: 'abc',
      message: 'Hello',
    });

    expect(component.contactForm.email().errors().length).toBeGreaterThan(0);
    expect(component.contactForm.mobile().errors().length).toBeGreaterThan(0);
  });

  it('confirms delivery and clears the form once it is submitted', async () => {
    const component = setup();

    component.contactModel.set({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      mobile: '+00 00000 00000',
      message: 'I would like to talk about a project.',
    });

    await component.submitForm(new Event('submit'));

    expect(component.sent()).toBe(true);
    expect(component.contactModel()).toEqual({ name: '', email: '', mobile: '', message: '' });
    expect(SOURCE_TEXT).toContain('Your message has been delivered to the owner.');
  });

  it('offers the form again after the confirmation', async () => {
    const component = setup();

    component.contactModel.set({ name: 'Ada', email: '', mobile: '', message: 'Hello' });
    await component.submitForm(new Event('submit'));
    component.writeAnother();

    expect(component.sent()).toBe(false);
    expect(SOURCE_TEXT).toContain('Send another message');
  });
});
