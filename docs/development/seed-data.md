# Seed data plan (local / dev only)

All seed data is fictional. Locations are declared places (ADR 0017): a country, an ISO 3166-2
state or province and an optional city, spread over the three platform regions; never a
coordinate or an address. Seed runs from `SeedDataRunner` (profile `local`,
`dev`) using SQL/JSON files in `apps/api/src/main/resources/db/seed/`, idempotently (upserts keyed
by stable UUIDs). Emulator auth users are created by the same runner through the Firebase Admin SDK when the emulator host is configured.

## Collectors

Stable ids use the pattern `00000000-0000-4000-8000-0000000000NN`.

| NN | Handle | Display name | Declared place (`locations.json`) | Region | Tags | Games | Inventory profile |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | collector1 | Maïka Tremblay | CA / CA-QC, city Montréal | americas-north | Collector, Trader, Local Meetups, French, English | Yu-Gi-Oh!, Pokémon | 2 public binders (fresh), 1 private binder |
| 02 | collector2 | Devon Okafor | CA / CA-ON, city Toronto | americas-north | Player, Competitive, Shipping | Magic | 1 public binder (fresh), wishlist (visible) alerted about collector1's Azure-Eyes listing |
| 03 | collector3 | Priya Raman | AR / AR-C, city Buenos Aires (hidden) | americas-south | Collector, Vintage, High-End | Yu-Gi-Oh! | public binder last confirmed 40 days ago (STALE) |
| 04 | collector4 | Lucas Bergeron | ES / ES-MD, city Madrid | europe | Player, Casual | Riftbound | binder temporarily public (24 h) |
| 05 | collector5 | Sofia Nguyen | US / US-CA, city Los Angeles | americas-north | Collector, Sealed, Shipping | Pokémon, Magic | public binder, accepts offers on several cards |
| 06 | collector6 | Ethan Walsh | CL / CL-RM, city Santiago | americas-south | Trader, High-End | Magic, Yu-Gi-Oh! | public binder 50 days old (HIDDEN until confirmed) |
| 07 | collector7 | Amara Diallo | US / US-NY, city Brooklyn | americas-north | Player, Competitive, Local Meetups | Pokémon | private only (not discoverable) |
| 08 | collector8 | Noah Kim | FR / FR-IDF, city Paris | europe | Collector, Casual | Riftbound, Pokémon | public binder, low quantity items |
| 09 | premium_user | Camille Roy | BR / BR-SP, city São Paulo | americas-south | Collector, Trader | all four | premium plan, saved searches |
| 10 | moderator | Jordan Lavoie | DE / DE-BE, city Berlin | europe | — | — | MODERATOR |
| 11 | admin | Alex Morin | GB / GB-ENG, no city | europe | — | — | ADMIN |
| 12 | superadmin | Sam Gagnon | CA / CA-QC, city Québec | americas-north | — | — | SUPER_ADMIN |

The seed stores the declared place only (country, subdivision, city, "show my city"); the public
place is its state or province and country. Discoverability comes from `profiles.json`.

## Catalog

`MockCardProvider` supplies ~40 printings per game with invented but plausible names, set codes
and metadata that exercise the JSONB model:

- Yu-Gi-Oh!: `attribute`, `level`, `atk`, `def`, `cardType`, `monsterType`; sets `LOB`-style
  codes with collector numbers `EN001`; editions `1st Edition` / `Unlimited`.
- Pokémon: `hp`, `types`, `stage`, `weakness`; sets with `SVI`-style codes; rarities `Common`
  … `Illustration Rare`; holo variants as separate printings.
- Magic: `manaCost`, `colorIdentity`, `typeLine`, `power`, `toughness`; foil/non-foil printings;
  set codes 3 letters.
- Riftbound: `domain`, `energy`, `might`, `type`; set codes `OGN`-style.

Names must not copy real card names verbatim when paired with real set codes (use invented
names such as "Azure-Eyes Sky Dragon", "Emberfang Fox VMAX", "Tidebinder Sovereign").

### Real Yu-Gi-Oh! catalog demo (optional)

The real catalog is never part of the automatic seed. After `npm run catalog:import -- --game yugioh
--provider ygoprodeck` (see [local setup](local-setup.md#card-images-and-the-real-yu-gi-oh-catalog)),
the `real-catalog-demo` seed step (order 550, also run right after each YGOPRODeck metadata import)
adds eight real printings to collector1's public "Yu-Gi-Oh! trade binder" with stable ids
`00000000-0000-4000-8c00-0000000101a1` … `a8`: Blue-Eyes White Dragon (LOB-EN001), Dark Magician
(LOB-EN005), Red-Eyes Black Dragon (LOB-EN070) and the five Exodia pieces (LOB-EN120 … LOB-EN124),
near mint, for trade. The collector stays fictional; the cards are the provider's real catalog
entries. Nothing happens while the real catalog is absent.

## Interactions

- Conversation between collector1 and collector2 (6 messages, one card link, one binder link).
- One OPEN offer from collector5 to collector1 (cash), one COUNTERED offer between 2 and 6.
- Ratings: collector1 ↔ collector2 (completed trade), collector5 → collector1.
- One OPEN collector report from collector4 against collector6 (reason SPAM) for admin review.
- Wishlist (stage S2): collector2 wants a printing that collector1 publishes (both in Americas
  North; public note, Near Mint only, "90% TCG"), the Pokémon printing `pkm-p002a` that collector1
  keeps private (publishing it locally triggers a fresh alert) and any printing of a Magic card
  ("100% TCG+"); the seed runs the real alert pipeline on collector1's listing, so collector2 has
  one wishlist alert. The same holds for a database seeded before stage S2 and migrated since
  (V112 left its three seed wishes without note, flag or term): at the next start the seed gives
  each of them its values above while the wish is still untouched (the three fields empty and
  never edited), and sends the sample alert once. A seed wish edited locally is never changed; a
  seed wish that was paused before S2 was deleted by V112 and is simply seeded again.
- Notifications: a few read/unread for collector1.
- Plans: FREE and PREMIUM with limits (binder views/day 30 vs unlimited, wishlist alerts 5 vs
  unlimited, advanced filters off/on); premium-user subscribed.
- Delist policy: ACTIVE 0–14, AGING 15–30, STALE 31–45, HIDDEN 46+ days.
- Feature flags (migration state, V010 + V105 launch configuration): `mlScanning=false`,
  `protectedPayments=false`, `publicChat=true`, `premiumPlans=false`, `advertising=false`,
  `credits=false`, `donations=false` — every money feature off. The `local`/`dev` seed
  (`FeatureFlagSeedContributor`) then switches on `protectedPayments`, `premiumPlans`, `credits`,
  `advertising` and `donations` so those flows run with the fake providers; `mlScanning` stays off
  (Phase 11 on hold). Flags an admin already edited are kept. Staging/prod never run the seed and
  start with the migration state (see `docs/deployment/runbooks.md`, "Launch configuration").
- Community channels: one per platform region (Americas (North), Americas (South), Europe, V110),
  Looking For, New Listings, Trades, General; the former Montréal city channels are archived
  (kept for their posts, not listed to members).
