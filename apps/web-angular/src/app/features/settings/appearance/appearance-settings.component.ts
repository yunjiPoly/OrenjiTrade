import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AppConfigService } from '../../../core/config/app-config.service';
import { KeyboardPrefs } from '../../../core/keyboard/keyboard-prefs.service';
import { KeyboardShortcuts } from '../../../core/keyboard/keyboard-shortcuts.service';
import { ApiVersionComponent } from '../../../core/layout/api-version/api-version.component';
import { ThemePreference, ThemeService } from '../../../core/theme/theme.service';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';

const THEMES: readonly { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'system', label: 'Same as the system', icon: 'brightness_auto' },
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
];

/** The switch's line on and off (board W25's wording, decision 24). */
export const SINGLE_KEYS_ON =
  'Press /, n, g then a letter, or ? without holding another key. They never fire while you type in a field.';
export const SINGLE_KEYS_OFF =
  'Off. Ctrl/Cmd+K still opens the search, and Enter still sends in a chat.';

/** The key chips under the switch (struck through while it is off). */
export const KEY_CHIPS: readonly { keys: string[]; label: string }[] = [
  { keys: ['/'], label: 'Search' },
  { keys: ['n'], label: 'Add cards' },
  { keys: ['g', 'i'], label: 'Go to Inventory' },
  { keys: ['?'], label: 'Shortcuts' },
];

/**
 * Settings › Appearance: the theme (in this browser; "Same as the system" by default, decision
 * 12), the single-key shortcuts switch (decision 24, WCAG 2.2 SC 2.1.4) with "See all shortcuts",
 * and the environment details with the API version.
 */
@Component({
  selector: 'app-appearance-settings',
  imports: [
    MatButtonToggleModule,
    MatIconModule,
    MatSlideToggleModule,
    SectionCardComponent,
    ApiVersionComponent,
  ],
  template: `
    <app-section-card
      heading="Theme"
      headingId="appearance-theme"
      description="Saved in this browser. “Same as the system” follows your computer’s light or dark setting."
    >
      <mat-button-toggle-group
        aria-labelledby="appearance-theme"
        [vertical]="stacked()"
        [value]="theme.preference()"
        (change)="theme.setPreference($event.value)"
      >
        @for (option of themes; track option.value) {
          <mat-button-toggle [value]="option.value">
            <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
            {{ option.label }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
      <p class="appearance__note">Currently showing the {{ theme.resolved() }} theme.</p>
    </app-section-card>

    <app-section-card heading="Keyboard" headingId="appearance-keys">
      <mat-slide-toggle
        data-testid="single-key-shortcuts"
        [checked]="prefs.singleKeys()"
        (change)="prefs.setSingleKeys($event.checked)"
        aria-describedby="appearance-keys-line"
      >
        Single-key shortcuts
      </mat-slide-toggle>
      <p class="appearance__note" id="appearance-keys-line">
        {{ prefs.singleKeys() ? on : off }}
      </p>
      <div class="appearance__chips">
        @for (chip of chips; track chip.label) {
          <span class="appearance__chip" [class.appearance__chip--off]="!prefs.singleKeys()">
            @for (key of chip.keys; track $index) {
              <kbd>{{ key }}</kbd>
            }
            {{ chip.label }}
          </span>
        }
        <button type="button" class="appearance__link" (click)="shortcuts.openHelp()">
          See all shortcuts
        </button>
      </div>
    </app-section-card>

    <app-section-card heading="About this environment" headingId="appearance-env">
      <p class="appearance__note">
        Connected to <span class="mono">{{ config.apiBaseUrl() || 'same origin' }}</span> ·
        environment <span class="mono">{{ config.environment() }}</span>
      </p>
      <div class="appearance__note"><app-api-version /></div>
    </app-section-card>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
    }
    mat-button-toggle-group {
      max-width: 100%;
    }
    /* Below 600 the three choices stack full width: no sideways scroll at 360 (spec 3). */
    mat-button-toggle-group.mat-button-toggle-vertical {
      display: flex;
      width: 100%;
    }
    mat-button-toggle mat-icon {
      margin-right: var(--spacing-1);
      vertical-align: middle;
    }
    .appearance__note {
      margin: var(--spacing-3) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .appearance__chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-3);
    }
    .appearance__chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      color: var(--color-text-secondary);
      font-size: var(--font-size-meta);
    }
    .appearance__chip--off {
      color: var(--color-text-muted);
      text-decoration: line-through;
    }
    .appearance__chip kbd {
      padding: 0 6px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
    .appearance__link {
      height: 36px;
      margin-left: auto;
      padding: 0 10px;
      border: 0;
      border-radius: var(--radius-pill);
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .appearance__link:hover {
      background: var(--color-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceSettingsComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly config = inject(AppConfigService);
  protected readonly prefs = inject(KeyboardPrefs);
  protected readonly shortcuts = inject(KeyboardShortcuts);
  protected readonly themes = THEMES;
  protected readonly chips = KEY_CHIPS;
  protected readonly on = SINGLE_KEYS_ON;
  protected readonly off = SINGLE_KEYS_OFF;
  /** The theme choices stack below 600 px. */
  protected readonly stacked = signal(false);

  constructor() {
    const list = inject(DOCUMENT).defaultView?.matchMedia?.(STACK_QUERY);
    if (list) {
      this.stacked.set(list.matches);
      const listener = (event: MediaQueryListEvent) => this.stacked.set(event.matches);
      list.addEventListener('change', listener);
      inject(DestroyRef).onDestroy(() => list.removeEventListener('change', listener));
    }
  }
}

/** Below this width the theme choices stack (one per line). */
export const STACK_QUERY = '(max-width: 599.98px)';
