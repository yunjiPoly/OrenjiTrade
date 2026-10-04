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
