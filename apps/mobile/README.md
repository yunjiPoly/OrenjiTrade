# OrenjiTrade mobile (`apps/mobile`)

React Native app built with **Expo SDK 57**, **expo-router** and strict TypeScript. Six tabs, as
decided in `CLAUDE.md`: **Map | Inventory | Search | Messages | Wishlist | Profile**.

Read the root `CLAUDE.md`, `IMPLEMENTATION_STATUS.md` (mobile rows) and
`docs/architecture/adr/0006-angular-web-react-native-mobile.md` first. Privacy (ADR 0004) and the
card image rules (ADR 0015) apply to the app exactly as to the web.

## Status

Phase 1 (accounts) is implemented and verified on the web build (Playwright) and on Android
(Expo Go on a local emulator, Maestro): sign-up with the versioned legal documents, email
verification, sign-in, password reset, session restore, sign-out, consent and account-state
screens (suspended, deletion pending with cancel and export), the three-step onboarding, the
Profile tab with a public preview, and Settings (profile, location and discoverability, privacy,
notifications, account with data export and deletion, appearance, legal).

Phases 2 and 3 (stage M2) are implemented on the same API as the web: the **Search** tab (card
catalog across games, live typo-tolerant search, game / set / rarity / language / edition filters,
infinite results, recent searches), the **card detail** (`cards/[id]`: picture with the provider
credit, attributes, printings and market prices, "Add to inventory", "Who has this near me" opens
the Map tab), the **Inventory** tab (cards with search, binder / game / intent filters and sorting,
totals, stale or hidden cards with "Confirm all", paused listings with "Resume"; binders), adding a
card (`items/new`: catalog search → printing → details), editing and deleting one (`items/[id]`),
and **binders** (`binders/new`, `binders/edit`, `binders/[id]`: create, rename, publish for 1 h /
24 h / until disabled, make private, confirm, delete, add or remove cards; the public view of
anyone's public binder). Freemium limits (`binders.max`, binder views per day) are explained where
they happen.

Phase 4 (stage M3) is implemented on the discovery API the web map uses: the **Map** tab shows
collectors near the viewer only as zones about 3 km wide (radius 1500 m) around their public
points, never pins, with every map capped at zoom 14 (ADR 0004, owner rule 2026-10-04); game /
intent / distance filters, "Who has this near me" from a card, a list view, the **preview bottom
sheet** (View profile, View public binder, Message, Show on map), and the **collector profile**
(`collectors/[id]`: place, distance bucket, approximate-area map, ratings and references, public
binders and cards). "Message" opens or starts the conversation (`POST /conversations`) in a
minimal thread (`messages/[id]`); the Messages and Wishlist tabs are still placeholders until
their stages ("Add to wishlist" waits for the wishlist stage: the web adds wishes through the
wishlist dialog). Card recognition (Phase 11) is on hold: no scan flow, the `mlScanning` flag
stays off.

## Prerequisites

- Node 24 (`.nvmrc` at the repo root), npm 11, `npm ci` once at the repository root.
- The local stack: `npm run infra:up` (PostGIS, Redis, Firebase Auth emulator) and an API
  (`npm run api:dev` on :8080, or the isolated mobile API, see [Tests](#tests)).
- For native: the free **Expo Go** app on an Android emulator / iOS simulator / phone. Expo CLI
  installs the matching Expo Go on an emulator by itself. Everything in this app runs in Expo Go;
  a local debug build (`npx expo run:android`, local Gradle, never EAS) is the fallback, and the
  generated `android/` / `ios/` folders stay git-ignored.

## Run

```bash
cd apps/mobile
npx expo start                # a = Android emulator, i = iOS simulator, w = web; or scan the QR code
```

Never run `npm install` inside this folder: the root `package-lock.json` is the only lockfile, and
dependencies are added with `npx expo install <pkg>` (SDK-compatible, pinned). Every script below
also works from the root as `npm run <script> -w apps/mobile`.

The npm workspace also holds the Angular app, whose toolchain uses Babel 8. The root
`package.json` pins `@babel/generator` and `@babel/traverse` 7.x so Babel 7 is hoisted: the
react-native-worklets Babel plugin needs it, and without it every native bundle fails with
`[Worklets] Babel plugin exception` (guarded by `__tests__/config/babel-toolchain.test.ts` and the
`expo export --platform android` step of the CI mobile job).

## Configuration

One typed module, `src/config/env.ts`, reads every value. All variables are `EXPO_PUBLIC_*` and are
inlined into the JS bundle: **public values only, never secrets**. Copy `.env.example` to `.env`
only to override a default.

| Variable                                  | Purpose                                                                                                                                                                   | Default                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`                | API origin                                                                                                                                                                | `http://10.0.2.2:8080` (Android), else `localhost` |
| `EXPO_PUBLIC_FIREBASE_API_KEY`            | Firebase web API key                                                                                                                                                      | `demo-local-key`                                   |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`        | Firebase auth domain                                                                                                                                                      | `<project>.firebaseapp.com`                        |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID`         | Firebase project id                                                                                                                                                       | `orenjitrade-local`                                |
| `EXPO_PUBLIC_FIREBASE_APP_ID`             | Firebase app id                                                                                                                                                           | empty                                              |
| `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | Auth emulator `host:port`; `off` for a real project                                                                                                                       | `10.0.2.2:9099` (Android), else `localhost:9099`   |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`         | Android Google Maps key (app-restricted, development/store builds only); without it, and always in Expo Go, Android maps use Leaflet + OpenStreetMap; iOS uses Apple Maps | empty                                              |

The Android emulator reaches the development machine at `10.0.2.2`; the iOS simulator and the web
build use `localhost`; a physical phone needs the machine's LAN address. Firebase Auth is created
lazily (`src/auth/firebase.ts`): React Native persistence on AsyncStorage on iOS/Android, IndexedDB
(then localStorage) on web, connected to the emulator whenever one is configured. A native build
without the React Native persistence keeps the session in memory (never browser storage).

## Architecture

```
app/                       expo-router routes
  _layout.tsx              providers (safe area, query client, session, account, theme, snackbar),
                           the offline banner and src/navigation/RootNavigator.tsx, which applies
                           the auth gate (src/account/useAuthGate.ts: guest, consent, account
                           state, onboarding, tabs)
  (auth)/                  sign-in, sign-up, reset-password (guests only)
  (account)/               verify-email, consent, suspended / deletion pending, unavailable
  onboarding.tsx           profile -> interests -> trading area (+ map opt-in, off by default)
  (tabs)/                  Map | Inventory | Search | Messages | Wishlist | Profile
  settings/                profile, location, privacy, notifications, account, delete-account,
                           appearance (screens of the root stack, no nested stack)
  legal/                   index + [key] (versioned documents read in-app)
  (tabs)/index.tsx         the Map tab (collector zones, filters, list, preview sheet)
  collectors/[id].tsx      public profile (also the "Public preview" of the own profile)
  messages/[id].tsx        a conversation (minimal thread opened by "Message"; the Messages stage
                           adds the inbox)
  cards/[id].tsx           card detail (`?printing=` selects a printing)
  items/new.tsx, [id].tsx  add a card (search -> printing -> details), edit / delete a card
  binders/                 [id] (own binder, or the public view; `?view=public`), new, edit (`?id=`)
src/
  config/env.ts            the typed configuration (platform defaults)
  auth/                    AuthPort (Firebase), session provider + reducer, friendly auth errors,
                           ID-token bridge for the API client
  account/                 /me (AccountProvider), account status, auth gate, registration flow
  api/                     openapi-fetch client on @orenji/shared-types (ID token, one retry after
                           401, RFC 9457 -> ApiError, 428/403 account signals), query client,
                           query keys, hooks per area
  components/ui/           Screen, TextField + form controls, Button, QueryState (skeleton / empty /
                           error with retry), Snackbar, ConfirmDialog, Stepper, CardImage, ...
  features/                screen parts per feature (legal, location, onboarding, profile,
                           catalog, inventory, binders, limits, map, collectors, messages, ...)
  components/map/          CollectorMap on three engines (react-native-maps, Leaflet in a
                           WebView, Leaflet on web), the WebView pages, the engine choice
  lib/                     pure helpers (3-decimal coordinates, distance buckets, card picture URLs,
                           approximate-area rules, map geometry)
  theme/                   tokens.ts (generated from packages/design-tokens), palette, ThemeProvider
```

Conventions later stages reuse:

- **API**: only through `src/api/client.ts` (`api.GET('/api/v1/...')`, types from
  `@orenji/shared-types`); never hand-written DTOs. Regenerate with `npm run generate:api` at the
  root when `docs/api/openapi.json` changes.
- **Queries**: keys in `src/api/queryKeys.ts` (everything of the signed-in collector under
  `['me', uid, ...]`, dropped on sign-out); `networkMode: 'offlineFirst'`, cached data kept a day,
  4xx never retried; mutations invalidate the narrowest key they change. Screens render
  `QueryState` (skeleton, empty, error with retry) and the root `OfflineBanner` covers offline use.
- **Lists**: paged endpoints use `useInfiniteQuery` (`nextPage`) in a `FlatList` with
  `ListFooter` (spinner / retry), pull to refresh and `keepPreviousData` while filters change.
  Writes refresh the narrowest keys: every inventory or binder write invalidates
  `['me', uid, 'inventory']` and `['me', uid, 'binders']` (counts and freshness change everywhere),
  never refetching what was just deleted.
- **Forms**: `TextField`, `PasswordField`, `Checkbox`, `SwitchRow`, `RadioGroup`, `Stepper`,
  `ChoiceChips` (a few values as radio chips) and `SelectSheet` (a field opening a bottom sheet of
  options) with inline errors and accessibility state; server field errors map through
  `src/api/errorMessages.ts`; `429 LIMIT_REACHED` is explained in place (`LimitReachedNotice`,
  `src/lib/limits.ts`: what is counted, used / allowed on the plan, when it resets).
- **Inventory vocabulary** (`src/lib/inventory.ts`, the web's `inventory-labels`): the trade / sell
  intents are the API's `availability` (trade or sale, trade, sale, collection only, not available)
  plus the separate "accepts offers" flag; wanting a card is a wishlist entry. Visibility is
  private / public / temporarily public (1 h to 30 days); `visibilityStatus.ts` explains why
  something set to public is not visible yet (binder private, hidden until confirmed, owner hidden).
- **Card pictures**: `CardImage` (expo-image) renders only API picture URLs
  (`/api/v1/public/card-images/{id}`, placeholders) with the provider credit line of the web;
  anything else (for example a YGOPRODeck URL) shows the placeholder.
- **Maps** (`src/components/map/mapEngine.ts`, ADR 0010 amendment 2026-10-05): the web rule
  "Google with a key, Leaflet otherwise". `native` = react-native-maps (Apple Maps on iOS; Google
  Maps on Android only in a development/store build with `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`);
  `leaflet` = Leaflet 1.9.4 + OpenStreetMap in a `react-native-webview` page
  (`src/components/map/leaflet/`, Leaflet from a pinned CDN URL with Subresource Integrity, no
  geolocation, links open in the browser) on Android without that key and always in Expo Go, whose
  bundled Google key the Maps SDK refuses ("Authorization failure": an empty grey map). The web
  build uses Leaflet directly (`*.web.tsx`).
- **Collector maps** (`src/components/map/CollectorMap`, Map tab and profile; ADR 0004 owner rule
  2026-10-04, ADR 0010 amendment of stage M3): other collectors are only ever soft zones of radius
  1500 m around their public point (`src/lib/approximateArea.ts`: `APPROXIMATE_AREA_RADIUS_M`,
  `COLLECTOR_MAP_MAX_ZOOM = 14`, "Locations are approximate (about 3 km)"), never a `Marker` or pin
  at the point; count bubbles (above 60 collectors, at the 3-decimal average of a group) are the
  only markers and clustering stops at 14. Every engine stops at 14: `maxZoomLevel` / Leaflet
  `maxZoom`, every camera request clamped (`src/lib/mapGeometry.ts`, cluster expansion and "Show on
  map" included) and a guard that pulls back anything past the cap. Taps are matched to the
  nearest zone in JS (`zoneAt`); no coordinate handed to a map has more than 3 decimals, the
  viewport only sizes the next query (its centre sent with 2 decimals) and is never stored. The
  own trading area is the server's: the Map tab sends no centre for it, and no device location is
  read on the map (like the web map).
- **Discovery** (`src/features/map/`): `useCollectorDiscovery` mirrors the web's
  `MapDiscoveryStore` (own area or a city, debounced viewport queries only when leaving the covered
  circle, the plan's `map.radius.max_km`, 429 -> the cap, 400 -> the city, the last answer kept
  offline); `collectorLayer.ts` builds zones and clusters; `discovery.ts` holds the query rules
  and the wording. The preview sheet and the profile offer "Message" only when the API's
  `canMessage` allows it (otherwise the web's reason: a block, or the collector's messaging
  permission).
- **Trading area** (`src/features/location/TradingAreaPicker.tsx`, onboarding step 3 and Settings →
  Location): the web picker's mechanism. A map (`TradingAreaMap`, engine as above) where a tap or
  a dragged pin (a long-press first on Google/Apple maps) moves the centre, "Use map centre" after
  panning, a 1–50 km radius drawn as a circle, "Jump to a city" quick picks (public centre +
  suggested radius) and "Use my current location". Hand-picked centres are rounded to 3 decimals
  and saved with source `MANUAL`; the map shows the loading skeleton and an error state with
  "Reload map" while the quick picks keep working.
- **Privacy**: the app never shows coordinates as text, only the API's public labels and distance
  buckets; generic labels ("Approximate area") never end up in "near …" sentences. "Use my current location" reads the device once at reduced accuracy
  (`expo-location`, `Accuracy.Low`; a last-known fix up to 10 min old, at most 10 s to get one,
  like the web's `maximumAge` / `timeout`), rounds it to 3 decimals exactly like the web
  (`roundCoordinate`) and sends it straight to `PUT /me/location/trading-area`; it is never
  rendered, stored, persisted or logged, and a saved device-derived centre is never drawn as a pin
  or circle (the map only looks at its neighbourhood, rounded to 2 decimals). Discoverability
  defaults to off.
- **Testing hooks**: screens carry `testID="screen-<name>"`, tab buttons `tab-<route>`. Keep
  controls off the top-right corner just below the header: Expo Go floats its tools button there
  and a Maestro tap would open the developer menu instead.

## Scripts

| Script                                  | What it does                                                |
| --------------------------------------- | ----------------------------------------------------------- |
| `npm start` / `android` / `ios` / `web` | `expo start` (+ platform)                                   |
| `npm run typecheck`                     | regenerate the typed routes, then `tsc --noEmit`            |
| `npm run typegen`                       | regenerate `.expo/types/router.d.ts` (no Metro needed)      |
| `npm run lint`                          | `expo lint` (eslint-config-expo + prettier compatibility)   |
| `npm run format` / `format:check`       | Prettier                                                    |
| `npm test`                              | Jest (`jest-expo`, `@testing-library/react-native`)         |
| `npm run sync:tokens`                   | regenerate `src/theme/tokens.ts` from the design tokens     |
| `npm run sync:legal`                    | copy the web's legal texts into `src/legal/legalContent.ts` |
| `npm run doctor`                        | `expo-doctor`                                               |

## Tests

| Command (repository root)     | What runs                                                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:mobile`         | typecheck, lint, Jest (unit + screen tests in `__tests__/`, every screen with loading / empty / error / validation states) and the E2E harness guard tests (`node --test scripts/lib/mobile-e2e-guard.test.mjs`; `npm run test:scripts` runs every `scripts/lib` test) |
| `npm run test:mobile:e2e`     | Playwright (`apps/mobile/e2e`) driving the Expo **web** build against a real, isolated stack                                                                                                                                                                           |
| `npm run test:mobile:maestro` | Maestro flows (`apps/mobile/.maestro`) in Expo Go on a running Android emulator                                                                                                                                                                                        |

### Isolation of the end-to-end suites

Both end-to-end suites use their own stack and never touch a developer's: the database
`orenjitrade_mobile_e2e` (dropped and recreated per run, migrated and seeded by the API), an API
jar on **:8090** (profile `local`, Redis database 1 (flushed with the database) with its own realtime channels
`e2e-mobile:rt:user:*`, media, card-image cache and provider snapshots under
`.local-dev/mobile-e2e/`, mock catalog only: YGOPRODeck disabled and pointed at a closed local port,
no image downloads), the shared Auth emulator, and the web build on **:19006** (Playwright) or
Metro on **:8082** (Maestro). `scripts/lib/mobile-e2e-guard.mjs` (built on the web E2E harness's
shared helpers in `web-e2e-guard.mjs`, `local-db.mjs` and `auth-emulator.mjs`) refuses to start the
API when its database (or its host), port, Redis database, realtime prefix or directories are not
the isolated ones (a directory that resolves to any checkout's `apps/api/.local-storage` would let
start-up reconciliation delete the developer's cached card images), and only ever drops
`orenjitrade_mobile_e2e`. The web E2E suite (`npm run test:e2e`: :8180 / :4300, database
`orenjitrade_e2e`, Redis db 2) and the developer stack (:8080 / :4200, Redis db 0) can run at the
same time. `--reuse-running` only reuses an API the harness started itself (identity block in
`/actuator/info`, instance id in `.local-dev/mobile-e2e/state.json`) and refuses the developer
API on :8080. Accounts created by a run are `m-<run id>-...@mobile-e2e.test` and are deleted from
the emulator at the end of the run; seed accounts (`@orenjitrade.test`) are only signed in to.

### Mobile web E2E (Playwright)

```bash
npm run test:mobile:e2e                      # build jar + web export, run every spec, stop everything
npm run test:mobile:e2e -- --keep-running    # leave API + web server up (stop: -- --stop)
npm run test:mobile:e2e -- --reuse-running --skip-build e2e/profile.spec.ts
```

Specs: `auth.spec.ts` (sign-up -> verification -> onboarding -> tabs -> sign-out, seed sign-in with
session restore, friendly errors, consent screen, password reset), `profile.spec.ts` (edit,
validation, tags, public preview), `location.spec.ts` (manual trading area: city quick pick, a tap
on the map, a dragged pin, the `PUT` body checked for `MANUAL` and 3 decimals; map opt-in; no
precise coordinates), `account.spec.ts` (export, deletion request and cancel, privacy and notification
settings), `leaflet-page.spec.ts` (the Android WebView map page in
Chromium: taps, pin drag, apply, focus, a 0 x 0 first layout, Leaflet load failure; no stack
needed), `catalog.spec.ts` (search -> game and language filters -> card detail -> printings, every
picture an API URL; printing-code match, an unknown card), `inventory.spec.ts` (add a card through
search -> printing -> details, edit it (only the changed fields are sent), delete it with a
confirmation; add from a card detail, intent / game filters and sorting), `binders.spec.ts`
(create a binder -> add a card -> publish for 24 hours -> make private -> remove the card -> rename
-> delete; the `binders.max` limit; another collector's public binder: public cards and notes
only), `map.spec.ts` (a seed collector sees the neighbours as 1500 m zones without markers, the
"+" button and the wheel stop at 14 and no tile beyond 14 loads, list -> preview -> "Show on map"
-> a tap in the zone -> the profile with its area; "Message" opens the seed conversation and
sends; "Who has this near me" from a card filters the map), `collector-map-page.spec.ts` (the
Android WebView collector page in Chromium: zone size at 14, zoom cap, taps, clusters, a static
profile map, a 0 x 0 first layout, Leaflet failure). The static web export served by `expo serve`
has no rewrites for dynamic routes
(`/cards/<id>` answers 404 on a full page load), so specs open them inside the running app
(`openInApp` in `e2e/support/stack.ts`). A privacy fixture scans every API response for coordinates with more than 3 decimals,
and OpenStreetMap tiles are served from memory (no tile requests leave the machine).
Logs: `.local-dev/mobile-e2e/logs/`.

### Native flows (Maestro on the Android emulator)

Free and local: an emulator, Expo Go and the Maestro CLI; never EAS, never Maestro Cloud.

```bash
# once per session: start an emulator (Windows example)
"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd Pixel_6_API_34 -no-snapshot-save -no-boot-anim
adb wait-for-device

# then, from the repository root (MAESTRO_BIN when maestro is not on PATH)
MAESTRO_BIN=D:/maestro/bin/maestro.bat npm run test:mobile:maestro
npm run test:mobile:maestro -- apps/mobile/.maestro/sign-in.yaml        # one flow
npm run test:mobile:maestro -- --keep-running                            # keep API + Metro (stop: -- --stop)
```

The harness starts (or reuses) the isolated API, starts Metro on :8082 with
`EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8090` and `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=10.0.2.2:9099`
(Expo CLI installs Expo Go when it is missing; the harness waits up to 6 minutes for that install),
checks that the Android bundle targets the isolated API, then runs the flows with
`APP_URL=exp://10.0.2.2:8082`. Flows: `sign-in.yaml`,
`sign-up-onboarding.yaml`, `profile-edit.yaml`, `discoverability.yaml` (city quick pick, a tap on
the map, save, `scripts/check-area.js` checks on the host that the API holds a `MANUAL` centre with
3 decimals; pan + "Use map centre"; map opt-in), `sign-out.yaml` (session restore after a
relaunch, then sign-out), `search-card-detail.yaml` (search, a schema language filter, card
detail, the French printing), `inventory-add-edit-delete.yaml` (add through search -> printing ->
details, edit, delete; `scripts/check-inventory.js` checks the API after each step),
`binder-create-add-item.yaml` (a card added on the host by `scripts/add-card.js`, a new binder,
"Add cards", publish for 24 hours, checked on the API), `map-preview-profile.yaml` (a seed
collector sees the neighbours' 3 km zones on OpenStreetMap without a Google key, list -> preview ->
"Show on map" -> a tap inside the zone -> the profile's area; screenshots of the zones),
`card-who-near-me.yaml` (a card collector1 lists, read on the host by `scripts/public-card.js`,
opened by deep link -> "Who has this near me" -> the filtered map, list and preview -> every
collector again). Flows scroll only with the edge-swipe subflows: a swipe in the middle of
the screen would pan the map instead of the page. Shared steps are in `.maestro/subflows/` (cleared
launch in Expo Go, dismissing the Expo Go developer menu and an "isn't responding" dialog,
sign-in, and scrolls that swipe along the screen edge so a slow swipe never starts on a filled
text field, which Android turns into a text-selection long press) and host-side helpers in
`.maestro/scripts/` (create a fictional collector through the emulator and the API, verify an
email with the emulator's code, check a saved trading area, add a card, check an inventory).
Screenshots and reports: `.local-dev/mobile-e2e/maestro/`. Edit nothing in the repository while
flows run (Metro re-crawls the workspace and Expo Go may lose the packager) and restart a kept
Metro after source changes (`npm run test:mobile:maestro -- --stop`).

## Deep links

- Custom scheme: `orenjitrade://collectors/<handle>`, `orenjitrade://cards/<id>`, `orenjitrade://binders/<id>`.
- Universal/App Links: `https://www.orenjitrade.com/(collectors|cards|binders)/<id>` via
  `ios.associatedDomains` and Android `intentFilters` (`autoVerify`) in `app.config.ts`.

## Not yet wired (tracked in `IMPLEMENTATION_STATUS.md`)

- The mobile UIs of Phases 5-10 (the Messages tab with the inbox, realtime, photos and links;
  wishlist and "Add to wishlist", rating collectors and reports, offers, payments, ...). The Map
  tab leaves out the web map's tag and freshness filters and its search box (the Search tab finds
  cards; "Who has this near me" starts from a card).
- Inventory extras of the web not on mobile yet: owner photos of an item, the multi-select bulk bar
  (visibility, availability, delete; moving cards into a binder is there), binder reordering, set
  pages (`/sets/:id`); a set opens the Search tab filtered by that set instead.
- Device push notifications (preferences are saved; delivery arrives with a later phase).
- Sora / Inter fonts (system font until `expo-font` loading is added).
- EAS: `extra.eas.projectId` stays a placeholder; no EAS build is used (local and free only).
