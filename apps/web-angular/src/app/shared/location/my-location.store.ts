import { Injectable, inject, signal } from '@angular/core';
import {
  LocationService,
  MyLocationResponse,
  PrivacySettings,
  SettingsService,
} from '@orenji/api-client';
import { Observable, firstValueFrom } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';
import { RegionContext } from '../../core/region/region-context.service';

async function call<T>(request: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(request);
  } catch (error) {
    throw toApiError(error);
  }
}

/** What the collector declares (ADR 0017): no coordinate, ever. */
export interface LocationDraft {
  countryCode: string;
  subdivisionCode: string;
  /** Optional; shown only on the collector's own public profile while `showCity` is on. */
  city: string;
  showCity: boolean;
}

/** Longest city the API accepts (after trimming). */
export const CITY_MAX_LENGTH = 80;

/**
 * The collector's own location (`/me/location`: country, state/province, optional city) and
 * privacy settings, shared by onboarding and settings. Writes reject with an {@link ApiError}.
 */
@Injectable({ providedIn: 'root' })
export class MyLocationStore {
  private readonly locationApi = inject(LocationService);
  private readonly settingsApi = inject(SettingsService);
  private readonly session = inject(SessionService);
  private readonly region = inject(RegionContext);

  private readonly locationState = signal<MyLocationResponse | null>(null);
  private readonly privacyState = signal<PrivacySettings | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<ApiError | null>(null);

  readonly location = this.locationState.asReadonly();
  readonly privacy = this.privacyState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Loads location and privacy together; resolves false (and sets `error`) on failure. */
  async load(): Promise<boolean> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const [location, privacy] = await Promise.all([
        call(this.locationApi.getMyLocation('body', false, { context: silentErrors() })),
        call(this.settingsApi.getPrivacySettings('body', false, { context: silentErrors() })),
      ]);
      this.locationState.set(location);
      this.privacyState.set(privacy);
      return true;
    } catch (error) {
      this.errorState.set(error as ApiError);
      return false;
    } finally {
      this.loadingState.set(false);
    }
  }

  async saveLocation(draft: LocationDraft): Promise<MyLocationResponse> {
    const city = draft.city.trim();
    const saved = await call(
      this.locationApi.updateMyLocation(
        {
          updateLocationRequest: {
            countryCode: draft.countryCode,
            subdivisionCode: draft.subdivisionCode,
            city: city === '' ? null : city,
            showCity: draft.showCity,
          },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
    this.locationState.set(saved);
    this.region.applyHome(saved.location?.regionCode ?? null);
    void this.session.load();
    return saved;
  }

  /** Removes the location; the server also turns discoverability off. */
  async removeLocation(): Promise<void> {
    await call(this.locationApi.deleteMyLocation('body', false, { context: silentErrors() }));
    this.locationState.set({ discoverable: false });
    const privacy = this.privacyState();
    if (privacy) {
      this.privacyState.set({ ...privacy, discoverable: false });
    }
    this.region.applyHome(null);
    void this.session.load();
  }

  /** Saves the complete privacy settings (the endpoint replaces every field). */
  async savePrivacy(settings: PrivacySettings): Promise<PrivacySettings> {
    const saved = await call(
      this.settingsApi.updatePrivacySettings({ privacySettings: settings }, 'body', false, {
        context: silentErrors(),
      }),
    );
    this.privacyState.set(saved);
    const location = this.locationState();
    if (location) {
      this.locationState.set({ ...location, discoverable: saved.discoverable });
    }
    return saved;
  }
}

/** The draft of a saved location, or null without one. */
export function draftOf(response: MyLocationResponse | null): LocationDraft | null {
  const location = response?.location;
  if (!location) {
    return null;
  }
  return {
    countryCode: location.countryCode,
    subdivisionCode: location.subdivisionCode,
    city: location.city ?? '',
    showCity: location.showCity,
  };
}

/** Same declared location (city compared after trimming). */
export function sameLocation(a: LocationDraft | null, b: LocationDraft | null): boolean {
  if (!a || !b) {
    return a === b;
  }
  return (
    a.countryCode === b.countryCode &&
    a.subdivisionCode === b.subdivisionCode &&
    a.city.trim() === b.city.trim() &&
    a.showCity === b.showCity
  );
}

/** Complete enough to save: a country, one of its subdivisions and a short enough city. */
export function isCompleteDraft(draft: LocationDraft | null): draft is LocationDraft {
  return (
    !!draft &&
    draft.countryCode !== '' &&
    draft.subdivisionCode !== '' &&
    draft.city.trim().length <= CITY_MAX_LENGTH
  );
}
