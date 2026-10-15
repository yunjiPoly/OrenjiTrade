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
| 01 | collector1 | Maïka Tremblay | CA / CA-QC, city Montréal | americas-north | Collector, Trader, Shipping, French, English | Yu-Gi-Oh!, Pokémon | 2 public binders (fresh), 1 private binder |
| 02 | collector2 | Devon Okafor | CA / CA-ON, city Toronto | americas-north | Player, Competitive, Shipping | Magic | 1 public binder (fresh), 1 public deck core "Moth Queen core" ($95, three Yu-Gi-Oh! key cards, no photo; stage R3), wishlist (visible) alerted about collector1's Azure-Eyes listing |
| 03 | collector3 | Priya Raman | AR / AR-C, city Buenos Aires (hidden) | americas-south | Collector, Vintage, High-End | Yu-Gi-Oh! | public binder last confirmed 40 days ago (STALE) |
| 04 | collector4 | Lucas Bergeron | ES / ES-MD, city Madrid | europe | Player, Casual | Riftbound | binder temporarily public (24 h) |
| 05 | collector5 | Sofia Nguyen | US / US-CA, city Los Angeles | americas-north | Collector, Sealed, Shipping | Pokémon, Magic | public binder, accepts offers on several cards |
| 06 | collector6 | Ethan Walsh | CL / CL-RM, city Santiago | americas-south | Trader, High-End | Magic, Yu-Gi-Oh! | public binder 50 days old (HIDDEN until confirmed) |
| 07 | collector7 | Amara Diallo | US / US-NY, city Brooklyn | americas-north | Player, Competitive, Shipping | Pokémon | private only (not discoverable) |
| 08 | collector8 | Noah Kim | FR / FR-IDF, city Paris | europe | Collector, Casual | Riftbound, Pokémon | public binder, low quantity items |
| 09 | premium_user | Camille Roy | BR / BR-SP, city São Paulo | americas-south | Collector, Trader | all four | an ordinary collector since stage F1 (the former Premium account) |
| 10 | moderator | Jordan Lavoie | DE / DE-BE, city Berlin | europe | — | — | MODERATOR |
| 11 | admin | Alex Morin | GB / GB-ENG, no city | europe | — | — | ADMIN |
| 12 | superadmin | Sam Gagnon | CA / CA-QC, city Québec | americas-north | — | — | SUPER_ADMIN |

The seed stores the declared place only (country, subdivision, city, "show my city"); the public
place is its state or province and country. Discoverability comes from `profiles.json`.

Profiles are inserted once and local edits are kept, with one exception for a database seeded
before stage F1 and migrated since: while `premium_user`'s bio is still exactly the old seed text
("Collector and trader across all four games. Premium member."), the next start gives it today's
seed bio (`ProfileSeedContributor`, local/dev only). A bio written by hand is never changed.

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
names such as "Azure-Eyes Sky Dragon", "Emberfang Fox VMAX", "Tidebinder Sovereign"). A real card
name therefore finds nothing in the sample catalog: the owner's example search "ash blossom"
(specification of 2026-10-08) answers "No cards match" until the real catalog is imported (next
section).

**Deck cards for the inventory import (stage S5), end-to-end databases only.** A deck file names
cards by their YGOPRODeck passcode, which the sample catalog does not carry. With
`SEED_IMPORT_FIXTURES=true` (set by the isolated API of the mobile suites, off everywhere else, and
refused while `YGOPRODECK_ENABLED` is true) `ImportFixtureSeedContributor` adds two fictional
cards (passcodes 910000001 and 910000002) and an alternate artwork of the second (passcode
910000003); see [test-accounts.md](test-accounts.md).

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

- Conversation between collector1 and collector2 (6 messages, one card link, one binder link):
  a deal shipped by mail, paid by e-Transfer (stage R1 of the phone redesign, ADR 0018: the seeds
  hold no meetup, game store or café line, and no address: `GeoPrivacyContractTest` would flag a
  city).
- One OPEN offer from collector5 to collector1 (cash), one COUNTERED offer between 2 and 6 (the
  API keeps offers for the paused web; the phone no longer shows them).
- Ratings: collector1 ↔ collector2 (completed trade), collector5 → collector1; shipping scores, no
  meetup score.
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
- Usage limits (migrations, not the seed): the same for every collector since stage F1 (ADR
  0019): 5 binders, 30 public binder views a day, 20 wishes, 5 wishlist alerts a day, 20 offers a
  day, an unlimited inventory (`saved_searches.max`, a Premium perk of a feature never built,
  left with Premium in V123). No plans, subscriptions,
  credits, campaigns or donations are seeded any more (stage F1 removed them).
- Delist policy: ACTIVE 0–14, AGING 15–30, STALE 31–45, HIDDEN 46+ days.
- Feature flags (migration state, V010 + V105 launch configuration; the `premiumPlans`,
  `advertising`, `credits` and `donations` flags left with their features, V120 to V123):
  `mlScanning=false`, `protectedPayments=false`, `publicChat=true` — the money feature off. The
  `local`/`dev` seed (`FeatureFlagSeedContributor`) then switches on `protectedPayments` so its
  flows run with the fake provider; `mlScanning` stays off (Phase 11 on hold). Flags an admin
  already edited are kept. Staging/prod never run the seed and
  start with the migration state (see `docs/deployment/runbooks.md`, "Launch configuration").
- Community channels: one per platform region (Americas (North), Americas (South), Europe, V110),
  Looking For, New Listings, Trades, General; the former Montréal city channels are archived
  (kept for their posts, not listed to members). Their descriptions say "trades and sales by
  mail" since V116 (stage R1), no longer "trades, meetups, locals".
- Profile tags: the curated "Local Meetups" tag is hidden since V115 (stage R1); seed profiles 01
  and 07 carry "Shipping" instead.

### A database seeded before stage R1

The rows whose texts stage R1 rewrote (profiles, the seed conversation, binders and cards,
community posts and replies, offers, ratings, and before stage F1 the donation and the sponsored
campaign) are inserted once and never rewritten. A database seeded before stage R1 (2026-10-14) and migrated since keeps
their earlier texts: collector1's bio ("always up for a meetup"), the seed conversation ending "see
you Saturday at the café!", the binder descriptions, community posts and replies, the open offer's
message ("I can meet at Berri-UQAM after work."), the rating comments (the donation message and the
sponsored headline went with their tables, V121 and V120, stage F1), with their meetup, game store,
café and "trade nights" lines; collector1 and
collector7 keep the hidden "Local Meetups" tag (no longer shown,
V115) and do not gain "Shipping". Only what the migrations change follows: V115 hides the tag and
V116 rewrites the untouched region channel descriptions. The shipping texts above appear on a
fresh database: `npm run infra:reset` (it **deletes all local data**, see
[local-setup.md](local-setup.md#reset-and-reseed)), then `npm run dev`. The owner's database
`orenjitrade` (V114 when R1 was built) is in this case.
