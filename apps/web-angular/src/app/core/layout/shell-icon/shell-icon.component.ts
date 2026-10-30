import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

/**
 * The shell's stroke icons: the phone's Lucide-like set (24 viewBox, stroke 1.8, round caps;
 * spec 2.4). Inline SVG paths, so the shell needs no icon font to draw. Always decorative: the
 * control that holds one carries the accessible name.
 */
export const SHELL_ICONS = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-3.5-3.5'],
  inventory: [
    'M5 6h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
    'M8 3h11a2 2 0 0 1 2 2v13',
  ],
  messages: ['M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z'],
  profile: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21a8 8 0 0 1 16 0'],
  shield: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z'],
  shieldCheck: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', 'm9 12 2 2 4-4'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  globe: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  ],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronRight: ['m9 6 6 6-6 6'],
  chevronLeft: ['m15 6-6 6 6 6'],
  check: ['m5 12 5 5L20 7'],
  checkCircle: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'm8 12 3 3 5-6'],
  close: ['M6 6l12 12M18 6 6 18'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  settings: ['M4 7h10M18 7h2M4 17h4M12 17h8', 'M16 5v4M10 15v4'],
  contrast: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 3v18'],
  keyboard: [
    'M4.5 6h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
    'M7 10h.01M11 10h.01M15 10h.01M8 14h8',
  ],
  logOut: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17 5 12l5-5M5 12h11'],
  binder: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h11'],
  arrowRight: ['M5 12h14M13 6l6 6-6 6'],
  alert: ['M12 3 2 20h20z', 'M12 10v4M12 17h.01'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5M12 8h.01'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  monitor: [
    'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    'M8 20h8M12 16v4',
  ],
  // Web stage WD (Search, Who has this card, sets, binders and deck cores).
  star: ['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  arrowLeft: ['M19 12H5M11 6l-6 6 6 6'],
  external: ['M7 17 17 7', 'M8 7h9v9'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  share: ['M12 3v12', 'm7 8 5-5 5 5', 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  sort: ['M4 7h16M7 12h10M10 17h4'],
  pencil: ['m4 20 4-1 11-11-3-3L5 16z', 'm14 6 3 3'],
  mail: ['M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'm3 7 9 6 9-6'],
  expand: ['M14 4h6v6', 'M10 20H4v-6', 'M20 4l-7 7', 'M4 20l7-7'],
  plusSquare: [
    'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    'M12 8v8M8 12h8',
  ],
  bellRing: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  // Web stage WE (Home, profiles, notifications, settings).
  refresh: ['M21 12a9 9 0 1 1-2.64-6.36L21 8', 'M21 3v5h-5'],
  camera: [
    'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z',
    'M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  ],
  heart: ['M12 20s-7.5-4.6-9.3-9.3C1.6 7.6 3.5 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3.1 1.6-1.9 3.1-3.1 5.2-3.1 3.3 0 5.2 3.1 4.1 6.2C19.5 15.4 12 20 12 20z'],
  hourglass: ['M6 3h12M6 21h12', 'M7 3v3a5 5 0 0 0 10 0V3M7 21v-3a5 5 0 0 1 10 0v3'],
  map: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z', 'M9 4v14M15 6v14'],
  mapPin: ['M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z', 'M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
  truck: [
    'M3 6h11v10H3z',
    'M14 9h4l3 3v4h-7',
    'M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  ],
  ban: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'm5.6 5.6 12.8 12.8'],
  fileText: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5M8 13h8M8 17h6'],
  lock: ['M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  box: ['M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z', 'M3 7.5 12 12l9-4.5M12 12v9'],
  doubleCheck: ['m2 12 4.5 4.5L15 8', 'm11 15.5 1 1L21 8'],
} as const satisfies Record<string, readonly string[]>;

export type ShellIconName = keyof typeof SHELL_ICONS;

@Component({
  selector: 'app-shell-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      [attr.fill]="filled() ? 'currentColor' : 'none'"
      [attr.fill-opacity]="filled() ? 0.25 : null"
      stroke="currentColor"
      [attr.stroke-width]="stroke()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellIconComponent {
  readonly name = input.required<ShellIconName>();
  readonly size = input(24);
  readonly stroke = input(1.8);
  readonly filled = input(false, { transform: booleanAttribute });
  protected readonly paths = computed(() => SHELL_ICONS[this.name()]);
}
