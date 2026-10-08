import {
  LEAFLET_CSS,
  LEAFLET_JS,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  attribute,
  pinHtml,
  scriptJson,
} from './leafletShared';

/**
 * The page the Android WebView fallback loads (Leaflet + OpenStreetMap, the web app's fallback
 * adapter): the trading-area map, the same mechanism as the web picker (tap the map or drag the
 * pin; the radius is a circle), and the Map tab's browse map (`pickable: false`, zoom capped).
 *
 * Protocol (JSON strings through `window.ReactNativeWebView.postMessage`):
 * - page -> app: `{type:'ready'}`, `{type:'error', reason}`, `{type:'pick', lat, lng}` (a tap or the
 *   end of a pin drag, raw: the app rounds it), `{type:'viewport', lat, lng}` (camera settled);
 * - app -> page (`injectJavaScript`): `window.__orenji.apply({area, disabled})` draws the chosen
 *   centre (or nothing for `area: null`) and `window.__orenji.focus({lat, lng, radiusKm})` moves the
 *   camera.
 * The page never asks for the device location and never stores anything.
 */

export interface PageFocus {
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface TradingAreaPageOptions {
  /** Where the camera starts (the chosen centre, or a coarse neighbourhood). */
  focus: PageFocus;
  /** Pin, circle and zoom-control colour (`#RRGGBB`). */
  color: string;
  /** Background behind the tiles while they load. */
  background: string;
  /** Accessible name of the map. */
  label: string;
  /** Title of the pin. */
  pinTitle: string;
  /** Taps report `pick` messages (default true; false for a map that only browses). */
  pickable?: boolean;
  /** Highest zoom level (default 19; 14 on maps of other collectors, ADR 0004). */
  maxZoom?: number;
}

const PAGE_SCRIPT = `
(function () {
  var CONFIG = window.__orenjiConfig;
  function send(message) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {}
  }
  if (!window.L) { send({ type: 'error', reason: 'leaflet' }); return; }
  var L = window.L;
  var map = L.map('map', { zoomControl: true, attributionControl: true, maxZoom: CONFIG.maxZoom });
  L.tileLayer(CONFIG.tileUrl, { attribution: CONFIG.attribution, maxZoom: CONFIG.maxZoom }).addTo(map);
  // A WebView laid out while its screen is still being pushed can be 0 x 0 at first: a fit then
  // would end on zoom 0 (the whole world). The fit waits until the map has a size.
  var pendingFit = null;
  function sized() {
    var size = map.getSize();
    return size.x > 0 && size.y > 0;
  }
  function fit(f, animate) {
    if (!sized()) { pendingFit = f; return; }
    pendingFit = null;
    map.fitBounds(L.latLng(f.lat, f.lng).toBounds(f.radiusKm * 2000), { animate: animate });
  }
  function onResize() {
    map.invalidateSize({ pan: false });
    if (pendingFit && sized()) { fit(pendingFit, false); }
  }
  map.setView([CONFIG.focus.lat, CONFIG.focus.lng], Math.min(12, CONFIG.maxZoom), { animate: false });
  fit(CONFIG.focus, false);
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) { new window.ResizeObserver(onResize).observe(document.getElementById('map')); }
  var state = { disabled: false, marker: null, circle: null };
  map.on('click', function (event) {
    if (CONFIG.pickable && !state.disabled) {
      send({ type: 'pick', lat: event.latlng.lat, lng: event.latlng.lng });
    }
  });
  map.on('moveend', function () {
    var centre = map.getCenter();
    send({ type: 'viewport', lat: centre.lat, lng: centre.lng });
  });
  function clear() {
    if (state.marker) { state.marker.remove(); state.marker = null; }
    if (state.circle) { state.circle.remove(); state.circle = null; }
  }
  window.__orenji = {
    apply: function (next) {
      state.disabled = !!next.disabled;
      clear();
      var area = next.area;
      if (!area) { return; }
      state.circle = L.circle([area.lat, area.lng], {
        radius: area.radiusKm * 1000, color: CONFIG.color, weight: 2,
        fillColor: CONFIG.color, fillOpacity: 0.12, interactive: false
      }).addTo(map);
      var marker = L.marker([area.lat, area.lng], {
        icon: L.divIcon({ className: 'orenji-map-pin', html: CONFIG.pinHtml, iconSize: [32, 32], iconAnchor: [16, 30] }),
        draggable: !state.disabled, keyboard: true, title: CONFIG.pinTitle, alt: CONFIG.pinTitle
      });
      marker.on('dragend', function () {
        var position = marker.getLatLng();
        send({ type: 'pick', lat: position.lat, lng: position.lng });
      });
      marker.addTo(map);
      state.marker = marker;
    },
    focus: function (f) { fit(f, true); }
  };
  send({ type: 'ready' });
})();
`;

/** The complete HTML document of the WebView map. */
export function tradingAreaPageHtml(options: TradingAreaPageOptions): string {
  const config = {
    focus: options.focus,
    color: options.color,
    pinTitle: options.pinTitle,
    pinHtml: pinHtml(options.color),
    tileUrl: OSM_TILE_URL,
    attribution: OSM_ATTRIBUTION,
    pickable: options.pickable ?? true,
    maxZoom: options.maxZoom ?? 19,
  };
  return [
    '<!doctype html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
    `<link rel="stylesheet" href="${LEAFLET_CSS.url}" integrity="${LEAFLET_CSS.integrity}" crossorigin="">`,
    '<style>',
    `html,body,#map{margin:0;padding:0;width:100%;height:100%;background:${attribute(options.background)}}`,
    '.orenji-map-pin{background:none;border:none}',
    '</style>',
    '</head><body>',
    `<div id="map" role="application" aria-label="${attribute(options.label)}"></div>`,
    `<script>window.__orenjiConfig=${scriptJson(config)};</script>`,
    // A failed or blocked download (offline, integrity mismatch) leaves `window.L` undefined:
    // the page script then reports an error state.
    `<script src="${LEAFLET_JS.url}" integrity="${LEAFLET_JS.integrity}" crossorigin=""></script>`,
    `<script>${PAGE_SCRIPT}</script>`,
    '</body></html>',
  ].join('\n');
}

export type TradingAreaPageMessage =
  | { type: 'ready' }
  | { type: 'error'; reason: string }
  | { type: 'pick'; lat: number; lng: number }
  | { type: 'viewport'; lat: number; lng: number };

function isLatLng(value: { lat?: unknown; lng?: unknown }): value is { lat: number; lng: number } {
  return (
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180
  );
}

/** Parses and validates a message of the page (null for anything unexpected). */
export function parsePageMessage(data: string): TradingAreaPageMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const message = value as { type?: unknown; reason?: unknown; lat?: unknown; lng?: unknown };
  switch (message.type) {
    case 'ready':
      return { type: 'ready' };
    case 'error':
      return {
        type: 'error',
        reason: typeof message.reason === 'string' ? message.reason : 'unknown',
      };
    case 'pick':
    case 'viewport': {
      const type = message.type;
      return isLatLng(message) ? { type, lat: message.lat, lng: message.lng } : null;
    }
    default:
      return null;
  }
}

/** The script that draws the chosen centre (or nothing) in the page. */
export function applyScript(
  area: { lat: number; lng: number; radiusKm: number } | null,
  disabled: boolean
): string {
  return `window.__orenji&&window.__orenji.apply(${scriptJson({ area, disabled })});true;`;
}

/** The script that moves the page's camera to a focus. */
export function focusScript(focus: PageFocus): string {
  return `window.__orenji&&window.__orenji.focus(${scriptJson(focus)});true;`;
}
