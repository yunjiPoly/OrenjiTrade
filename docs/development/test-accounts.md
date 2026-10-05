# Local development test accounts

**Local/emulator only.** These accounts exist solely in the Firebase Auth emulator and the local
seed data. They are fictional and must never be created in a real Firebase project or any
staging/production environment. Passwords below are development-only values.

| Handle | Email | Password | Roles | Purpose |
| --- | --- | --- | --- | --- |
| collector1 | collector1@orenjitrade.test | LocalDev!2026 | USER | Montréal (Plateau) collector, public Yu-Gi-Oh! + Pokémon binders, fresh inventory |
| collector2 | collector2@orenjitrade.test | LocalDev!2026 | USER | Montréal (Verdun) collector, Magic binder, has wishlist items matching collector1 |
| collector3 | collector3@orenjitrade.test | LocalDev!2026 | USER | Laval collector, stale inventory (tests auto-delist), private binders only |
| collector4 | collector4@orenjitrade.test | LocalDev!2026 | USER | Longueuil Riftbound player, temporarily public binder |
| collector5 | collector5@orenjitrade.test | LocalDev!2026 | USER | Mile End collector (Pokémon, Magic), accepts offers |
| collector6 | collector6@orenjitrade.test | LocalDev!2026 | USER | Westmount trader, binder hidden until confirmed (50 days) |
| collector7 | collector7@orenjitrade.test | LocalDev!2026 | USER | Rosemont player, private only, not discoverable |
| collector8 | collector8@orenjitrade.test | LocalDev!2026 | USER | Old Port collector (Riftbound, Pokémon) |
| premium_user | premium@orenjitrade.test | LocalDev!2026 | USER, PREMIUM_USER | Exercises entitlement overrides |
| moderator | moderator@orenjitrade.test | LocalDev!2026 | USER, MODERATOR | Reviews collector reports |
| admin | admin@orenjitrade.test | LocalDev!2026 | USER, ADMIN | Full admin console |
| superadmin | superadmin@orenjitrade.test | LocalDev!2026 | USER, SUPER_ADMIN | Feature flags, plans, destructive admin actions |

Seeding: `SeedDataRunner` in `apps/api` (profiles `local` and `dev`, idempotent) creates the
database accounts (stable ids `00000000-0000-4000-8000-0000000000NN`, provider uid
`seed-<handle>`) and, when `FIREBASE_AUTH_EMULATOR_HOST` is set, the matching Firebase emulator
users (password from `SEED_EMULATOR_PASSWORD`, default `LocalDev!2026`, email verified).
Handles must match `[a-z0-9_]{3,24}`, hence `premium_user`.

All seed locations are public landmarks or neighbourhood centroids, never residential
addresses. All names, emails and content are fictional.

Accounts created by the test suites (never seeds, all fictional, local emulator only): the web
Playwright suite uses `@example.test` addresses; the mobile suites (`npm run test:mobile:e2e`,
`npm run test:mobile:maestro`) use `m-<run id>-...@mobile-e2e.test` and delete the emulator
accounts of their run at the end; they only sign in to seed accounts, never modify them in the
emulator.
