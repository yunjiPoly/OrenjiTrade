import {
  COLLECTOR_MAP_MAX_ZOOM,
  COLLECTOR_MAP_MIN_ZOOM,
  clampZoom,
} from '@/src/lib/approximateArea';
import type { LatLng } from '@/src/lib/location';
import type { CameraTarget } from '@/src/lib/mapGeometry';

import type { CollectorCluster, CollectorZone } from '../CollectorMap.types';
import { ZONE_STYLE } from '../CollectorMap.types';
import {
  LEAFLET_CSS,
  LEAFLET_JS,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  attribute,
  scriptJson,
} from './leafletShared';

/**
 * The page of the collector maps in the Android WebView (Leaflet + OpenStreetMap, ADR 0010
 * amendment 2026-10-05): the Map tab and the profile's approximate-area map where Google Maps
 * cannot draw (Expo Go, no project key).
 *
 * Privacy (ADR 0004, owner rule 2026-10-04): collectors are soft circles of radius 1500 m around
 * their public point, never markers or pins at the point; the map, its tiles and every `setView` /
 * `fitBounds` stop at zoom 14 (`maxZoom`, plus a guard that pulls back anything past it).
 *
 * Protocol (JSON strings through `window.ReactNativeWebView.postMessage`):
 * - page -> app: `{type:'ready'}`, `{type:'error', reason}`, `{type:'tap', lat, lng, zoom}` (a tap
 *   on the map, raw: the app finds the zone under it and keeps nothing), `{type:'cluster', id}`,
 *   `{type:'viewport', lat, lng, zoom, north, south, east, west}` (camera settled);
 * - app -> page (`injectJavaScript`): `window.__orenji.layer({zones, clusters})` draws the zones
 *   and count bubbles, `window.__orenji.view(target)` moves the camera (centre + zoom, or bounds).
 * The page never asks for the device location and never stores anything.
 */

export interface CollectorMapPageOptions {
  start: { center: LatLng; zoom: number };
  /** `#RRGGBB` colours. */
  colors: {
    zone: string;
    selected: string;
    self: string;
    cluster: string;
    clusterText: string;
    background: string;
  };
  /** Accessible name of the map. */
  label: string;
  /** Taps report `tap` messages and gestures move the map (default true; false for a map that only shows). */
  interactive?: boolean;
  /** Highest zoom (default and ceiling 14). */
  maxZoom?: number;
}

/** What the page draws: zones (radius in metres) and count bubbles, all at 3 decimals at most. */
export interface PageLayer {
  zones: {
    id: string;
    lat: number;
    lng: number;
    radius: number;
    selected: boolean;
    self: boolean;
  }[];
  clusters: { id: string; lat: number; lng: number; count: number; label: string }[];
}

export function pageLayer(
  zones: readonly CollectorZone[],
  clusters: readonly CollectorCluster[]
): PageLayer {
  return {
    zones: zones.map((zone) => ({
      id: zone.id,
      lat: zone.center.lat,
      lng: zone.center.lng,
      radius: zone.radiusMeters,
      selected: zone.selected,
      self: zone.self,
    })),
    clusters: clusters.map((cluster) => ({
      id: cluster.id,
      lat: cluster.center.lat,
      lng: cluster.center.lng,
      count: cluster.count,
      label: cluster.label,
    })),
  };
}

const PAGE_SCRIPT = `
(function () {
  var CONFIG = window.__orenjiConfig;
  function send(message) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {}
  }
  if (!window.L) { send({ type: 'error', reason: 'leaflet' }); return; }
  var L = window.L;
  function clamp(zoom) {
    var z = typeof zoom === 'number' && isFinite(zoom) ? zoom : CONFIG.maxZoom;
    return Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, z));
  }
  // A map that only shows (a profile's area) keeps still inside its scrolling screen.
  var moves = CONFIG.interactive;
  var map = L.map('map', {
    zoomControl: false, attributionControl: true,
    minZoom: CONFIG.minZoom, maxZoom: CONFIG.maxZoom,
    dragging: moves, touchZoom: moves, doubleClickZoom: moves, scrollWheelZoom: moves,
    boxZoom: moves, keyboard: moves, tap: moves
  });
  // Zoom buttons bottom right, above the credit: the screen's toolbar covers the top of the map.
  if (moves) { L.control.zoom({ position: 'bottomright' }).addTo(map); }
  L.tileLayer(CONFIG.tileUrl, {
    attribution: CONFIG.attribution, minZoom: CONFIG.minZoom, maxZoom: CONFIG.maxZoom
  }).addTo(map);
  // A WebView laid out while its screen is still being pushed can be 0 x 0 at first: a fitBounds
  // then would end on the minimum zoom. Camera moves wait until the map has a size.
  var pending = null;
  function sized() { var size = map.getSize(); return size.x > 0 && size.y > 0; }
  function move(target, animate) {
    if (!sized()) { pending = target; return; }
    pending = null;
    if (target.kind === 'bounds') {
      var b = target.bounds;
      map.fitBounds([[b.south, b.west], [b.north, b.east]], {
        maxZoom: CONFIG.maxZoom, padding: [48, 48], animate: animate
      });
    } else {
      map.setView([target.center.lat, target.center.lng], clamp(target.zoom), { animate: animate });
    }
  }
  // The starting view is applied again once the map has a size: a view set at 0 x 0 would leave
  // the start (a profile's zone) off centre after the first layout.
  var startTarget = { kind: 'center', center: CONFIG.start.center, zoom: CONFIG.start.zoom };
  var startedSized = false;
  function onResize() {
    // Keeps the centre (pan) when the map is resized.
    map.invalidateSize({ pan: true, animate: false });
    if (!startedSized && sized()) {
      startedSized = true;
      map.setView([startTarget.center.lat, startTarget.center.lng], clamp(startTarget.zoom), { animate: false });
    }
    if (pending && sized()) { move(pending, false); }
  }
  map.setView([CONFIG.start.center.lat, CONFIG.start.center.lng], clamp(CONFIG.start.zoom), { animate: false });
  startedSized = sized();
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) { new window.ResizeObserver(onResize).observe(document.getElementById('map')); }
  // Guard: nothing may leave the map past the cap (ADR 0004).
  map.on('zoomend', function () { if (map.getZoom() > CONFIG.maxZoom) { map.setZoom(CONFIG.maxZoom); } });
  map.on('click', function (event) {
    if (CONFIG.interactive) {
      send({ type: 'tap', lat: event.latlng.lat, lng: event.latlng.lng, zoom: map.getZoom() });
    }
  });
  map.on('moveend', function () {
    var c = map.getCenter();
    var b = map.getBounds();
    send({
      type: 'viewport', lat: c.lat, lng: c.lng, zoom: map.getZoom(),
      north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest()
    });
  });
  var zones = L.layerGroup().addTo(map);
  var bubbles = L.layerGroup().addTo(map);
  function colourOf(zone) { return zone.selected ? CONFIG.colors.selected : zone.self ? CONFIG.colors.self : CONFIG.colors.zone; }
  window.__orenji = {
    layer: function (next) {
      zones.clearLayers();
      bubbles.clearLayers();
      (next.zones || []).forEach(function (zone) {
        var colour = colourOf(zone);
        L.circle([zone.lat, zone.lng], {
          radius: zone.radius, color: colour, opacity: CONFIG.style.strokeOpacity,
          weight: zone.selected ? CONFIG.style.selectedStrokeWidth : CONFIG.style.strokeWidth,
          fillColor: colour,
          fillOpacity: zone.selected ? CONFIG.style.selectedFillOpacity : CONFIG.style.fillOpacity,
          interactive: false, className: zone.selected ? 'orenji-zone orenji-zone--selected' : 'orenji-zone'
        }).addTo(zones);
      });
      (next.clusters || []).forEach(function (cluster) {
        var count = String(Math.max(0, Math.floor(Number(cluster.count) || 0)));
        var marker = L.marker([cluster.lat, cluster.lng], {
          icon: L.divIcon({
            className: 'orenji-cluster',
            html: '<span style="display:flex;width:40px;height:40px;border-radius:50%;align-items:center;justify-content:center;font:600 14px sans-serif;background:' +
              CONFIG.colors.cluster + ';color:' + CONFIG.colors.clusterText + ';border:2px solid #fff;box-shadow:0 2px 6px rgb(0 0 0 / 0.3)">' + count + '</span>',
            iconSize: [40, 40], iconAnchor: [20, 20]
          }),
          keyboard: true, title: String(cluster.label), alt: String(cluster.label)
        });
        marker.on('click', function () { send({ type: 'cluster', id: cluster.id }); });
        marker.addTo(bubbles);
      });
    },
    view: function (target) { move(target, true); }
  };
  send({ type: 'ready' });
})();
`;

/** The complete HTML document of the WebView collector map. */
export function collectorMapPageHtml(options: CollectorMapPageOptions): string {
  const maxZoom = Math.min(options.maxZoom ?? COLLECTOR_MAP_MAX_ZOOM, COLLECTOR_MAP_MAX_ZOOM);
  const config = {
    start: options.start,
    colors: options.colors,
    style: ZONE_STYLE,
    tileUrl: OSM_TILE_URL,
    attribution: OSM_ATTRIBUTION,
    interactive: options.interactive ?? true,
    maxZoom,
    minZoom: COLLECTOR_MAP_MIN_ZOOM,
  };
  return [
    '<!doctype html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
    `<link rel="stylesheet" href="${LEAFLET_CSS.url}" integrity="${LEAFLET_CSS.integrity}" crossorigin="">`,
    '<style>',
    `html,body,#map{margin:0;padding:0;width:100%;height:100%;background:${attribute(options.colors.background)}}`,
    '.orenji-cluster{background:none;border:none}',
    '</style>',
    '</head><body>',
    `<div id="map" role="application" aria-label="${attribute(options.label)}"></div>`,
    `<script>window.__orenjiConfig=${scriptJson(config)};</script>`,
    // A failed or blocked download (offline, integrity mismatch) leaves `window.L` undefined: the
    // page script then reports an error state.
    `<script src="${LEAFLET_JS.url}" integrity="${LEAFLET_JS.integrity}" crossorigin=""></script>`,
    `<script>${PAGE_SCRIPT}</script>`,
    '</body></html>',
  ].join('\n');
}

export type CollectorPageMessage =
  | { type: 'ready' }
  | { type: 'error'; reason: string }
  | { type: 'tap'; lat: number; lng: number; zoom: number }
  | { type: 'cluster'; id: string }
  | {
      type: 'viewport';
      lat: number;
      lng: number;
      zoom: number;
      north: number;
      south: number;
      east: number;
      west: number;
    };

function finite(...values: unknown[]): boolean {
  return values.every((value) => typeof value === 'number' && Number.isFinite(value));
}

function validLatLng(lat: unknown, lng: unknown): boolean {
  return finite(lat, lng) && Math.abs(lat as number) <= 90 && Math.abs(lng as number) <= 180;
}

/** Parses and validates a message of the page (null for anything unexpected). */
export function parseCollectorPageMessage(data: string): CollectorPageMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const m = value as Record<string, unknown>;
  switch (m.type) {
    case 'ready':
      return { type: 'ready' };
    case 'error':
      return { type: 'error', reason: typeof m.reason === 'string' ? m.reason : 'unknown' };
    case 'tap':
      return validLatLng(m.lat, m.lng) && finite(m.zoom)
        ? { type: 'tap', lat: m.lat as number, lng: m.lng as number, zoom: m.zoom as number }
        : null;
    case 'cluster':
      return typeof m.id === 'string' && m.id.length > 0 && m.id.length < 200
        ? { type: 'cluster', id: m.id }
        : null;
    case 'viewport':
      return validLatLng(m.lat, m.lng) &&
        finite(m.zoom, m.north, m.south, m.east, m.west) &&
        validLatLng(m.north, m.east) &&
        validLatLng(m.south, m.west)
        ? {
            type: 'viewport',
            lat: m.lat as number,
            lng: m.lng as number,
            zoom: m.zoom as number,
            north: m.north as number,
            south: m.south as number,
            east: m.east as number,
            west: m.west as number,
          }
        : null;
    default:
      return null;
  }
}

/** The script that draws a layer in the page. */
export function layerScript(layer: PageLayer): string {
  return `window.__orenji&&window.__orenji.layer(${scriptJson(layer)});true;`;
}

/** The script that moves the page's camera (the zoom clamped to the cap first). */
export function viewScript(target: CameraTarget, maxZoom: number = COLLECTOR_MAP_MAX_ZOOM): string {
  const safe: CameraTarget =
    target.kind === 'center'
      ? {
          kind: 'center',
          center: target.center,
          zoom: clampZoom(target.zoom, maxZoom),
        }
      : target;
  return `window.__orenji&&window.__orenji.view(${scriptJson(safe)});true;`;
}
