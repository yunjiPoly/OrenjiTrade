import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { CITY_PRESETS, CityPreset } from '../../../shared/location/city-presets';

/**
 * Shown when the map is not centred on the viewer's own trading area (signed out, or no area
 * yet): which city is shown, a city picker, and the way to set an area.
 */
@Component({
  selector: 'app-area-prompt',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <div class="prompt" role="status">
      <mat-icon class="prompt__icon" aria-hidden="true">travel_explore</mat-icon>
      <p class="prompt__text">
        Showing collectors around <strong>{{ city().label }}</strong
        >.
        @if (signedIn()) {
          Set your trading area to see collectors near you.
        } @else {
          Sign in to see collectors around your own area.
        }
      </p>
      <div class="prompt__actions">
        <button matButton type="button" [matMenuTriggerFor]="cities" aria-label="Choose a city">
          <mat-icon aria-hidden="true">location_city</mat-icon>
          City
        </button>
        @if (signedIn()) {
          <a matButton="filled" routerLink="/settings/trading-area">Set my area</a>
        } @else {
          <a matButton="filled" routerLink="/auth/sign-in" [queryParams]="{ returnUrl: '/map' }">
            Sign in
          </a>
        }
      </div>
    </div>
    <mat-menu #cities="matMenu">
      @for (preset of presets; track preset.id) {
        <button mat-menu-item type="button" (click)="cityChosen.emit(preset)">
          {{ preset.label }}
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: block;
    }
    .prompt {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
      padding: var(--spacing-2) var(--spacing-2) var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--elevation-floating);
      font-size: var(--font-size-sm);
    }
    .prompt__icon {
      color: var(--color-primary);
    }
    .prompt__text {
      flex: 1 1 220px;
      margin: 0;
    }
    .prompt__actions {
      display: flex;
      gap: var(--spacing-1);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaPromptComponent {
  readonly city = input.required<CityPreset>();
  readonly signedIn = input(false);
  readonly cityChosen = output<CityPreset>();
  protected readonly presets = CITY_PRESETS;
}
