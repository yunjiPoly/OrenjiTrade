# Local development test accounts

**Local/emulator only.** These accounts exist solely in the Firebase Auth emulator and the local
seed data. They are fictional and must never be created in a real Firebase project or any
staging/production environment. Passwords below are development-only values.

| Handle | Email | Password | Roles | Declared place (region) | Purpose |
| --- | --- | --- | --- | --- | --- |
| collector1 | collector1@orenjitrade.test | LocalDev!2026 | USER | Montréal, Quebec, Canada (Americas North) | public Yu-Gi-Oh! + Pokémon binders, fresh inventory |
| collector2 | collector2@orenjitrade.test | LocalDev!2026 | USER | Toronto, Ontario, Canada (Americas North) | Magic binder, has wishlist items matching collector1 |
| collector3 | collector3@orenjitrade.test | LocalDev!2026 | USER | Buenos Aires City, Argentina, city hidden (Americas South) | stale inventory (tests auto-delist), private binders only |
| collector4 | collector4@orenjitrade.test | LocalDev!2026 | USER | Madrid, Community of Madrid, Spain (Europe) | Riftbound player, temporarily public binder |
| collector5 | collector5@orenjitrade.test | LocalDev!2026 | USER | Los Angeles, California, United States (Americas North) | Pokémon, Magic, accepts offers |
| collector6 | collector6@orenjitrade.test | LocalDev!2026 | USER | Santiago, Santiago Metropolitan Region, Chile (Americas South) | trader, binder hidden until confirmed (50 days) |
| collector7 | collector7@orenjitrade.test | LocalDev!2026 | USER | Brooklyn, New York, United States (Americas North) | player, private only, not discoverable |
| collector8 | collector8@orenjitrade.test | LocalDev!2026 | USER | Paris, Île-de-France, France (Europe) | Riftbound, Pokémon |
| premium_user | premium@orenjitrade.test | LocalDev!2026 | USER, PREMIUM_USER | São Paulo, Brazil (Americas South) | Exercises entitlement overrides |
| moderator | moderator@orenjitrade.test | LocalDev!2026 | USER, MODERATOR | Berlin, Germany (Europe) | Reviews collector reports |
| admin | admin@orenjitrade.test | LocalDev!2026 | USER, ADMIN | England, United Kingdom, no city (Europe) | Full admin console |
| superadmin | superadmin@orenjitrade.test | LocalDev!2026 | USER, SUPER_ADMIN | Québec, Quebec, Canada (Americas North) | Feature flags, plans, destructive admin actions |

Seeding: `SeedDataRunner` in `apps/api` (profiles `local` and `dev`, idempotent) creates the
database accounts (stable ids `00000000-0000-4000-8000-0000000000NN`, provider uid
`seed-<handle>`) and, when `FIREBASE_AUTH_EMULATOR_HOST` is set, the matching Firebase emulator
users (password from `SEED_EMULATOR_PASSWORD`, default `LocalDev!2026`, email verified).
Handles must match `[a-z0-9_]{3,24}`, hence `premium_user`.

Seed locations are **declared places** (ADR 0017): a country, an ISO 3166-2 state or province
and an optional city, never a coordinate or an address (`db/seed/locations.json`). Others only
see the state or province; the city shows on the collector's own profile while "show my city" is
on (collector3 hides it, admin has none). The seed covers the three platform regions, so the
region switcher, the map and region-scoped search all have data. All names, emails and content
are fictional.

**18+ rule (launch readiness, 2026-10-05):** the seed accounts predate the rule and never
recorded the `AGE_CONFIRMATION` consent, so the web app and the mobile app ask each of them to
confirm being 18 or older once, on the next sign-in (the onboarding "Age" step; the confirmation
is a consent row in the database, nothing else is asked). The mobile test suites record it for
`collector1` and `collector2` through the API in their isolated database (`orenjitrade_mobile_e2e`;
Playwright global setup, Maestro `scripts/confirm-age.js`), never in the emulator.

Accounts created by the test suites (never seeds, all fictional, local emulator only): the web
Playwright suite uses `@example.test` addresses; the mobile suites (`npm run test:mobile:e2e`,
`npm run test:mobile:maestro`) use `m-<run id>-...@mobile-e2e.test` and delete the emulator
accounts of their run at the end; they only sign in to seed accounts, never modify them in the
emulator.
