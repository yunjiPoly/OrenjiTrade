import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { MyLocationStore } from '../location/my-location.store';
import type { ViewerPlace } from './who-has/holder-groups';

/**
 * The viewer's declared state or province and country (ADR 0017: a place they typed, never a
 * position), for "Your province" on Search's state list, the map's teal outline and "Quebec · your
 * province" on Who has this card. Read once from `GET /me/location` while signed in; nulls for a
 * guest or a collector without a location.
 */
@Injectable({ providedIn: 'root' })
export class ViewerPlaceService {
  private readonly session = inject(SessionService);
  private readonly locations = inject(MyLocationStore);
  private asked = false;

  readonly place = computed<ViewerPlace>(() => {
    const location = this.session.status() === 'ready' ? this.locations.location()?.location : null;
    return {
      subdivisionCode: location?.subdivisionCode ?? null,
      countryCode: location?.countryCode ?? null,
    };
  });

  constructor() {
    effect(() => {
      const status = this.session.status();
      untracked(() => {
        if (status !== 'ready') {
          this.asked = false;
          return;
        }
        if (!this.asked && !this.locations.location() && !this.locations.loading()) {
          this.asked = true;
          void this.locations.load();
        }
      });
    });
  }
}
