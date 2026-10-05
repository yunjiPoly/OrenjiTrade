# ADR 0010 — Google Maps behind a map adapter with Leaflet fallback

**Status:** Accepted · **Date:** 2026-09-29

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
