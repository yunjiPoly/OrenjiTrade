import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LocationService,
  MyLocationResponse,
  PlansService,
  WishlistItemResponse,
  WishlistService,
} from '@orenji/api-client';
import { Subscription, filter, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { WISH_ITEMS_LIMIT_KEY } from '../../../shared/wishlist/wishlist-form';

export type WishlistStatus = 'loading' | 'ready' | 'error';
export type WishFilter = 'all' | 'matches' | 'paused';

/** The plan's `wishlist.items.max` for the usage meter (`limit: null` = unlimited). */
export interface WishUsage {
  used: number;
  limit: number | null;
  planName: string | null;
}

/**
 * Whether the collector can get matches: the matcher measures distances between approximate
 * public points, and the API keeps one only for a discoverable collector with a trading area.
 * `unknown` until `GET /me/location` answers.
 */
export type MatchReadiness = 'unknown' | 'ready' | 'no-area' | 'hidden';

export function matchReadiness(location: MyLocationResponse | null | undefined): MatchReadiness {
  if (!location) {
    return 'unknown';
  }
  if (!location.tradingArea) {
    return 'no-area';
  }
  return location.discoverable && location.publicPoint ? 'ready' : 'hidden';
}

/** Wishes shown by a filter: all, those with matches nearby, or the paused ones. */
export function filterWishes(
  items: readonly WishlistItemResponse[],
  wishFilter: WishFilter,
): WishlistItemResponse[] {
  switch (wishFilter) {
    case 'matches':
      return items.filter((item) => item.matchCount > 0);
    case 'paused':
      return items.filter((item) => !item.active);
    default:
      return [...items];
  }
}

/**
 * The caller's wishlist (`GET /wishlist`, newest first) with its actions: add/replace after the
 * dialog, alerts on/off (`PATCH /wishlist/{id}` `{active}`, optimistic), remove
 * (`DELETE /wishlist/{id}`), and the plan usage (`GET /me/plan`, `wishlist.items.max`).
 * A pushed WISHLIST_MATCH notification and every realtime reconnection quietly re-read the list
 * so match counts stay live.
 *
 * Provided by the wishlist page.
 */
@Injectable()
export class WishlistStore {
  private readonly api = inject(WishlistService);
  private readonly plansApi = inject(PlansService);
  private readonly locationApi = inject(LocationService);
  private readonly center = inject(NotificationCenter);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly itemsState = signal<WishlistItemResponse[]>([]);
  private readonly statusState = signal<WishlistStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly usageState = signal<WishUsage | null>(null);
  private readonly filterState = signal<WishFilter>('all');
  private readonly busyState = signal<ReadonlySet<string>>(new Set());
  private readonly locationState = signal<MyLocationResponse | null>(null);

  readonly items = this.itemsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly usage = this.usageState.asReadonly();
  readonly filter = this.filterState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  /** Whether new listings nearby can match (trading area + discoverable). */
  readonly readiness = computed(() => matchReadiness(this.locationState()));
  readonly visible = computed(() => filterWishes(this.itemsState(), this.filterState()));
  readonly counts = computed(() => {
    const items = this.itemsState();
    return {
      all: items.length,
      matches: items.filter((item) => item.matchCount > 0).length,
      paused: items.filter((item) => !item.active).length,
    };
  });
  /** Matches across active wishes. */
  readonly totalMatches = computed(() =>
    this.itemsState().reduce((sum, item) => sum + (item.active ? item.matchCount : 0), 0),
  );

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
    void this.loadLocation();
    this.center.pushed$
      .pipe(
        filter((notification) => notification.type === 'WISHLIST_MATCH'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.refresh());
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

  /** Quietly re-reads the list (live match counts); keeps what is shown on failure. */
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
      // Keep the current list; the next push or reconnection tries again.
    }
  }

  setFilter(value: WishFilter): void {
    this.filterState.set(value);
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

  /** Alerts on/off (optimistic); rejects with an `ApiError` after restoring the wish. */
  async setActive(item: WishlistItemResponse, active: boolean): Promise<WishlistItemResponse> {
    this.replace({ ...item, active });
    this.setBusy(item.id, true);
    try {
      const saved = await firstValueFrom(
        this.api.updateWishlistItem(
          { id: item.id, updateWishlistItemRequest: { active } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.replace(saved);
      return saved;
    } catch (error) {
      this.replace(item);
      throw toApiError(error);
    } finally {
      this.setBusy(item.id, false);
    }
  }

  /** Removes a wish (and its matches); rejects with an `ApiError`. */
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

  /** The caller's location state (trading area, discoverable) behind {@link readiness}. */
  async loadLocation(): Promise<void> {
    try {
      this.locationState.set(
        await firstValueFrom(
          this.locationApi.getMyLocation('body', false, { context: silentErrors() }),
        ),
      );
    } catch {
      // The hint is optional; matching itself is unaffected.
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

  private replace(item: WishlistItemResponse): void {
    this.itemsState.update((items) =>
      items.map((candidate) => (candidate.id === item.id ? item : candidate)),
    );
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
