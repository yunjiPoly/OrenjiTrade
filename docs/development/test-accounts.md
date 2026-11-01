# Local development test accounts

**Local/emulator only.** These accounts exist solely in the Firebase Auth emulator and the local
seed data. They are fictional and must never be created in a real Firebase project or any
staging/production environment. Passwords below are development-only values.

| Handle | Email | Password | Roles | Declared place (region) | Purpose |
| --- | --- | --- | --- | --- | --- |
| collector1 | collector1@orenjitrade.test | LocalDev!2026 | USER | Montréal, Quebec, Canada (Americas North) | public Yu-Gi-Oh! + Pokémon binders, fresh inventory |
| collector2 | collector2@orenjitrade.test | LocalDev!2026 | USER | Toronto, Ontario, Canada (Americas North) | Magic binder, wishlist (public notes, Near Mint only, price terms) alerted by collector1's listing |
| collector3 | collector3@orenjitrade.test | LocalDev!2026 | USER | Buenos Aires City, Argentina, city hidden (Americas South) | stale inventory (tests auto-delist), private binders only |
| collector4 | collector4@orenjitrade.test | LocalDev!2026 | USER | Madrid, Community of Madrid, Spain (Europe) | Riftbound player, temporarily public binder |
| collector5 | collector5@orenjitrade.test | LocalDev!2026 | USER | Los Angeles, California, United States (Americas North) | Pokémon, Magic, accepts offers (web only); Home's feed of Americas (North) (`seed-data.md`) |
| collector6 | collector6@orenjitrade.test | LocalDev!2026 | USER | Santiago, Santiago Metropolitan Region, Chile (Americas South) | trader, binder hidden until confirmed (50 days) |
| collector7 | collector7@orenjitrade.test | LocalDev!2026 | USER | Brooklyn, New York, United States (Americas North) | player, private only, not discoverable |
| collector8 | collector8@orenjitrade.test | LocalDev!2026 | USER | Paris, Île-de-France, France (Europe) | Riftbound, Pokémon |
| premium_user | premium@orenjitrade.test | LocalDev!2026 | USER | São Paulo, Brazil (Americas South) | An ordinary collector since stage F1 (2026-10-14: no Premium any more); the handle and the sign-in are kept |
| moderator | moderator@orenjitrade.test | LocalDev!2026 | USER, MODERATOR | Berlin, Germany (Europe) | Reviews collector reports |
| admin | admin@orenjitrade.test | LocalDev!2026 | USER, ADMIN | England, United Kingdom, no city (Europe) | Full admin console |
| superadmin | superadmin@orenjitrade.test | LocalDev!2026 | USER, SUPER_ADMIN | Québec, Quebec, Canada (Americas North) | Feature flags, usage limits, destructive admin actions |

**No account: the guest (stage R15, 2026-10-25).** The phone opens on Home for a signed-out
visitor, so the first thing to check needs no account at all: a fresh install (or Sign out, which
lands on Home as a guest) browses Home and Search of Americas (North) and Yu-Gi-Oh! by default,
with the seed's posts and binders shown as "A collector" and their state or province, never a
handle. Inventory, Messages, Profile and Search › Wishlist ask to sign in in place; Message on a
card or binder opens the sheet, and signing in to a seed account above finishes it.

Seeding: `SeedDataRunner` in `apps/api` (profiles `local` and `dev`, idempotent) creates the
database accounts (stable ids `00000000-0000-4000-8000-0000000000NN`, provider uid
`seed-<handle>`) and, when `FIREBASE_AUTH_EMULATOR_HOST` is set, the matching Firebase emulator
users (password from `SEED_EMULATOR_PASSWORD`, default `LocalDev!2026`, email verified).
Handles must match `[a-z0-9_]{3,24}`, hence `premium_user` (the former Premium account: since
stage F1, ADR 0019, every collector has the same limits and this one has no plan or role of its
own; a database seeded before is cleaned by V123).

The table describes a freshly seeded database **and** one seeded before stage S2 and migrated
since: at the first start after the migration the seed fills collector2's three untouched seed
wishes (public note, Near Mint only, price terms) and sends the sample wishlist alert once. No
`npm run infra:reset` is needed for that; wishes you edited yourself are left as they are.

Seed locations are **declared places** (ADR 0017): a country, an ISO 3166-2 state or province
and an optional city, never a coordinate or an address (`db/seed/locations.json`). Others only
see the state or province; the city shows on the collector's own profile while "show my city" is
on (collector3 hides it, admin has none). The seed covers the three platform regions, so the
region switcher, the map and region-scoped search all have data. All names, emails and content
are fictional.

**18+ rule (launch readiness, 2026-10-05):** the seed accounts predate the rule and never
recorded the `AGE_CONFIRMATION` consent, so the web app and the mobile app ask each of them to
confirm being 18 or older once, on the next sign-in (Review our terms with the age line alone: on
the phone since stage R12, on the web since stage WG; the confirmation
is a consent row in the database, nothing else is asked). The mobile test suites record it for
`collector1` and `collector2` through the API in their isolated database (`orenjitrade_mobile_e2e`;
Playwright global setup, Maestro `scripts/confirm-age.js`), never in the emulator.

Accounts created by the test suites (never seeds, all fictional, local emulator only): the web
Playwright suite uses `@example.test` addresses; the mobile suites (`npm run test:mobile:e2e`,
`npm run test:mobile:maestro`) use `m-<run id>-...@mobile-e2e.test` and delete the emulator
accounts of their run at the end; they only sign in to seed accounts, never modify them in the
emulator.

**Deck cards for the inventory import (stage S5, 2026-10-13), in the end-to-end test databases
only:** a Yu-Gi-Oh! deck file (.ydk) names cards by passcode, matched through the provider
`ygoprodeck`, which the sample catalog of the seed does not have. The isolated API of the mobile
suites therefore starts with `SEED_IMPORT_FIXTURES=true` (`scripts/lib/mobile-e2e-guard.mjs`,
`ImportFixtureSeedContributor`), and since web stage WB so do the web suite's
(`scripts/lib/web-e2e-guard.mjs`, database `orenjitrade_e2e`) and the web E2E job of CI
(`.github/workflows/e2e.yml`). It adds three fictional things to `orenjitrade_mobile_e2e` and
`orenjitrade_e2e`: the card `910000001` "Fixture Lantern Wisp" (one printing, `YDKF-EN001`), the card `910000002`
"Fixture Clockwork Heron" (two printings, `YDKF-EN002` and the more recent `YDKR-EN002`) and
`910000003`, an alternate artwork of the Heron; any other passcode is unknown. The switch is off
everywhere else and refuses to run while `YGOPRODECK_ENABLED` is true: a developer database, which
can import the real catalog, never gets an invented passcode. The API's own tests create their
cards themselves. The Collectr CSV of the suites names cards of the sample catalog.
