# Stage S1 API contract — platform regions and the self-declared location (ADR 0017)

Supersedes every geography part of the Phase 1, 3, 4, 6 and 10 contracts (trading areas, public
points, distance buckets, radius parameters, the `map.radius.max_km` limit, grid-cell and region
label ad targeting). The OpenAPI document (`docs/api/openapi.json`, generated from code) is the
source of truth; this page is the overview.

## Rule

No endpoint accepts or returns coordinates, distances or radii. Places are ISO codes chosen by
the collector. Unknown request members (an old client's `lat`, `lng`, `radiusKm`) are ignored and
never stored.

## Regions (public)

`GET /api/v1/regions` → `RegionsResponse`

```json
{ "regions": [
  { "code": "americas-north", "name": "Americas (North)", "isDefault": true,
    "countries": [
      { "code": "CA", "name": "Canada", "regionCode": "americas-north", "active": true,
        "subdivisions": [ { "code": "CA-QC", "name": "Quebec", "wholeCountry": false } ] } ] } ] }
```

Cached server side (`regions:v1`, 60 s). A whole-country pseudo-subdivision has the country's
alpha-2 code and `wholeCountry: true` (e.g. `PR`, `MC`).

Admin: `PUT /api/v1/admin/regions/countries/{code}` (ADMIN) body `{ "regionCode": "europe",
"active": true }` → `RegionCountry`; audited `region.country.update`; evicts the cache.

## My location (authenticated)

- `GET /api/v1/me/location` → `MyLocationResponse`
  `{ "location": { "regionCode", "regionName", "countryCode", "countryName", "subdivisionCode",
  "subdivisionName", "label": "Quebec, Canada", "city": "Montréal" | null, "showCity": true } | null,
  "discoverable": false }`
- `PUT /api/v1/me/location` body `UpdateLocationRequest`
  `{ "countryCode": "CA", "subdivisionCode": "CA-QC", "city": "Montréal" | null, "showCity": true }`
  → `MyLocationResponse`. 400 `VALIDATION_FAILED` for an unknown or inactive country, a
  subdivision of another country, or a city that is longer than 80 characters, uses other
  characters than letters, digits, spaces and `.,'’()&-`, looks like a coordinate or breaks the
  profile text rules. The city is never geocoded. Like every request body of the API, unknown
  properties (for instance an old client's `lat`, `lng` or `radiusKm`) are ignored and never
  stored: `user_location` has no column that could hold them.
- `DELETE /api/v1/me/location` → 204; discoverability is turned off.
- `PUT /api/v1/me/settings/privacy` with `discoverable: true` and no location → 409
  `LOCATION_REQUIRED`. `showDistance` is gone from the privacy settings.
- `GET /api/v1/me` gains `homeRegion` (the region of the declared country, absent without a
  location) and `onboarding.locationSet` (replaces `tradingAreaSet`).

## Places of other collectors

Every collector block (search results, card holders, binder owners, offer and trade parties,
wishlist matches (removed in stage S2, [s2-wishlist.md](s2-wishlist.md)), conversations) carries `place`:
`{ "regionCode", "countryCode", "countryName", "subdivisionCode", "subdivisionName", "label" }`,
absent when the collector is not discoverable. `GET /api/v1/collectors/{handle}` returns
`location` (`ProfileLocation`: the same fields plus `city`, present only while the owner shows
it). Nothing else ever carries a city.

## Region-scoped discovery

`region` (a platform region code) on `GET /search`, `/search/suggest`, `/search/card-holders` and
`/ads`; default: the caller's home region, else `americas-north`; unknown → 400. Card holders sort
`freshness` (default) or `price`; results rank by freshness, rating, handle. The
`/collectors/nearby` and `/collectors/{handle}/preview` endpoints are removed.

## Map

- `GET /api/v1/regions/{region}/binder-counts` → `{ "region": "americas-north", "total": 12,
  "subdivisions": [ { "code": "CA-QC", "binderCount": 5 } ] }` (public binders of discoverable
  collectors per subdivision; 404 for an unknown region).
- `GET /api/v1/regions/{region}/subdivisions/{code}/binders?cursor=&limit=` → cursor page of
  `PublicBinderSummary` (1–50 per page; 404 for a subdivision outside the region). Every row's
  `owner` carries `place` (state/province + country, never the city); the web panel shows it on
  each row.

Both are public. Anonymous answers are cached **server side only** (the Redis discovery cache,
60 s, invalidated by publications, location, privacy, account-state and region changes); answers
to a request with an `Authorization` header apply blocks and are computed live. Like `/meta`,
`/cards`, `/search` and `/public/binders`, every answer carries Spring Security's
`Cache-Control: no-cache, no-store, max-age=0, must-revalidate`, so neither browsers nor Cloudflare
store them (the Cloudflare cache rules cover only `/api/v1/public/card-images`,
`/placeholder-images` and `/media`). Making the anonymous answers edge-cacheable would be a
separate change (a `public` `Cache-Control` on anonymous answers only plus a cache rule).

## Wishlist, community, ads, plans

- Wishes have no `radiusKm`; matches have no `distanceBucket`: a public listing matches the wishes
  of collectors in the same platform region.
- Community: one `REGION` channel per platform region (`regionLabel` = the region code; the admin
  channel endpoints refuse anything else with 400); city channels are archived.
- Ads: targeting kinds `GAME`, `REGION`, `COUNTRY`, `SUBDIVISION`, `TAG`, `PLAN`.
- Plans: the `map.radius.max_km` limit, its entitlements and the `map_radius_day` credit product
  are gone.
