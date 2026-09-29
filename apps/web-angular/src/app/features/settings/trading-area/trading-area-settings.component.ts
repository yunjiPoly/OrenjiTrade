import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { isApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { DEFAULT_RADIUS_KM, DEFAULT_TRADING_CENTER } from '../../../shared/location/city-presets';
import { MyLocationStore } from '../../../shared/location/my-location.store';
import {
  TradingAreaPickerComponent,
  TradingAreaSource,
  TradingAreaValue,
} from '../../../shared/location/trading-area-picker/trading-area-picker.component';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

/** Settings → Trading area: the picker bound to `/me/location`, public label, removal. */
@Component({
  selector: 'app-trading-area-settings',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TradingAreaPickerComponent,
    SectionCardComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    @if (!loaded() && store.error(); as error) {
      <app-error-state
        title="We could not load your trading area"
        [message]="error.message"
        [requestId]="error.requestId"
        (retry)="load()"
      />
    } @else if (!loaded()) {
      <div class="section-skeleton" aria-busy="true">
        <span class="visually-hidden">Loading your trading area</span>
        <app-skeleton height="320px" />
      </div>
    } @else {
      <app-section-card
        heading="Trading area"
        headingId="area-heading"
        description="Where you like to meet or ship from. Only you see the exact centre you pick."
      >
        <div class="area__status">
          @if (store.location()?.tradingArea; as area) {
            <span class="area__chip">
              <mat-icon aria-hidden="true">location_on</mat-icon>
              <span data-testid="area-public-label">{{ area.label || 'Approximate area' }}</span>
            </span>
            <span class="area__chip">
              <mat-icon aria-hidden="true">radar</mat-icon>
              {{ area.radiusKm }} km radius
            </span>
            <span class="area__chip" [class.area__chip--off]="!store.location()?.discoverable">
              <mat-icon aria-hidden="true">
                {{ store.location()?.discoverable ? 'visibility' : 'visibility_off' }}
              </mat-icon>
              {{ store.location()?.discoverable ? 'Visible on the map' : 'Hidden from the map' }}
            </span>
          } @else {
            <p class="section-muted">
              You have not set a trading area yet, so you do not appear on the map.
            </p>
          }
        </div>
        @if (!store.location()?.discoverable) {
          <p class="section-muted area__hint">
            Visibility is controlled in <a routerLink="/settings/privacy">Privacy</a> (“Show me on
            the map”).
          </p>
        }

        <app-trading-area-picker
          [value]="draft()"
          [publicLabel]="store.location()?.tradingArea?.label"
          (valueChange)="onChange($event)"
        />

        @if (error(); as message) {
          <p class="section-error" role="alert">{{ message }}</p>
        }
        <div class="section-actions">
          @if (store.location()?.tradingArea) {
            <button matButton type="button" [disabled]="busy() !== null" (click)="remove()">
              <mat-icon aria-hidden="true">location_off</mat-icon>
              Remove location
            </button>
          }
          <button
            matButton="filled"
            type="button"
            [disabled]="busy() !== null || !dirty()"
            (click)="save()"
          >
            @if (busy() === 'save') {
              <mat-spinner diameter="18" aria-hidden="true" />
            }
            Save trading area
          </button>
        </div>
      </app-section-card>
    }
  `,
  styleUrl: '../settings-section.scss',
  styles: `
    .area__status {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-3);
    }
    .area__chip {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      padding: 4px var(--spacing-3);
      border-radius: var(--radius-pill);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
    .area__chip mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .area__chip--off {
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .area__hint {
      margin-bottom: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradingAreaSettingsComponent {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(MyLocationStore);

  protected readonly loaded = signal(false);
  protected readonly busy = signal<'save' | 'remove' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly edited = signal<TradingAreaValue | null>(null);
  protected readonly draft = computed<TradingAreaValue>(() => {
    const saved = this.store.location()?.tradingArea;
    return (
      this.edited() ??
      (saved
        ? {
            lat: saved.lat,
            lng: saved.lng,
            radiusKm: saved.radiusKm,
            source: saved.source as TradingAreaSource,
          }
        : { ...DEFAULT_TRADING_CENTER, radiusKm: DEFAULT_RADIUS_KM, source: 'MANUAL' })
    );
  });
  protected readonly dirty = computed(() => {
    const saved = this.store.location()?.tradingArea;
    const edited = this.edited();
    if (!saved) {
      return true;
    }
    return (
      !!edited &&
      (edited.lat !== saved.lat || edited.lng !== saved.lng || edited.radiusKm !== saved.radiusKm)
    );
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (await this.store.load()) {
      this.edited.set(null);
      this.loaded.set(true);
    }
  }

  protected onChange(value: TradingAreaValue): void {
    this.edited.set(value);
  }

  protected async save(): Promise<void> {
    this.busy.set('save');
    this.error.set(null);
    try {
      const saved = await this.store.saveTradingArea(this.draft());
      this.edited.set(null);
      this.snackBar.open(
        `Trading area saved${saved.tradingArea?.label ? ` · ${saved.tradingArea.label}` : ''}.`,
        'OK',
        { duration: 4000 },
      );
    } catch (error) {
      this.error.set(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async remove(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: 'Remove your location?',
            message:
              'You will disappear from the map and nearby searches until you set a new trading area.',
            confirmLabel: 'Remove location',
            tone: 'danger',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    this.busy.set('remove');
    this.error.set(null);
    try {
      await this.store.removeLocation();
      this.edited.set(null);
      this.snackBar.open('Your location was removed.', 'OK', { duration: 4000 });
    } catch (error) {
      this.error.set(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
    } finally {
      this.busy.set(null);
    }
  }
}
