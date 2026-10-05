import 'leaflet/dist/leaflet.css';

import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { zoomForRadius } from '@/src/lib/location';
import { useTheme } from '@/src/theme';

import {
  PIN_TITLE,
  TRADING_AREA_MAP_LABEL,
  type TradingAreaMapProps,
} from './TradingAreaMap.types';
import { TradingAreaMapFrame, type MapLoadState } from './TradingAreaMapFrame';

/** OpenStreetMap standard tiles, as on the web app (usage policy: attribution, no bulk loads). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type LeafletModule = typeof Leaflet;

interface LeafletState {
  L: LeafletModule;
  map: Leaflet.Map;
  marker: Leaflet.Marker | null;
  circle: Leaflet.Circle | null;
}

async function loadLeaflet(): Promise<LeafletModule> {
  const mod = (await import('leaflet')) as unknown as LeafletModule & { default?: LeafletModule };
  return mod.default ?? mod;
}

/** The web app's pin (`.orenji-map-pin__dot`), inline because the markup lives outside React. */
function pinHtml(color: string): string {
  return (
    '<span style="display:flex;width:32px;height:32px;align-items:center;justify-content:center">' +
    '<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;' +
    `transform:rotate(-45deg);background:${color};border:3px solid #fff;` +
    'box-shadow:0 4px 10px rgb(0 0 0 / 0.35);box-sizing:border-box"></span></span>'
  );
}

/**
 * Trading-area map on web: Leaflet + OpenStreetMap, the same fallback adapter as the web app's
 * picker (click the map or drag the pin; arrow keys pan the focused map for "Use map centre").
 * Leaflet is loaded on the client only, so the static web render never touches it.
 */
export function TradingAreaMap({
  centre,
  radiusKm,
  focus,
  onPick,
  onViewportChange,
  disabled,
  testID = 'trading-area-map',
}: TradingAreaMapProps) {
  const { palette } = useTheme();
  const hostRef = useRef<View>(null);
  const leafletRef = useRef<LeafletState | null>(null);
  const [state, setState] = useState<MapLoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  // Latest values for Leaflet's listeners (registered once per map).
  const live = useRef({ onPick, onViewportChange, disabled, focus });
  useEffect(() => {
    live.current = { onPick, onViewportChange, disabled, focus };
  });

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
        const start = live.current.focus;
        const map = L.map(host, {
          center: [start.lat, start.lng],
          zoom: zoomForRadius(start.radiusKm),
          scrollWheelZoom: false,
        });
        L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        map.getContainer().setAttribute('aria-label', TRADING_AREA_MAP_LABEL);
        map.on('click', (event: Leaflet.LeafletMouseEvent) => {
          if (!live.current.disabled) {
            live.current.onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
          }
        });
        map.on('moveend', () => {
          const viewport = map.getCenter();
          live.current.onViewportChange({ lat: viewport.lat, lng: viewport.lng });
        });
        map.fitBounds(L.latLng(start.lat, start.lng).toBounds(start.radiusKm * 2000), {
          animate: false,
        });
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map.invalidateSize());
          resizeObserver.observe(host);
        }
        leafletRef.current = { L, map, marker: null, circle: null };
        setState('ready');
      } catch (error) {
        console.warn('[TradingAreaMap] Leaflet failed to load.', error);
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
  }, [attempt]);

  // Pin and circle follow the chosen centre and radius.
  const lat = centre?.lat;
  const lng = centre?.lng;
  useEffect(() => {
    const current = leafletRef.current;
    if (state !== 'ready' || !current) {
      return;
    }
    const { L, map } = current;
    current.marker?.remove();
    current.circle?.remove();
    current.marker = null;
    current.circle = null;
    if (lat === undefined || lng === undefined) {
      return;
    }
    current.circle = L.circle([lat, lng], {
      radius: radiusKm * 1000,
      color: palette.primary,
      weight: 2,
      fillColor: palette.primary,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'orenji-map-pin',
        html: pinHtml(palette.primary),
        iconSize: [32, 32],
        iconAnchor: [16, 30],
      }),
      draggable: !disabled,
      keyboard: true,
      title: PIN_TITLE,
      alt: PIN_TITLE,
    });
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      live.current.onPick({ lat: position.lat, lng: position.lng });
    });
    marker.addTo(map);
    marker.getElement()?.setAttribute('data-testid', 'trading-area-pin');
    current.marker = marker;
  }, [state, lat, lng, radiusKm, disabled, palette.primary]);

  // A new focus (a city, a reset area) moves the camera; clicks and drags never do.
  const { lat: focusLat, lng: focusLng, radiusKm: focusRadius, seq } = focus;
  useEffect(() => {
    const current = leafletRef.current;
    if (state !== 'ready' || !current || seq === 0) {
      return;
    }
    current.map.fitBounds(current.L.latLng(focusLat, focusLng).toBounds(focusRadius * 2000));
  }, [state, focusLat, focusLng, focusRadius, seq]);

  return (
    <TradingAreaMapFrame
      state={state}
      onRetry={() => {
        setState('loading');
        setAttempt((value) => value + 1);
      }}
    >
      <View ref={hostRef} style={styles.host} testID={testID} />
    </TradingAreaMapFrame>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
});
