import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { MyLocationStore } from '../location/my-location.store';
import type { ViewerPlace } from './who-has/holder-groups';

/**
 * The viewer's declared state or province and country (ADR 0017: a place they typed, never a
 * position), for "Your province" on Search's state list, the map's teal outline and "Quebec · your
 * province" on Who has this card. Read from `GET /me/location` once per signed-in account (the
 * store forgets the previous account's location, WD review P1); nulls for a guest or a collector
 * without a location.
 */
@Injectable({ providedIn: 'root' })
export class ViewerPlaceService {
  private readonly session = inject(SessionService);
  private readonly locations = inject(MyLocationStore);
  /** The account whose location was asked for. */
  private askedFor: string | null = null;

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
      const account = this.session.me()?.id ?? null;
      untracked(() => {
        if (status !== 'ready' || !account) {
          this.askedFor = null;
          return;
        }
        if (this.askedFor !== account) {
          this.askedFor = account;
          // Settings may have loaded it for this account already; otherwise ask (once).
          if (!this.locations.location() && !this.locations.loading()) {
            void this.locations.load();
          }
        }
      });
    });
  }
}
