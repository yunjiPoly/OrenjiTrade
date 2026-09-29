import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemePreference, ThemeService } from '../../theme/theme.service';

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: string;
}

const OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'system', label: 'System', icon: 'brightness_auto' },
];

/** Icon button opening a light / dark / system menu bound to {@link ThemeService}. */
@Component({
  selector: 'app-theme-toggle',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    <button
      matIconButton
      type="button"
      [matMenuTriggerFor]="themeMenu"
      [matTooltip]="'Theme: ' + current().label"
      aria-label="Change theme"
    >
      <mat-icon>{{ current().icon }}</mat-icon>
    </button>
    <mat-menu #themeMenu="matMenu" xPosition="before" aria-label="Theme">
      @for (option of options; track option.value) {
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="theme.preference() === option.value"
          (click)="theme.setPreference(option.value)"
        >
          <mat-icon>{{ option.icon }}</mat-icon>
          <span>{{ option.label }}</span>
          @if (theme.preference() === option.value) {
            <mat-icon class="theme-toggle__check" aria-hidden="true">check</mat-icon>
          }
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .theme-toggle__check {
      margin-left: auto;
      margin-right: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly options = OPTIONS;
  protected readonly current = computed(
    () => OPTIONS.find((o) => o.value === this.theme.preference()) ?? OPTIONS[2],
  );
}
