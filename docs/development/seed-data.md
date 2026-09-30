# Seed data plan (local / dev only)

All seed data is fictional. Locations are public landmarks or neighbourhood centroids in the
Montréal area, never residential addresses. Seed runs from `SeedDataRunner` (profile `local`,
`dev`) using SQL/JSON files in `apps/api/src/main/resources/db/seed/`, idempotently (upserts keyed
by stable UUIDs). Emulator auth users are created by the same runner through the Firebase Admin SDK when the emulator host is configured.

## Collectors

Stable ids use the pattern `00000000-0000-4000-8000-0000000000NN`.

| NN | Handle | Display name | Trading area (approx.) | Tags | Games | Inventory profile |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | collector1 | Maïka Tremblay | Plateau-Mont-Royal, Montréal (45.522, -73.581) | Collector, Trader, Local Meetups, French, English | Yu-Gi-Oh!, Pokémon | 2 public binders (fresh), 1 private binder |
| 02 | collector2 | Devon Okafor | Verdun, Montréal (45.458, -73.568) | Player, Competitive, Shipping | Magic | 1 public binder (fresh), wishlist matches collector1's cards |
| 03 | collector3 | Priya Raman | Laval (45.606, -73.712) | Collector, Vintage, High-End | Yu-Gi-Oh! | public binder last confirmed 40 days ago (STALE) |
| 04 | collector4 | Lucas Bergeron | Longueuil (45.531, -73.518) | Player, Casual | Riftbound | binder temporarily public (24 h) |
| 05 | collector5 | Sofia Nguyen | Mile End, Montréal (45.524, -73.601) | Collector, Sealed, Shipping | Pokémon, Magic | public binder, accepts offers on several cards |
| 06 | collector6 | Ethan Walsh | Westmount (45.483, -73.598) | Trader, High-End | Magic, Yu-Gi-Oh! | public binder 50 days old (HIDDEN until confirmed) |
| 07 | collector7 | Amara Diallo | Rosemont (45.549, -73.577) | Player, Competitive, Local Meetups | Pokémon | private only (not discoverable) |
| 08 | collector8 | Noah Kim | Old Port, Montréal (45.507, -73.554) | Collector, Casual | Riftbound, Pokémon | public binder, low quantity items |
| 09 | premium_user | Camille Roy | Outremont (45.518, -73.610) | Collector, Trader | all four | premium plan, saved searches |
| 10 | moderator | Jordan Lavoie | Griffintown (45.493, -73.561) | — | — | MODERATOR |
| 11 | admin | Alex Morin | Downtown Montréal (45.501, -73.567) | — | — | ADMIN |
| 12 | superadmin | Sam Gagnon | Downtown Montréal (45.503, -73.571) | — | — | SUPER_ADMIN |

Public map points are derived by the server (grid snap + deterministic jitter), so the seed only
stores the trading-area centre and radius (default 5 km).

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

## Interactions

- Conversation between collector1 and collector2 (6 messages, one card link, one binder link).
- One OPEN offer from collector5 to collector1 (cash), one COUNTERED offer between 2 and 6.
- Ratings: collector1 ↔ collector2 (completed trade), collector5 → collector1.
- One OPEN collector report from collector4 against collector6 (reason SPAM) for admin review.
- Wishlist: collector2 wants a printing that collector1 publishes (radius 25 km) so a fresh
  publication triggers a match locally.
- Notifications: a few read/unread for collector1.
- Plans: FREE and PREMIUM with limits (binder views/day 30 vs unlimited, wishlist alerts 5 vs
  unlimited, radius 25 km vs 100 km, advanced filters off/on); premium-user subscribed.
- Delist policy: ACTIVE 0–14, AGING 15–30, STALE 31–45, HIDDEN 46+ days.
- Feature flags: `mlScanning=false`, `protectedPayments=false`, `publicChat=true`,
  `premiumPlans=true`, `advertising=false`, `credits=true`, `donations=false` (V010 migration
  defaults). The `local`/`dev` seed (`FeatureFlagSeedContributor`) then switches on
  `protectedPayments`, `advertising` and `donations` so those flows run with the fake
  providers; `mlScanning` stays off (Phase 11 on hold). Flags an admin already edited are kept.
- Community channels: Montréal / Yu-Gi-Oh!, Montréal / Pokémon, Montréal / Magic,
  Montréal / Riftbound, Looking For, New Listings, Trades, General.
