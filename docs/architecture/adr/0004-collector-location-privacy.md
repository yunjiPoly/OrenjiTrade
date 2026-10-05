# ADR 0004 — Collector location privacy model

**Status:** Accepted · **Date:** 2026-09-29 · **Non-negotiable** · Amended 2026-10-03 (client
rendering) and 2026-10-04 (3 km zones on web and mobile)

## Context
The map is the product's centrepiece, yet collectors trade from home. Exposing exact or
re-identifiable positions is a safety failure. Repeated queries with small radius changes can
triangulate a randomly jittered point, so naive jitter is insufficient.

## Decision
`user_location` holds three distinct concepts:

| Column | Meaning | Visibility |
| --- | --- | --- |
| `home_point` (nullable) | Precise device location if the user ever shared it | Private. Only the `location` module reads it. Never serialised |
| `trading_area_center`, `trading_area_radius_m` | User-selected approximate area (map pick or city/neighbourhood) | Private |
| `public_point` | Derived, stored, indexed. Used by **every** public query | Public, by design imprecise |
| `public_label` | e.g. "Plateau-Mont-Royal, Montréal" derived for the *public* point | Public |

`public_point` derivation (server side, `ApproximateLocationService`):
1. Take `trading_area_center` (or `home_point` only if the user explicitly chose "use my
   location", and only to seed the trading area).
2. Snap to a ~1 km grid cell (`floor(lat/0.009)`, `floor(lng/(0.009/cos lat))`).
3. Offset within the cell with a deterministic pseudo-random vector seeded by
   `HMAC(user_id, server_secret)`. Same user ⇒ same public point until they change their area.
4. Persist; recompute only on trading-area change.

API rules: distance is bucketed (`< 1 km`, `~4 km`, `10–25 km`); coordinates in any response
have at most 3 decimals and are always the `public_point`; the requester's search centre is
their own trading-area centre or a client-supplied centre (the searcher's choice, never stored
as `home_point`). A contract test scans every JSON response for precise coordinates.
Analytics events carry only the grid cell id / region label. Precise meetup locations are
shared only inside private conversations by the users themselves.

## Consequences
- Public map is intentionally imprecise but stable, which also makes marker positions
  cacheable per collector.
- Users who never opt in to discoverability have `public_point = NULL` and never appear.
- Advertising targeting uses region labels and grid cells only (spec §30).

## Client rendering (amendment 2026-10-03)

> Superseded in part on 2026-10-04 (see the next amendment): zones are now 3 km wide (radius
> 1500 m) on web and mobile; the zoom cap, clustering and adapter rules below are unchanged. The
> 2 km figures are kept here as the record of the 2026-10-03 decision.

**Problem.** The server side above was correct, but the web map undid it visually: maps could
zoom to 19 (OpenStreetMap tiles; Google had no cap), every collector was a 44 px avatar centred
exactly on the public point, and clustering stopped at zoom 16. From zoom 17 one avatar covers one
house, so a jittered public point read as a precise address, usually an uninvolved neighbour's.

**Rule.** No map that shows *other* collectors may suggest a position more precise than an area
about 2 km wide, at any zoom, with either map adapter (ADR 0010). The constants live in
`apps/web-angular/src/app/shared/map/approximate-area.ts` and apply to `/map`
(`features/map/map-canvas`) and the profile map (`shared/map/approximate-area-map`), the only
surfaces that draw another collector's public point. The trading-area picker
(`shared/location/trading-area-picker`, onboarding and settings) shows the user's own private
choice to themselves only and is deliberately not capped.

1. **Zoom cap `COLLECTOR_MAP_MAX_ZOOM = 14`**, passed as `MapAdapterOptions.maxZoom`. Leaflet gets
   the map's `maxZoom` option, which bounds the wheel, the zoom buttons (the "+" button is disabled
   at 14), the keyboard, touch, double-click and box zoom, `setView` and `fitBounds`; the adapter
   also clamps the initial zoom, `setView` and the `fitBounds` limit explicitly. Google Maps gets
   `MapOptions.maxZoom` (same paths), a clamped `setZoom` and a `zoom_changed` guard that pulls
   back anything that slips past. The `/map` store never asks for more (preview focus and cluster
   zoom use the cap). *Why 14:* the Web Mercator ground resolution at zoom 14 is about 9.6 m/px at
   the equator, 6.8 m/px at 45° N (Montréal) and 6.0 m/px at 51° N (Calgary), so the 2 km disc is
   roughly 210 to 330 px wide and fits whole on a 375 px phone at our launch latitudes (always
   seen as an area), a 44 px avatar spans about 300 m (several blocks, never one house), and
   street names stay readable for orientation. At 15 the disc (about 600 px) overflows a phone and
   the avatar alone dominates the view; from 16 an avatar covers a single block. 14 was already the
   preview focus zoom and is below the former `fitBounds` limit of 15.
2. **Approximate areas, not pins.** Every collector drawn on their own keeps the avatar marker
   (recognition, click and keyboard target) on top of a translucent disc of
   `APPROXIMATE_AREA_RADIUS_M = 1000` m radius (2 km wide) centred on the public point, sized in
   metres so it grows with the map (`MapCircle` variant `approximate`; the selected collector's
   disc uses the stronger `area` look). Clustered collectors get no disc: the count bubble already
   stands for a group. The profile map draws the same shared disc (it already used a 1000 m
   radius; the constant is now shared). *Why 2 km:* it is the scale of what the point actually
   tells (the trading-area centre lies somewhere in the ~1 km cell around it), and it is display
   only. *Why a disc for every collector* rather than only the selected one: an answer has at most
   200 collectors (`NEARBY_LIMIT`), and 200 non-interactive circles are cheap for Leaflet (SVG
   paths) and Google (`google.maps.Circle`); the adapters skip unchanged discs on re-render. At
   zoom 11 and below a disc (about 37 px across at 45° N) hides behind its 44 px avatar, so discs
   only appear when zooming in, exactly when a pin would start to look exact. An 8 % fill keeps
   overlapping discs readable in dense areas. The "selected disc plus per-marker cue" fallback was
   not needed.
3. **Clustering** stops at the cap (`CLUSTER_MAX_ZOOM = COLLECTOR_MAP_MAX_ZOOM`, was 16): at the
   closest zoom every collector is drawn on their own; a cluster above the cap could never be
   opened. Threshold (60) and cell size (72 px) are unchanged.
4. **Wording.** The map legend says "Locations are approximate (about 2 km) to protect privacy"
   (its keys explain the disc), the collector preview says "Locations are approximate (about
   2 km)", the map's accessible name ends with the same note, the profile says "Approximate area
   (about 2 km) around …", and the Privacy Policy's "Public point" definition adds that maps show
   it as an area about 2 km wide. Texts about the ~1 km grid itself are unchanged.
5. **Unchanged:** `ApproximateLocationService`, the ~1 km grid (`CELL_DEG = 0.009`), the API
   contract (3-decimal public points, 2-decimal search centres, distance buckets), the database
   and `GeoPrivacyContractTest`. The web never holds a collector coordinate finer than the API
   sends, logs none and sends no client analytics.

Tests: `leaflet-map-adapter.spec.ts` (real Leaflet: initial zoom, `setView`, `fitBounds`, zoom
button, keyboard and wheel stop at 14; disc styling), `google-maps-adapter.spec.ts` (fake
`google.maps`: `maxZoom` option, clamped `setView`, guard after `fitBounds`), `map-adapter.spec.ts`,
`map-markers.spec.ts`, `marker-clusters.spec.ts`, `map-discovery.store.spec.ts`,
`map-page.component.spec.ts`, `approximate-area-map.component.spec.ts`,
`collector-preview-card.component.spec.ts`; Playwright `e2e/map.spec.ts` (preview note, discs,
zoom-in button disabled at the cap).

## Amendment 2026-10-04: collectors are 3 km zones only, web and mobile (owner decision)

**Rule.** Other collectors' locations are shown **only as zones 3 km wide (radius 1500 m)** around
their public point, never as exact points or pins on a location, and **every map that shows other
collectors is capped at zoom 14**. This replaces the 2 km discs of the 2026-10-03 amendment above
(its zoom cap, clustering and adapter rules stay as written).

- **Server: unchanged.** Same `ApproximateLocationService` (~1 km grid snap, deterministic
  per-user HMAC offset, 3-decimal rounding), same API contract (no new coordinate field, no zone
  radius in any response), same distance buckets, same `GeoPrivacyContractTest`. Clients draw the
  zone around the existing public point; no server-side radius constant is needed.
- **Web** (`apps/web-angular/src/app/shared/map/approximate-area.ts`):
  `APPROXIMATE_AREA_RADIUS_M = 1500` (was 1000), `COLLECTOR_MAP_MAX_ZOOM = 14` and
  `CLUSTER_MAX_ZOOM = COLLECTOR_MAP_MAX_ZOOM` unchanged; the note reads "Locations are approximate
  (about 3 km)" on the legend ("… to protect privacy"), the collector preview, the map's accessible
  name, and the profile's "Approximate area (about 3 km) around …"; the Privacy Policy's "Public
  point" definition says maps show it "as an area about 3 km wide, never as an exact spot". The
  policy text lives in the web app (`features/legal/legal-content.ts`, `lastUpdated` 2026-10-04),
  not in a Flyway migration; the consented `legal_document` version (PRIVACY 2026-09-01) is
  unchanged and no re-consent is asked: the change only describes a coarser display of the same
  public point (no new data, purpose, recipient or retention).
- **Mobile** (`apps/mobile`, Expo + react-native-maps, Map tab and collector profile): the same
  rule. Each collector is a soft `Circle` of radius 1500 m around the public point with no `Marker`
  pin at its centre (an avatar badge inside the zone is allowed when it does not read as an exact
  spot); zoom capped at 14 on iOS and Android (`maxZoomLevel` plus clamping of every programmatic
  camera/region change, cluster expansion and "zoom to collector"); the "approximate (about 3 km)"
  note; the collector profile's mini map uses the same zone and cap; a device location used for
  "near me" is rounded like the web's before it is sent and never drawn as a point.
- **Why 3 km at zoom 14.** The public point only says that the chosen trading-area centre lies in
  the ~1 km grid cell around it; a 3 km zone covers that cell and its neighbours, so the drawing
  never singles out a spot inside the cell (the sparse-cell question below is about the cell and the
  label themselves and stays open). Web Mercator at zoom 14: the
  zone is about 310 px wide at the equator, 450 px at Montréal (45.5° N, 6.7 m/px) and 500 px at
  Calgary (51° N): on a desktop map it is a clearly bounded area; on a 375 px phone it fills the
  width, so it is seen as an area (never a point) and the "+" button is already disabled. A 44 px
  avatar badge covers about 300 m (a few blocks) and sits on the zone's centre; the selected
  collector's zone uses the stronger `area` look. From zoom 11 down the zone (about 56 px at 45° N
  at zoom 11) shrinks behind the avatar, exactly when a pin could no longer look exact.
- **Tests.** Web unit specs: radius 1500 and the "about 3 km" wording (`map-adapter.spec.ts`,
  `map-markers.spec.ts`, `approximate-area-map.component.spec.ts`, `collector-preview-card` and
  `map-page` specs, Google adapter `radius: 1500`), zoom clamping above 14 (`clampZoom`), and the
  real Leaflet adapter drawing the zone about 224 px in radius at zoom 14 / 45.5° N that stays so
  when 17 is requested (`leaflet-map-adapter.spec.ts`). Playwright: `e2e/map.spec.ts` and
  `e2e/acceptance/map.spec.ts` try the wheel, the "+" button, the keyboard and double clicks, then
  check that the "+" button is disabled, no map tile beyond zoom 14 is loaded, the collector's zone
  measures 1500 m at zoom 14 at its latitude with the avatar on its centre, and that no DOM
  attribute holds a coordinate finer than 3 decimals (`PrivacyScanner.scanDom` in the acceptance
  suite, besides its scan of every JSON response and STOMP frame). Mobile (implemented by the mobile
  workflow, stage M3): jest tests of `CollectorMap` (circle radius 1500, no pin markers, zoom
  clamping), the preview bottom sheet and the profile screen states.

## Open questions for the owner

- **Sparse rural cells.** In rural areas one ~1 km grid cell may contain only a handful of homes
  (sometimes a single farm), so the cell plus the public label can narrow a collector to very few
  households even though the map now draws a 3 km area. Possible answers, none implemented: an
  adaptive or larger cell where housing is sparse, a coarser public label there, or advice in the
  trading-area picker to choose a nearby town centre. The grid is left unchanged until the owner
  decides.
