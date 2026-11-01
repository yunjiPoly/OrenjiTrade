import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SHELL_ICONS } from '../../../core/layout/shell-icon/shell-icon.component';

/**
 * The console's own stroke icons (Lucide-like, 24 viewBox, stroke 1.8, round caps; spec 2.4),
 * kept in the admin chunk so the app's initial bundle never carries them. The shell's icons are
 * reused by name. Always decorative: the control that holds one carries the accessible name.
 */
export const ADMIN_ICONS = {
  overview: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  listings: ['M8 8h12v12H8z', 'M4 16V4h12'],
  cards: ['M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 7h6'],
  database: [
    'M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3z',
    'M3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6',
    'M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6',
  ],
  games: ['M3 5h18v14H3z', 'M8 10v4M6 12h4', 'M15 11h.01M18 13h.01'],
  gauge: ['m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  toggle: ['M8 5h8a7 7 0 0 1 0 14H8A7 7 0 0 1 8 5z', 'M16 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  chart: ['M3 3v18h18', 'M8 17V9', 'M13 17V5', 'M18 17v-3'],
  history: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  restore: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  receipt: [
    'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z',
    'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8',
  ],
  gavel: ['m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8', 'm16 16 6-6', 'm8 8 6-6', 'm9 7 8 8'],
  card: ['M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M2 10h20'],
  archive: ['M3 3h18v5H3z', 'M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8', 'M10 12h4'],
  userCheck: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'm16 11 2 2 4-4',
  ],
  hammer: [
    'm15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9',
    'M17.64 15 22 10.64',
    'm20.91 11.7-1.25-1.25 1.25-1.25-4-4-1.25 1.25-1.25-1.25L12 7.6l4.4 4.4z',
  ],
  filter: ['M22 3H2l8 9.46V19l4 2v-8.54z'],
  pause: ['M10 4H6v16h4z', 'M18 4h-4v16h4z'],
  table: ['M3 3h18v18H3z', 'M3 9h18', 'M3 15h18', 'M9 3v18'],
  chevronUp: ['m18 15-6-6-6 6'],
  copy: [
    'M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z',
    'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  ],
  grip: ['M9 6h.01', 'M9 12h.01', 'M9 18h.01', 'M15 6h.01', 'M15 12h.01', 'M15 18h.01'],
  arrowUp: ['M12 19V5', 'm5 12 7-7 7 7'],
  arrowDown: ['M12 5v14', 'm19 12-7 7-7-7'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'],
  sync: ['M21 12a9 9 0 0 1-15 6.7L3 16', 'M3 12a9 9 0 0 1 15-6.7L21 8', 'M3 21v-5h5', 'M21 3v5h-5'],
  hardDrive: [
    'M22 12H2',
    'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    'M6 16h.01M10 16h.01',
  ],
} as const;

export type AdminIconName = keyof typeof ADMIN_ICONS | keyof typeof SHELL_ICONS;

@Component({
  selector: 'app-admin-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
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
    }
    svg {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminIconComponent {
  readonly name = input.required<AdminIconName>();
  readonly size = input(20);
  readonly stroke = input(1.8);
  protected readonly paths = computed<readonly string[]>(() => {
    const name = this.name();
    return (
      (ADMIN_ICONS as Record<string, readonly string[]>)[name] ??
      (SHELL_ICONS as Record<string, readonly string[]>)[name] ??
      []
    );
  });
}
