# ADR 0017 — Platform regions instead of geolocation

**Status:** Accepted · **Date:** 2026-10-08 · **Non-negotiable** · Supersedes ADR 0004 (collector
location privacy model) · Amends ADR 0010 (map provider) · Retires the `map.radius.max_km`
business rule (ADR 0014 data)

## Context

ADR 0004 protected collectors by deriving a public point from a private trading-area centre (a
~1 km grid snap plus a deterministic HMAC jitter) and bucketing distances. It worked, but it kept
precise coordinates in the database, a jitter secret in every environment, a geocoder, a radius
limit sold as a Premium perk, and a long list of rules (zoom caps, 3 km zones, triangulation
guards) that every new surface had to respect. The owner's product change of 2026-10-08 removes
the problem instead of managing it: OrenjiTrade stops handling positions altogether.

The product question stays "who owns, trades, sells or wants this card", answered per **platform
region** and per **state or province**, from what the collector declares.

## Decision

### No coordinates, anywhere

The platform stores, receives, derives and returns **no coordinates, no distances and no
radius**. There is no GPS, no browser or device geolocation, no IP geolocation and no geocoding:
the web sends `Permissions-Policy: geolocation=()`, the mobile app requests no location
permission, and no endpoint accepts `lat`, `lng` or `radiusKm` (unknown members are ignored and
never stored). The PostGIS image and extension stay installed (ADR 0002 keeps the option for
future, non-personal geography), but no application table has a geometry or geography column.

### Platform regions, countries, subdivisions (data, editable)

Three platform regions partition the countries served at launch:

| Code | Name | Countries |
| --- | --- | --- |
| `americas-north` (default) | Americas (North) | Canada, United States, Mexico, Central America, the Caribbean (39) |
| `americas-south` | Americas (South) | South America, the Falklands, French Guiana (14) |
| `europe` | Europe | 51 countries and territories (Russia, Turkey and the Caucasus are not served) |

- `platform_region(code, name, sort_order, is_default)`, `country(code, name, region_code,
  active, sort_order)` and `subdivision(code, country_code, name, whole_country)` (V106, seeded by
  V107). Country codes are ISO 3166-1 alpha-2 (`XK` for Kosovo, user-assigned), subdivision codes
  are ISO 3166-2 first-level codes; a territory or micro-state without useful subdivisions has one
  *whole-country* pseudo-subdivision whose code is its alpha-2 code (`PR`, `MC`, ...).
- Admins move a country to another region or deactivate it (`PUT
  /api/v1/admin/regions/countries/{code}`, ADMIN, audited `region.country.update`). The catalog is
  read through `RegionCatalog` (Redis `regions:v1`, 60 s, plus a 10 s in-process memo, evicted
  after every admin write; ADR 0014 rule: business data in the database, not in code).
- `GET /api/v1/regions` (public) returns the whole tree for pickers and the map.

### Self-declared location

`user_location(user_id, country_code, subdivision_code, city, show_city)` (V108 drops the old
table and its coordinates; every collector becomes not discoverable until they declare a
location). `GET/PUT/DELETE /api/v1/me/location`:

- country and subdivision are required, checked against the catalog (400 for an unknown or
  inactive country, or a subdivision of another country);
- `city` is optional free text, trimmed, 1–80 characters, letters, digits, spaces and `.,'’()&-`
  only, refused when it looks like a coordinate, and moderated with the profile text rules; it is
  **never geocoded**;
- `showCity` (default true) lets the owner hide the city;
- removing the location turns discoverability off; becoming discoverable without a location
  answers `409 LOCATION_REQUIRED`.

### What is public

- Every public representation carries a **place**: region, country and subdivision codes and
  names and a label such as `Quebec, Canada` (`Place` schema; a whole-country place is labelled by
  the country alone).
- **The city appears in exactly one place:** the owner's public profile (`GET
  /api/v1/collectors/{handle}`), and only while `showCity` is on. Never in search, binders,
  offers, trades, messages, notifications, the map, admin lists, exports to others or analytics.
- `GeoPrivacyContractTest` signs in as every seed account and visits every public and member
  surface: no key naming a position, distance or area (`lat`, `lng`, `distance*`, `radiusKm`,
  `publicPoint`, `tradingArea`, `gridCell`, ...), no number with more than 3 decimals, no "km away"
  wording, each city only on its owner's profile while shown, nothing coordinate-like in the logs.

### Discovery by region

- Search, card holders, binder search, suggestions, the wishlist alerts, ads and the map are
  scoped to **one platform region**: the request's `region` parameter, else the signed-in
  collector's home region, else the default (`americas-north`). Clients always send it.
- Results rank by freshness, then rating, then handle (no distance sort; the holders sort is
  `FRESHNESS` or `PRICE`).
- The wishlist matcher matches a new public listing with wishes of collectors **in the same
  region** (the old distance bucket and `radius_km` are gone; V109 deletes the stored matches and
  their notifications); the notification reads "<card> was listed by @handle in <place>".
  *Amended 2026-10-09 (stage S2, V112):* no match is stored any more; the same region rule now
  decides the wishlist alerts ("<card> <code> <rarity> was just listed by @handle in <state>,
  <country>.", once per collector and listing), see `docs/api/contracts/s2-wishlist.md`.
- The map is a **choropleth of binder counts per state/province** (`GET
  /api/v1/regions/{region}/binder-counts`) and a **list of public binders per state/province**
  (`GET /api/v1/regions/{region}/subdivisions/{code}/binders`, cursor pages of 1–50). Both are
  public; anonymous answers are cached server side (the Redis discovery cache, 60 s, invalidated
  by publications, location, privacy, account-state and region changes); signed-in answers apply
  blocks and are computed live. Like every other API answer outside the card images and media,
  they carry `Cache-Control: no-cache, no-store`, so no browser or CDN stores them; edge caching
  of anonymous answers would be a separate decision.
- The collector map endpoints (`/collectors/nearby`, `/collectors/{handle}/preview`) are removed.

### Map rendering (amends ADR 0010)

One Leaflet vector map, **no tiles and no map provider**: the web draws bundled static boundary
files, `apps/web-angular/public/boundaries/<region>.json`, fetched lazily for the region on screen,
states shaded by binder count, with an accessible list of every state beside it (keyboard and
screen-reader alternative to the map). Google Maps, its key, Map ID and adapter, the OpenStreetMap
tiles and the `MapAdapter` abstraction are removed; the CSP no longer allows any map or tile host.
The mobile Map tab shows a placeholder until it gets the same map (follow-up; `react-native-maps`
stays installed so the native build does not change). The mobile location step and settings use
pickers fed by `GET /regions`; `expo-location` and its permission strings are removed.

### Boundary data

- Source: **Natural Earth 1:10m Cultural Vectors, Admin 1 – States, Provinces, version 5.1.1**
  (`ne_10m_admin_1_states_provinces.zip` from the official `naciscdn.org` distribution linked by
  naturalearthdata.com, SHA-256
  `efc59726337323058f9446210adc96673179cd344e053666ee3d28cb58ba2b05`). Natural Earth is in the
  **public domain** (naturalearthdata.com/about/terms-of-use: no permission needed, credit
  optional); the map credits "Made with Natural Earth" anyway.
- Build: `node scripts/regions/build.mjs --ne <path to the .shp>` (one-off, owner side; the
  download, the shapefile and intermediate files are never committed). It runs **mapshaper
  0.7.59** (pinned, MPL-2.0, through `npx`, build time only), joins the ISO 3166-2 codes of
  `scripts/regions/config.mjs` (code remaps, dissolves where Natural Earth is finer than ISO
  3166-2, e.g. French regions, Spanish autonomous communities, the four UK nations), clips to a
  box per region, dissolves, simplifies (Visvalingam weighted, 3 %, keep-shapes), rounds to 0.01°
  and writes one GeoJSON per region with features `{code, country, kind: 'subdivision'}` and
  country outlines `{country, kind: 'country'}`. With `--sql <new file>` it also writes the seed
  migration (V107 came from it and is never regenerated in place).
- Committed assets: `americas-north.json` 241,416 bytes (≈ 58 KiB gzipped), `americas-south.json`
  144,927 bytes (≈ 32 KiB), `europe.json` 315,908 bytes (≈ 69 KiB). Ten subdivisions created after
  the data (e.g. `PA-10`, `ME-25`) are seeded but not drawn (`LISTED_NOT_DRAWN`), and five that
  collapse at 0.01° (four Maltese local councils and Vatican City, `TOO_SMALL_TO_DRAW`) are
  dropped by the build; the map lists both under their country. `scripts/lib/regions.test.mjs`
  checks that every drawn code is a seeded subdivision of the right country and region, every
  seeded subdivision is drawn unless listed, sizes stay under 400 KiB and coordinates have 2
  decimals at most.

### Community, analytics, ads, plans

- Community: no channel is ever created from a location; there is one REGION channel per platform
  region (`americas-north`, `americas-south`, `europe`, V110); the former city channels are
  archived, not deleted. A REGION channel's `regionLabel` must be a platform region code (the
  admin channel endpoints answer 400 otherwise), so no city channel can be recreated.
- Analytics events carry `region_code` and `subdivision_code` (the BigQuery schema replaces
  `region_label` and `geo_cell`); `city`, `distance*`, `radius*`, `grid_cell` and `geo_cell` are
  refused keys.
- Ad targeting kinds are `GAME`, `REGION`, `COUNTRY`, `SUBDIVISION`, `TAG`, `PLAN`
  (`GEO_CELL` and `REGION_LABEL` are removed; impressions and clicks store region and subdivision
  codes; the ad token carries them).
- Removed plan perks and settings: the `map.radius.max_km` usage limit (FREE 25 / PREMIUM 100),
  its entitlements, the `map_radius_day` credit product, the Premium "wider map radius" copy, the
  `showDistance` privacy setting, the wishlist radius, the `LOCATION_JITTER_SECRET` secret (code,
  `.env.example`, CI and Terraform), `orenji.location.*` and `orenji.search.*-radius` properties.

## Consequences

- The privacy rule becomes simple and testable: there is nothing precise to leak. The public
  granularity is a state or province, chosen by the collector.
- "Near me" now means "in my state or province, inside my platform region": collectors at the
  edge of a large state see the whole state. Distance sorting and radius filters are gone by
  design.
- Existing local databases lose their trading areas and their discoverability on the first start
  after V108 (by design; collectors declare a location again). No production database exists yet.
- The boundary assets are static files of the web build: no runtime network call to any map
  service, no key, no quota; updating them is an explicit, reviewed rebuild.
- Mobile follow-ups (map, region switcher) are tracked in `IMPLEMENTATION_STATUS.md`.

## Alternatives considered

- **Keep ADR 0004 and remove only the visible map points**: still stores coordinates and needs
  the jitter secret, the geocoder and the zoom rules; rejected by the owner.
- **Postal-code prefixes**: finer than a state in dense areas but country-specific, and some
  prefixes cover a handful of homes; rejected.
- **IP or device geolocation to pre-fill the location**: a third-party call and a position the
  user did not choose; rejected (the user picks from the list).
- **TopoJSON assets**: smaller, but needs a client decoder dependency; plain GeoJSON with 2
  decimals is small enough once gzipped.
