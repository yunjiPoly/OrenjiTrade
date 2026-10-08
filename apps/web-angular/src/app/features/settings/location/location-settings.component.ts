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
import { LocationFieldsComponent } from '../../../shared/location/location-fields/location-fields.component';
import {
  LocationDraft,
  MyLocationStore,
  draftOf,
  isCompleteDraft,
  sameLocation,
} from '../../../shared/location/my-location.store';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

/**
 * Settings → Location (ADR 0017): the country, state/province and optional city the collector
 * declares, with what others see and the removal. No map, no GPS, no coordinates.
 */
@Component({
  selector: 'app-location-settings',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    LocationFieldsComponent,
    SectionCardComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    @if (!loaded() && store.error(); as error) {
      <app-error-state
        title="We could not load your location"
        [message]="error.message"
        [requestId]="error.requestId"
        (retry)="load()"
      />
    } @else if (!loaded()) {
      <div class="section-skeleton" aria-busy="true">
        <span class="visually-hidden">Loading your location</span>
        <app-skeleton height="240px" />
      </div>
    } @else {
      <app-section-card
        heading="Location"
        headingId="location-heading"
        description="Your country and state or province decide your region and where your binders appear on the map. Others never see more than your state or province (and your city on your profile, if you choose)."
      >
        <div class="location__status">
          @if (store.location()?.location; as location) {
            <span class="location__chip" data-testid="location-label">
              <mat-icon aria-hidden="true">location_on</mat-icon>
              {{ location.label }}
            </span>
            <span class="location__chip">
              <mat-icon aria-hidden="true">public</mat-icon>
              {{ location.regionName }}
            </span>
            <span
              class="location__chip"
              [class.location__chip--off]="!store.location()?.discoverable"
            >
              <mat-icon aria-hidden="true">
                {{ store.location()?.discoverable ? 'visibility' : 'visibility_off' }}
              </mat-icon>
              {{ store.location()?.discoverable ? 'Visible on the map' : 'Hidden from the map' }}
            </span>
          } @else {
            <p class="section-muted" data-testid="location-none">
              You have not said where you are yet, so you do not appear on the map.
            </p>
          }
        </div>
        @if (!store.location()?.discoverable) {
          <p class="section-muted location__hint">
            Visibility is controlled in <a routerLink="/settings/privacy">Privacy</a> (“Show me on
            the map”).
          </p>
        }

        <app-location-fields
          [value]="draft()"
          [showErrors]="submitted()"
          (valueChange)="edited.set($event)"
        />

        @if (error(); as message) {
          <p class="section-error" role="alert">{{ message }}</p>
        }
        <div class="section-actions">
          @if (store.location()?.location) {
            <button matButton type="button" [disabled]="busy() !== null" (click)="remove()">
              <mat-icon aria-hidden="true">location_off</mat-icon>
              Remove location
            </button>
          }
          <button
            matButton="filled"
            type="button"
            data-testid="location-save"
            [disabled]="busy() !== null || !dirty()"
            (click)="save()"
          >
            @if (busy() === 'save') {
              <mat-spinner diameter="18" aria-hidden="true" />
            }
            Save location
          </button>
        </div>
      </app-section-card>
    }
  `,
  styleUrl: '../settings-section.scss',
  styles: `
    .location__status {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-3);
    }
    .location__chip {
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
    .location__chip mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .location__chip--off {
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .location__hint {
      margin-bottom: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationSettingsComponent {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(MyLocationStore);

  protected readonly loaded = signal(false);
  protected readonly busy = signal<'save' | 'remove' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly edited = signal<LocationDraft | null>(null);
  protected readonly saved = computed(() => draftOf(this.store.location()));
  protected readonly draft = computed(() => this.edited() ?? this.saved());
  protected readonly dirty = computed(() => {
    const edited = this.edited();
    return !!edited && !sameLocation(edited, this.saved());
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

  protected async save(): Promise<void> {
    this.submitted.set(true);
    const draft = this.draft();
    if (!isCompleteDraft(draft)) {
      return;
    }
    this.busy.set('save');
    this.error.set(null);
    try {
      const saved = await this.store.saveLocation(draft);
      this.edited.set(null);
      this.submitted.set(false);
      this.snackBar.open(
        `Location saved${saved.location ? ` · ${saved.location.label}` : ''}.`,
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
              'You will disappear from the map and from searches in your region until you choose a location again.',
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
