import { Injectable, inject, signal } from '@angular/core';
import {
  LocationService,
  MyLocationResponse,
  PrivacySettings,
  SettingsService,
  UpdateTradingAreaRequestSourceEnum,
} from '@orenji/api-client';
import { Observable, firstValueFrom } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';
import { roundCoordinate } from '../domain/location-labels';
import { TradingAreaValue } from './trading-area-picker/trading-area-picker.component';

async function call<T>(request: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(request);
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * The collector's own trading area (`/me/location`) and privacy settings, shared by onboarding
 * and settings. Writes reject with an {@link ApiError}.
 */
@Injectable({ providedIn: 'root' })
export class MyLocationStore {
  private readonly locationApi = inject(LocationService);
  private readonly settingsApi = inject(SettingsService);
  private readonly session = inject(SessionService);

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

  async saveTradingArea(area: TradingAreaValue): Promise<MyLocationResponse> {
    const location = await call(
      this.locationApi.updateMyTradingArea(
        {
          updateTradingAreaRequest: {
            lat: roundCoordinate(area.lat),
            lng: roundCoordinate(area.lng),
            radiusKm: area.radiusKm,
            source: area.source as UpdateTradingAreaRequestSourceEnum,
          },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
    this.locationState.set(location);
    void this.session.load();
    return location;
  }

  async removeLocation(): Promise<void> {
    await call(this.locationApi.deleteMyLocation('body', false, { context: silentErrors() }));
    this.locationState.set({ discoverable: this.privacyState()?.discoverable ?? false });
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
    // Discoverability changes the public point; refresh what the owner sees.
    const location = await call(
      this.locationApi.getMyLocation('body', false, { context: silentErrors() }),
    ).catch(() => null);
    if (location) {
      this.locationState.set(location);
    }
    return saved;
  }
}
