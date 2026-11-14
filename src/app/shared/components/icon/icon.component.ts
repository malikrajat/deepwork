import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The names the app draws from its own icon set.
 *
 * Text glyphs (`⏸`, `⛶`, `▭`, `◐`…) are not icons: which font supplies them, and
 * whether it has the glyph at all, is up to the operating system. The dashboard
 * used to put those characters in the command palette and on the clock, and on
 * some machines two of them drew as empty boxes. These are strokes instead, so
 * they inherit the surrounding colour and render the same everywhere.
 */
export type IconName =
  | 'search'
  | 'help'
  | 'play'
  | 'pause'
  | 'stop'
  | 'skip'
  | 'reset'
  | 'mini'
  | 'fullscreen'
  | 'contract'
  | 'keyboard'
  | 'settings'
  | 'tasks'
  | 'chart'
  | 'sun'
  | 'target'
  | 'clock'
  | 'flame'
  | 'coffee'
  | 'moon'
  | 'check'
  | 'plus'
  | 'chevron-down'
  | 'x'
  | 'arrow-right'
  | 'sparkles'
  | 'edit';

/**
 * One inline SVG, sized by the caller.
 *
 * The shell is stroke-only because most icons are outlines; the handful that
 * read better solid (play, pause, stop, skip) turn their own fill on. Everything
 * is `aria-hidden`: an icon always sits next to the word it stands for, so a
 * screen reader should hear the label once, not twice.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('search') {
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        }
        @case ('help') {
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
          <path d="M12 17h.01" />
        }
        @case ('play') {
          <path
            d="M7 4.6v14.8a1 1 0 0 0 1.54.84l11.2-7.4a1 1 0 0 0 0-1.68L8.54 3.76A1 1 0 0 0 7 4.6Z"
            fill="currentColor"
            stroke="none"
          />
        }
        @case ('pause') {
          <rect x="6" y="4" width="4" height="16" rx="1.2" fill="currentColor" stroke="none" />
          <rect x="14" y="4" width="4" height="16" rx="1.2" fill="currentColor" stroke="none" />
        }
        @case ('stop') {
          <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" stroke="none" />
        }
        @case ('skip') {
          <path
            d="M5 4.6v14.8a1 1 0 0 0 1.54.84L17 12 6.54 3.76A1 1 0 0 0 5 4.6Z"
            fill="currentColor"
            stroke="none"
          />
          <rect x="17.5" y="4" width="2.6" height="16" rx="1.1" fill="currentColor" stroke="none" />
        }
        @case ('reset') {
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        }
        @case ('mini') {
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <rect x="11.5" y="11" width="7" height="6" rx="1.4" fill="currentColor" stroke="none" />
        }
        @case ('fullscreen') {
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
        }
        @case ('contract') {
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M16 3v3a2 2 0 0 0 2 2h3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
        }
        @case ('keyboard') {
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01" />
          <path d="M8 17h8" />
        }
        @case ('settings') {
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path
            d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"
          />
        }
        @case ('tasks') {
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        }
        @case ('chart') {
          <path d="M3 3v18h18" />
          <path d="M7 15v-4M12 15V7M17 15v-7" />
        }
        @case ('sun') {
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          />
        }
        @case ('target') {
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        }
        @case ('flame') {
          <path
            d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5.5 12 3c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7Z"
          />
        }
        @case ('coffee') {
          <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
          <path d="M6 2v2M10 2v2M14 2v2" />
        }
        @case ('moon') {
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
        }
        @case ('check') {
          <path d="M20 6 9 17l-5-5" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
        @case ('x') {
          <path d="M18 6 6 18M6 6l12 12" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14M13 6l6 6-6 6" />
        }
        @case ('sparkles') {
          <path
            d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"
          />
        }
        @case ('edit') {
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
        line-height: 0;
      }
      svg {
        display: block;
      }
    `,
  ],
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  readonly strokeWidth = input(2);
}
