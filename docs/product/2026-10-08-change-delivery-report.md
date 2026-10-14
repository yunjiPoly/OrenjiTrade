# The change of 2026-10-08: delivery report

Written on 2026-10-14 for the owner, at the end of stage S6. It closes the change the owner asked
for on 2026-10-08 ([the specification](specs/2026-10-08-have-want-regions.md), kept word for word).
It says what was built, what was not built and why, and what can come next. It describes the
product as it is today; nothing is deployed.

Words used here:

- **Phone**: the Expo app (`apps/mobile`), on iPhone and Android. It is checked on the iPhone
  simulator of the owner's Mac.
- **Web**: the Angular web app (`apps/web-angular`). The owner paused it on 2026-10-12: it keeps
  what it had and gets nothing new.
- **API**: the server both apps talk to (`apps/api`).
- **Stage**: one piece of the change, built and reviewed on its own branch, then merged.
- **Migration**: a numbered file that changes the database (V106 is the 106th).

## The stages, in short

| Stage | What | Where | State |
| --- | --- | --- | --- |
| S1 | Platform regions instead of positions; the state map (spec sections 1 and 3) | API, web, phone | merged (#57) |
| S2 | A simpler wishlist, wishlist alerts, no matches (section 4) | API, web, phone | merged (#60) |
| M9 | The phone catches up with S1: region switcher, region map, binders of a state | phone | merged (#67) |
| Lock fix | Writes to one collector's cards and binders take turns (no more deadlocks) | API | merged (#68) |
| S5 | Import a deck file (.ydk) or a Collectr CSV (section 6) | API, phone | merged (#69) |
| S6 | Small fixes, the final documents, this report (sections 8 and 9, the definition of done) | API, phone, documents | this branch |
| S3 | Printing-aware search, "Who wants it", "Wanted by N", search history (sections 2 and 2b) | — | **not built**: skipped by the owner on 2026-10-13 |
| S4 | Photos in community posts (section 5) | — | **not built**: skipped by the owner on 2026-10-13 |

Two other pieces shipped on the way: the iOS path of the phone's test suite with the iOS defects it
found (#61, 2026-10-12), and a dark backdrop that iOS took for a dialog (#70, 2026-10-14).

## (a) What a collector can do now

### On the phone

1. **Say where they are without a map or GPS.** Region, country, state or province, and an
   optional city with a switch "Show my city on my profile". At sign-up and in Settings → Location.
   The app never asks for the phone's location.
2. **Choose the region to browse.** Americas (North), Americas (South) or Europe, with the switcher
   on top of the Map and Search tabs and in the list of card holders. Away from home a line says
   "Not your region" and one press goes back.
3. **See the region as a map.** The Map tab draws the countries and their states and provinces,
   shaded by their number of public binders. A tap on a state opens its binders. The same places
   are also a list, with a filter. A link can open a region and a state directly.
4. **See who has a card in the region**, each with their state or province and country. Never a
   distance, never a city.
5. **Make a simpler wish**: which copy (any printing, any printing of one rarity, or one printing),
   a public note, "Near Mint only", and one price choice such as "85% TCG".
6. **Get a wishlist alert** when a collector of their own region lists a card that fits the wish.
   One switch turns alerts on or off. The old "matches" are gone.
7. **Fill the inventory from a file**: a Yu-Gi-Oh! deck file (.ydk) or a Collectr CSV export,
   chosen from Files or pasted. A preview shows every line first: the printing to choose, the
   condition, the copies, the lines to leave out. Nothing is added before the collector confirms.
   New cards start private.

### On the web (before the pause)

1. Say where they are: the same fields as the phone, at sign-up ("Where are you?") and in
   Settings → Location. The old trading-area page sends there.
2. Choose the region to browse with the switcher at the top left of every page. Signed out, the
   web starts in Americas (North).
3. See the region map: states shaded by public binders, a list of states for keyboard and screen
   reader users, the binders of a state, and links such as `/map?region=europe&subdivision=FR-IDF`.
4. See who has a card in the region, with the holder's state or province and no distance.
5. Make the simpler wish, with a full printing picker ("Any printing" first) in the wish dialog.
6. Get wishlist alerts by region, with the same switch in the notification settings.
7. Staff: edit the countries of each region (`/admin/regions`) and the price choices of the wish
   form (`/admin/wishlist`).

The web has **no import screen**: the import exists on the phone and in the API only.

### Gone, on both

Distances, the 3 km zones, the trading area and its map picker, collectors drawn on a map, the
map's collector preview, Google Maps, the wishlist radius and the "matches" with their screens.

## (b) The definition of done, clause by clause

An independent verifier walked every clause on 2026-10-14 (web on its own test stack, phone on the
owner's iPhone simulator, the database, every test suite). The table keeps its findings. Clauses
21 and 22 were judged before this stage's documents landed: clause 22 is done now and clause 21 is
partly done (see their rows).

| # | Clause of the specification | State | Where | Evidence (one line) |
| --- | --- | --- | --- | --- |
| C1 | Chooses Americas (North) at the top left; the region re-scopes search, holders, the map and binder lists | done | web, phone, API | Switcher in the web header and on the phone's Map and Search tabs; switching changed the holders from Ontario to Île-de-France; an unknown region is refused (400). |
| C2 | Searches "ash blossom" | partly | web, phone, API | The search runs in the region, but the sample catalog has no such card ("Nothing matches"); a real catalog import was not allowed during the walk. |
| C3 | Sees all printings with rarities and holder counts | not built (S3, 2026-10-13) | — | Both card pages list printings with rarity, but no holder count per printing, and both still pick the first printing by themselves. |
| C4 | Finds holders for any printing, one printing and one rarity | partly | web, phone, API | Any printing: yes. One printing: the API and the links accept it, but no control on the card page. One rarity: not built (S3). |
| C5 | State or province shown, no distance | done | web, phone, API | Holder rows read "Ontario, Canada"; no response carried a coordinate or distance; `GeoPrivacyContractTest` passes. |
| C6 | Sees who wants the card | not built (S3, 2026-10-13) | — | No "Who wants it" anywhere; a collector's wishes show only on their own profile ("Looking for"), when they allow it. |
| C7 | Clicks "Find this card" | not built (S3, 2026-10-13) | — | The button is "Who has this in my region" and opens the holders of the whole card. |
| C8 | Sees recent searches in the search box | partly | phone only | The phone keeps the last 8 searches per account and segment on the device (since stage M2, 2026-10-05); the web has none; the server-side history of S3 is not built. |
| C9 | Sees "Wanted by N" on their own inventory items | not built (S3, 2026-10-13) | — | No such count on either inventory. |
| C10 | The map shows countries with clickable states that list binders | done | web, phone, API | Web: Quebec opened "2 public binders"; phone: the Map tab, the list, then Quebec with 2 binders. |
| C11 | Onboarding and settings ask only country, state, optional city, with a hide switch | done | web, phone, API | Both ask region, country, state, optional city and "Show my city on my profile"; no map, no GPS button; a state of another country is refused. |
| C12 | The database has no coordinate columns | done | database | No column named or typed like a position; PostGIS stays installed but unused, by decision. |
| C13 | The wish form shows only which copy, a public note, "Near Mint only" and a % TCG choice | done | web, phone, API | Both forms show exactly these; the price choices come from an admin setting. |
| C14 | The matches feature is gone | done | database, API, web, phone | No table, no endpoint (404), no screen. |
| C15 | Wishlist alerts fire by region | done | API, web, phone | Quebec wisher alerted by an Ontario listing, not by an Île-de-France one; the phone's alert flow passes. |
| C16 | Community posts take up to 4 photos of 3 MB and refuse videos | not built (S4, 2026-10-13) | — | Posts take text and a card or binder link only. |
| C17 | A .ydk file imports into the inventory through a preview | done | phone, API (no web screen) | Deck pasted, printing chosen, condition set for all, "Import done, 2 new cards added, 4 copies, private". |
| C18 | A Collectr CSV imports into the inventory through a preview | done | phone, API (no web screen) | CSV pasted, preview "2 new cards", added as private cards. |
| C19 | All the tests of section 9 pass | partly | API, web, phone | Every existing suite passes with retries off; the tests of S3 and S4 do not exist because those stages were not built, and the wishlist region rule has an integration test but no unit test (table in (i)). |
| C20 | OpenAPI and the api-client are regenerated | done | API, packages | Export and regeneration leave git clean. |
| C21 | Docs, ADRs, CLAUDE.md and IMPLEMENTATION_STATUS.md are updated | partly | documents, database | ADR 0017 new, 0004 superseded, 0010 amended; this stage brought the status file, the handoff, the product overview, the READMEs, the S2 wishlist contract, the deployment guide and the schema notes to today. Still stale, recorded in (h): two lines of the paused web's README (the web is not changed) and two database comments of V112 that name "Who wants it" (V112 is frozen; only a new migration can restate them). CLAUDE.md: the owner's sentences of the spec are in; six more are proposed in the last section. An independent fact check of the documents (2026-10-14) found the stale lines; the rest of what it found is fixed. |
| C22 | A final summary and the exact next task | done (this stage) | documents | This report; `IMPLEMENTATION_STATUS.md` "NEXT TASK" names the phone redesign of 2026-10-14. Not re-walked by the verifier. |

In numbers: **12 done** (11 at the walk, plus C22 with this stage), **5 partly** (C2, C4, C8, C19,
C21) and **5 not built** (C3, C6, C7, C9, C16: all of S3 and S4). Two clauses are done on one
client only: the imports (C17, C18) exist on the phone and in the API, not on the web.

## (c) What was not built, and why

| What | Decision | What it would take |
| --- | --- | --- |
| **S3 on every client**: the printing picker with holder counts on the card page ("Any printing" by default), holders by rarity and by state, "Find this card", "Who wants it", "Wanted by N" on inventory items, have and want counts in search results, the rarity and code query parsing, the search history and its privacy switch | Owner, 2026-10-13: after the map, only S5 and S6; S3 and S4 skipped until asked for. Owner, 2026-10-14 (the redesign, its section 2): the phone drops "Who wants it", "Wanted by N" and the holder counts, and keeps recent searches on the phone | An API stage (grouped holder counts, two new lists, a new history table) and then the screens of each client; on the web it also needs room in a bundle that has 0.07 kB left. |
| **S4**: photos in community posts | Owner, 2026-10-13 (skipped); the redesign keeps it skipped | An upload path like the message photos (4 photos, 3 MB, metadata stripped, videos refused), its moderation and deletion, one migration, the composer of each client. |
| **The web import screen** (and a web admin page for the import limits) | Owner, 2026-10-12: mobile only, the web is paused | The API is ready; a web page that follows the phone's steps (source, file or paste, preview, commit), on a lazy route so the main bundle does not grow. |
| **Web screens for what the phone got in M9** | Same order (web paused) | Nothing is missing on the web today: it already had the switcher and the map from S1. |

Also on hold, older decisions: card scanning with machine learning (Phase 11, since 2026-09-29),
the full French translation of the interface (2026-10-07), the Expo SDK 58 upgrade (until it is
stable), and every cloud deployment.

## (d) The migrations

All are applied and frozen (never edited again). The next one is V115.

| Migration | What it does |
| --- | --- |
| V106 `platform_regions` | Creates the regions, countries and states tables (staff can move a country to another region). |
| V107 `platform_regions_seed` | Fills them: 3 regions, 104 countries, 1,259 states and provinces (from Natural Earth). |
| V108 `self_declared_location` | Replaces the old location (centre, radius, map point) with country, state, optional city and "show my city". Every collector is hidden until they declare a place again. |
| V109 `remove_distance_features` | Removes the wishlist radius, the distance of matches, the map radius limit and its paid "wider map" day; ads target regions, countries and states. |
| V110 `platform_region_channels` | Archives the city chat channels and creates one community channel per region. |
| V111 `region_model_comments` | Database comments only: no comment describes the old model any more. |
| V112 `simplified_wishlist` | The simpler wish (public note, "Near Mint only", one price choice), the wishlist alert switch and its "already alerted" list; drops the matches. |
| V113 `inventory_import` | The import previews and their lines, the import limits (admin settings) and an inventory size limit without a number. |
| V114 `inventory_import_review_fixes` | An import of many parts reserves its room under the inventory limit; the "plain copy assumed" choice. |

## (e) Settings, plan perks and endpoints

### Removed

- **Privacy and location**: the "show my distance" switch; the trading area (centre, radius, use my
  location); the wishlist radius.
- **Plan perks**: the map radius limit (`map.radius.max_km`, Free 25 km, Premium 100 km), its
  entitlements, and the credit product "Wider map for a day" (`map_radius_day`); the Premium
  "wider map" wording.
- **Secrets and keys**: `LOCATION_JITTER_SECRET`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_MAP_ID`,
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`.
- **Wishlist**: the matches and their screens, the "dismiss" action, the per-wish alert switch, the
  nightly re-match job (Cloud Scheduler goes from 10 jobs to 9), the fields maximum price,
  currency, trade or buy, private notes, language, minimum condition and edition.
- **Endpoints**: `GET /collectors/nearby`, `GET /collectors/{handle}/preview`,
  `PUT /me/location/trading-area`, the distance sort of the card holders,
  `GET /wishlist/{id}/matches`, `POST /wishlist/matches/{id}/dismiss`.
- **Community**: the city channels (archived, not deleted).

### Added

- **Regions and places** (S1): `GET /regions`; `GET`, `PUT`, `DELETE /me/location`; the map's
  `GET /regions/{region}/binder-counts` and `GET /regions/{region}/subdivisions/{code}/binders`;
  a `region` on search, suggestions, card holders and ads; `homeRegion` on `GET /me`; staff
  `PUT /admin/regions/countries/{code}`.
- **Wishlist** (S2): `GET /wishlist/price-terms`; staff `GET` and `PUT /admin/wishlist/settings`;
  the setting `wishlist.price_terms` (80, 85, 90, 100 and 100+ % TCG); the notification switch
  `wishlistAlerts`. The perks `wishlist.items.max` (Free 20, Premium 500) and
  `wishlist.alerts.per_day` (Free 5) are kept.
- **Import** (S5): `/inventory/imports` (upload, read, lines, edit, bulk action, commit, discard,
  limits); staff `GET` and `PUT /admin/inventory/import-settings`; the settings
  `inventory.import.*` (deck file 100 kB and 500 lines, CSV 2 MB and 5,000 rows, preview kept 60
  minutes); the plan limit `inventory.items.max` (no number for any plan); 30 uploads and 30
  commits an hour per collector; the housekeeping job `inventory-import-purge` (runs after the
  hourly freshness job).

## (f) Decisions you can still overrule

Each was taken by a stage so the work could go on. Each has one place to change it.

| Decision | Today | Where to change it |
| --- | --- | --- |
| Condition of an imported card whose file names none | the lowest grade (Damaged), so nobody promises more than the card is | `ImportMatcher.defaultCondition` (one line) |
| An import never raises a card the collector shows | the copies become a private card of their own | `InventoryService.mergeTargets` |
| "Use the most recent printing" where a set holds several versions | it takes the plain copy (Unlimited, no foil) and marks the line to check | `ImportMatcher.mostRecent` |
| A "confirm all" for those plain copies | not built: each line is confirmed one at a time | a new bulk action of the import |
| A number for the inventory size limit | none for any plan | `/admin/usage-limits` (key `inventory.items.max`) |
| The import file limits | deck 100 kB / 500 lines, CSV 2 MB / 5,000 rows, preview 60 minutes | `PUT /api/v1/admin/inventory/import-settings` (no web page yet) |
| The purge of old previews | runs with the hourly freshness job | one entry in `infrastructure/terraform/modules/scheduler/variables.tf` for a job of its own |
| Showing the file's variant on an import line | not stored | a migration and a contract change |
| Import previews in the owner's data export | not exported: a preview lives an hour and what it becomes is the inventory, which is exported; previews are deleted with the account | the inventory module's `ExportContributor` (`InventoryExtensions`) |
| What Europe holds | no Russia, Turkey, Armenia, Azerbaijan, Georgia; Greenland not in Americas (North) | `/admin/regions` (data, no code) |
| The region chat channel texts | "trades, meetups, locals" | the admin channel editor (data) |
| "Near Mint only" | also accepts Mint | the wishlist alert rules (`WishlistAlertRules`) |
| One alert per collector and listing, even with several fitting wishes | yes; an alert decided while alerts were off is not sent later | `WishlistAlerts` |
| A stale card due to be hidden while its owner is writing | hidden at the next hourly run | the freshness job (waiting again would bring the deadlocks back) |
| A sponsored placement on the phone's map | none (the web's map page has one) | a placement decision; then the Map tab |
| The discoverability switch's wording | "Show me on the map" (the map lists binders, not people) | the switch's label on each client |
| The optional Cloudflare rule on `/admin` by country | documented, not applied; it is the only use of an IP's country | `infrastructure/cloudflare/README.md` |
| Blocked collectors in the collectors part of search | removed after a shared cache, so a page can hold fewer rows | the collector search cache (one per viewer) |

## (g) What could not be verified

- **Android.** This Mac has no Android SDK, so the Android run could not be verified. Only the
  Android JavaScript bundle was exported (`npx expo export --platform android`); nothing ran on
  Android. Uploads from Android (photos, import files) are expected to fail the way iOS uploads did
  before their fix; nothing here can prove it either way.
- **A real phone.** Everything ran in Expo Go on the iPhone simulator; no physical iPhone, no store
  build.
- **VoiceOver and Voice Control.** The names they would read were read from the accessibility
  tree, not heard. The label-in-name fix of this stage is checked by tests, not by Voice Control.
- **A real Collectr export.** Its column titles were never seen; the import finds columns through
  a table of known names.
- **Alternate-artwork passcodes against the real catalog.** Proven with one fictional fixture only.
- **The owner's example "ash blossom".** The local sample catalog has no real card names, and a
  real catalog import was not allowed during the walk.
- **The Natural Earth licence wording.** Recorded as public domain (ADR 0017 and
  `docs/development/regions-boundaries.md`), not re-checked.
- **Cloud timings.** Nothing is deployed; every timing is from the owner's Mac.
- **`npm run dev` itself.** The owner's ports and database are off limits for the agents; the
  same builds were walked on isolated test stacks.
- **A pinch on the map**, the status-bar tap of iOS, the Files picker with iCloud Drive, and
  device push (no EAS project).

## (h) Known defects and follow-ups

### Phone and API

Small:
- The card screen still picks the first printing by itself (the S3 picker would fix it; the
  redesign's stage R5 rebuilds the card page).
- At the largest text size the name card of a held place covers the top of the map.
- A notification's spoken name ends with two full stops ("Uruguay.. Unread").
- The collectors part of search can hold fewer rows than asked after a block (see (f)).
- A wishlist alert names no edition, and two copies listed by one collector give two alerts that
  read the same.
- A full wishlist opens the form and refuses only at save; "Add a card" preselects the first
  printing of a typed code.
- On an import line left out, the note "Taken as the plain copy…" was once seen cut; it was not
  seen again in this stage.
- The card screen's list of printings shows "Market 42.00 CAD" without the price's source (the
  spec's section 4 asks for it; the "Selected printing" price names it). The S3 picker was to
  replace that list; the redesign takes market prices off the phone's card page (its section 8).
- The stored `publicly_listed` flag of a card can be one decision behind when the freshness job
  overlaps a write of the same collector, until the next run; public reads apply the live rules,
  never the flag (the lock fix).
- The phone's web build (the one its browser tests drive) does not hold the browser's own Back
  button on the import screen (the header's back button asks; the preview is kept either way), and
  names that header button "(tabs), back".
- Two database comments of V112 still name "Who wants it", which is not built
  (`wishlist_item.public_note`, `wishlist_item.near_mint_only`). `docs/database/schema.md` says it
  right; the database itself needs a new migration to restate them, as V111 did for older
  comments. This stage adds none: the redesign's prompt numbers its migrations from V115.

Larger:
- Uploaded photos can come out rotated (the API drops the photo's orientation when it re-encodes
  it), on every client.
- Uploads from Android (see (g)).
- No time limit on inventory writes that wait for each other; the after-commit analytics listeners
  can run out of database connections when a job hides many listings at once (hardening).
- The analytics events `search_performed` and `search_no_results` carry the text a collector
  searched for, from every client (`AnalyticsText` masks e-mail addresses, decimal numbers and
  long runs of digits and keeps at most 64 characters). S3's history rule ("never in analytics
  beyond counts") was to reduce it, and S3 is not built (hardening).
- A dialog after a sheet could be invisible to VoiceOver on iOS: fixed on `main` by #70
  (2026-10-14); this branch gets it when the lead merges `main`.

### Web (paused: recorded, not changed)

- The main bundle is 899.93 kB, 0.07 kB under its 900 kB warning budget: any new web feature
  crosses it.
- The card page picks the first printing by itself ("Selected printing TMP-EN014 …"), and its
  printings table shows market prices without their source.
- The wish dialog's hint mentions a rarity filter that is not shown when all printings share one
  rarity.
- The header search opens a code shared by several printings on the first one; on a 375 px screen
  the "shared code" notice is below the fold of the wish dialog; a few small leftovers of the S2
  review (a clipped chip, focus after "Retry", a console error when the dialog closes during a
  refused save).
- The staff channel list shows the raw region code.
- No import screen, no admin page for the import limits, no label for the purge job on the health
  page.
- Its README still names "ADR 0004 rules" for the inventory's privacy notice (ADR 0017 replaced
  ADR 0004) and lists a "preview Report button" test among those of Phase 7 (the map preview and
  that test are gone since S1). Left as they are with the rest of `apps/web-angular`.

## (i) The tests of section 9

| Test asked by the specification | State | Where |
| --- | --- | --- |
| API unit: region, country and state validation | exists | `LocationServiceTest`, `RegionCatalogTest` (also `LocationIT`, `RegionsIT`) |
| API unit: rarity query parsing | missing (S3) | — |
| API unit: deck file parser (sections, duplicates, comments, CRLF, bad lines) | exists | `YdkParserTest` |
| API unit: CSV mapping | exists | `CollectrCsvParserTest`, `ImportMatcherTest` |
| API unit: wishlist region matching | partly | no unit test: the region rule is SQL (`WishlistAlertRepository`), covered by the integration test `WishlistAlertsIT` (same region alerts, another region does not, both ways) |
| API: holders by any printing, one printing, rarity only, with region and state filters | partly | `CardHoldersIT` covers card, printing, region and every existing filter; rarity and state filters are S3 |
| API: holder counts per printing | missing (S3) | — |
| API: binder counts and state lists leave out hidden and blocked collectors | exists | `RegionMapIT` |
| API: the city is hidden everywhere but the owner's profile | exists | `GeoPrivacyContractTest`, `LocationServiceTest` |
| API: no response holds coordinates or distances | exists | `GeoPrivacyContractTest` |
| API: an alert fires in the same region and not in another | exists | `WishlistAlertsIT` |
| API: community photo limits | not applicable (S4) | — |
| API: import preview and commit, ownership, repeat, merge | exists | `InventoryImportIT` (27 tests), `InventoryImportRateLimitIT` |
| API: the wish takes only the new fields | exists | `WishlistIT` |
| API: public note moderation and length | exists | `WishlistIT` |
| API: % TCG choice checked against the admin list | exists | `WishlistIT`, `WishlistRulesTest` |
| API: "Near Mint only" alerts, no duplicate alert | exists | `WishlistAlertsIT` |
| API: no matches table or endpoint left | exists | `WishlistIT`, `SimplifiedWishlistMigrationIT`, `OpenApiExportTest` |
| API: "Who wants it" respects visibility, blocks and region | missing (S3) | — |
| API: "Wanted by N" counts | missing (S3) | — |
| API: search history (record, list, delete, clear, cap, privacy switch, account deletion) | missing (S3) | — |
| Web unit: search history dropdown | missing (S3) | — |
| Web unit: printing picker | exists | `printing-picker.component.spec.ts` (used by the wish dialog) |
| Web unit: region switcher | exists | `region-switcher.component.spec.ts`, `region-context.service.spec.ts` |
| Web unit: onboarding location step | exists | onboarding, location fields and settings specs |
| Web unit: map panel | exists | the map page, state list, state panel and map specs |
| Browser test: "Ash Blossom", recent searches, "Find this card", any / one printing, rarity, holders, "Who wants it" | missing (S3) | holders by card and by printing code are covered by `map.spec.ts` and `catalog.spec.ts` |
| Browser test: "Wanted by N" | missing (S3) | — |
| Browser test: switch region | exists | web `map.spec.ts`; phone `regions.spec.ts` and `region-switch.yaml` |
| Browser test: map, state, binder | exists | web `map.spec.ts`; phone `map.spec.ts` and `map-region-binders.yaml` |
| Browser test: onboarding location step | exists | web `auth.spec.ts`; phone `location.spec.ts` and `sign-up-onboarding.yaml` |
| Browser test: a post with 2 photos | not applicable (S4) | — |
| Browser test: import a fictional .ydk and a fictional Collectr CSV | partly (phone only) | phone `inventory-import.spec.ts` and three native flows; no web test (no web screen) |
| Run every suite | exists | all green on 2026-10-14 (below) |

The last full run (2026-10-14, retries off): API 974 tests in 170 classes plus 12 catalog tests;
web 678 unit tests and 74 browser tests; phone 922 unit tests, 60 browser tests on the phone's web
build and 30 of 30 native flows on the owner's iPhone simulator; 133 script tests; the audit gate.

## (j) What can come next

**Decided by the owner on 2026-10-14: the phone redesign**, stages R1 to R8
([spec](specs/2026-10-14-phone-redesign.md)). Five tabs (Home, Search, Inventory, Messages,
Profile); offers, trades, protected payments, checkout and disputes leave the phone (the server
keeps them for the paused web); deals ship by mail with payment by e-Transfer outside the app;
deck cores; a map-first Search; new profiles. R1 starts from a `main` that holds this stage.

The other tasks wait for your choice:

1. **Resume the web**: first the import screen (the API is ready), then S3 and S4 on the web.
   It needs room in the web bundle first.
2. **S3 and S4 on the phone.** The redesign already drops S3's "Who wants it", "Wanted by N" and
   holder counts and keeps recent searches on the phone; S4 stays skipped unless you ask.
3. **Install the Android SDK** on the Mac, so the Android half of every phone change can be run
   (and the Android upload fix proven).
4. **Hardening**: a time limit on inventory writes that wait; the after-commit analytics listeners
   (fewer at once, or batched); blocked collectors in the collectors part of search; the search
   text in the search analytics events; the photo orientation on upload; the Phase 13 list
   (accessibility pass, load test, index review, backup drill).
5. **Open launch decisions** (from `docs/development/claude-handoff.md`): how a store build sells
   Premium and takes donations (ADR 0011); an arm64 PostGIS image before macOS 28; the two
   allowlisted npm advisories that expire on 2026-11-30 (`npm run audit:gate` fails after that);
   the `[to confirm]` placeholders of the legal drafts for the lawyer; OrbStack's licence terms; one
   session with VoiceOver on a real iPhone.

## Proposed sentences for CLAUDE.md (not applied)

CLAUDE.md is the owner's file; these are proposals.

1. Mobile conventions, replace the tabs clause: "expo-router tabs `Map | Inventory | Search |
   Messages | Wishlist | Profile` today; the phone redesign approved on 2026-10-14 (stages R1 to
   R8, `docs/product/specs/2026-10-14-phone-redesign.md`) changes them to `Home | Search |
   Inventory | Messages | Profile`. Until a stage lands, describe the phone as it is."
2. Working rules, add: "Owner orders in force: the web app (`apps/web-angular`) is paused since
   2026-10-12 (read, build, test and walk it; change nothing); stages S3 and S4 of the 2026-10-08
   spec are skipped since 2026-10-13 until the owner asks, and are never described as done."
3. Working rules, add: "Native runs use the iOS simulator the owner keeps booted
   (`ORENJI_IOS_SIMULATOR_UDID=<its UDID>`); never boot, create, erase or shut down a simulator.
   This Mac has no Android SDK: say 'the Android run could not be verified'."
4. Backend conventions, add: "A discovery list that pages or counts rows (card holders, binder
   search, suggestions, binders of a state) excludes both directions of a block in its SQL
   (`DiscoverySql.notBlocked`), before the limit and in the count, never by dropping rows
   afterwards. One exception exists today: the collectors section of `GET /search` reads a page
   cached for every viewer and drops blocked collectors after it (a hardening follow-up)."
5. Backend conventions, add: "Every write to `binder` or `inventory_item` starts with
   `BinderService.lockOwners`, then locks binder rows before item rows, each in ascending id and
   `FOR NO KEY UPDATE`; only the freshness job skips locked rows. See `docs/database/schema.md`,
   'Locks of binders and inventory items'."
6. Frontend conventions, mobile, add: "A Jest test file must not end with a real timer of 5 s or
   more armed (`jest.setup.ts` fails it): answer every mocked request before the test ends, or use
   fake timers."
