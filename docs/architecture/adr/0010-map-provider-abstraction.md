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
