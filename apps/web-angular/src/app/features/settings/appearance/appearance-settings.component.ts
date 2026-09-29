import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { AppConfigService } from '../../../core/config/app-config.service';
import { ThemePreference, ThemeService } from '../../../core/theme/theme.service';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';

const THEMES: readonly { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'system', label: 'System', icon: 'brightness_auto' },
];

/** Settings → Appearance: theme preference (stored on this device) and environment details. */
@Component({
  selector: 'app-appearance-settings',
  imports: [MatButtonToggleModule, MatIconModule, SectionCardComponent],
  template: `
    <app-section-card
      heading="Theme"
      headingId="appearance-theme"
      description="Stored on this device. “System” follows your operating system."
    >
      <mat-button-toggle-group
        aria-labelledby="appearance-theme"
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

    <app-section-card heading="About this environment" headingId="appearance-env">
      <p class="appearance__note">
        Connected to <span class="mono">{{ config.apiBaseUrl() || 'same origin' }}</span> ·
        environment <span class="mono">{{ config.environment() }}</span>
      </p>
    </app-section-card>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceSettingsComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly config = inject(AppConfigService);
  protected readonly themes = THEMES;
}
