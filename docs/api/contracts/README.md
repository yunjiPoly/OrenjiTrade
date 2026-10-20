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
| Scan | [Card scan: match the text read on a card, add the scanned cards](card-scan.md) |

Stages S3 (printing-aware search, "Who wants it", "Wanted by N", search history) and S4 (photos in
community posts) of the owner's change of 2026-10-08 have no contract: the owner skipped them on
2026-10-13 and nothing of them is built (`docs/product/2026-10-08-change-delivery-report.md`). The
phone redesign of 2026-10-14 (`docs/product/specs/2026-10-14-phone-redesign.md`) adds its own
contracts for its new endpoints, one per stage (R2, R3 and R4 above; R5 to R7 to come).
