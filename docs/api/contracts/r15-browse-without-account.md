# Stage R15 contract — Browse without an account (70 to 75)

> Owner prompt of 2026-10-19/20
> ([`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md)),
> section "R15. Browse without an account (70 to 75)"; mockup v50 screens 70 to 75. Extends
> [phase4-map-search.md](phase4-map-search.md) ("reduced detail" for anonymous callers),
> [s1-regions-location.md](s1-regions-location.md), [r3-binders-deck-cores.md](r3-binders-deck-cores.md),
> [r5-search.md](r5-search.md) and [r7-home-feed.md](r7-home-feed.md). No migration. One new
> endpoint (`GET /listings/owner`, members only), Home's feed opened to signed-out callers (GET
> only), and who a collector is left out of every response a signed-out caller can get. Field-level
> truth: `../openapi.json`.

"Looking is free; doing needs an account." A signed-out visitor (a *guest*) reads Home and Search
with the places of the collectors, never who they are; every write stays members only (401).

## The rule: a signed-out viewer never sees who a collector is

One rule of the privacy matrix (`PrivacyPolicyService.canSeeWho`, unit-tested in
`PrivacyPolicyServiceTest`): members only. With it, `canSeeLastActive`, `canSeeOnlineStatus` and
`canAppearInNameSearch` are false for a signed-out viewer whatever the collector's switches say.

For a signed-out caller every collector block below keeps its keys and sends `null` for who the
collector is; the state or province and the country stay (`place`), never a city or a coordinate
(ADR 0017):

| Response | Fields `null` for a guest | Kept |
| --- | --- | --- |
| `FeedCollector` (each post of `GET /feed`) | `id`, `handle`, `displayName`, `avatarUrl` | the post's `place`, its cards, wish or deck core |
| `CollectorMarker` (`GET /search/card-holders`, `GET /search`'s `collectors`) | `id`, `handle`, `displayName`, `avatarUrl`, `rating`; `lastActiveBucket` and `onlineStatus` are `HIDDEN` | `place`, `tags`, `games`, the counts, `matchingItems`, the item |
| `PublicBinderOwner` (`owner` of `GET /public/binders/{id}`, `GET /regions/{region}/binders`, `GET /regions/{region}/subdivisions/{code}/binders`, `GET /search/deck-cores`, `GET /search`'s `binders`) | `id`, `handle`, `displayName`, `avatarUrl` | `place` |

- `id`, `handle` and `displayName` of these three schemas are nullable in the contract (required,
  `["string","null"]`); `rating` keeps the project's `{"type":"null","$ref":…}` form of a nullable
  object, so a generated type may say it is always there: the phone reads it only for members.
- Collector name search finds nobody for a guest: `GET /search/collectors` answers `[]`,
  `GET /search` without a resolved card answers no `collectors`, `GET /search/suggest` holds no
  `COLLECTOR` entry, and binder search (`GET /search?types=binders`, the region and state lists
  with `q`) does not match the owner's handle (typing a handle must not list that collector's
  binders). A card name or code still finds its holders (anonymised), a binder's own name its
  binder.
- Reads by a handle the caller already has stay as they are: `GET /collectors/{handle}/binders`
  and `GET /collectors/{handle}/inventory` (no owner block in them). `GET /collectors/{handle}`
  (the profile) stays members only (401), as before.
- `region=` and `game=` scope every read for a guest as for a member; a guest without `region`
  reads Americas (North).
- Analytics events of a guest's reads carry no actor (`actor_hash` null) and no device id, as
  before (`ActorHasher`, the `AnalyticsEvent` forbidden keys).

## `GET /api/v1/feed`: open to signed-out callers (GET only)

`/api/v1/feed` joins `SecurityConfig.PUBLIC_GET_PATTERNS`. A guest reads the same posts as a member
with every field of `collector` null. A guest has no posts of their own and no blocks: the SQL
leaves out "never the caller's own" and `DiscoverySql.notBlocked` only for a signed-in caller
(`FeedRepository`, `Scope.signedIn`). Unknown game, region or kind are 400 as before.

## `GET /api/v1/listings/owner` (new, members only)

Who owns a public listing, for a member: exactly one of `itemId` (a public inventory item),
`binderId` (a public binder or deck core) and `wishId` (a wish its owner shows).

```
GET /api/v1/listings/owner?itemId=…   (or binderId=…, or wishId=…)
200 PublicListingOwner { id, handle, displayName, avatarUrl }   (never a place)
400 VALIDATION_FAILED  not exactly one of the three
401                    signed out
404 NOT_FOUND          not public right now, the owner hidden (suspended, pending deletion,
                       PRIVATE profile), a hidden wishlist, or a block either way
```

- Why: the phone keeps a guest's action ("Message", "I have it", a post's header, a holder's row,
  Report) by the listing it was about, never by a collector (a guest never gets a collector id);
  once the guest has signed in this names the collector so the action can finish.
- It reveals nothing a member does not already read in card holders, a public binder or Home's
  feed. The caller's own listing names the caller (the phone says "That’s one of your own
  listings.").
- The listing rules are the modules' own: `PublicInventoryService.publicItems` (an effectively
  public item), `PublicBinderService.publicBinders` (an effectively public binder, no block),
  `WishlistService.visibleOwnerOf` (`canSeeWishlist`, a block either way), then
  `PublicBinderService.visibleOwner` (publicly visible account, not PRIVATE, no block). It never
  counts a binder view.
- Schema name `PublicListingOwner` (the admin console's `ListingOwner { id, handle }` keeps its
  shape).

## Rate limit of signed-out discovery reads

A policy `guest-discovery` (application.yml): GET `/api/v1/feed`, `/api/v1/search`,
`/api/v1/search/**`, `/api/v1/regions/*/binders`, `/api/v1/regions/*/subdivisions/*/binders` and
`/api/v1/public/binders/**`, signed-out callers only, keyed by address, **20 requests per 10
seconds** (`RATE_LIMIT_GUEST_DISCOVERY_PER_10S`). Members keep `default-authenticated` (120 a
minute, by account); card pictures keep `card-images`; the other open reads keep
`default-anonymous` (60 a minute). Beyond it: 429 `RATE_LIMITED` with `Retry-After`.

- The address is only part of the Redis key `rl:guest-discovery:IP:<address>:<window start>`,
  which expires with its window (the limiter's one script sets the expiry on the first hit): never
  stored, never logged with a place, never used for geography (ADR 0017).
- The E2E stacks (web 8180, mobile 8090) raise it to 1000, as they raise the anonymous budget: every
  worker of a suite calls from one address.

## Writes stay members only

Every write is 401 signed out, as before (`POST /conversations`, `POST /wishlist`,
`POST /inventory/items`, …); so are `/notifications`, `/conversations`, `/collectors/{handle}`.

## The paused web

The Angular client keeps `id`, `handle` and `displayName` of the three schemas typed as before
(`WEB_CLIENT_NOT_NULL`, `packages/api-client/tools/web-omits.mjs`): the paused web builds unchanged.
At run time a signed-out web visitor reads `null` there (an owner follow-up of stage R15).

## Tests

`GuestBrowsingIT` (the feed open with the place and without who posted, `region=` and `game=`
respected, the default region; card holders and the unified search of a resolved card without who
holds it, a member reading the handle; name search, binder search by handle and the suggestions
finding nobody for a guest; the binder lists, a public binder and its items with the owner's place
only; writes and member reads 401; `GET /listings/owner` by item, binder and wish, 400, 404 for a
private item, a hidden wishlist, a block); `GuestRateLimitIT` (a tiny policy: the fourth guest read
429, a member counted apart, the one key expiring with its window); `ShippedRateLimitPoliciesTest`
(the shipped policy for each open read, signed out only, 10 seconds at most); `PrivacyPolicyServiceTest`
(`canSeeWho`, last activity, presence and name search for a guest); `GeoPrivacyContractTest`'s
signed-out pass (every open read in every region and game, the holders and deck cores of every
seeded public card, by every seed handle and name: no coordinate, distance or city, no handle,
display name or avatar with a value, no collector id anywhere, the places present). The older
tests that read names signed out (`CardHoldersIT`, `CollectorsByNameIT`, `DeckCoreSearchIT`,
`RegionMapIT`, `SearchIT`, `PublicBinderIT`, `FeedIT`) now read them as members and assert the
guest's nulls.
