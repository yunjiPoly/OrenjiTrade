# Phase contracts

Orchestration contracts written before each phase so backend, web and mobile work converges.
The backend implements the contract; the exported `../openapi.json` then supersedes these
documents for field-level truth. Update a contract if implementation deliberately deviates.

| Phase | Document |
| --- | --- |
| 1 | [Auth, users, profiles, location, settings, deletion](phase1-auth-users.md) |
| 2 | [Card catalog](phase2-catalog.md) |
| 3 | [Inventory and binders](phase3-inventory.md) |
| 4 | [Map discovery and search](phase4-map-search.md) |
| 5 | [Private chat, realtime, community](phase5-chat.md) |
| 6 | [Wishlist and notifications](phase6-wishlist-notifications.md) (its wishlist part is history since S2) |
| 7 | [Ratings, reports, admin, auto-delist](phase7-ratings-reports-admin.md) |
| 8 | [Offers and trades](phase8-offers-trades.md) |
| 9 | [Payments and disputes](phase9-payments-disputes.md) |
| 10 | [Freemium, credits, ads, donations](phase10-freemium-credits-ads-donations.md) (removed by stage F1, ADR 0019, except the usage limits) |
| S1 | [Platform regions and the self-declared location (ADR 0017; supersedes the geography of 1, 3, 4, 6, 10)](s1-regions-location.md) |
| S2 | [A simpler wishlist, wishlist alerts, no matches (supersedes the wishlist of 6)](s2-wishlist.md) |
| S5 | [Inventory import: YDK deck files and Collectr CSV exports](s5-inventory-import.md) |
| R2 | [The inventory and adding cards of the phone redesign: the price as typed, a condition not stated, undo a delete (extends 3)](r2-inventory-phone.md) |
| R3 | [Binders and deck cores: the deck core fields, binder photos, key cards, deck cores in search and on the map (extends 3, 4 and the map of S1)](r3-binders-deck-cores.md) |
| R4 | [Messages and Mark as sold: the chat's subject, sharing one's own card, sales and their undo, the SALE interaction, the buyer's notification (extends 5, 6 and 7)](r4-messages-sales.md) |
| R5 | [Search: collectors by name while a card is typed, the holders of a card grouped by province, wishlist availability, blocked collectors left out of the collectors of search, no search text in analytics (extends 4, 6 and S2)](r5-search.md) |
| R6 | [Profiles: the profile page as the phone reads it, "I have it" (extends 1, 3, 7 and R4)](r6-profiles.md) |
| Scan | [Card scan: match the text read on a card, add the scanned cards](card-scan.md) |
| G | [One game at a time: One Piece, `hasCards`, binders of one game with their two 409s, `game=` on the discovery reads the phone calls (extends 2, 3, 4, R3, R5 and S2)](g-one-game.md) |
| R7 | [Home's feed: `GET /feed` (new cards per collector and hour, public wishes, public deck cores of a region and game in the last 30 days, by cursor), V133 `binder.core_since` (extends 3, S2, R3 and G)](r7-home-feed.md) |
| R9 | [Notifications and the bell: `excludeTypes` on the notification list and unread count, the rows' new `data` keys (extends 6, S2 and R4)](r9-notifications.md) |
| R10 | [Card data for Magic and Pokémon: the providers `scryfall` (mtg) and `tcgdex` (pokemon) for the existing imports, `hasCards` after a first import, printings on their own artwork; no endpoint, field or migration (extends 2 and G)](r10-card-sources.md) |
| R11 | [Messages › Community, one simple room per game: the 15 rooms (V134, the other channels archived), `lastPost` on the channels, posts with photos (`photoUploadIds`, `COMMUNITY` uploads of 3 MB), the author's place and a shared deck core's details (extends 5)](r11-community-rooms.md) |
| R12 | [Sign-in, sign-up and welcome: `GET /me/profile/handle-availability` (the welcome's live handle check, 60 per 10 minutes); the age asked at sign-up or on Review our terms, three welcome steps, no other API change (extends 1)](r12-sign-in-welcome.md) |
| R13 | [Settings (47 to 59): an optional `tags` on `PUT /me/profile` (Edit profile's one save, one transaction); no migration, no other API change (extends 1)](r13-settings.md) |

Stages S3 (printing-aware search, "Who wants it", "Wanted by N", search history) and S4 (photos in
community posts) of the owner's change of 2026-10-08 have no contract: the owner skipped them on
2026-10-13 and nothing of them is built (`docs/product/2026-10-08-change-delivery-report.md`). The
phone redesign of 2026-10-14 (`docs/product/specs/2026-10-14-phone-redesign.md`) adds its own
contracts for its new endpoints, one per stage (R2 to R7 above); the owner's prompt of 2026-10-19/20
(`docs/product/specs/2026-10-20-finish-the-phone-ui.md`) adds G and R9 to R15.
