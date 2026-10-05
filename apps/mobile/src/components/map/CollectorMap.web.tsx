import 'leaflet/dist/leaflet.css';

import type * as Leaflet from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OSM_ATTRIBUTION, OSM_TILE_URL } from '@/src/components/map/leaflet/leafletShared';
import {
  COLLECTOR_MAP_MAX_ZOOM,
  COLLECTOR_MAP_MIN_ZOOM,
  clampZoom,
} from '@/src/lib/approximateArea';
import { zoneAt } from '@/src/lib/mapGeometry';
import { useTheme } from '@/src/theme';

import {
  ZONE_STYLE,
  type CollectorMapComponentProps,
  type CollectorZone,
} from './CollectorMap.types';
import { CollectorMapFrame, type CollectorMapState } from './CollectorMapFrame';

type LeafletModule = typeof Leaflet;

interface LeafletState {
  L: LeafletModule;
  map: Leaflet.Map;
  zones: Leaflet.LayerGroup;
  bubbles: Leaflet.LayerGroup;
}

async function loadLeaflet(): Promise<LeafletModule> {
  const mod = (await import('leaflet')) as unknown as LeafletModule & { default?: LeafletModule };
  return mod.default ?? mod;
}

/**
 * The collector map in the web build of the app: Leaflet + OpenStreetMap directly (the web app's
 * fallback adapter, ADR 0010). Same rules as the native engines (ADR 0004): zones are circles of
 * radius 1500 m around public points (class `orenji-zone`), never markers; `maxZoom` 14 bounds the
 * wheel, buttons, keyboard, touch and every `setView` / `fitBounds`, plus a guard that pulls back
 * anything past it. Leaflet loads on the client only (the static render never touches it).
 */
export function CollectorMap({
  zones,
  clusters,
  initialCamera,
  camera,
  onViewportChange,
  onZonePress,
  onClusterPress,
  onEmptyPress,
  accessibilityLabel,
  errorMessage,
  interactive = true,
  testID = 'collector-map',
}: CollectorMapComponentProps) {
  const { palette } = useTheme();
  const hostRef = useRef<View>(null);
  const leafletRef = useRef<LeafletState | null>(null);
  const [state, setState] = useState<CollectorMapState>('loading');
  const [attempt, setAttempt] = useState(0);

  // Latest values for Leaflet's listeners (registered once per map).
  const live = useRef({
    zones,
    onViewportChange,
    onZonePress,
    onClusterPress,
    onEmptyPress,
    interactive,
  });
  useEffect(() => {
    live.current = {
      zones,
      onViewportChange,
      onZonePress,
      onClusterPress,
      onEmptyPress,
      interactive,
    };
  });
  const [start] = useState(() => ({
    center: initialCamera.center,
    zoom: clampZoom(initialCamera.zoom),
  }));

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current as unknown as HTMLElement | null;
    let resizeObserver: ResizeObserver | null = null;
    (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !host) {
          return;
        }
        const moves = live.current.interactive;
        const map = L.map(host, {
          center: [start.center.lat, start.center.lng],
          zoom: start.zoom,
          minZoom: COLLECTOR_MAP_MIN_ZOOM,
          maxZoom: COLLECTOR_MAP_MAX_ZOOM,
          // A map that only shows (a profile's area) keeps still inside its scrolling screen.
          zoomControl: moves,
          dragging: moves,
          touchZoom: moves,
          doubleClickZoom: moves,
          scrollWheelZoom: moves,
          boxZoom: moves,
          keyboard: moves,
        });
        L.tileLayer(OSM_TILE_URL, {
          attribution: OSM_ATTRIBUTION,
          minZoom: COLLECTOR_MAP_MIN_ZOOM,
          maxZoom: COLLECTOR_MAP_MAX_ZOOM,
        }).addTo(map);
        map.getContainer().setAttribute('aria-label', accessibilityLabel);
        map.on('zoomend', () => {
          if (map.getZoom() > COLLECTOR_MAP_MAX_ZOOM) {
            map.setZoom(COLLECTOR_MAP_MAX_ZOOM);
          }
        });
        map.on('click', (event: Leaflet.LeafletMouseEvent) => {
          if (!live.current.interactive) {
            return;
          }
          const zone = zoneAt(
            live.current.zones,
            { lat: event.latlng.lat, lng: event.latlng.lng },
            map.getZoom()
          );
          if (zone) {
            live.current.onZonePress(zone.id);
          } else {
            live.current.onEmptyPress?.();
          }
        });
        map.on('moveend', () => {
          const centre = map.getCenter();
          const bounds = map.getBounds();
          live.current.onViewportChange({
            center: { lat: centre.lat, lng: centre.lng },
            zoom: map.getZoom(),
            bounds: {
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest(),
            },
          });
        });
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map.invalidateSize());
          resizeObserver.observe(host);
        }
        leafletRef.current = {
          L,
          map,
          zones: L.layerGroup().addTo(map),
          bubbles: L.layerGroup().addTo(map),
        };
        setState('ready');
      } catch (error) {
        console.warn('[CollectorMap] Leaflet failed to load.', error);
        if (!cancelled) {
          setState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      leafletRef.current?.map.remove();
      leafletRef.current = null;
    };
  }, [attempt, start, accessibilityLabel]);

  const zoneColour = useCallback(
    (zone: CollectorZone) =>
      zone.selected ? palette.onPrimaryContainer : zone.self ? palette.accent : palette.primary,
    [palette]
  );

  // Zones and count bubbles follow the layer.
  useEffect(() => {
    const current = leafletRef.current;
    if (state !== 'ready' || !current) {
      return;
    }
    const { L } = current;
    current.zones.clearLayers();
    current.bubbles.clearLayers();
    for (const zone of zones) {
      const colour = zoneColour(zone);
      L.circle([zone.center.lat, zone.center.lng], {
        radius: zone.radiusMeters,
        color: colour,
        opacity: ZONE_STYLE.strokeOpacity,
        weight: zone.selected ? ZONE_STYLE.selectedStrokeWidth : ZONE_STYLE.strokeWidth,
        fillColor: colour,
        fillOpacity: zone.selected ? ZONE_STYLE.selectedFillOpacity : ZONE_STYLE.fillOpacity,
        interactive: false,
        className: zone.selected ? 'orenji-zone orenji-zone--selected' : 'orenji-zone',
      }).addTo(current.zones);
    }
    for (const cluster of clusters) {
      const bubble = document.createElement('span');
      bubble.textContent = String(cluster.count);
      bubble.setAttribute(
        'style',
        `display:flex;width:40px;height:40px;border-radius:50%;align-items:center;` +
          `justify-content:center;font:600 14px sans-serif;background:${palette.primary};` +
          `color:${palette.onPrimary};border:2px solid #fff;box-shadow:0 2px 6px rgb(0 0 0 / 0.3)`
      );
      const marker = L.marker([cluster.center.lat, cluster.center.lng], {
        icon: L.divIcon({
          className: 'orenji-cluster',
          html: bubble,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        }),
        keyboard: true,
        title: cluster.label,
        alt: cluster.label,
      });
      marker.on('click', () => live.current.onClusterPress(cluster.id));
      marker.addTo(current.bubbles);
      marker.getElement()?.setAttribute('data-testid', `cluster-${cluster.id}`);
    }
  }, [state, zones, clusters, zoneColour, palette]);

  // A new camera request moves the map once (clamped to the cap).
  const seq = camera?.seq ?? 0;
  const lastSeq = useRef(0);
  useEffect(() => {
    const current = leafletRef.current;
    if (state !== 'ready' || !current || !camera || seq === lastSeq.current) {
      return;
    }
    lastSeq.current = seq;
    if (camera.kind === 'center') {
      current.map.setView([camera.center.lat, camera.center.lng], clampZoom(camera.zoom));
    } else {
      const { bounds } = camera;
      current.map.fitBounds(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        { maxZoom: COLLECTOR_MAP_MAX_ZOOM, padding: [48, 48] }
      );
    }
  }, [state, camera, seq]);

  return (
    <View style={styles.container} testID={`${testID}-container`}>
      <CollectorMapFrame
        state={state}
        errorMessage={errorMessage}
        onRetry={() => {
          setState('loading');
          setAttempt((value) => value + 1);
        }}
      >
        <View ref={hostRef} style={styles.host} testID={testID} />
      </CollectorMapFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  host: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
});
