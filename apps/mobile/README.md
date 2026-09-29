# OrenjiTrade mobile (`apps/mobile`)

React Native app built with **Expo SDK 57**, **expo-router** (bottom tabs) and strict TypeScript.
Six tabs, as decided in `CLAUDE.md`: **Map | Inventory | Search | Messages | Wishlist | Profile**.

Read the root `CLAUDE.md` and `docs/architecture/adr/0006-angular-web-react-native-mobile.md` first.

## Prerequisites

- Node 24 (`.nvmrc` at the repo root), npm 11.
- Expo Go on a device/simulator, or a development build (`npx expo run:ios|android`) for native
  modules that Expo Go does not bundle. Everything in this scaffold works in Expo Go.
- The API running locally: `docker compose up -d` at the repo root, then `cd apps/api && ./gradlew bootRun`.

## Run

```bash
npm ci                        # ONCE, at the repository root (npm workspaces: web + mobile + packages/*)
cd apps/mobile
cp .env.example .env          # optional; defaults target http://localhost:8080
npx expo start                # press i / a / w, or scan the QR code with Expo Go
```

Never run `npm install` inside this folder: the root `package-lock.json` is the only lockfile.
Every script below also works from the repository root as `npm run <script> -w apps/mobile`
(CI does exactly that). Expo's Metro config detects the workspace root automatically (SDK 52+),
so there is no `metro.config.js`; `@orenji/shared-types` resolves through the root
`node_modules` like any other dependency.

Testing on a physical phone? Set `EXPO_PUBLIC_API_BASE_URL` in `.env` to your machine's LAN IP
(for example `http://192.168.1.20:8080`); `localhost` points at the phone itself.

## Environment

All variables are `EXPO_PUBLIC_*` and are inlined into the JS bundle: public values only, never secrets.

| Variable                                  | Purpose                                                       | Default                             |
| ----------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`                | OrenjiTrade API origin                                        | `http://localhost:8080`             |
| `EXPO_PUBLIC_FIREBASE_API_KEY`            | Firebase web API key (domain-restricted)                      | `demo-local-key`                    |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`        | Firebase auth domain                                          | `orenjitrade-local.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID`         | Firebase project id                                           | `orenjitrade-local`                 |
| `EXPO_PUBLIC_FIREBASE_APP_ID`             | Firebase app id                                               | empty                               |
| `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | `host:port` of the Auth emulator from `docker compose`        | `localhost:9099`                    |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`         | Android Google Maps key (app-restricted). iOS uses Apple Maps | empty                               |

Without a Maps key the Android map renders an empty canvas; nothing crashes. Firebase is
initialised lazily (`src/auth/firebase.ts`) and only when a screen asks for it.

## Project layout

```
app/                      expo-router routes (file = screen, _layout = navigator)
  _layout.tsx             providers: SafeArea, TanStack Query, Session, Theme, OfflineBanner
  (tabs)/                 six tabs
  (auth)/                 sign-in / sign-up placeholders (Firebase wiring is Phase 1)
  collectors/[id].tsx     deep-link targets (see below)
  cards/[id].tsx
  binders/[id].tsx
src/
  api/                    openapi-fetch client, ApiError (RFC 9457), TanStack Query client, queries/
  auth/                   lazy Firebase bootstrap, SessionProvider, token bridge for the client
  components/ui/          Screen, EmptyState, ErrorState, Skeleton, Badge, Chip, BottomSheet, TextField, Button
  components/map/         CollectorMap (native) + CollectorMap.web (placeholder)
  components/OfflineBanner.tsx
  lib/                    relativeTime, formatDistanceBucket, assertNever
  store/                  zustand store (theme override, session prefs, last map region), persisted
  theme/                  tokens.ts (generated), palette, ThemeProvider, useTheme
  types/                  env typings (EXPO_PUBLIC_* declarations)
scripts/sync-tokens.mjs   regenerates src/theme/tokens.ts from packages/design-tokens/tokens.json
.maestro/smoke.yaml       Maestro smoke flow
```

### Shared packages

- **API types + client**: `@orenji/shared-types` (`packages/shared-types`) is a workspace
  dependency. `src/api/client.ts` builds the app client with its `createApiClient()` (bearer
  token from the session, `X-Request-Id` from `expo-crypto`) and adds the RFC 9457 → `ApiError`
  middleware; screens import `paths`, `MetaResponse`, ... from the same package. Regenerate it
  with `npm run generate:api` at the repo root whenever `docs/api/openapi.json` changes.
- **Design tokens**: `npm run sync:tokens` regenerates `src/theme/tokens.ts` from
  `packages/design-tokens/tokens.json` (merged over built-in fallback values so the app always
  compiles). Commit the generated file.

## Scripts

| Script                                  | What it does                                               |
| --------------------------------------- | ---------------------------------------------------------- |
| `npm start` / `android` / `ios` / `web` | `expo start` (+ platform)                                  |
| `npm run typecheck`                     | `tsc --noEmit`                                             |
| `npm run lint`                          | `expo lint` (eslint-config-expo + prettier compatibility)  |
| `npm run format` / `format:check`       | Prettier                                                   |
| `npm test`                              | Jest (`jest-expo` preset, `@testing-library/react-native`) |
| `npm run sync:tokens`                   | regenerate design tokens                                   |
| `npm run doctor`                        | `expo-doctor`                                              |

## Tests

Unit and component tests live in `__tests__/` (kept out of `app/` so they are never treated as
routes). Native modules are mocked in `jest.setup.ts` (AsyncStorage, NetInfo, expo-crypto,
react-native-maps, safe-area-context). The tabs test uses `expo-router/testing-library`'s
`renderRouter` with the real layouts.

```bash
npm test                  # CI mode
npm run test:watch
```

## Maestro (E2E smoke)

Install [Maestro](https://maestro.mobile.dev), start the app on a simulator/emulator (development
build recommended; with Expo Go set `appId` to Expo Go's bundle id), then:

```bash
maestro test .maestro/smoke.yaml
```

The flow launches the app, asserts the **Map** and **Inventory** tab labels and taps **Profile**.

## Deep links

- Custom scheme: `orenjitrade://collectors/<id>`, `orenjitrade://cards/<id>`, `orenjitrade://binders/<id>`.
- Universal/App Links: `https://www.orenjitrade.com/(collectors|cards|binders)/<id>` via
  `ios.associatedDomains` and Android `intentFilters` (`autoVerify`) in `app.config.ts`. The
  `apple-app-site-association` and `assetlinks.json` files are served by the web app.

Try one locally: `npx uri-scheme open "orenjitrade://collectors/42" --ios` (or `--android`).

## Privacy reminder

The map shows **approximate** collector positions only (ADR 0004). The app never requests
precise location for discovery, stores the last map _viewport_ on-device only, and formats
distances as buckets (`< 1 km`, `~4 km`, `10–25 km`) — never raw metres.

## Not yet wired (tracked in `IMPLEMENTATION_STATUS.md`)

- Firebase sign-in/sign-up (Phase 1): screens validate locally and show a notice.
- Sora / Inter fonts: the system font is used until `expo-font` loading is added.
- EAS: `extra.eas.projectId` is a placeholder until `npx eas-cli init` runs.
