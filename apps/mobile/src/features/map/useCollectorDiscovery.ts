import { useEffect, useMemo, useRef, useState } from 'react';

import { useAccount } from '@/src/account/AccountProvider';
import { useMapRadiusCap, useNearbyCollectors } from '@/src/api/hooks/discovery';
import type { CollectorMarker, NearbyCollectorsResponse } from '@/src/api/types';
import type { InitialCamera } from '@/src/components/map/CollectorMap.types';
import { isLimitReached } from '@/src/lib/limits';
import { CITY_PRESETS, zoomForRadius, type CityPreset, type LatLng } from '@/src/lib/location';
import { COLLECTOR_FOCUS_ZOOM, clampZoom, round3 } from '@/src/lib/approximateArea';
import {
  visibleRadiusKm,
  type CameraRequest,
  type CameraTarget,
  type MapBounds,
  type MapViewport,
} from '@/src/lib/mapGeometry';

import { buildCollectorLayer, clusterCamera, type CollectorLayer } from './collectorLayer';
import {
  DEFAULT_MAP_FILTERS,
  FALLBACK_RADIUS_CAP_KM,
  VIEWPORT_DEBOUNCE_MS,
  capAfterLimit,
  chosenRadiusKm,
  filterKey,
  isCovered,
  nearbyParams,
  queryRadiusKm,
  type CoveredArea,
  type HoldersTarget,
  type MapFilters,
  type NearbyQuery,
} from './discovery';

/**
 * Where the map is centred: the signed-in collector's own trading area (the server knows it; the
 * app never reads its private centre) or a public city centre (collectors without a trading area).
 */
export type AreaOrigin = 'own-area' | 'city';

const KM_PER_DEGREE_LAT = 111.32;

/** Bounds of a circle (for "show the whole radius"). */
export function circleBounds(center: LatLng, radiusKm: number): MapBounds {
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  const dLng = dLat / Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  return {
    north: round3(center.lat + dLat),
    south: round3(center.lat - dLat),
    east: round3(center.lng + dLng),
    west: round3(center.lng - dLng),
  };
}

function cityCentre(city: CityPreset): LatLng {
  return { lat: city.lat, lng: city.lng };
}

/**
 * State of the Map tab (mirror of the web's `MapDiscoveryStore`): where the map is, its filters,
 * the collectors of `GET /collectors/nearby`, and the camera requests.
 *
 * Collectors with a trading area start on the server's answer (`lat`/`lng` left out: their own
 * area, answered with a 2-decimal centre); the others start on a city. Pans and zooms re-query
 * (debounced) only when the visible area leaves the circle the last answer covered; filters and
 * the radius always re-query. A 429 `LIMIT_REACHED` lowers the radius to the plan's cap; a 400 (no
 * trading area after all) falls back to the city.
 */
export function useCollectorDiscovery(
  holdersTarget: HoldersTarget | null,
  selectedHandle: string | null
) {
  // Stable across renders (route parameters give a new object every time).
  const holdersKind = holdersTarget?.kind ?? null;
  const holdersId = holdersTarget?.id ?? null;
  const holders = useMemo<HoldersTarget | null>(
    () => (holdersKind && holdersId ? { kind: holdersKind, id: holdersId } : null),
    [holdersKind, holdersId]
  );
  const account = useAccount();
  const me = account.me;
  const [cityFallback, setCityFallback] = useState(false);
  const origin: AreaOrigin | null = !me
    ? null
    : me.onboarding.tradingAreaSet && !cityFallback
      ? 'own-area'
      : 'city';
  const [city, setCity] = useState<CityPreset>(CITY_PRESETS[0] as CityPreset);
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_MAP_FILTERS);
  const planCap = useMapRadiusCap();
  const [limitCap, setLimitCap] = useState<number | null>(null);
  const radiusCap = Math.min(
    planCap ?? FALLBACK_RADIUS_CAP_KM,
    limitCap ?? Number.POSITIVE_INFINITY
  );
  const radiusKm = chosenRadiusKm(filters.radiusKm, radiusCap);

  // The viewport the queries follow (debounced), and the zoom the layer is drawn for (live).
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [zoom, setZoom] = useState(zoomForRadius(radiusKm));
  const [start, setStart] = useState<InitialCamera | null>(null);
  const [camera, setCamera] = useState<CameraRequest | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestCamera = (target: CameraTarget) =>
    setCamera((previous) => ({ ...target, seq: (previous?.seq ?? 0) + 1 }) as CameraRequest);

  // The query: own area (no centre) until the map follows a viewport, else the visible circle.
  const wanted = useMemo<NearbyQuery | null>(() => {
    if (!origin) {
      return null;
    }
    const centre = viewport ? viewport.center : origin === 'own-area' ? null : cityCentre(city);
    return {
      centre,
      radiusKm: viewport ? queryRadiusKm(visibleRadiusKm(viewport), radiusKm) : radiusKm,
      limitKm: radiusKm,
      game: filters.game,
      intent: filters.intent,
      holders,
    };
  }, [origin, viewport, city, radiusKm, filters.game, filters.intent, holders]);

  // The last good answer and the query it answered. Offline tolerance: when a pan's query fails,
  // it stays on the map (with a notice) instead of an empty map; it also tells which circle is
  // already covered (small pans and zooming in never re-query).
  const [lastGood, setLastGood] = useState<{
    key: string;
    result: NearbyCollectorsResponse;
  } | null>(null);
  const covered: CoveredArea | null = lastGood
    ? {
        centre: lastGood.result.center,
        radiusKm: lastGood.result.radiusKm,
        filterKey: lastGood.key,
      }
    : null;

  // The query actually sent: kept while the wanted one is inside what the last answer covered.
  const [committed, setCommitted] = useState<NearbyQuery | null>(null);
  const nextCommitted = !wanted
    ? null
    : committed &&
        filterKey(committed) === filterKey(wanted) &&
        (JSON.stringify(committed) === JSON.stringify(wanted) || isCovered(wanted, covered))
      ? committed
      : wanted;
  if (nextCommitted !== committed) {
    setCommitted(nextCommitted);
  }

  const params = useMemo(() => (committed ? nearbyParams(committed) : null), [committed]);
  const nearby = useNearbyCollectors(params);
  const fresh = nearby.data && !nearby.isPlaceholderData && committed ? nearby.data : null;
  if (fresh && committed && (lastGood?.result !== fresh || lastGood.key !== filterKey(committed))) {
    setLastGood({ key: filterKey(committed), result: fresh });
  }
  const result =
    nearby.data ??
    (lastGood && committed && lastGood.key === filterKey(committed) ? lastGood.result : undefined);

  // Where the map starts: the server's answer for the own area, else the city.
  if (!start && origin === 'city') {
    setStart({ center: cityCentre(city), zoom: zoomForRadius(radiusKm) });
  } else if (!start && origin === 'own-area' && fresh) {
    setStart({ center: fresh.center, zoom: zoomForRadius(fresh.radiusKm) });
  }

  // Errors: the plan's radius cap, or no trading area after all.
  const error = nearby.error;
  if (error && committed && isLimitReached(error) && limitCap === null) {
    setLimitCap(capAfterLimit(error, committed.limitKm, radiusCap));
  } else if (
    error &&
    committed &&
    error.status === 400 &&
    committed.centre === null &&
    !cityFallback
  ) {
    setCityFallback(true);
  }

  useEffect(
    () => () => {
      if (debounce.current) {
        clearTimeout(debounce.current);
      }
    },
    []
  );

  /** The map moved (pan, zoom, resize). */
  const viewportChanged = (next: MapViewport) => {
    setZoom(next.zoom);
    if (!start) {
      // Still on the first view: the starting point comes from the server.
      return;
    }
    if (debounce.current) {
      clearTimeout(debounce.current);
    }
    debounce.current = setTimeout(() => setViewport(next), VIEWPORT_DEBOUNCE_MS);
  };

  /** Signed-in collectors without a trading area browse around a city. */
  const chooseCity = (next: CityPreset) => {
    setCity(next);
    setViewport(null);
    requestCamera({ kind: 'center', center: cityCentre(next), zoom: zoomForRadius(radiusKm) });
  };

  /** New filters; a new radius also shows the whole circle. */
  const updateFilters = (patch: Partial<MapFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    if ('radiusKm' in patch) {
      const centre = viewport?.center ?? result?.center ?? cityCentre(city);
      const nextRadius = chosenRadiusKm(patch.radiusKm ?? null, radiusCap);
      requestCamera({ kind: 'bounds', bounds: circleBounds(centre, nextRadius) });
    }
  };

  const collectors = useMemo<readonly CollectorMarker[]>(() => result?.collectors ?? [], [result]);
  const selfId = me?.id ?? null;
  const layer = useMemo<CollectorLayer>(
    () => buildCollectorLayer(collectors, zoom, selectedHandle, selfId),
    [collectors, zoom, selectedHandle, selfId]
  );

  /** Pressing a count bubble zooms into it (never past the cap). */
  const expandCluster = (id: string) => {
    const cluster = layer.clusters.find((candidate) => candidate.id === id);
    if (cluster) {
      requestCamera(clusterCamera(cluster.bounds, zoom));
    }
  };

  /** "Show on map": the collector's whole zone in view, never past the cap. */
  const zoomToCollector = (handle: string) => {
    const collector = collectors.find((candidate) => candidate.handle === handle);
    if (collector) {
      requestCamera({
        kind: 'center',
        center: {
          lat: round3(collector.publicPoint.lat),
          lng: round3(collector.publicPoint.lng),
        },
        zoom: clampZoom(COLLECTOR_FOCUS_ZOOM),
      });
    }
  };

  return {
    origin,
    city,
    filters,
    radiusKm,
    radiusCap,
    limitLowered: limitCap !== null,
    result,
    collectors,
    layer,
    zoom,
    start,
    camera,
    /** The centre the preview's distance is measured from (a city only, never the own area). */
    previewCentre: origin === 'city' ? (viewport?.center ?? cityCentre(city)) : null,
    loading: nearby.isFetching,
    error: result ? null : (error ?? null),
    refreshError: result ? (error ?? null) : null,
    retry: () => void nearby.refetch(),
    viewportChanged,
    chooseCity,
    updateFilters,
    clearFilters: () => setFilters(DEFAULT_MAP_FILTERS),
    expandCluster,
    zoomToCollector,
  };
}

export type CollectorDiscovery = ReturnType<typeof useCollectorDiscovery>;
