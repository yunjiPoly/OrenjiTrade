import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CatalogService,
  CollectorMarker,
  CollectorPreview,
  DiscoveryService,
  NearbyCollectorsResponse,
  PlansService,
  PublicBindersService,
} from '@orenji/api-client';
import {
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  debounceTime,
  filter,
  firstValueFrom,
  map,
  merge,
  switchMap,
} from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { limitReachedInfo } from '../../../core/limits/limit-reached';
import { DiscoveryCentreService } from '../../../shared/discovery/discovery-centre';
import { CITY_PRESETS, CityPreset, zoomForRadius } from '../../../shared/location/city-presets';
import {
  LatLng,
  MapBounds,
  MapViewport,
  circleBounds,
  distanceKm,
} from '../../../shared/map/map-adapter';
import { PlansStore } from '../../../shared/plans/plans.store';
import { DEFAULT_MAP_PARAMS, MapParams, holdersTarget } from './map-params';
import { CLUSTER_MAX_ZOOM } from './marker-clusters';
import {
  CoveredArea,
  FALLBACK_RADIUS_CAP_KM,
  NearbyQuery,
  VIEWPORT_DEBOUNCE_MS,
  chosenRadiusKm,
  filterKey,
  isCovered,
  nearbyRequest,
  queryRadiusKm,
  radiusCapKm,
  visibleRadiusKm,
} from './map-query';

/** Plan limit capping the map radius (V011 key; the contract calls it `map.radius.max`). */
export const MAP_RADIUS_LIMIT_KEY = 'map.radius.max_km';

/**
 * Where the map is centred: the signed-in collector's own trading area (the server knows it; the
 * client never reads the private centre) or a public city centre (signed-out visitors and
 * collectors without a trading area).
 */
export type AreaOrigin = 'own-area' | 'city';

export type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading'; handle: string; marker: CollectorMarker | null }
  | { kind: 'ready'; handle: string; preview: CollectorPreview }
  | { kind: 'not-found'; handle: string }
  | { kind: 'error'; handle: string; error: ApiError };

/** A request for the map canvas to move (`seq` makes repeated requests distinct). */
export interface MapViewRequest {
  seq: number;
  centre?: LatLng;
  zoom?: number;
  bounds?: MapBounds;
}

/**
 * State of the `/map` page (provided by the page): where the map is, the filters from the URL,
 * the collectors of `GET /collectors/nearby`, the "holders of X" mode and the preview card.
 *
 * Pans and zooms re-query (debounced) only when the visible area leaves the circle the last
 * answer covered; filters and the chosen radius always re-query. A 429 `LIMIT_REACHED` (radius
 * beyond the plan) opens the global limit dialog and lowers the radius to the plan's cap.
 */
@Injectable()
export class MapDiscoveryStore {
  private readonly discovery = inject(DiscoveryService);
  private readonly catalog = inject(CatalogService);
  private readonly bindersApi = inject(PublicBindersService);
  private readonly plansApi = inject(PlansService);
  private readonly plans = inject(PlansStore);
  private readonly centres = inject(DiscoveryCentreService);
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly originState = signal<AreaOrigin | null>(null);
  private readonly cityState = signal<CityPreset>(CITY_PRESETS[0]);
  private readonly signedInState = signal(false);
  private readonly paramsState = signal<MapParams>(DEFAULT_MAP_PARAMS);
  private readonly capState = signal(FALLBACK_RADIUS_CAP_KM);
  private readonly resultState = signal<NearbyCollectorsResponse | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<ApiError | null>(null);
  private readonly zoomState = signal(zoomForRadius(10));
  private readonly holdersTitleState = signal<string | null>(null);
  private readonly selectedState = signal<string | null>(null);
  private readonly previewState = signal<PreviewState>({ kind: 'idle' });
  private readonly previewBinderState = signal<string | null | undefined>(undefined);
  private readonly viewRequestState = signal<MapViewRequest | null>(null);

  /** `null` until the session is known. */
  readonly origin = this.originState.asReadonly();
  readonly city = this.cityState.asReadonly();
  readonly signedIn = this.signedInState.asReadonly();
  readonly params = this.paramsState.asReadonly();
  /** Largest radius of the caller's plan (slider bound). */
  readonly radiusCap = this.capState.asReadonly();
  /** Radius the collector chose, bounded by the plan. */
  readonly radiusKm = computed(() => chosenRadiusKm(this.paramsState().radiusKm, this.capState()));
  readonly result = this.resultState.asReadonly();
  readonly collectors = computed<readonly CollectorMarker[]>(
    () => this.resultState()?.collectors ?? [],
  );
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** Current map zoom (drives marker clustering). */
  readonly zoom = this.zoomState.asReadonly();
  readonly holders = computed(() => holdersTarget(this.paramsState()));
  /** Name of the card (or printing) in "holders of X" mode; `null` while unknown. */
  readonly holdersTitle = this.holdersTitleState.asReadonly();
  readonly selectedHandle = this.selectedState.asReadonly();
  readonly preview = this.previewState.asReadonly();
  /** First public binder of the previewed collector: `undefined` while loading, `null` if none. */
  readonly previewBinderId = this.previewBinderState.asReadonly();
  readonly viewRequest = this.viewRequestState.asReadonly();
  readonly selfId = computed(() => this.session.me()?.id ?? null);

  private viewport: MapViewport | null = null;
  private covered: CoveredArea | null = null;
  private seq = 0;
  private limitRetried = false;
  private initialised = false;
  /** Pans and zooms count once the first view is known (own area answered, or a city). */
  private followViewport = false;
  private readonly viewportChanges = new Subject<void>();
  private readonly refreshes = new Subject<boolean>();
  private previewSubscription: Subscription | null = null;
  private binderSubscription: Subscription | null = null;
  private titleSubscription: Subscription | null = null;

  constructor() {
    merge(
      this.viewportChanges.pipe(
        debounceTime(VIEWPORT_DEBOUNCE_MS),
        map(() => false),
      ),
      this.refreshes,
    )
      .pipe(
        map((force) => ({ force, query: this.currentQuery() })),
        filter(
          (entry): entry is { force: boolean; query: NearbyQuery } =>
            entry.query !== null && (entry.force || !isCovered(entry.query, this.covered)),
        ),
        switchMap(({ query }) => this.fetch(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
    this.destroyRef.onDestroy(() => {
      this.previewSubscription?.unsubscribe();
      this.binderSubscription?.unsubscribe();
      this.titleSubscription?.unsubscribe();
    });
  }

  /** Resolves who is looking (and whether they have a trading area), then loads the map. */
  async init(): Promise<void> {
    const centre = await this.centres.resolve();
    this.signedInState.set(centre.signedIn);
    const origin: AreaOrigin = centre.city ? 'city' : 'own-area';
    this.originState.set(origin);
    this.initialised = true;
    if (origin === 'city') {
      this.requestView({ centre: this.cityState().center, zoom: zoomForRadius(this.radiusKm()) });
      this.followViewport = true;
    }
    this.refreshes.next(true);
    void this.loadRadiusCap();
  }

  /** New filters from the URL. */
  setParams(next: MapParams): void {
    const previous = this.paramsState();
    this.paramsState.set(next);
    if (previous.card !== next.card || previous.printing !== next.printing) {
      this.loadHoldersTitle();
    }
    if (!this.initialised) {
      return;
    }
    const radiusChanged =
      chosenRadiusKm(previous.radiusKm, this.capState()) !==
      chosenRadiusKm(next.radiusKm, this.capState());
    const filtersChanged =
      previous.game !== next.game ||
      previous.availability !== next.availability ||
      previous.freshness !== next.freshness ||
      previous.tags.join(',') !== next.tags.join(',') ||
      previous.card !== next.card ||
      previous.printing !== next.printing;
    if (radiusChanged) {
      this.showRadius();
    } else if (filtersChanged) {
      this.refreshes.next(true);
    }
  }

  /** The map moved (pan, zoom, resize). */
  viewportChanged(viewport: MapViewport): void {
    this.zoomState.set(viewport.zoom);
    if (!this.followViewport) {
      // The map is still at its fallback position: the first view comes from the server.
      return;
    }
    this.viewport = viewport;
    this.viewportChanges.next();
  }

  retry(): void {
    this.refreshes.next(true);
  }

  /** Signed-out visitors (and collectors without a trading area) browse around a city. */
  chooseCity(city: CityPreset): void {
    this.cityState.set(city);
    this.viewport = null;
    this.requestView({ centre: city.center, zoom: zoomForRadius(this.radiusKm()) });
    this.refreshes.next(true);
  }

  /** Opens the preview card of a collector (`null` closes it). */
  select(handle: string | null): void {
    this.previewSubscription?.unsubscribe();
    this.binderSubscription?.unsubscribe();
    this.selectedState.set(handle);
    this.previewBinderState.set(undefined);
    if (!handle) {
      this.previewState.set({ kind: 'idle' });
      return;
    }
    const marker = this.collectors().find((collector) => collector.handle === handle) ?? null;
    this.previewState.set({ kind: 'loading', handle, marker });
    // Distance from the signed-in collector's own area (server side), else from the viewed centre.
    const centre =
      this.originState() === 'own-area' ? null : (this.viewport?.center ?? this.cityState().center);
    this.previewSubscription = this.discovery
      .getCollectorPreview(
        {
          handle,
          lat: centre ? Math.round(centre.lat * 100) / 100 : undefined,
          lng: centre ? Math.round(centre.lng * 100) / 100 : undefined,
        },
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({
        next: (preview) => {
          this.previewState.set({ kind: 'ready', handle, preview });
          this.loadFirstBinder(handle, preview.publicBinderCount);
          if (!marker) {
            // Chosen from the search box: bring the collector into view.
            this.requestView({ centre: preview.publicPoint, zoom: 14 });
          }
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          this.previewState.set(
            apiError.status === 404
              ? { kind: 'not-found', handle }
              : { kind: 'error', handle, error: apiError },
          );
        },
      });
  }

  retryPreview(): void {
    const state = this.previewState();
    if (state.kind !== 'idle') {
      this.select(state.handle);
    }
  }

  /**
   * Zooms into a marker cluster: to its bounds, or straight past the clustering zoom when its
   * collectors share (almost) the same public point.
   */
  zoomTo(bounds: MapBounds): void {
    const spanKm = distanceKm(
      { lat: bounds.north, lng: bounds.east },
      { lat: bounds.south, lng: bounds.west },
    );
    if (spanKm < 0.5 || this.zoomState() >= CLUSTER_MAX_ZOOM - 2) {
      this.requestView({
        centre: { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 },
        zoom: Math.max(CLUSTER_MAX_ZOOM, Math.round(this.zoomState()) + 1),
      });
      return;
    }
    this.requestView({ bounds });
  }

  private requestView(request: Omit<MapViewRequest, 'seq'>): void {
    this.viewRequestState.set({ ...request, seq: ++this.seq });
  }

  /** A new chosen radius: show the whole circle; the resulting viewport change re-queries. */
  private showRadius(): void {
    const centre = this.viewport?.center ?? this.resultState()?.center ?? this.cityState().center;
    this.requestView({ bounds: circleBounds(centre, this.radiusKm() * 1000) });
    // Fallback when the map does not move (same view): still re-query after the debounce.
    this.viewportChanges.next();
  }

  private currentQuery(): NearbyQuery | null {
    const origin = this.originState();
    if (!origin) {
      return null;
    }
    const params = this.paramsState();
    const chosen = this.radiusKm();
    const viewport = this.viewport;
    const target = holdersTarget(params);
    return {
      centre: viewport ? viewport.center : origin === 'own-area' ? null : this.cityState().center,
      radiusKm: viewport ? queryRadiusKm(visibleRadiusKm(viewport), chosen) : chosen,
      limitKm: chosen,
      game: params.game,
      availability: params.availability,
      freshness: params.freshness,
      tags: params.tags,
      cardId: target?.kind === 'card' ? target.id : null,
      printingId: target?.kind === 'printing' ? target.id : null,
    };
  }

  private fetch(query: NearbyQuery): Observable<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    return this.discovery
      .listNearbyCollectors(nearbyRequest(query), 'body', false, { context: silentErrors() })
      .pipe(
        map((response) => {
          const first = this.resultState() === null;
          this.limitRetried = false;
          this.loadingState.set(false);
          this.resultState.set(response);
          this.covered = {
            centre: response.center,
            radiusKm: response.radiusKm,
            filterKey: filterKey(query),
          };
          if (first && query.centre === null) {
            // Own trading area: the server answered with its (snapped, 2-decimal) centre.
            this.requestView({ centre: response.center, zoom: zoomForRadius(response.radiusKm) });
          }
          this.followViewport = true;
        }),
        catchError((error: unknown) => {
          this.onFetchError(toApiError(error), query);
          return EMPTY;
        }),
      );
  }

  private onFetchError(error: ApiError, query: NearbyQuery): void {
    this.loadingState.set(false);
    if (error.errorCode === 'LIMIT_REACHED' && !this.limitRetried) {
      // The global dialog explains the limit; continue with the plan's largest radius.
      this.limitRetried = true;
      const { limit } = limitReachedInfo(error);
      this.capState.set(
        limit !== null
          ? radiusCapKm(limit)
          : Math.max(1, Math.min(this.capState(), Math.floor(query.limitKm) - 1)),
      );
      this.refreshes.next(true);
      return;
    }
    if (error.status === 400 && query.centre === null) {
      // No trading area after all (removed meanwhile): fall back to a city centre.
      this.originState.set('city');
      this.requestView({ centre: this.cityState().center, zoom: zoomForRadius(this.radiusKm()) });
      this.followViewport = true;
      this.refreshes.next(true);
      return;
    }
    this.errorState.set(error);
  }

  /** The caller's `map.radius.max_km` (their plan with overrides; FREE when signed out). */
  private async radiusLimit(): Promise<{ limit: number | null | undefined } | null> {
    if (this.signedInState()) {
      try {
        const plan = await firstValueFrom(
          this.plansApi.getMyPlan('body', false, { context: silentErrors() }),
        );
        const status = plan.limits?.find((entry) => entry.key === MAP_RADIUS_LIMIT_KEY);
        return status ? { limit: status.limit } : null;
      } catch {
        return null;
      }
    }
    const plans = await this.plans.load();
    const free = plans?.find((plan) => plan.code === 'FREE') ?? plans?.[0];
    const entry = free?.limits?.find((candidate) => candidate.key === MAP_RADIUS_LIMIT_KEY);
    return entry ? { limit: entry.limit } : null;
  }

  private async loadRadiusCap(): Promise<void> {
    const before = this.radiusKm();
    const known = await this.radiusLimit();
    if (!known) {
      return;
    }
    this.capState.set(radiusCapKm(known.limit));
    if (this.radiusKm() !== before) {
      this.showRadius();
    }
  }

  private loadFirstBinder(handle: string, count: number): void {
    if (count <= 0) {
      this.previewBinderState.set(null);
      return;
    }
    this.binderSubscription = this.bindersApi
      .listCollectorBinders({ handle }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (binders) => this.previewBinderState.set(binders?.[0]?.id ?? null),
        error: () => this.previewBinderState.set(null),
      });
  }

  private loadHoldersTitle(): void {
    this.titleSubscription?.unsubscribe();
    this.holdersTitleState.set(null);
    const target = holdersTarget(this.paramsState());
    if (!target) {
      return;
    }
    const request: Observable<string> =
      target.kind === 'card'
        ? this.catalog
            .getCard({ id: target.id }, 'body', false, { context: silentErrors() })
            .pipe(map((card) => card.name ?? 'this card'))
        : this.catalog
            .getPrinting({ id: target.id }, 'body', false, { context: silentErrors() })
            .pipe(
              map((detail) => {
                const name = detail.card?.name ?? 'this card';
                const code = detail.printing?.printingCode;
                return code ? `${name} (${code})` : name;
              }),
            );
    this.titleSubscription = request.subscribe({
      next: (title) => this.holdersTitleState.set(title),
      error: () => this.holdersTitleState.set('this card'),
    });
  }
}
