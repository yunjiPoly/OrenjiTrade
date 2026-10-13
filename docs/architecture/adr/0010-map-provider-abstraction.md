# ADR 0010 — Google Maps behind a map adapter with Leaflet fallback

**Status:** Accepted · **Date:** 2026-09-29 · Amended 2026-10-08 by
[ADR 0017](0017-platform-regions-instead-of-geolocation.md) (see the last section: the provider
abstraction is gone)

## Context
Google Maps is the intended production provider (spec §2, §4). Geographic truth is PostGIS,
not the map SDK. Local development, CI and E2E must work without a Google Maps key.

## Decision
Web map screens depend on a `MapAdapter` interface (`setView`, `setMarkers`, `onMarkerClick`,
`fitBounds`, `onViewportChange`). `GoogleMapsAdapter` (`@angular/google-maps`, Advanced
Markers, Map ID for cloud styling) is used when `GOOGLE_MAPS_API_KEY` is configured;
`LeafletAdapter` (OpenStreetMap tiles) otherwise, including in Playwright runs. Marker data
comes exclusively from `/api/v1/collectors/nearby` (public points, ADR 0004). Mobile uses
`react-native-maps` with the Google provider on Android and Apple Maps on iOS.

## Consequences
- The map key never gates development or tests; production styling still uses Google.
- No business logic in adapter code; clustering thresholds and filters live in the feature.

## Amendment 2026-10-03: zoom limits and approximate-area circles

The contract (`apps/web-angular/src/app/shared/map/map-adapter.ts`) gains, for the location
privacy rendering of ADR 0004 ("Client rendering"):

- `MapAdapterOptions.minZoom` / `maxZoom` (optional; unset keeps the provider's own limits). Both
  adapters must bound *every* zoom path with them: Leaflet through the map's `minZoom`/`maxZoom`
  options (wheel, buttons, keyboard, touch, box zoom, `setView`, `fitBounds`) plus explicit clamps
  of the initial zoom, `setView` and the `fitBounds` limit; Google Maps through
  `MapOptions.minZoom`/`maxZoom` plus a clamped `setZoom` and a `zoom_changed` guard. The shared
  `clampZoom` helper and the test `FakeMapAdapter` apply the same rule.
- `MapCircle.variant` `approximate`: a light disc sized in metres (a collector's approximate
  area), next to `area` and `search`; the look of each variant is shared by the adapters
  (`circleStyle`), and a circle whose variant changes is restyled in place.

The values (zoom cap 14, 1000 m disc radius) are privacy rules, not adapter logic: they live in
`shared/map/approximate-area.ts` and are passed in by the feature code.

## Amendment 2026-10-05: the mobile app gets the same Leaflet fallback

Running the Expo app in Expo Go on an Android emulator (the owner's free, local runtime) showed
that Google Maps cannot draw there: the Maps SDK refuses the key bundled with Expo Go
("Authorization failure"), so `react-native-maps` with the Google provider renders an empty grey
surface (no tiles, pins or circles), and a project key can only be used by a development or store
build. The mobile app therefore follows the web rule "Google with a key, Leaflet otherwise":

- `apps/mobile/src/components/map/mapEngine.ts` chooses the engine once per map:
  `native` (`react-native-maps`: Apple Maps on iOS, which needs no key; Google Maps on Android only
  in a build carrying `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` and not in Expo Go) or `leaflet`.
- `leaflet` is Leaflet + OpenStreetMap in a `react-native-webview` page
  (`src/components/map/leaflet/tradingAreaPage.ts`): Leaflet 1.9.4 from a pinned CDN URL with
  Subresource Integrity equal to the npm package's bytes (a jest test compares them), OSM tiles
  with their credit, no geolocation, no storage, navigation limited to the page (links open in the
  system browser). The page and the app talk through validated JSON messages (`ready`, `error`,
  `pick`, `viewport`) and injected `apply` / `focus` calls.
- Users: the trading-area picker (the web picker's mechanism: tap the map or drag the pin) and the
  Map tab (browse only, zoom capped at 14 as ADR 0004 requires for maps of other collectors). The
  web build of the Expo app keeps using Leaflet directly (`*.web.tsx`).

## Amendment 2026-10-05 (mobile stage M3): collector maps on the three mobile engines

The Map tab and the collector profile of the Expo app draw other collectors (ADR 0004 and its
owner rule of 2026-10-04: zones 3 km wide, never points, zoom capped at 14). One component,
`apps/mobile/src/components/map/CollectorMap` (props in `CollectorMap.types.ts`), hides the engine
chosen by `mapEngine.ts`:

- `CollectorMapNative` (react-native-maps: Apple Maps on iOS, Google Maps on Android builds with
  the project's key): each collector is a `Circle` of radius 1500 m around the public point; there
  is no `Marker` at any collector's point (count bubbles of clusters are the only markers, at the
  3-decimal average of several points); `maxZoomLevel` 14 bounds gestures, every requested camera
  goes through `regionForTarget` (centre + zoom or bounds, clamped to 14), and a guard animates
  the camera back to 14 when a settled region is past the cap. Taps are matched to the nearest
  zone in JS (`zoneAt`, with a minimum touch target), so the platforms' circle tap support does not
  matter.
- `CollectorMapLeaflet` (Leaflet + OpenStreetMap in a WebView: Expo Go and Android without a key,
  the free local runtime): a second page, `leaflet/collectorMapPage.ts` (same pinned Leaflet with
  Subresource Integrity, no geolocation, no storage), with `maxZoom` 14 on the map and the tile
  layer, a `zoomend` guard, zones as `L.circle` (radius 1500 m, not interactive) and count bubbles
  as `L.marker` + `divIcon`. Messages: `ready`, `error`, `tap` (raw tap, matched to a zone by the
  app and not kept), `cluster`, `viewport`; the app calls `layer({zones, clusters})` and
  `view(target)` with the zoom clamped first.
- `CollectorMap.web.tsx` (the web build of the app): Leaflet directly, the same rules
  (`path.orenji-zone`, `maxZoom` 14, guard).

Shared rules live outside the engines: `src/lib/approximateArea.ts` (`APPROXIMATE_AREA_RADIUS_M =
1500`, `COLLECTOR_MAP_MAX_ZOOM = 14`, the "about 3 km" wording, `clampZoom`, 3-decimal rounding),
`src/lib/mapGeometry.ts` (zoom <-> region, bounds fitting, the guard, hit testing) and
`src/features/map/collectorLayer.ts` (zones, clustering above 60 that stops at 14, cluster
expansion that never passes 14). No coordinate handed to an engine has more than 3 decimals; the
viewport the engines report is only used to size the next `GET /collectors/nearby` (centre rounded
to 2 decimals) and is never persisted (the app store dropped its stored viewport, version 3). A
map that only shows (the profile's approximate area at zoom 13) has no gestures and reports no
taps. Tested by jest (`collectorMap.test.tsx` on both native engines, `mapGeometry`,
`collectorLayer`, the privacy scan `mapPrivacy.test.tsx`), Playwright (`collector-map-page.spec.ts`
runs the WebView page in Chromium: 1500 m at zoom 14, the "+" button, wheel and requests stop at
14, no tile beyond 14; `map.spec.ts` on the web build) and Maestro on the Android emulator.

## Amendment 2026-10-08 (ADR 0017): one vector map, no provider

The product no longer shows collectors at positions (ADR 0017). The web has **one** map: a
Leaflet vector map (Leaflet 1.9.4, lazy-loaded) of the bundled Natural Earth boundary files
`apps/web-angular/public/boundaries/<region>.json`, states shaded by public binder counts, with an
accessible list beside it. There are **no tiles and no map provider**: `GoogleMapsAdapter`,
`LeafletAdapter`, the `MapAdapter` contract, `@angular/google-maps`, `GOOGLE_MAPS_API_KEY`, the Map
ID, the OpenStreetMap tiles, the zoom caps and approximate-area circles of the amendments above are
removed, and the CSP allows no map or tile host. The mobile Map tab is a placeholder until it
draws the same boundaries (follow-up); `react-native-maps` stays installed (its config plugin runs
without a key) and the mobile Leaflet WebView page, `mapEngine` and
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` are removed.

