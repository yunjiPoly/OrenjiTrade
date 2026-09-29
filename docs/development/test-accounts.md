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
| premium-user | premium@orenjitrade.test | LocalDev!2026 | USER, PREMIUM_USER | Exercises entitlement overrides |
| moderator | moderator@orenjitrade.test | LocalDev!2026 | USER, MODERATOR | Reviews collector reports |
| admin | admin@orenjitrade.test | LocalDev!2026 | USER, ADMIN | Full admin console |
| superadmin | superadmin@orenjitrade.test | LocalDev!2026 | USER, SUPER_ADMIN | Feature flags, plans, destructive admin actions |

Seed script: `apps/api/src/main/resources/db/seed/` (applied by `SeedDataRunner` on the
`local` profile). Emulator users are created by `scripts/seed-auth-emulator.mjs` (idempotent)
which the API also triggers on startup when `FIREBASE_AUTH_EMULATOR_HOST` is set.

All seed locations are public landmarks or neighbourhood centroids, never residential
addresses. All names, emails and content are fictional.
