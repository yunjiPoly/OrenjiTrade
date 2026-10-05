/**
 * Pieces shared by every Leaflet map of the app: the web build (Leaflet from npm) and the
 * WebView fallback on Android (Leaflet from a pinned CDN URL with Subresource Integrity, so the
 * WebView runs exactly the bytes of the npm package `leaflet@1.9.4` the web build uses).
 */

/** Origin of the WebView map pages (a Referer for the OpenStreetMap tile servers; nothing loads from it). */
export const PAGE_BASE_URL = 'https://www.orenjitrade.com/';

/** OpenStreetMap standard tiles, as on the web app (usage policy: attribution, no bulk loads). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** The Leaflet release of `package.json` (`leaflet` 1.9.4). */
export const LEAFLET_VERSION = '1.9.4';
export const LEAFLET_JS = {
  url: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
  // sha256 of node_modules/leaflet/dist/leaflet.js (also the hash published by leafletjs.com).
  integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
} as const;
export const LEAFLET_CSS = {
  url: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
  integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
} as const;

/** The web app's pin (`.orenji-map-pin__dot`), inline because the markup lives outside React. */
export function pinHtml(color: string): string {
  return (
    '<span style="display:flex;width:32px;height:32px;align-items:center;justify-content:center">' +
    '<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;' +
    `transform:rotate(-45deg);background:${color};border:3px solid #fff;` +
    'box-shadow:0 4px 10px rgb(0 0 0 / 0.35);box-sizing:border-box"></span></span>'
  );
}

const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

/** JSON safe to embed in an inline <script> (no `</script>` or `<!--` can close it). */
export function scriptJson(value: unknown): string {
  const backslash = String.fromCharCode(92);
  return JSON.stringify(value)
    .replace(/</g, `${backslash}u003c`)
    .replace(/>/g, `${backslash}u003e`)
    .replace(LINE_SEPARATOR, `${backslash}u2028`)
    .replace(PARAGRAPH_SEPARATOR, `${backslash}u2029`);
}

export function attribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
