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
| 6 | [Wishlist and notifications](phase6-wishlist-notifications.md) |
| 7 | [Ratings, reports, admin, auto-delist](phase7-ratings-reports-admin.md) |
| 8 | [Offers and trades](phase8-offers-trades.md) |
| 9 | [Payments and disputes](phase9-payments-disputes.md) |
| 10 | [Freemium, credits, ads, donations](phase10-freemium-credits-ads-donations.md) |
| S1 | [Platform regions and the self-declared location (ADR 0017; supersedes the geography of 1, 3, 4, 6, 10)](s1-regions-location.md) |
