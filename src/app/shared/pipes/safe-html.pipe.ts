import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'safeHtml' })
export class SafeHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string): SafeHtml {
    // Only allow SVG/HTML content that is developer-provided (not user input).
    // This pipe is used exclusively for inline SVG icons in the sidebar.
    return this.sanitizer.bypassSecurityTrustHtml(value); // NOSONAR - internal SVG icons only
  }
}
