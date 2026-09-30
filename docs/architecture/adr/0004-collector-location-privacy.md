# ADR 0004 — Collector location privacy model

**Status:** Accepted · **Date:** 2026-09-29 · **Non-negotiable**

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
