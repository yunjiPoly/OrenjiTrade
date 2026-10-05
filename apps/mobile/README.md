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
notifications, account with data export and deletion, appearance, legal). The Map, Inventory,
Search, Messages and Wishlist tabs are placeholders until their phases. Card recognition
(Phase 11) is on hold: no scan flow, the `mlScanning` flag stays off.

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
  collectors/[id].tsx      public profile (also the "Public preview" of the own profile)
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
  features/                screen parts per feature (legal, location, onboarding, profile, ...)
  lib/                     pure helpers (3-decimal coordinates, distance buckets, card picture URLs)
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
- **Forms**: `TextField`, `PasswordField`, `Checkbox`, `SwitchRow`, `RadioGroup`, `Stepper` with
  inline errors and accessibility state; server field errors map through `src/api/errorMessages.ts`.
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
  build uses Leaflet directly (`*.web.tsx`). The Map tab (Phase 0 placeholder until the collector
  zones of a later stage) browses with the same engine, zoom capped at 14 (ADR 0004).
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
- **Testing hooks**: screens carry `testID="screen-<name>"`, tab buttons `tab-<route>`.

## Scripts

| Script                                  | What it does                                                |
| --------------------------------------- | ----------------------------------------------------------- |
| `npm start` / `android` / `ios` / `web` | `expo start` (+ platform)                                   |
| `npm run typecheck`                     | `tsc --noEmit`                                              |
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
jar on **:8090** (profile `local`, Redis database 1 with its own realtime channels
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
needed). A privacy fixture scans every API response for coordinates with more than 3 decimals,
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
relaunch, then sign-out). Flows scroll only with the edge-swipe subflows: a swipe in the middle of
the screen would pan the map instead of the page. Shared steps are in `.maestro/subflows/` (cleared
launch in Expo Go, dismissing the Expo Go developer menu and an "isn't responding" dialog,
sign-in, and scrolls that swipe along the screen edge so a slow swipe never starts on a filled
text field, which Android turns into a text-selection long press) and host-side helpers in
`.maestro/scripts/` (create a fictional collector through the emulator and the API, verify an
email with the emulator's code, check a saved trading area). Screenshots and reports: `.local-dev/mobile-e2e/maestro/`.

## Deep links

- Custom scheme: `orenjitrade://collectors/<handle>`, `orenjitrade://cards/<id>`, `orenjitrade://binders/<id>`.
- Universal/App Links: `https://www.orenjitrade.com/(collectors|cards|binders)/<id>` via
  `ios.associatedDomains` and Android `intentFilters` (`autoVerify`) in `app.config.ts`.

## Not yet wired (tracked in `IMPLEMENTATION_STATUS.md`)

- The mobile UIs of Phases 2-10 (catalog, binders, collectors on the map as 3 km zones, chat,
  wishlist, offers, payments, ...).
- Device push notifications (preferences are saved; delivery arrives with a later phase).
- Sora / Inter fonts (system font until `expo-font` loading is added).
- EAS: `extra.eas.projectId` stays a placeholder; no EAS build is used (local and free only).
