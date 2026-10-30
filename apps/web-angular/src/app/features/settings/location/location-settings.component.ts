import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggle, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { isApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { LocationFieldsComponent } from '../../../shared/location/location-fields/location-fields.component';
import { RegionsStore } from '../../../shared/regions/regions.store';
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
 * Settings › Location (ADR 0017; spec 13, board W25): "Show me on the map" (409
 * LOCATION_REQUIRED answered in place), the country, state or province and optional city the
 * collector declares with "Show my city on my profile", what others see, how OrenjiTrade protects
 * where you live, "Remove my location" and Save. No map, no GPS, no coordinates.
 */
@Component({
  selector: 'app-location-settings',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    ShellIconComponent,
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
        description="Collectors find your binders by state or province. You choose it; the app never locates you."
      >
        <div class="loc__map" data-testid="location-discoverable">
          <span class="loc__map-icon" aria-hidden="true"
            ><app-shell-icon name="map" [size]="20"
          /></span>
          <div class="loc__map-text">
            <span class="loc__map-title" id="location-map-label">Show me on the map</span>
            <span class="loc__map-line" id="location-map-line">
              @if (!store.location()?.location) {
                Choose your country and state or province first. You need a location to show on the
                map.
              } @else if (store.location()?.discoverable) {
                Collectors see you in {{ store.location()?.location?.label }}. Visitors without an
                account see your cards, never your name.
              } @else {
                You are hidden from the map. Turn it on so collectors of your region find your
                binders.
              }
            </span>
          </div>
          <!-- disabledInteractive: the switch keeps the focus while it saves (A4). -->
          <mat-slide-toggle
            data-testid="location-map-switch"
            [checked]="!!store.location()?.discoverable"
            [disabled]="mapBusy() || !store.privacy()"
            disabledInteractive
            aria-labelledby="location-map-label"
            aria-describedby="location-map-line"
            (change)="setDiscoverable($event.checked, $event.source)"
          />
        </div>
        @if (mapError(); as message) {
          <p class="section-error" role="alert">{{ message }}</p>
        }

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
            <p class="section-muted" data-testid="location-none" tabindex="-1">
              You have not said where you are yet, so you do not appear on the map.
            </p>
          }
        </div>

        <h3 class="loc__label">Where you ship from</h3>
        <app-location-fields
          settingsLayout
          [onMap]="!!store.location()?.discoverable"
          [value]="draft()"
          [showErrors]="submitted()"
          (valueChange)="edited.set($event)"
        />

        @if (preview(); as place) {
          <h3 class="loc__label">What others see</h3>
          @if (place.hidden) {
            <p class="loc__hidden" data-testid="location-others-hidden">
              While you are hidden from the map, nobody sees your state, province or city.
            </p>
          } @else {
            <ul class="loc__others" aria-label="What others see" data-testid="location-others">
              <li>
                <span class="loc__who">
                  <span class="loc__name">{{ session.handle() }}</span>
                  <span class="loc__place">{{ place.subdivisionName }}</span>
                </span>
                <span class="loc__where">Members, in search, binders and chats</span>
              </li>
              <li>
                <span class="loc__who">
                  <span class="loc__name">{{ session.displayName() }}</span>
                  <span class="loc__place" data-testid="location-others-profile">{{
                    place.profilePlace
                  }}</span>
                </span>
                <span class="loc__where">Your profile</span>
              </li>
              <li>
                <span class="loc__who">
                  <span class="loc__name">A collector</span>
                  <span class="loc__place">{{ place.subdivisionName }}</span>
                </span>
                <span class="loc__where">Visitors without an account</span>
              </li>
            </ul>
          }
        }

        <section class="loc__protect" aria-labelledby="location-protect">
          <h3 class="loc__protect-title" id="location-protect">
            <app-shell-icon name="shieldCheck" [size]="18" />
            How OrenjiTrade protects where you live
          </h3>
          <ul>
            <li>
              You choose your country and state or province. Never an address, and the app never
              uses GPS.
            </li>
            <li>The map counts binders per state or province: no pin, no point, no distance.</li>
            <li>
              Your city is optional and only on your profile. Search, binders, chats and the map
              never show it.
            </li>
          </ul>
        </section>

        @if (error(); as message) {
          <p class="section-error" role="alert">{{ message }}</p>
        }
        <div class="loc__actions">
          @if (store.location()?.location) {
            <button
              type="button"
              class="loc__remove"
              [disabled]="busy() !== null"
              (click)="remove()"
            >
              Remove my location
            </button>
          }
          <span class="loc__spacer"></span>
          <span class="loc__state" aria-live="polite">{{
            dirty() ? 'Unsaved changes' : 'No changes yet'
          }}</span>
          <button
            matButton="filled"
            type="button"
            data-testid="location-save"
            [disabled]="busy() !== null || !dirty()"
            disabledInteractive
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
    .loc__map {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
      padding: 16px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-surface-variant);
    }
    .loc__map-icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--color-accent-tint);
      color: var(--color-accent);
    }
    .loc__map-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .loc__map-title {
      font-weight: var(--font-weight-semibold);
    }
    .loc__map-line {
      color: var(--color-text-secondary);
      font-size: 14px;
    }
    .loc__label {
      margin: 24px 0 12px;
      color: var(--color-text-secondary);
      font-family: var(--font-body);
      font-size: 12px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .loc__others {
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      list-style: none;
    }
    .loc__others li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 4px 12px;
      padding: 12px 16px;
    }
    .loc__others li + li {
      border-top: 1px solid var(--color-border);
    }
    .loc__who {
      display: flex;
      flex-direction: column;
    }
    .loc__name {
      font-weight: var(--font-weight-semibold);
    }
    .loc__place,
    .loc__where {
      color: var(--color-text-secondary);
      font-size: 13px;
    }
    .loc__hidden {
      margin: 0;
      padding: 12px 16px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      color: var(--color-text-secondary);
      font-size: 14px;
    }
    .loc__protect {
      margin-top: 24px;
      padding: 16px 20px;
      border: 1px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
      border-radius: 14px;
      background: color-mix(in srgb, var(--color-accent) 7%, transparent);
    }
    .loc__protect-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 8px;
      font-family: var(--font-body);
      font-size: 15px;
      font-weight: var(--font-weight-semibold);
    }
    .loc__protect-title app-shell-icon {
      color: var(--color-accent);
    }
    .loc__protect ul {
      margin: 0;
      padding-left: 28px;
      color: var(--color-text-secondary);
      font-size: 14px;
      line-height: 1.6;
    }
    .loc__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--color-border);
    }
    .loc__spacer {
      flex: 1;
    }
    .loc__remove {
      padding: 6px 0;
      border: 0;
      background: none;
      color: var(--color-danger);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .loc__state {
      color: var(--color-text-muted);
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationSettingsComponent {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(MyLocationStore);
  protected readonly session = inject(SessionService);
  private readonly regions = inject(RegionsStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly mapBusy = signal(false);
  protected readonly mapError = signal<string | null>(null);

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

  /**
   * "What others see", following the form (an unsaved state shows what saving it would show): your
   * handle with the state or province (members), your name with the city only while you show it
   * (your profile), "A collector" with the state (visitors). While you are hidden from the map, no
   * one sees any of it (the API returns no place: P3), said in one line instead.
   */
  protected readonly preview = computed(() => {
    const draft = this.draft();
    const entry = this.regions.subdivision(draft?.subdivisionCode);
    if (!draft || !entry) {
      return null;
    }
    const subdivisionName = entry.subdivision.wholeCountry
      ? entry.country.name
      : entry.subdivision.name;
    const city = draft.city.trim();
    return {
      hidden: !this.store.location()?.discoverable,
      subdivisionName,
      profilePlace: draft.showCity && city ? `${city}, ${subdivisionName}` : subdivisionName,
    };
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

  /**
   * "Show me on the map" (spec 13): saved at once; without a location the API answers 409
   * LOCATION_REQUIRED, said in place and the switch goes back.
   */
  protected async setDiscoverable(on: boolean, toggle: MatSlideToggle): Promise<void> {
    const privacy = this.store.privacy();
    if (!privacy) {
      return;
    }
    this.mapBusy.set(true);
    this.mapError.set(null);
    try {
      await this.store.savePrivacy({ ...privacy, discoverable: on });
    } catch (error) {
      toggle.checked = !on;
      this.mapError.set(
        isApiError(error) && error.errorCode === 'LOCATION_REQUIRED'
          ? 'Choose your country and your state or province first, then turn this on.'
          : isApiError(error)
            ? friendlyMessage(error)
            : 'Your change could not be saved.',
      );
    } finally {
      this.mapBusy.set(false);
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
      // "Remove my location" goes away with the location: the focus moves to the line saying so.
      afterNextRender(
        () =>
          this.host.nativeElement
            .querySelector<HTMLElement>('[data-testid="location-none"]')
            ?.focus(),
        { injector: this.injector },
      );
    } catch (error) {
      this.error.set(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
    } finally {
      this.busy.set(null);
    }
  }
}
