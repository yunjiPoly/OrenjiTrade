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
| 10 | [Freemium, credits, ads, donations](phase10-freemium-credits-ads-donations.md) |
| S1 | [Platform regions and the self-declared location (ADR 0017; supersedes the geography of 1, 3, 4, 6, 10)](s1-regions-location.md) |
| S2 | [A simpler wishlist, wishlist alerts, no matches (supersedes the wishlist of 6)](s2-wishlist.md) |
| S5 | [Inventory import: YDK deck files and Collectr CSV exports](s5-inventory-import.md) |
| Scan | [Card scan: match the text read on a card, add the scanned cards](card-scan.md) |

Stages S3 (printing-aware search, "Who wants it", "Wanted by N", search history) and S4 (photos in
community posts) of the owner's change of 2026-10-08 have no contract: the owner skipped them on
2026-10-13 and nothing of them is built (`docs/product/2026-10-08-change-delivery-report.md`). The
phone redesign of 2026-10-14 (`docs/product/specs/2026-10-14-phone-redesign.md`) will add its own
contracts for its new endpoints.
