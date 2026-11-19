import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LegalComponent } from '../../src/app/pages/legal/legal.component';
import { CONTACT_EMAIL } from '../../src/app/core/constants/about.constants';
import type { LegalDocumentId } from '../../src/app/core/constants/legal.constants';

function mount(document: LegalDocumentId) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LegalComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { document } } } },
    ],
  });
  const fixture = TestBed.createComponent(LegalComponent);
  fixture.detectChanges();
  return fixture;
}

describe('LegalComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the privacy policy for the privacy route', () => {
    const fixture = mount('privacy');
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Privacy policy');
    expect(element.textContent).toContain('The DeepWork application collects no data about you');
    expect(element.textContent).toContain('no telemetry on your work');
    expect(element.textContent).toContain('local database');
    expect(element.textContent).toContain('Google AdSense');
    expect(element.textContent).toContain('cookies');
    expect(element.textContent).toContain('Your rights');
    expect(element.textContent).toContain('Last updated 17 November 2026');
    expect(element.textContent).toContain(CONTACT_EMAIL);
  });

  it('renders the terms for the terms route', () => {
    const fixture = mount('terms');
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Terms & conditions');
    expect(element.textContent).toContain('No charge');
    expect(element.textContent).toContain('Advertising and third-party links');
    expect(element.textContent).toContain('does not charge you or take money from you');
    expect(element.textContent).toContain('entirely at your own risk');
    expect(element.textContent).toContain('will not honor any claim of any kind');
    expect(element.textContent).toContain('MIT licence');
    expect(element.textContent).toContain('laws of India');
  });

  it('links to the other policy page and to contact', () => {
    const fixture = mount('privacy');
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (a) => a.getAttribute('href'),
    );

    expect(links).toContain('/about');
    expect(links).toContain('/privacy');
    expect(links).toContain('/terms');
    expect(links).toContain('/contact');
  });
});
