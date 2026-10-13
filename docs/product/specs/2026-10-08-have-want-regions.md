# Owner spec 2026-10-08: have/want inventory, printing-aware search, platform regions, state map, community photos, YDK + Collectr import

> Pasted by the owner on 2026-10-08 as the task for Claude Code. Authoritative for the stages S1-S6
> (see `docs/development/claude-handoff.md` for the stage plan and status). It overrides older rules
> in CLAUDE.md, ADR 0004 and ADR 0010 where they conflict. Kept verbatim; the `/mnt/project-files/...`
> path in section 6 does not exist in this repo (the Collectr import is built from section 6 itself).

---

You are working in the OrenjiTrade monorepo (local web app in apps/web-angular, Spring Boot API in apps/api, PostgreSQL in Docker; Expo mobile dev client in apps/mobile uses the same local API). Implement the product changes below. The owner decided them on 2026-10-08 and they override older rules in CLAUDE.md, ADR 0004 and ADR 0010 where they conflict; update those documents as part of this task.

The product goal (main focus): an easy inventory system where a collector sees what others HAVE and what others WANT. Help a collector find the card they want, with or without a specific printing/rarity, see who has it in their region, and see who wants the cards they own. Search is the core of the app and must work fully without ever opening the map.

## 0. Before changing anything

Read CLAUDE.md, IMPLEMENTATION_STATUS.md, ADR 0004 (collector location privacy), ADR 0005 (multi-TCG data model), ADR 0010 (map provider abstraction), ADR 0012 (Postgres search), ADR 0015 (card images). Then inspect, at minimum:
- Catalog: V013__catalog.sql (card, card_set, card_printing), V101__yugioh_catalog_fields.sql (a printing code can exist in several rarities; rarity is part of the printing key), apps/api/.../cards (CatalogService, CardController, YgoProDeckMapper: YGOPRODeck card ids are stored as card.external_ref {provider, id}).
- Search: apps/api/.../search (SearchController: /api/v1/search, /search/card-holders, /search/suggest; SearchService, CardHolderRepository, CollectorSearchRepository, GeoScopeResolver, DiscoveryController /collectors/nearby and /collectors/{handle}/preview, DiscoverySql, MarkerRanking).
- Location: apps/api/.../location (user_location from V005__location.sql, ApproximateLocationService, RegionGeocoder/StaticRegionGeocoder, DistanceBucket, LocationService, TradingAreaChangedEvent, DiscoverabilityPolicy), privacy_settings.discoverable (V004).
- Wishlist: V050__wishlist.sql (card_id/printing_id/rarity/radius_km), WishlistMatchRepository, WishlistMatcher, WishlistRules, WishlistInventoryListener, WishlistRematchJob.
- Community: V041__community.sql, CommunityService, RegionChannelListener, features/community (post-composer), admin community moderation.
- Uploads: messaging ImageUploadService/UploadController (content sniffing, re-encode, EXIF/GPS strip), ImageUploadInspector, common/storage ObjectStorage + PublicMediaController.
- Inventory: V022__inventory.sql (inventory_item.printing_id NOT NULL, no rarity column), InventoryController and the web features/inventory add-card dialog.
- Web: features/search (unified-results, card-holders, holder-row, collector-result), features/catalog/card-detail (the "Selected printing" block that silently defaults to the first printing, the "Who has this near me" link that ignores the selected printing, PrintingsTableComponent), features/map (map-page, map-canvas, discovery-panel, collector-list), shared/map (MapAdapter, GoogleMapsAdapter, LeafletMapAdapter, approximate-area.ts), shared/location (trading-area-picker, city-presets, my-location.store), shared/domain/location-labels.ts, features/onboarding ("Trading area" step), features/settings/trading-area, features/collectors/collector-profile-view, the app shell header.
- Mobile: apps/mobile map tab (src/components/map/CollectorMap*, MapOverlay, constants.ts). It currently calls only GET /api/v1/meta.
- Plan settings that use distance (e.g. map.radius.max_km and its plan perks), analytics events that carry grid_cell or distance, seeds in db/seed, and every other usage of public_point, publicLabel, distance buckets, radiusKm, lat/lng found by grep across api, web, mobile, packages and docs.
Also check whether a CSV inventory import already exists (a Collectr CSV import prompt was written earlier; it may or may not be implemented). Extend what exists; do not build a parallel model.

Extend working code. Keep the modular monolith, REST /api/v1, generated OpenAPI + packages/api-client, Problem Details errors, RBAC, feature flags and admin-configurable settings exactly as the repo does them. Never edit an applied Flyway migration; add new ones.

## 1. Platform regions replace geolocation (no location data stored)

Decision: OrenjiTrade no longer stores or uses any coordinates or GPS. There are no distances and no "nearby". The platform is split into 3 regions:
- Americas (North): Canada, United States, Mexico, Central America, Caribbean (default).
- Americas (South): South American countries.
- Europe: European countries.
Put the region list and the country-to-region mapping in the database (seeded in a new migration, editable via the existing admin settings pattern), not in hard-coded constants. Verify the default country lists and say what you chose.

What a user declares (self-declared text/codes only, no coordinates, no geocoding, no device location):
- country (ISO 3166-1 alpha-2), required to be discoverable; the platform region follows from it;
- state/province/first-level subdivision (ISO 3166-2 code), required to be discoverable;
- city: optional free text (trimmed, max 80 chars, validated, moderated like other profile text), never geocoded;
- "Show my city on my profile" toggle, default on. When off, the profile shows only state/province + country.
- Discoverable stays opt-in, default off.

Where it is shown:
- City appears only on the user's own public profile page (if not hidden). Everywhere else (search results, holder lists, binder lists, previews, alerts, messages headers) shows state/province + country only.

Data changes:
- New migration(s): store country, subdivision code and city + show_city flag (in the location module or profiles, whichever fits the existing ownership; justify). Drop the coordinate data entirely: user_location home_point, trading_area_center, trading_area_radius_m, public_point, grid_cell, source, and any geography indexes on them; drop the table if nothing else remains in it. There are no real users (only fictional seed/test data), so no backfill: existing accounts simply have no location until they set one. Update db/seed with fictional countries/states/cities spread across all 3 regions.
- Delete ApproximateLocationService, RegionGeocoder/StaticRegionGeocoder, the HMAC jitter secret/config, DistanceBucket, GeoScopeResolver radius logic, TradingAreaChangedEvent consumers that depend on points, the trading-area picker and city presets, approximate-area.ts, distance labels, and the `map.radius.max_km` setting and any plan perk built on radius (list the perks you removed in your summary). Remove lat/lng/radiusKm parameters from public APIs.
- Do NOT remove the PostGIS image/extension in this task (it is a CLAUDE.md stack decision). Note in the new ADR that it is now unused by location and that removing it is a separate decision.
- Replace /api/v1/me/location/trading-area with a simple endpoint to read/update country, subdivision, city, showCity (validated against the seeded country/subdivision lists; unknown codes are 400 Problem Details). Keep GET/DELETE semantics where they exist.
- Analytics: replace grid_cell/distance with region and subdivision code.
- Privacy test: keep GeoPrivacyContractTest (or its equivalent) and change it to assert that no response anywhere contains coordinates, distances, or a hidden city, and that city appears only in the owner's public profile response.

Onboarding and settings:
- Replace the onboarding "Trading area" step with "Where are you?": region (preselected from the header switcher), country, state/province (list filtered by country), city (optional), "Show my city on my profile", and the existing discoverable toggle. No map, no GPS button. Same change in settings (rename the Trading area settings page to Location or similar).
- Users without a location keep working (search uses the region chosen in the header) but cannot be discoverable until country + state are set; prompt them gently.

Region switcher:
- Add a region selector at the top left of the app shell header: "Americas (North)", "Americas (South)", "Europe". Default: the signed-in user's home region; signed out: last choice (localStorage, wrapped in try/catch) else Americas (North). Changing it re-scopes search, holder lists, the map and binder lists. Every scoped API call sends the region explicitly (e.g. `region` query parameter); the server validates it and never trusts it for authorization.

## 2. Card search: any printing or a specific printing, and who has it

Today's problem (reproduce it first): searching "ash blossom" lands on the card page with "Selected printing MACR-EN036" chosen silently; the user cannot easily pick another printing or rarity, "Who has this near me" ignores the selected printing, printing chips show no rarity, the holder search has no rarity filter, and a printing code shared by several rarities cannot be told apart.

Implement:
- Search results list cards first, each showing number of printings and number of collectors in the current region who list it. Searching a printing code (MACR-EN036), a set code (MACR) or a rarity word/abbreviation together with a name (e.g. "ash blossom qcsr", "ash blossom quarter century") narrows results; verify rarity names against the yugioh GameSchema rarities and keep the parsing in one place per game. A code shared by several rarities shows all of them, never a silent pick. Keep Postgres full-text + pg_trgm (ADR 0012); add indexes only if EXPLAIN shows a need.
- Card page: replace "Selected printing" with a printing picker at the top:
  - First option "Any printing", selected by default (no more silent first printing).
  - Every printing as a row/tile with image (existing card-image endpoint, never hotlink), set name, code, rarity, edition, language, finish, market price if any, and the number of collectors in the region who have it. Printings with holders sort first.
  - Filters above the list: rarity, set, edition, language. Choosing only a rarity means "any printing with this rarity" (e.g. any Quarter Century Secret Rare Ash Blossom).
  - The selection is reflected in the URL (`?printing=` and `?rarity=` etc.) so it can be shared and survives reload.
- Directly under the picker, the "Who has it" list updates for the current selection and region:
  - Any printing: every collector with any version; each row states the exact printing code + rarity + condition + edition + language they own.
  - A specific printing: only that printing.
  - Filters: rarity, condition, edition, language, price range, accepts offers, availability, country and state/province within the region. Sort: newest listing (default), price, best rated. No distance anywhere.
  - Rows show handle, rating, state/province + country, item details, price or "Make an offer", and link to message/offer actions that already exist.
  - Empty state explains what to change ("No one in Americas (North) lists this printing yet. Try Any printing or another rarity.") and offers "Add to wishlist" with the current selection.
- Backend: extend /api/v1/search/card-holders (or the existing service behind it) with rarity filter, region + optional country/subdivision filters, per-printing holder counts for a card (one efficient grouped query, not N+1), and the new sorts; remove distance sort/radius. Exclude the caller's own items and non-discoverable/blocked/paused users exactly as today. Keep cursor pagination.
- "Add to wishlist" and "Add to inventory" use exactly what the picker shows (any printing + optional rarity, or one printing); the wishlist form is the simplified one from section 4. Inventory still requires a concrete printing: if "Any printing" is selected, the add dialog asks the user to pick one.
- Rename the card page button "Who has this near me" (card-detail-page.component.html) to "Find this card": it scrolls to / focuses the "Who has it" list for the current printing selection (no longer a link to the map). Replace every "near me"/"near you"/"nearby" wording in search and holder pages (e.g. card-holders.component.ts "Who has this card near you") with region wording.
- Search history in the search box (header search and the search page):
  - On focus with an empty box, show the user's recent searches (newest first, max 10 shown, keep 20), each removable, plus "Clear history". Selecting one re-runs it, including its filters/printing selection when it came from a card page. Keyboard accessible (arrow keys, Enter, Delete) and combined with the existing /search/suggest suggestions while typing (history matches first, visually distinct).
  - Signed in: store server-side per user so it follows them to mobile (new small table + GET/DELETE /api/v1/me/search-history and delete-one; record entries server-side when a search is run, de-duplicated by normalized query, capped at 20 per user by deleting the oldest). Signed out: localStorage only (try/catch). On sign-in do not upload the anonymous history.
  - Privacy: history is private to its owner, never in analytics beyond counts, deleted with the account, included in the user's data export if one exists, and a privacy setting "Save my search history" (default on) disables recording and clears it.
- Fix the unified search banner ("Near you", "Who has X", "N collectors list it nearby") to region wording and to link to the card page with the current selection.

## 2b. See what others want (have/want in one place)

The repo already has privacy_settings.wishlist_visible (V004, default false) and a public wishlist summary; inspect how it is used before adding anything.
- Card page: next to "Who has it", add "Who wants it" for the same printing selection and region: collectors whose wishlist (visible per wishlist_visible) includes this card/printing/rarity, showing handle, rating, state/province + country, the wanted printing or "any printing" with rarity, the public note, and the NM / % TCG chips, and actions Message / Make an offer. Show both counts on the tabs or headings ("Have it (12) Â· Want it (5)").
- Inventory page: on each of my items show "Wanted by N in <region>" (matching the same rules as wishlist alerts, from visible wishlists) with a link to the list of those collectors, and a filter/sort "Wanted by others". This is the main way a collector sees demand for what they own. Use one grouped query, not one query per item.
- Search results: each card row shows have and want counts for the region.
- Onboarding and wishlist page: explain that making the wishlist visible lets owners find you, with a toggle bound to wishlist_visible (keep its default off; it is a privacy choice). Wishlist alerts still work for hidden wishlists.
- Private wishlist notes are removed in section 4; only the public note is shown. Exclude blocked users both ways and non-discoverable users exactly like holders.

## 3. Map: country map with clickable states (no people)

- Remove Google Maps completely from web (GoogleMapsAdapter, API key config, docs, env examples). Keep a single Leaflet-based adapter or replace the MapAdapter abstraction with a simpler component if nothing else needs it; justify. Draw vector boundaries only (no street tiles, no third-party tile requests).
- Bundle simplified boundary GeoJSON/TopoJSON for the countries of the 3 regions and their first-level subdivisions as static web assets. Use a public-domain source such as Natural Earth admin-0/admin-1; verify the license and attribution requirements, record the source, version and license in docs, simplify so the bundle stays small (state the size), and make the subdivision codes match the ISO 3166-2 codes used in profiles. Lazy-load per region.
- The map shows the countries of the selected region with their states/provinces outlined and shaded by number of public binders (from a counts endpoint). No collectors, no pins, no points.
- Clicking a state/province opens a panel (and a URL like /map?region=..&subdivision=..) listing the public binders of discoverable collectors in that state/province: binder name, owner handle, state/province + country (no city), card count, last updated, link to the binder. Cursor pagination, skeleton, empty state, error with retry, keyboard access (states must also be reachable from an accessible list, not only by mouse).
- The old "List" button / "Collectors nearby" panel becomes this binder list. Remove /collectors/nearby and the collector map preview, or replace them with the new endpoints; update callers.
- New endpoints (names are a suggestion, follow repo conventions): GET /api/v1/regions (regions, countries, subdivisions), GET /api/v1/regions/{region}/binder-counts, GET /api/v1/regions/{region}/subdivisions/{code}/binders. Public, cacheable only for anonymous responses per existing caching rules.

## 4. A much simpler wishlist (and no matches feature)

The owner finds the wishlist too complicated. Inspect apps/web-angular/src/app/shared/wishlist (wishlist-item-dialog, wish-criteria-fields, wishlist-labels, wishlist-form), features/wishlist (list, wish-card, wishlist-summary, match-readiness, matches/, data/wishlist-matches.store) and the api wishlist module (V050, WishlistController, WishlistMatcher, WishlistMatchRepository, WishlistRules, WishlistInventoryListener, WishlistRematchJob).

A wish now has only:
- The card and "which copy": Any printing (default) or one printing, plus optional rarity, chosen with the same printing picker as the card page. Edition is dropped as a separate field (a specific printing already fixes it).
- Public note (first field in the form, optional, max 280 characters, plain text, checked with the existing TextModerationService). It is shown to others wherever the wish is visible ("Who wants it", the owner's public wishlist).
- Optional checkboxes below the note:
  - "Near Mint only" (NM).
  - Price terms relative to the TCG market price, at most one selected: e.g. "80% TCG", "85% TCG", "90% TCG", "100% TCG", "100% TCG+". Keep the option list in an admin-configurable setting (seeded with these values), not hard-coded. These are display terms for sellers, not a filter. When the printing has a market price, show the approximate amount next to the term ("85% TCG â‰ˆ 21.25 USD"); with "Any printing" show only the term. Verify where card_printing.market_price comes from (YgoProDeckMapper fills it from YGOPRODeck set prices, which are TCGplayer-based USD) and label it accurately in the UI ("TCG market price" with the source and date in a tooltip).

Remove from the form, API, DTOs and database (new migration; there are no real users, so drop the data rather than migrate it):
- The "Deal" section: maximum price and currency.
- The "I want to" section (trade / buy preference).
- The "Distance" section and radius_km.
- Private notes (do NOT copy them into the public note; they were private).
- Language and minimum condition (condition is replaced by the "Near Mint only" checkbox).

Remove the matches feature entirely: the wishlist_match table and repository, match counts, "Matches nearby" summary, match-readiness, the matches sheet and wish-match cards, dismiss-match endpoints, the rematch job's match storage, related notifications that link to matches, analytics on matches, and their tests and docs. Remove the "Match alerts on" toggle from the form.

What replaces it (default chosen; tell the owner in your summary): wishes still drive two things without storing matches:
- "Who wants it" on the card page and "Wanted by N" on inventory items (section 2b), computed live from visible wishlists.
- A simple wishlist alert notification when someone in the wish owner's region lists a public item that fits the wish (card/printing/rarity, plus NM if checked): "<card> <code> <rarity> was just listed by @handle in <state>, <country>." It links to the card page "Find this card" list with the wish's selection. On/off lives in notification settings (one switch), not in each wish. De-duplicate so the same item never notifies the same user twice (a small sent-alert key is fine; it is not a matches list). Owners without a location get no alerts and a prompt to set country/state.

Wishlist page: a clean list of wished cards with image, which copy, public note, NM / % TCG chips, edit and remove, plus the existing wishlist_visible toggle explained ("Let others see what you want"). Keep the existing plan limit on wishlist size if one exists.

## 5. Community: photos only (no videos)

- Posts may include up to 4 photos (make the count an admin setting, default 4). No video uploads at all; reject video types.
- Each photo max 3 MB (admin setting, default 3, server-enforced in addition to the client check). JPEG, PNG or WebP detected from content, not extension.
- Reuse the existing image upload pipeline (content sniffing, decompression-bomb guard, re-encode, EXIF/GPS stripped, ImageUploadInspector hook) with a community-post kind; uploads not attached to a post expire like message uploads. Store via common/storage. Optional alt text per photo.
- Feature flag (e.g. communityPhotos), rate limit per user, reportable with the post, shown in the admin community moderation queue; removing a post, a moderation removal or account deletion deletes its files.
- Composer: add photos with preview and remove; post view shows a responsive gallery with a lightbox; skeleton and error states.
- This is unrelated to payment disputes: ADR 0011's ban on unboxing-video evidence stays unchanged.
- Region channels: stop creating channels from the old location label (RegionChannelListener). Seed one channel per platform region; archive (do not delete) existing city channels.

## 6. Inventory import: YDK files and Collectr CSV

Add an "Import" entry on the inventory page with two sources sharing one preview â†’ commit flow (if a CSV import already exists, extend it):
- Collectr CSV: follow /mnt/project-files/prompts/collectr-csv-import.md if not yet implemented (user exports CSV from Collectr; we never call or scrape Collectr; never store Collectr prices; header detected with aliases because the real header is unconfirmed).
- YDK (YGOPro deck file): text file with `#main`, `#extra`, `!side` sections, one card passcode per line, `#`-comments. Parse all three sections (user can untick sections in the preview), count repeated passcodes into quantities, ignore blank/comment lines, reject non-text or oversized files (admin setting, default 100 KB / 500 lines).
  - Match passcodes to Yu-Gi-Oh! cards via card.external_ref (provider ygoprodeck, id = passcode). Alternate-artwork passcodes may only exist as YGOPRODeck image ids; check card_image external ids as a fallback and report unmatched passcodes clearly.
  - YDK has no printing or rarity: each row needs a printing. Preselect when the card has exactly one printing; otherwise the row is "Choose printing" with the same picker component as the card page, plus a bulk action "Use the most recent printing for all unchosen rows" (most recent by set release date; verify the field exists).
- Shared rules: authenticated, actor from token, preview stored server-side short-lived and owned by the user, commit is one idempotent transaction, merges duplicates (same printing + condition + edition + language) instead of doubling, items Private by default, respects freemium inventory limits and the Redis rate limiter, Problem Details error codes, never logs file contents. Default condition for YDK rows: the repo's safest default, shown and editable in the preview.

## 7. Mobile (keep it working)

- The mobile app must still build and start against the changed API. Update the map tab placeholder copy (no "nearby", no "approximate positions"); a mobile version of the region switcher, search and state binder list is a follow-up, not this task. Do not remove react-native-maps in this task; list it as a follow-up.
- Regenerate packages/shared-types if the mobile client uses them.

## 8. Docs

- New ADR "Platform regions instead of geolocation" superseding ADR 0004's location model; amend ADR 0010 (Google Maps removed, boundary map only).
- Update CLAUDE.md: replace the "exact collector coordinates" privacy section with the new rule (no coordinates or GPS are collected or stored; only country, state/province and optional city; city only on the owner's profile and hideable; no distances), remove Google Maps/MapAdapter mentions, and record the community photo limits. Keep everything else.
- Update IMPLEMENTATION_STATUS.md, README/local setup (no GOOGLE_MAPS_API_KEY), test-accounts doc, privacy policy draft text about location, and API contract docs.

## 9. Tests

- API unit: region/country/subdivision validation, rarity query parsing, YDK parser (sections, duplicates, comments, CRLF, bad lines), CSV mapping, wishlist region matching.
- API integration (AbstractIntegrationTest): holder search any-printing vs printing vs rarity-only with region and state filters; per-printing counts; binder counts and state binder list exclude non-discoverable/blocked users; city hidden everywhere except the owner's profile and absent when showCity=false; no response contains coordinates or distances; wishlist alert fires for same region and not for another region; community photo limits (count, 3 MB, video rejected, EXIF stripped, files deleted on removal); import preview/commit, ownership, idempotency, merge.
- API integration: wish create/update accepts only the new fields (old fields rejected or ignored per repo convention), public note moderation and length, % TCG option validated against the admin list, NM-only alert filtering, no duplicate alerts for one item, no wishlist_match table or endpoints remain.
- API integration: who-wants list respects wishlist_visible, blocks and region; "wanted by N" counts on inventory; search history record/list/delete/clear, cap of 20, owner-only access, disabled by the privacy setting, deleted with the account.
- Web unit tests for the search history dropdown (keyboard), the printing picker, region switcher, onboarding location step, map panel.
- Playwright (against the E2E database, never the dev DB): search "Ash Blossom", reopen the search box and pick it from recent searches, click "Find this card", pick "Any printing" then a specific printing and a rarity-only filter, see the matching holders and the "Who wants it" list; see "Wanted by N" on an inventory item; switch region; open the map, click a state, open a binder; onboarding location step; post with 2 photos; import a fictional .ydk and a fictional Collectr CSV.
- Run the full api test suite, web lint/unit/build, mobile typecheck, and the E2E suite. Fix failures you caused.

## 10. Constraints

- No coordinates, GPS, IP geolocation or geocoding anywhere. No new third-party network calls at runtime.
- No stores, events, binder-to-binder matching, videos, or ML card scanning (still on hold).
- Do not change payments, credits, trades or messaging behavior beyond removing distance/location text.
- Pin any new dependency and justify it; prefer what the repo already uses.
- Seed and test data stay fictional.

## Definition of done

Locally (`npm run dev`): a signed-in collector chooses Americas (North) top-left, searches "ash blossom", sees all printings with rarities and holder counts, finds holders for any printing, for one printing and for one rarity, with state/province shown and no distance; sees who wants the card; clicks "Find this card"; sees recent searches in the search box; sees "Wanted by N" on their own inventory items; the map shows countries with clickable states that list binders; onboarding/settings ask only country, state and optional city with a hide toggle; the database has no coordinate columns; the wishlist form shows only which copy, a public note, "Near Mint only" and a % TCG choice; the matches feature is gone; wishlist alerts fire by region; community posts accept up to 4 photos of max 3 MB and reject videos; a .ydk file and a Collectr CSV import into inventory through a preview. All tests above pass, OpenAPI and api-client are regenerated, docs/ADRs/CLAUDE.md/IMPLEMENTATION_STATUS.md are updated. Finish with a summary of what changed, migrations added, settings/perks removed, anything you could not verify (Natural Earth license details, real Collectr header, alternate-art passcodes), and the exact next task.