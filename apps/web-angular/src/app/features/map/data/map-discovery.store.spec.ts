import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CatalogService,
  DiscoveryService,
  ListNearbyCollectorsRequestParams,
  NearbyCollectorsResponse,
  PlansService,
  PublicBindersService,
} from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { toApiError } from '../../../core/http/api-error';
import { DiscoveryCentreService } from '../../../shared/discovery/discovery-centre';
import { CITY_PRESETS } from '../../../shared/location/city-presets';
import { PlansStore } from '../../../shared/plans/plans.store';
import { MapDiscoveryStore } from './map-discovery.store';
import { DEFAULT_MAP_PARAMS, parseMapParams } from './map-params';
import { VIEWPORT_DEBOUNCE_MS } from './map-query';
import { collector, preview } from './testing/collector-fixtures';

const CARD = '69c8ee73-9bf6-42e2-9178-a00582a544e5';

function answer(
  params: ListNearbyCollectorsRequestParams,
  collectors = [collector('maika')],
): NearbyCollectorsResponse {
  return {
    center:
      params.lat !== undefined
        ? { lat: params.lat, lng: params.lng ?? 0 }
        : { lat: 45.52, lng: -73.58 },
    radiusKm: params.radiusKm ?? 10,
    collectors,
    total: collectors.length,
    truncated: false,
  };
}

function httpError(status: number, body: Record<string, unknown>) {
  return toApiError(new HttpErrorResponse({ status, error: body }));
}

describe('MapDiscoveryStore', () => {
  let store: MapDiscoveryStore;
  let nearby: ReturnType<typeof vi.fn>;
  let previewApi: ReturnType<typeof vi.fn>;
  let binders: ReturnType<typeof vi.fn>;
  let getCard: ReturnType<typeof vi.fn>;
  let myPlan: ReturnType<typeof vi.fn>;
  let centre: { signedIn: boolean; city: (typeof CITY_PRESETS)[number] | null };

  function setup(options: { signedIn: boolean; ownArea: boolean; planLimit?: number | null }) {
    centre = { signedIn: options.signedIn, city: options.ownArea ? null : CITY_PRESETS[0] };
    nearby = vi.fn((params: ListNearbyCollectorsRequestParams) => of(answer(params)));
    previewApi = vi.fn(() => of(preview('maika', { publicBinderCount: 2 })));
    binders = vi.fn(() => of([{ id: 'b1' }, { id: 'b2' }]));
    getCard = vi.fn(() =>
      of({
        id: CARD,
        name: 'Azure-Eyes Sky Dragon',
        game: 'yugioh',
        primaryImageUrl: 'http://localhost:8080/api/v1/public/card-images/img-1',
        printings: [],
      }),
    );
    myPlan = vi.fn(() =>
      of({ limits: [{ key: 'map.radius.max_km', limit: options.planLimit ?? 25 }] }),
    );
    TestBed.configureTestingModule({
      providers: [
        MapDiscoveryStore,
        {
          provide: DiscoveryService,
          useValue: { listNearbyCollectors: nearby, getCollectorPreview: previewApi },
        },
        { provide: PublicBindersService, useValue: { listCollectorBinders: binders } },
        { provide: CatalogService, useValue: { getCard, getPrinting: vi.fn() } },
        { provide: PlansService, useValue: { getMyPlan: myPlan } },
        {
          provide: PlansStore,
          useValue: {
            load: vi.fn(async () => [
              { code: 'FREE', limits: [{ key: 'map.radius.max_km', limit: 25 }] },
            ]),
          },
        },
        { provide: DiscoveryCentreService, useValue: { resolve: vi.fn(async () => centre) } },
        { provide: SessionService, useValue: { me: signal({ id: 'id-me' }) } },
      ],
    });
    store = TestBed.inject(MapDiscoveryStore);
  }

  async function flush(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('centres signed-out visitors on Montréal and sends a public centre', async () => {
    setup({ signedIn: false, ownArea: false });
    await store.init();
    await flush();
    expect(store.origin()).toBe('city');
    expect(store.viewRequest()?.centre).toEqual(CITY_PRESETS[0].center);
    expect(nearby).toHaveBeenCalledTimes(1);
    expect(nearby.mock.calls[0][0]).toEqual({ lat: 45.5, lng: -73.57, radiusKm: 10, limit: 200 });
    expect(store.collectors().map((c) => c.handle)).toEqual(['maika']);
    expect(store.radiusCap()).toBe(25);
  });

  it('lets the server centre a collector on their own area, then follows the map', async () => {
    setup({ signedIn: true, ownArea: true });
    // The map reports its fallback position before the session is known: ignored.
    store.viewportChanged({
      center: { lat: 45.502, lng: -73.567 },
      zoom: 11,
      bounds: { north: 45.6, south: 45.4, east: -73.4, west: -73.7 },
    });
    await store.init();
    await flush();
    expect(nearby.mock.calls[0][0].lat).toBeUndefined();
    expect(store.viewRequest()?.centre).toEqual({ lat: 45.52, lng: -73.58 });

    // Zooming in on the answered area: nothing new to ask.
    store.viewportChanged({
      center: { lat: 45.521, lng: -73.581 },
      zoom: 13,
      bounds: { north: 45.54, south: 45.5, east: -73.55, west: -73.61 },
    });
    await flush(VIEWPORT_DEBOUNCE_MS);
    expect(nearby).toHaveBeenCalledTimes(1);
    expect(store.zoom()).toBe(13);

    // Panning away re-queries around the new centre (2 decimals).
    store.viewportChanged({
      center: { lat: 45.8123, lng: -73.4567 },
      zoom: 13,
      bounds: { north: 45.83, south: 45.79, east: -73.43, west: -73.48 },
    });
    await flush(VIEWPORT_DEBOUNCE_MS);
    expect(nearby).toHaveBeenCalledTimes(2);
    expect(nearby.mock.calls[1][0]).toMatchObject({ lat: 45.81, lng: -73.46 });
  });

  it('re-queries right away when a filter changes and loads the holders title', async () => {
    setup({ signedIn: true, ownArea: true });
    await store.init();
    await flush();
    store.setParams(parseMapParams({ game: 'yugioh', card: CARD }));
    await flush();
    expect(nearby).toHaveBeenCalledTimes(2);
    expect(nearby.mock.calls[1][0]).toMatchObject({ game: 'yugioh', hasCardId: CARD });
    expect(store.holders()).toEqual({ kind: 'card', id: CARD });
    expect(store.holdersTitle()).toBe('Azure-Eyes Sky Dragon');
    // The holders list shows the card's API picture (never a provider URL built here).
    expect(store.holdersCard()).toEqual({
      name: 'Azure-Eyes Sky Dragon',
      game: 'yugioh',
      imageUrl: 'http://localhost:8080/api/v1/public/card-images/img-1',
      byPrinting: {},
    });
  });

  it('lowers the radius to the plan cap after a 429 LIMIT_REACHED and retries', async () => {
    setup({ signedIn: true, ownArea: true, planLimit: 100 });
    store.setParams({ ...DEFAULT_MAP_PARAMS, radiusKm: 50 });
    nearby.mockImplementation((params: ListNearbyCollectorsRequestParams) =>
      (params.radiusKm ?? 0) > 25
        ? throwError(() =>
            httpError(429, {
              errorCode: 'LIMIT_REACHED',
              limitKey: 'map.radius.max_km',
              limit: 25,
            }),
          )
        : of(answer(params)),
    );
    await store.init();
    await flush(VIEWPORT_DEBOUNCE_MS);
    // The plan (100 km) allowed 50 km, but the server said 25: the store settles on 25.
    const radii = nearby.mock.calls.map((call) => call[0].radiusKm);
    expect(radii).toContain(50);
    expect(radii.at(-1)).toBe(25);
    expect(store.radiusCap()).toBe(25);
    expect(store.radiusKm()).toBe(25);
    expect(store.error()).toBeNull();
  });

  it('falls back to a city when the trading area is gone', async () => {
    setup({ signedIn: true, ownArea: true });
    nearby.mockImplementationOnce(() =>
      throwError(() => httpError(400, { errorCode: 'VALIDATION_FAILED' })),
    );
    await store.init();
    await flush();
    expect(store.origin()).toBe('city');
    expect(nearby).toHaveBeenCalledTimes(2);
    expect(nearby.mock.calls[1][0]).toMatchObject({ lat: 45.5, lng: -73.57 });
  });

  it('keeps other failures as a retryable error', async () => {
    setup({ signedIn: false, ownArea: false });
    nearby.mockImplementationOnce(() =>
      throwError(() => httpError(503, { errorCode: 'SERVICE_UNAVAILABLE' })),
    );
    await store.init();
    await flush();
    expect(store.error()?.status).toBe(503);
    store.retry();
    await flush();
    expect(store.error()).toBeNull();
    expect(store.collectors()).toHaveLength(1);
  });

  it('opens a preview with the first public binder', async () => {
    setup({ signedIn: true, ownArea: true });
    await store.init();
    await flush();
    store.select('maika');
    expect(store.selectedHandle()).toBe('maika');
    expect(previewApi.mock.calls[0][0]).toEqual({
      handle: 'maika',
      lat: undefined,
      lng: undefined,
    });
    const state = store.preview();
    expect(state.kind).toBe('ready');
    expect(store.previewBinderId()).toBe('b1');

    previewApi.mockReturnValueOnce(of(preview('quiet', { publicBinderCount: 0 })));
    store.select('quiet');
    expect(store.previewBinderId()).toBeNull();
    expect(binders).toHaveBeenCalledTimes(1);

    previewApi.mockReturnValueOnce(throwError(() => httpError(404, { errorCode: 'NOT_FOUND' })));
    store.select('gone');
    expect(store.preview()).toEqual({ kind: 'not-found', handle: 'gone' });

    store.select(null);
    expect(store.preview()).toEqual({ kind: 'idle' });
  });
});
