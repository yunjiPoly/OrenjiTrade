import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { CITY_PRESETS, CityPreset } from '../location/city-presets';

/**
 * Centre of a geographic search. Signed-in collectors with a trading area send none: the server
 * uses their area (the client never reads its private centre). Everyone else searches around a
 * public city centre (Montréal, the launch city).
 */
export interface DiscoveryCentre {
  signedIn: boolean;
  /** `null` = the caller's own trading area. */
  city: CityPreset | null;
}

@Injectable({ providedIn: 'root' })
export class DiscoveryCentreService {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);

  async resolve(): Promise<DiscoveryCentre> {
    await this.auth.ready();
    const status = this.auth.isAuthenticated() ? await this.session.ensureLoaded() : 'anonymous';
    const me = status === 'ready' ? this.session.me() : null;
    return {
      signedIn: !!me,
      city: me?.onboarding?.tradingAreaSet ? null : CITY_PRESETS[0],
    };
  }
}
