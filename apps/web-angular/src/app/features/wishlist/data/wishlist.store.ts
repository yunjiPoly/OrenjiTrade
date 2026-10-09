import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlansService, WishlistItemResponse, WishlistService } from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { MyLocationStore } from '../../../shared/location/my-location.store';
import { WISH_ITEMS_LIMIT_KEY } from '../../../shared/wishlist/wishlist-form';

export type WishlistStatus = 'loading' | 'ready' | 'error';

/** The plan's `wishlist.items.max` for the usage meter (`limit: null` = unlimited). */
export interface WishUsage {
  used: number;
  limit: number | null;
  planName: string | null;
}

/**
 * Whether wishlist alerts can reach the collector: alerts go to collectors of the lister's
 * platform region (ADR 0017), so the collector needs a country and a state or province. `unknown`
 * until `GET /me/location` answers.
 */
export type AlertReadiness = 'unknown' | 'ready' | 'no-location';

/**
 * The caller's wishlist (`GET /wishlist`, newest first) with its actions: add/replace after the
 * dialog, remove (`DELETE /wishlist/{id}`), the plan usage (`GET /me/plan`, `wishlist.items.max`),
 * the location behind the alerts and the "Let others see what you want" switch (privacy setting
 * `wishlistVisible`, saved through the shared {@link MyLocationStore}). Every realtime
 * reconnection quietly re-reads the list.
 *
 * Provided by the wishlist page.
 */
@Injectable()
export class WishlistStore {
  private readonly api = inject(WishlistService);
  private readonly plansApi = inject(PlansService);
  private readonly myLocation = inject(MyLocationStore);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly itemsState = signal<WishlistItemResponse[]>([]);
  private readonly statusState = signal<WishlistStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly usageState = signal<WishUsage | null>(null);
  private readonly busyState = signal<ReadonlySet<string>>(new Set());
  private readonly settingsLoaded = signal(false);
  private readonly visibilitySaving = signal(false);

  readonly items = this.itemsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly usage = this.usageState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  /** Whether listings of the region can alert the collector (a location is set). */
  readonly readiness = computed<AlertReadiness>(() => {
    if (!this.settingsLoaded()) {
      return 'unknown';
    }
    return this.myLocation.location()?.location ? 'ready' : 'no-location';
  });
  /** The `wishlistVisible` privacy setting; `null` until known. */
  readonly visible = computed(() =>
    this.settingsLoaded() ? (this.myLocation.privacy()?.wishlistVisible ?? false) : null,
  );
  readonly savingVisibility = this.visibilitySaving.asReadonly();

  private loadSubscription: Subscription | null = null;
  private started = false;

  /** First load and live wiring; idempotent. */
  init(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.load();
    void this.loadUsage();
    void this.loadSettings();
    this.realtime.resync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refresh());
    this.destroyRef.onDestroy(() => this.loadSubscription?.unsubscribe());
  }

  /** (Re)loads the list, showing the skeleton. */
  load(): void {
    this.loadSubscription?.unsubscribe();
    this.statusState.set('loading');
    this.errorState.set(null);
    this.loadSubscription = this.api
      .listWishlist('body', false, { context: silentErrors() })
      .subscribe({
        next: (items) => {
          this.itemsState.set(items ?? []);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          this.errorState.set(toApiError(error));
          this.statusState.set('error');
        },
      });
  }

  /** Quietly re-reads the list; keeps what is shown on failure. */
  async refresh(): Promise<void> {
    if (this.statusState() !== 'ready') {
      if (this.statusState() === 'error') {
        this.load();
      }
      return;
    }
    try {
      const items = await firstValueFrom(
        this.api.listWishlist('body', false, { context: silentErrors() }),
      );
      this.itemsState.set(items ?? []);
    } catch {
      // Keep the current list; the next reconnection tries again.
    }
  }

  find(id: string | null | undefined): WishlistItemResponse | null {
    return id ? (this.itemsState().find((item) => item.id === id) ?? null) : null;
  }

  /** A wish created or edited in the dialog: replaced in place, or added on top. */
  upsert(item: WishlistItemResponse): void {
    const exists = this.itemsState().some((candidate) => candidate.id === item.id);
    this.itemsState.update((items) =>
      exists
        ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
        : [item, ...items],
    );
    if (!exists) {
      void this.loadUsage();
    }
  }

  /** Removes a wish; rejects with an `ApiError`. */
  async remove(item: WishlistItemResponse): Promise<void> {
    this.setBusy(item.id, true);
    try {
      await firstValueFrom(
        this.api.deleteWishlistItem({ id: item.id }, 'body', false, { context: silentErrors() }),
      );
      this.itemsState.update((items) => items.filter((candidate) => candidate.id !== item.id));
      void this.loadUsage();
    } catch (error) {
      throw toApiError(error);
    } finally {
      this.setBusy(item.id, false);
    }
  }

  /** "Let others see what you want" (`wishlistVisible`); rejects with an `ApiError`. */
  async setVisible(visible: boolean): Promise<void> {
    const privacy = this.myLocation.privacy();
    if (!privacy || this.visibilitySaving()) {
      return;
    }
    this.visibilitySaving.set(true);
    try {
      await this.myLocation.savePrivacy({ ...privacy, wishlistVisible: visible });
    } finally {
      this.visibilitySaving.set(false);
    }
  }

  /** The location (alert readiness) and the privacy settings (wishlist visibility). */
  async loadSettings(): Promise<void> {
    if (await this.myLocation.load()) {
      this.settingsLoaded.set(true);
    }
  }

  /** The plan usage of `wishlist.items.max`; `null` when unknown. */
  async loadUsage(): Promise<void> {
    try {
      const plan = await firstValueFrom(
        this.plansApi.getMyPlan('body', false, { context: silentErrors() }),
      );
      const status = plan.limits?.find((entry) => entry.key === WISH_ITEMS_LIMIT_KEY);
      this.usageState.set(
        status
          ? {
              used: status.used ?? 0,
              limit: status.limit ?? null,
              planName: plan.plan?.name ?? null,
            }
          : null,
      );
    } catch {
      // The meter is optional.
    }
  }

  private setBusy(id: string, busy: boolean): void {
    this.busyState.update((ids) => {
      const next = new Set(ids);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}
