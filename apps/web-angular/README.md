# OrenjiTrade web (`apps/web-angular`)

Angular 22 · TypeScript strict · Angular Material (Material 3) · standalone components · signals ·
ESLint + Prettier · Vitest unit tests · Playwright E2E · nginx container for Cloud Run.

Read [`CLAUDE.md`](../../CLAUDE.md) and ADR 0006 before changing conventions.

## Run

```bash
npm ci                      # installs deps, links packages/design-tokens + packages/api-client
npm start                   # builds design tokens, then ng serve on http://localhost:4200
```

The API is expected on `http://localhost:8080` (`cd apps/api && ./gradlew bootRun`). When it is
down the app still renders; the footer shows "API unavailable" with a retry button and no page
breaks.

| Script                 | What it does                                                                |
| ---------------------- | --------------------------------------------------------------------------- |
| `npm start`            | dev server (`prestart` prepares the workspace, see below)                   |
| `npm run build`        | production build with budgets (`dist/web-angular/browser`)                  |
| `npm run build:prod`   | same, explicit configuration                                                |
| `npm run build:dev`    | development build (source maps, no optimisation)                            |
| `npm run lint`         | ESLint (angular-eslint, templates included)                                 |
| `npm run format`       | Prettier write / `npm run format:check` verifies                            |
| `npm test`             | unit tests once (`ng test --watch=false`); `npm run test:watch`             |
| `npm run e2e`          | Playwright (chromium) — starts `npm start` unless :4200 already runs        |
| `npm run generate:api` | regenerates `packages/api-client` and `packages/shared-types`               |
| `npm run tokens:build` | rebuilds `packages/design-tokens/dist`                                      |
| `npm run workspace:*`  | `workspace:link` links workspace peers, `workspace:prepare` = tokens + link |

## Workspace packages

The app consumes two packages from `packages/` as TypeScript source:

- `@orenji/design-tokens` — `dist/tokens.css` (imported by `src/styles.scss`) and
  `dist/tokens.ts` (`Theme` types used by `ThemeService`).
- `@orenji/api-client` — the generated Angular services (`MetaService`, ...).

How it is wired (no npm workspaces at the repo root, so this is explicit):

1. `package.json` lists both as `file:../../packages/...` dependencies; npm symlinks them into
   `node_modules/@orenji/*`.
2. `tsconfig.json` `paths` map `@orenji/api-client` → `../../packages/api-client/src/index.ts`
   and `@orenji/design-tokens` → `../../packages/design-tokens/dist/tokens.ts`, so both compile
   as part of this app (strict mode, AOT) and changes trigger rebuilds in `ng serve`.
3. `scripts/link-workspace-peers.mjs` (runs on `postinstall` and via `workspace:prepare` before
   start/build/test/lint) links the api-client's optional peer dependencies (`@angular/core`,
   `@angular/common`, `rxjs`, `tslib`) from this app's `node_modules` into
   `packages/api-client/node_modules`. The generated code resolves them from its real path to the
   app's single copy — no `preserveSymlinks` (which makes `ng serve` crawl `node_modules` on
   Windows) and no second copy of Angular.
4. The design tokens are rebuilt by the same `pre*` hooks; `dist/` is git-ignored.

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
2. `requestIdInterceptor` — adds `X-Request-Id` (UUID) to API requests for log correlation.
3. `errorInterceptor` — maps RFC 9457 Problem Details to `ApiError`
   (`errorCode`, `message`, `requestId`, `status`, `fieldErrors`) and shows a `MatSnackBar` toast
   for 5xx/network failures. Opt out per request with `silentErrors()` / `SKIP_ERROR_TOAST`.

Generated services from `@orenji/api-client` use an empty base path so they go through the same
interceptors (`core/api/provide-api-client.ts`).

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
    api/        provideApiClient()  (generated client wiring)
    config/     AppConfigService    (/config.json)
    http/       interceptors, ApiError, HttpContext tokens
    layout/     app-shell, top-bar, bottom-nav (<960px), footer, api-version, theme-toggle
    routing/    OrenjiTitleStrategy ("<page> · OrenjiTrade")
    theme/      ThemeService
  features/     map, inventory, search, community, wishlist, messages, collectors, settings,
                admin (shell + dashboard + section list), legal (content map + pages), not-found
  shared/
    pipes/      relativeTime
    ui/         empty-state, error-state, skeleton, page-header, freshness-badge,
                condition-chip, availability-chip, search-field, wordmark
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

- Unit (`npm test`): Angular's Vitest runner (jsdom). Covered: app shell (wordmark, nav,
  landmarks), `ThemeService`, HTTP interceptors (ProblemDetail → `ApiError`, toast rules,
  request id), `relativeTime`, freshness buckets, `AppConfigService`, legal pages (draft banner
  for every route key).
- E2E (`npm run e2e`): `e2e/smoke.spec.ts` — shell renders the wordmark, navigation to
  `/inventory` and `/map`, `/legal/terms` shows the draft banner, 404 page. Run
  `npx playwright install chromium` once.

## Docker (Cloud Run)

Multi-stage image: `node:24-alpine` builds tokens + app, `nginx:1.27-alpine` serves it.
**The build context is the repository root** because the image needs `packages/`:

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
