import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { DEFAULT_REGION, REGION_CODE } from '../../shared/regions/regions.store';

/** localStorage key of the region a signed-out visitor browses. */
export const REGION_STORAGE_KEY = 'orenji.region';

function isRegionCode(value: string | null | undefined): value is string {
  return !!value && value.length <= 32 && REGION_CODE.test(value);
}

/**
 * The platform region the app is browsing (ADR 0017); every region-scoped call (search, card
 * holders, suggestions, ads, the map) sends it as `region`.
 *
 * - Signed in: the collector's home region (`homeRegion` of `GET /me`), applied when the session
 *   loads and whenever the location changes; the switcher can browse another region meanwhile.
 * - Signed out: the last region chosen on this browser (localStorage), else `americas-north`.
 */
@Injectable({ providedIn: 'root' })
export class RegionContext {
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(SessionService);

  private readonly storage = this.resolveStorage();
  private readonly currentState = signal(this.readStored() ?? DEFAULT_REGION);
  private readonly homeState = signal<string | null>(null);
  private signedIn = false;

  readonly current = this.currentState.asReadonly();
  /** Home region of the signed-in collector; null when signed out or without a location. */
  readonly home = this.homeState.asReadonly();
  readonly browsingAway = computed(() => {
    const home = this.homeState();
    return home !== null && home !== this.currentState();
  });

  constructor() {
    effect(() => {
      const status = this.session.status();
      const home = this.session.me()?.homeRegion ?? null;
      untracked(() => {
        if (status === 'ready') {
          this.signedIn = true;
          if (home !== this.homeState()) {
            this.applyHome(isRegionCode(home) ? home : null);
          }
        } else if (status === 'anonymous' && this.signedIn) {
          this.signedIn = false;
          this.homeState.set(null);
          this.currentState.set(this.readStored() ?? DEFAULT_REGION);
        }
      });
    });
  }

  /** Browses another region (the switcher, a `?region=` link). Ignores malformed codes. */
  select(code: string): void {
    if (!isRegionCode(code)) {
      return;
    }
    this.currentState.set(code);
    if (!this.signedIn) {
      try {
        this.storage?.setItem(REGION_STORAGE_KEY, code);
      } catch {
        // Storage may be unavailable (private mode, quota); the in-memory state still works.
      }
    }
  }

  /** The collector's home region is known or changed: the app follows it. */
  applyHome(code: string | null): void {
    this.homeState.set(code);
    if (code) {
      this.currentState.set(code);
    }
  }

  private readStored(): string | null {
    try {
      const stored = this.storage?.getItem(REGION_STORAGE_KEY) ?? null;
      return isRegionCode(stored) ? stored : null;
    } catch {
      return null;
    }
  }

  private resolveStorage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
