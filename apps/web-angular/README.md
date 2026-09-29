# OrenjiTrade web (`apps/web-angular`)

Angular 22 · TypeScript strict · Angular Material (Material 3) · standalone components · signals ·
ESLint + Prettier · Vitest unit tests · Playwright E2E · nginx container for Cloud Run.

Read [`CLAUDE.md`](../../CLAUDE.md) and ADR 0006 before changing conventions.

## Run

```bash
npm ci                      # ONCE, at the repository root (npm workspaces: web + mobile + packages/*)
cd apps/web-angular
npm start                   # builds design tokens, then ng serve on http://localhost:4200
```

Every script below also works from the repository root as `npm run <script> -w apps/web-angular`
(CI does exactly that). Never run `npm install` inside this folder: the root
`package-lock.json` is the only lockfile.

The API is expected on `http://localhost:8080` (`cd apps/api && ./gradlew bootRun`) and the
Firebase Auth emulator on `localhost:9099` (`docker compose up -d` at the repository root). When
the API is down the app still renders; the footer shows "API unavailable" with a retry button,
signed-in pages show error states with retry and no page breaks.

| Script                 | What it does                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `npm start`            | dev server (`prestart` prepares the workspace, see below)                                |
| `npm run build`        | production build with budgets (`dist/web-angular/browser`)                               |
| `npm run build:prod`   | same, explicit configuration                                                             |
| `npm run build:dev`    | development build (source maps, no optimisation)                                         |
| `npm run lint`         | ESLint (angular-eslint, templates included)                                              |
| `npm run format`       | Prettier write / `npm run format:check` verifies                                         |
| `npm test`             | unit tests once (`ng test --watch=false`); `npm run test:watch`                          |
| `npm run e2e`          | Playwright (chromium) — starts `npm start` unless :4200 already runs                     |
| `npm run generate:api` | delegates to the root `generate:api` (api-client + shared-types)                         |
| `npm run tokens:build` | `npm run build -w @orenji/design-tokens` (also the `pre*` hook of start/build/test/lint) |

## Workspace packages

The app consumes two packages from `packages/` as TypeScript source:

- `@orenji/design-tokens` — `dist/tokens.css` (imported by `src/styles.scss`) and
  `dist/tokens.ts` (`Theme` types used by `ThemeService`).
- `@orenji/api-client` — the generated Angular services (`MetaService`, ...).

How it is wired (root npm workspace):

1. `package.json` lists both as workspace dependencies (`"*"`); the root `npm ci` symlinks them
   into `<repo>/node_modules/@orenji/*`.
2. `tsconfig.json` `paths` map `@orenji/api-client` → `../../packages/api-client/src/index.ts`
   and `@orenji/design-tokens` → `../../packages/design-tokens/dist/tokens.ts`, so both compile
   as part of this app (strict mode, AOT) and changes trigger rebuilds in `ng serve`.
3. The generated client imports `@angular/core`, `@angular/common/http`, `rxjs` and `tslib`
   (declared there as optional peer dependencies). They are hoisted to the root `node_modules`
   by the workspace install, so the generated code resolves them from its real path to the same
   single copy this app uses — no `preserveSymlinks`, no link script, no second Angular.
4. The design tokens are rebuilt by the `pre*` hooks (`tokens:build`); `dist/` is git-ignored.

## Runtime configuration (`config.json`)

The same build runs in every environment. At startup `AppConfigService`
(`src/app/core/config`) loads `/config.json` (`provideAppInitializer`) and exposes it as signals:

```json
{
  "apiBaseUrl": "http://localhost:8080",
  "wsBaseUrl": "ws://localhost:8080/ws",
  "firebase": { "apiKey": "", "authDomain": "", "projectId": "", "appId": "" },
  "firebaseAuthEmulatorHost": "localhost:9099",
  "googleMapsApiKey": "",
  "googleMapsMapId": "",
  "environment": "local"
}
```

- Local: `public/config.json` (served by `ng serve`).
- Container: rendered from environment variables by `docker-entrypoint.sh` (see Docker below).
- Missing/invalid file: defaults from `app-config.model.ts` and a console warning; the app boots.

Only public values belong here (Firebase web config, referrer-restricted Maps key). Never secrets.

## HTTP layer

`provideHttpClient(withInterceptors([...]))` in `app.config.ts`, in this order:

1. `apiBaseUrlInterceptor` — rewrites relative `/api/...` URLs to `${apiBaseUrl}/api/...` and tags
   the request (`IS_API_REQUEST`).
2. `acceptHeaderInterceptor` — the generated client sends `Accept: application/problem+json`
   for operations without a success body (204); the API answers those with 406, so such API
   requests also accept `application/json`.
3. `requestIdInterceptor` — adds `X-Request-Id` (UUID) to API requests for log correlation.
4. `sessionInterceptor` — reports 428 `TERMS_ACCEPTANCE_REQUIRED` and 403 `ACCOUNT_SUSPENDED`
   from any call to `SessionService`, which routes to `/auth/consent` or `/auth/suspended`
   (opt out with `SKIP_SESSION_REDIRECT`).
5. `authInterceptor` — `Authorization: Bearer <Firebase ID token>` on every API route except
   `/api/v1/public/**` and `/api/v1/meta`; waits for Firebase to restore the session; on a 401
   forces one token refresh and retries once (never for `REAUTHENTICATION_REQUIRED`).
6. `errorInterceptor` — maps RFC 9457 Problem Details to `ApiError`
   (`errorCode`, `message`, `requestId`, `status`, `fieldErrors`, raw `problem` extensions) and
   shows a `MatSnackBar` toast for 5xx/network failures. Opt out per request with
   `silentErrors()` / `SKIP_ERROR_TOAST`. `friendlyError()` turns an `ApiError` into safe copy.

Generated services from `@orenji/api-client` use an empty base path so they go through the same
interceptors (`core/api/provide-api-client.ts`). Role sets: the generator types `uniqueItems`
arrays as `Set`, which `HttpClient` would serialise as `{}`; use `roleList()` to read and
`rolePayload()` to send roles (`core/auth/roles.ts`).

## Authentication and session (Phase 1)

- **Firebase Auth (JS SDK v12)** behind `FirebaseAuthPort` (`core/auth/firebase-auth.port.ts`).
  The SDK is loaded lazily (dynamic import) so it stays out of the initial bundle. With
  `firebaseAuthEmulatorHost` set (local), every call goes to the Auth emulator
  (`docker compose up -d`, port 9099); no real Firebase project is needed.
- **`AuthService`** (signals): email sign-up/sign-in, Google pop-up (dismissals are silent,
  blocked pop-ups explained), verification email, password reset, re-authentication (password
  or Google), `getIdToken(forceRefresh)`, sign-out, `ready()` for guards.
- **`SessionService`**: `GET /api/v1/me` for the signed-in user, reloaded on user switch;
  statuses `anonymous | loading | ready | consent-required | suspended | deletion-pending |
error` (error = retryable; the shell shows a banner with Retry). Exposes roles,
  `needsOnboarding`, `canAccessAdmin`.
- **Guards** (`core/auth/auth.guards.ts`): `authGuard`, `accountGuard` (terms accepted, not
  suspended), `onboardingGuard` (public pages: visitors pass, signed-in collectors must have
  finished onboarding), `accountStateGuard`, `adminGuard` (ADMIN/SUPER_ADMIN everywhere,
  MODERATOR only on routes without `adminArea: 'admin'`), `guestGuard`. Return URLs are
  validated by `safeReturnUrl()` (in-app paths only).

Routes: `/auth/sign-in`, `/auth/sign-up` (required legal documents from
`GET /public/legal/documents`, consents recorded, verification email), `/auth/verify-email`,
`/auth/reset-password`, `/auth/consent`, `/auth/suspended` (suspension or pending deletion with
cancel + export), `/onboarding` (profile, interests, trading area), `/settings/{profile,
privacy, notifications, trading-area, account, appearance}`, `/collectors/:handle`,
`/admin` (dashboard), `/admin/users`, `/admin/users/:id`, `/admin/audit-logs`.

Local accounts: `docs/development/test-accounts.md` (password `LocalDev!2026`, emulator only).
In the emulator no email is sent: verification and reset links appear in the emulator logs and
the Emulator UI (http://localhost:4000/auth).

## Maps

Feature code uses `MapAdapter` (`shared/map/map-adapter.ts`: view, markers, circles,
`fitBounds`, click / marker click / drag / viewport callbacks) created by `MapAdapterFactory`.
The factory lazy-loads the **Leaflet + OpenStreetMap** adapter by default and only uses the
Google Maps adapter when `googleMapsApiKey` is configured (falling back to Leaflet if Google
fails). Leaflet's stylesheet is a non-injected global bundle (`leaflet.css`) added on first use;
markers are CSS `divIcon`s (`src/styles/_app-extras.scss`). `TradingAreaPickerComponent`
(`shared/location`) edits a trading area (draggable centre, 1–50 km radius, browser
geolocation, city presets) and rounds coordinates to 3 decimals; the server derives the public
point (ADR 0004).

## Theming and design tokens

- Tokens: `packages/design-tokens/tokens.json` → `dist/tokens.css` (CSS custom properties) and
  `dist/tokens.ts` (typed constants). `src/styles.scss` imports the CSS by relative path. Use
  `var(--color-primary)`, `var(--spacing-4)`, `var(--radius-md)`, `var(--font-display)`,
  `var(--color-status-fresh)`, ... — never raw hex.
- Material 3: `src/theme/_theme-colors.scss` was generated with
  `ng generate @angular/material:theme-color --primary-color=#F4761A --tertiary-color=#0F766E`.
  `styles.scss` applies `mat.theme()` (Inter as plain family, Sora as brand family) on `html`
  (light), on `[data-theme='dark']` and under `prefers-color-scheme: dark` for
  `html:not([data-theme='light'])`.
- `ThemeService` (`core/theme`) holds `preference` (`light | dark | system`, persisted in
  `localStorage`) and `resolved`; it sets `html[data-theme]`. The toolbar menu drives it.
- Icons: Material Symbols Rounded (`MatIconRegistry.setDefaultFontSetClass`).
- Fonts (Sora, Inter, JetBrains Mono) and icons come from Google Fonts (preconnected in
  `index.html`); the CSP allows exactly those origins.

## Structure

```
src/app/
  app.config.ts, app.routes.ts       providers, lazy routes ("" -> /map, "**" -> not found)
  core/
    account/    AccountExportService (GET /me/export -> JSON download)
    api/        provideApiClient()  (generated client wiring)
    auth/       AuthService, FirebaseAuthPort, SessionService, guards, interceptors, roles
    config/     AppConfigService    (/config.json)
    http/       interceptors, ApiError, friendlyError, HttpContext tokens
    layout/     app-shell, top-bar, account-menu, session-banner, bottom-nav (<960px), footer,
                api-version, theme-toggle
    routing/    OrenjiTitleStrategy ("<page> · OrenjiTrade")
    theme/      ThemeService
  features/
    auth/       sign-in, sign-up, verify-email, reset-password, consent, suspended
    onboarding/ three-step wizard
    settings/   shell + profile, privacy, notifications, trading-area, account, appearance
    collectors/ public profile (container + presentational view)
    admin/      shell, dashboard, users (list, detail, roles editor, suspend dialog), audit logs
    map, inventory, search, community, wishlist, messages, legal, not-found
  shared/
    domain/     games, distance / last-active labels, coordinate rounding
    location/   TradingAreaPicker, city presets, MyLocationStore
    map/        MapAdapter, Leaflet + Google adapters, factory, approximate-area map
    profile/    profile form, game / language / tag pickers, MyProfileStore
    pipes/      relativeTime
    ui/         avatar, card-art, confirm-dialog, game-chip, section-card, empty-state,
                error-state, skeleton, page-header, freshness-badge, condition-chip,
                availability-chip, search-field, wordmark
```

Rules: standalone components, `ChangeDetectionStrategy.OnPush`, signals for state, feature
folders, no giant components, skeleton + empty + error(retry) states on every screen, labels on
every icon-only button, skip link and landmarks in the shell.

## API client regeneration

```bash
npm run generate:api
```

Runs OpenAPI Generator (typescript-angular, pinned in `packages/api-client/tools/openapitools.json`,
needs Java) and `openapi-typescript` against `docs/api/openapi.json`. Commit the regenerated
`packages/api-client/src` and `packages/shared-types/src/schema.d.ts`. Details:
[`packages/api-client/README.md`](../../packages/api-client/README.md).

## Tests

- Unit (`npm test`): Angular's Vitest runner (jsdom). Covered: app shell, `ThemeService`,
  HTTP interceptors (ProblemDetail to `ApiError`, toast rules, request id, bearer token + single
  retry, Accept widening), `AuthService` (fake Firebase port), `SessionService` (status
  mapping, 428/403 handling, consents), guards, roles, friendly errors, map adapter factory
  (Leaflet default, Google with key, fallback), trading-area picker (fake adapter), profile
  form rules, avatar validation, admin helpers, sign-in page, `relativeTime`, freshness,
  `AppConfigService`, legal pages.
- E2E (`npm run e2e`, Playwright/chromium; `npx playwright install chromium` once):
  - `e2e/smoke.spec.ts`: shell, navigation, legal draft banner, 404 (no API needed).
  - `e2e/auth.spec.ts`, `e2e/settings.spec.ts`, `e2e/admin.spec.ts` run against the **real
    local stack** and create fresh fictional users through the UI or the emulator REST API:
    sign-up with consents, email verification through the emulator's oob codes, onboarding
    (including clicking the Leaflet map), sign-out / sign-in, the 428 consent page,
    discoverability with a check that every JSON response carries at most 3 decimals for
    `lat`/`lng`, JSON export download, profile edits, deletion with re-authentication and
    cancel, admin suspend/unsuspend and the audit log, moderator/collector restrictions.
    They skip with a clear message only when the API (`E2E_API_URL`, default
    `http://localhost:8080`) or the Auth emulator (`E2E_AUTH_EMULATOR_URL`, default
    `http://localhost:9099`) is unreachable.

  Start the stack first: `docker compose up -d` at the repository root, then the API with the
  `local` profile (`cd apps/api && ./gradlew bootRun`, or a snapshot jar:
  `java -jar <api>.jar --spring.profiles.active=local` from `apps/api`), wait for
  `http://localhost:8080/actuator/health/readiness`, then `npm run e2e`.

## Docker (Cloud Run)

Multi-stage image: `node:24-alpine` builds tokens + app, `nginx:1.27-alpine` serves it.
**The build context is the repository root** because the image installs from the root
`package-lock.json` (`npm ci --workspace apps/web-angular --workspace packages/design-tokens
--workspace packages/api-client`) and needs `packages/`:

```bash
# from the repo root
docker build -f apps/web-angular/Dockerfile -t orenjitrade-web .
docker run --rm -p 8080:8080 \
  -e API_BASE_URL=http://localhost:8081 -e ENVIRONMENT=development orenjitrade-web
```

`docker-entrypoint.sh` renders `/usr/share/nginx/html/config.json` from
`API_BASE_URL, WS_BASE_URL, FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
FIREBASE_APP_ID, FIREBASE_AUTH_EMULATOR_HOST, GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID, ENVIRONMENT`,
renders `nginx.conf` (listen `$PORT`, default 8080) and starts nginx.

`nginx.conf`: SPA fallback, gzip, immutable caching for hashed assets, `no-cache` for
`index.html` and `config.json`, `/healthz`, and security headers (`X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, CSP allowing self, Google
Fonts, Google Maps, Firebase Auth / Identity Toolkit, the Firebase auth domain, OpenStreetMap
tiles and `ws(s)` to the API).

Ignore rules live in `.dockerignore` and its BuildKit twin `Dockerfile.dockerignore` (the
latter is the one Docker reads when the context is the repo root; keep both identical).
