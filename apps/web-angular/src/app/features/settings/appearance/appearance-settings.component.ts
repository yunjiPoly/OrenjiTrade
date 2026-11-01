import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AppConfigService } from '../../../core/config/app-config.service';
import { KeyboardPrefs } from '../../../core/keyboard/keyboard-prefs.service';
import { KeyboardShortcuts } from '../../../core/keyboard/keyboard-shortcuts.service';
import { ApiVersionComponent } from '../../../core/layout/api-version/api-version.component';
import { ThemePreference, ThemeService } from '../../../core/theme/theme.service';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';

const THEMES: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Same as the system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
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
  imports: [MatSlideToggleModule, SectionCardComponent, ApiVersionComponent],
  template: `
    <app-section-card
      heading="Theme"
      headingId="appearance-theme"
      description="Saved in this browser. “Same as the system” follows your computer’s light or dark setting."
    >
      <div class="ap__tiles" role="radiogroup" aria-labelledby="appearance-theme">
        @for (option of themes; track option.value) {
          <label class="ap__tile" [class.ap__tile--on]="theme.preference() === option.value">
            <input
              class="ap__radio"
              type="radio"
              name="appearance-theme"
              [value]="option.value"
              [checked]="theme.preference() === option.value"
              (change)="theme.setPreference(option.value)"
            />
            <span class="ap__preview" [attr.data-preview]="option.value" aria-hidden="true">
              <span class="ap__half ap__half--a"><span></span><span></span><span></span></span>
              <span class="ap__half ap__half--b"><span></span><span></span><span></span></span>
            </span>
            <span class="ap__label">{{ option.label }}</span>
          </label>
        }
      </div>
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

    <!-- The API environment line only on non-production builds (spec 13). -->
    @if (!config.isProduction()) {
      <app-section-card heading="About this environment" headingId="appearance-env">
        <p class="appearance__note">
          Connected to <span class="mono">{{ config.apiBaseUrl() || 'same origin' }}</span> ·
          environment <span class="mono">{{ config.environment() }}</span>
        </p>
        <div class="appearance__note"><app-api-version /></div>
      </app-section-card>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
    }
    /* Three preview tiles of 200x120 (spec 13, board W25); they wrap: no sideways scroll at 360. */
    .ap__tiles {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .ap__tile {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 200px;
      max-width: 100%;
      cursor: pointer;
    }
    .ap__radio {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
    }
    .ap__preview {
      display: flex;
      width: 200px;
      max-width: 100%;
      height: 120px;
      overflow: hidden;
      border: 2px solid var(--color-border);
      border-radius: 14px;
    }
    .ap__tile--on .ap__preview {
      border-color: var(--color-primary);
    }
    .ap__tile:has(.ap__radio:focus-visible) .ap__preview {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .ap__half {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 8px;
      padding: 14px 12px;
    }
    .ap__half span {
      height: 10px;
      border-radius: 5px;
    }
    .ap__half span:first-child {
      width: 60%;
      height: 14px;
    }
    .ap__half span:last-child {
      width: 40%;
    }
    /* Light previews: off-white page, ink lines, the orange accent. */
    .ap__preview[data-preview='light'] .ap__half,
    .ap__preview[data-preview='system'] .ap__half--a {
      background: #f7f5f2;
    }
    .ap__preview[data-preview='light'] .ap__half span,
    .ap__preview[data-preview='system'] .ap__half--a span {
      background: #d6d1ca;
    }
    .ap__preview[data-preview='dark'] .ap__half,
    .ap__preview[data-preview='system'] .ap__half--b {
      background: #141210;
    }
    .ap__preview[data-preview='dark'] .ap__half span,
    .ap__preview[data-preview='system'] .ap__half--b span {
      background: #3a3531;
    }
    .ap__half span:first-child {
      background: #f4761a !important;
    }
    .ap__label {
      font-weight: var(--font-weight-semibold);
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
}
