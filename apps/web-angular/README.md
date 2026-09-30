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
5. `limitReachedInterceptor` — any 429 `LIMIT_REACHED` opens the limit-reached dialog
   (`core/limits`, lazy chunk: limit key and label, used/limit, reset time, the premium benefit
   and a "See Premium" link to `/premium` while the `premiumPlans` flag is on). The error still
   reaches the caller; opt out with `SKIP_LIMIT_DIALOG`.
6. `authInterceptor` — `Authorization: Bearer <Firebase ID token>` on every API route except
   `/api/v1/public/**` and `/api/v1/meta` (unless the request sets `ATTACH_ID_TOKEN`, used by
   the feature flags and the footer's `/meta` probe so signed-in calls count against the
   account, not the anonymous per-IP rate limit); waits for Firebase to restore the session; on
   a 401 forces one token refresh and retries once (never for `REAUTHENTICATION_REQUIRED`).
7. `errorInterceptor` — maps RFC 9457 Problem Details to `ApiError`
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
`/admin` (dashboard), `/admin/users`, `/admin/users/:id`, `/admin/audit-logs`; Phase 2 adds
`/cards`, `/cards/:id`, `/sets/:id`, `/premium`, `/admin/games`, `/admin/cards[/:id]`,
`/admin/feature-flags`, `/admin/usage-limits`.

Local accounts: `docs/development/test-accounts.md` (password `LocalDev!2026`, emulator only).
In the emulator no email is sent: verification and reset links appear in the emulator logs and
the Emulator UI (http://localhost:4000/auth).

## Catalog and platform rules (Phase 2)

- **Feature flags** (`core/feature-flags`): `FeatureFlagsService` loads
  `GET /public/feature-flags` (with the ID token when signed in, so partial rollouts are
  evaluated per account) on the first navigation outside `/auth/**`, and again after a sign-in
  or sign-out. `isEnabled()` / `enabled()` are `false` until known, so switched-off features
  never flash. Used by the top bar (Community needs `publicChat`), the account menu and the
  limit dialog (`premiumPlans`); `featureGuard(key, label)` protects flag-gated routes
  (`/community`).
- **Limits**: `LimitReachedService` + interceptor (see HTTP layer); `PlansStore`
  (`GET /plans`, shared by `/premium` and the dialog); `/premium` lists the plans and, signed
  in, the collector's usage (`GET /me/plan`). Checkout arrives with billing (Phase 10).
- **Catalog** (`features/catalog`, `shared/catalog`): top-bar `CardSearchBoxComponent`
  (`GET /cards/suggest`, 250 ms debounce, 2+ characters, arrow keys + Enter, printing
  suggestions open the card with that printing selected, Enter without a highlighted
  suggestion searches `/cards?q=`; deferred chunk with the plain search field as placeholder);
  `/cards` (query + game pills + set/rarity/language/edition from the game's `GameSchema`,
  every piece of state in the URL, paginated grid, printing-code badge); `/cards/:id`
  (`?printing=` selects a printing; hero picture, attributes rendered from the schema's
  `metadataFields`, printings table with market prices, "Add to inventory" (opens the add-card
  dialog on that printing), "Who has this near me" (opens `/map?card=<id>&view=list`, Phase 4)
  and "Add to wishlist" (coming soon); `/sets/:id` (cards + paginated checklist). `GamesStore`
  (`GET /games`) also feeds the profile game picker, so hidden games disappear there.
- **Admin**: `/admin/games` (list incl. hidden, edit names/status/order and the schema JSON with
  live validation and a preview), `/admin/cards` (find cards, catalog sync with polling and the
  latest runs), `/admin/cards/:id` (card fields, schema-driven attributes, printings dialog),
  `/admin/feature-flags` (switch with confirmation; SUPER_ADMIN, read-only for ADMIN),
  `/admin/usage-limits` (plans x limits, inline edit with validation; SUPER_ADMIN).
- Not in the generated client, so not in the UI yet: `metadata.<key>` catalog filters (the
  generator did not emit the dynamic query parameters).

## Inventory, binders and public binders (Phase 3)

Contract: `docs/api/contracts/phase3-inventory.md` (web section). Generated client only
(`InventoryService`, `BindersService`, `PublicBindersService`).

- **`/inventory`** (`features/inventory`): signed-out visitors get a sign-in invitation. The
  container (`InventoryPageComponent`) keeps every filter in the URL
  (`?binder=<id>|unfiled&q=&game=&visibility=&availability=&condition=&freshness=&sort=&view=&page=&size=`,
  parsed by `data/inventory-params.ts`) and provides `InventoryStore` (signals for binders,
  summary, privacy settings, the item page, selection; writes return promises that reject with
  `ApiError`) and `BinderActionsService` to its dialogs through the page injector.
  - Left: `BinderListComponent` (All cards, Unfiled, binders with visibility icon and counts,
    New binder, binder manager); a horizontal strip below 960 px.
  - Top: `InventorySummaryComponent` (cards/copies, public now, private, temporarily public with
    the next end, stale + hidden with "Confirm all" = bulk CONFIRM of every STALE/HIDDEN item),
    a privacy notice when something is public but the collector is neither discoverable nor has a
    PUBLIC profile (ADR 0004 rules), `InventoryToolbarComponent` (search, visibility segmented
    control All/Private/Public/Temporarily public, game, availability, condition, freshness,
    sort, grid/table).
  - Selected binder: `BinderHeaderComponent` (kind, description, effective visibility with the
    reason when nobody can see it, counts, freshness, publish 1 hour / 24 hours / until disabled,
    make private, view public page, edit, confirm, delete).
  - Items: `InventoryItemCardComponent` (grid) / `InventoryItemTableComponent` (table) with
    picture, name, printing code, condition/availability/offers chips, price, quantity stepper
    (PATCH in place), visibility badge (`data/visibility-status.ts` explains why a public item is
    not visible: hidden, expired, private binder, owner hidden) and freshness badge (server label).
  - Multi-select: `BulkBarComponent` (visibility incl. temporary with 1 h / 24 h / 3 / 7 / 30
    days, move to binder or unfiled, availability, confirm, delete with confirmation); the outcome
    sentence lists skipped cards and why (`data/bulk-actions.ts`).
  - Dialogs (opened with the page injector): `AddCardDialogComponent` (autocomplete on
    `/cards/suggest` → printing picker on `/cards/{id}` → details, private by default so cards can
    be prepared and published later; `/inventory?card=<id>&add=<printingId>` opens it, used by the
    card detail's "Add to inventory"), `ItemEditorSheetComponent` (side panel: every field via
    `ItemDetailsFieldsComponent`, PATCH of the changed fields only (`data/item-form.ts`), photos,
    confirm availability, delete), `BinderFormDialogComponent` (create/edit; 429 `binders.max`
    opens the global limit-reached dialog and an inline message), `BinderManagerDialogComponent`
    (drag and drop or arrow buttons to reorder, inline rename, publish/make private, delete,
    create).
- **`/binders/:id`** (`features/binders`): public binder (`GET /public/binders/{id}` + items, sent
  with the ID token when signed in so `binder.views.per_day` counts and a distance bucket is
  returned). Owner card with region label and distance bucket only, game pills, search and
  availability filter in the URL, public item cards (condition, availability, price, offers,
  public notes; never private notes). States: not available (404), daily view limit (429),
  error with retry.
- **Collector page**: "View public binder" opens the first public binder; public binders
  (`GET /collectors/{handle}/binders`) and a preview of public cards
  (`GET /collectors/{handle}/inventory`) are listed.

## Map discovery and search (Phase 4)

Contract: `docs/api/contracts/phase4-map-search.md` ("Web /map page"). Generated client only
(`DiscoveryService`, `SearchService`, `PublicBindersService`, `CatalogService`, `PlansService`).

- **`/map`** (`features/map`), the flagship page: a full-height map through the `MapAdapter`
  (Leaflet/OpenStreetMap; zoom buttons bottom right). The container (`MapPageComponent`) keeps the
  filters in the URL (`?game=&availability=&freshness=&tags=&radius=&card=|printing=&view=list`,
  `data/map-params.ts`) but never the map position, and provides `MapDiscoveryStore`
  (`data/map-discovery.store.ts`):
  - Centre: signed-in collectors with a trading area send no `lat`/`lng` (the server uses their
    area and answers with its 2-decimal snapped centre; the client never reads the private
    centre, so `GET /me/location` is not called here); signed-out visitors and collectors
    without an area browse around Montréal (city picker + "Sign in" / "Set my area" prompt).
  - `GET /collectors/nearby` with the visible radius (half the viewport diagonal, never more than
    the chosen radius, 2-decimal centre). Pans and zooms are debounced (400 ms) and re-query only
    when the view leaves the circle the last answer covered (`data/map-query.ts`); filters and the
    radius always re-query. The radius slider is bounded by `map.radius.max_km` (`GET /me/plan`,
    FREE plan of `GET /plans` when signed out); a 429 `LIMIT_REACHED` opens the global
    limit-reached dialog and the store continues at the plan's cap.
  - Markers: round avatars at `publicPoint` with a freshness ring (`data/map-markers.ts`),
    grouped into count bubbles when more than 60 collectors are loaded (screen-space grid,
    `data/marker-clusters.ts`; the selected collector never hides in a cluster; clicking a
    cluster zooms in). Markers are keyboard-focusable buttons (Enter/Space activate) with
    "Name, public label" as accessible name; the viewer's own marker reads "You (...)".
  - `CollectorPreviewCardComponent` (`GET /collectors/{handle}/preview`, first public binder from
    `GET /collectors/{handle}/binders`): name, avatar, approximate distance (never for signed-out
    visitors), rating, tags, last activity, listing freshness, games; View profile, View public
    binder, Message (disabled until Phase 5). Non-modal dialog: focus moves in, Escape closes and
    returns focus. Bottom sheet on phones.
  - "List" toggle (`view=list`): `DiscoveryPanelComponent` + `CollectorListComponent`, the same
    collectors as an accessible list (keyboard alternative to the markers).
  - Top search: `UnifiedSearchBoxComponent` (`shared/search`, `GET /search/suggest`, grouped
    cards / collectors / binders / sets / tags). A card or printing switches to "holders of X"
    (`hasCardId` / `hasPrintingId`: markers filtered, the list shows each holder's listings with
    condition / availability / offers chips and prices, "All filters" leads to `/search`); a
    collector opens their preview; a tag filters; sets and binders open their pages; Enter
    searches `/search?q=`. The top bar's card autocomplete (Phase 2) is unchanged.
  - Bottom `MapFiltersBarComponent` (game, radius slider, availability, freshness, tags from
    `GET /tags` when signed in plus the tags of the loaded collectors), `MapLegendComponent`
    ("Positions are approximate to protect privacy" + marker key), `AreaPromptComponent`, and the
    right-hand Messages panel (placeholder until Phase 5).
- **`/search`** (`features/search`, the mobile Search tab), all state in the URL
  (`data/search-params.ts`):
  - `?q=&tab=cards|collectors|binders`: `GET /search` in tabs (cards + printings + sets,
    collectors with their matching listings, public binders with their owner block). When the
    query resolves to a card or printing, a banner lists the nearby holders with "All holders and
    prices" and "Show on the map".
  - `?card=|printing=` + `availability`, `condition`, `minPrice`, `maxPrice`, `freshness`,
    `edition`, `language`, `offers`, `sort=distance|price|freshness`, `page`: the card-holders
    view (`GET /search/card-holders`) with `HolderFiltersComponent` (reactive form; prices
    validated inline, min <= max) and paginated `HolderRowComponent`s (listing + holder with
    approximate place and distance, View binder).
  - Signed-out visitors (and collectors without an area) search around Montréal
    (`shared/discovery/discovery-centre.ts`).

## Maps

Feature code uses `MapAdapter` (`shared/map/map-adapter.ts`: view, markers (pins, avatar and
cluster variants with escaped HTML), circles (trading area or dashed search radius),
`fitBounds`, click / marker click / drag / viewport callbacks, zoom-control corner) created by
`MapAdapterFactory`.
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
    feature-flags/ FeatureFlagsService, featureGuard
    http/       interceptors, ApiError, friendlyError, HttpContext tokens
    limits/     limit-reached interceptor, service and dialog
    layout/     app-shell, top-bar, account-menu, session-banner, bottom-nav (<960px), footer,
                api-version, theme-toggle
    routing/    OrenjiTitleStrategy ("<page> · OrenjiTrade")
    theme/      ThemeService
  features/
    auth/       sign-in, sign-up, verify-email, reset-password, consent, suspended
    onboarding/ three-step wizard
    settings/   shell + profile, privacy, notifications, trading-area, account, appearance
    collectors/ public profile (container + presentational view)
    admin/      shell, dashboard, users (list, detail, roles editor, suspend dialog), audit logs,
                games (schema editor), cards (search, editor, printing dialog, sync panel),
                feature flags, usage limits
    catalog/    card search (filters, URL params), card detail (metadata, printings), set page
    inventory/  /inventory: data/ (params, store, item form, bulk actions, visibility status),
                binder list, toolbar, summary, items (grid card, table, stepper), bulk bar,
                binders (header, publish menu, form + manager dialogs), editor side panel,
                add-card dialog
    binders/    /binders/:id public binder (container + header)
    premium/    plans and usage
    map/        /map: data/ (params, query, clusters, markers, MapDiscoveryStore), map canvas,
                preview card, discovery panel + collector list, filters bar, legend, area
                prompt, messages panel (placeholder)
    search/     /search: data/ (params), unified results (tabs, collector result), card holders
                (filters form, result row)
    community, wishlist, messages, legal, not-found
  shared/
    catalog/    GamesStore, card image / tile / grid, card search box, catalog labels
    inventory/  inventory labels, item chips, public item card, public binder card
    plans/      PlansStore, plan and limit wording
    discovery/  discovery labels (filters, ratings, listings), DiscoveryCentreService
    search/     UnifiedSearchBox (GET /search/suggest), suggestion grouping and routing
    domain/     games, distance / last-active labels, coordinate rounding
    location/   TradingAreaPicker, city presets, MyLocationStore
    map/        MapAdapter, Leaflet + Google adapters, factory, approximate-area map
    profile/    profile form, game / language / tag pickers, MyProfileStore
    pipes/      relativeTime
    ui/         avatar, card-art, confirm-dialog, game-chip, section-card, empty-state,
                error-state, skeleton, page-header, freshness-badge, condition-chip,
                availability-chip, visibility-badge, search-field, wordmark
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
  `AppConfigService`, legal pages; Phase 2: feature flags (deferral on account pages, reload on
  sign-in, guard), limit-reached parsing/interceptor/dialog, card search box, catalog labels,
  card search params, card metadata, game schema validation, usage-limit matrix and cell
  editor, admin metadata form, plan labels; Phase 3: inventory params, item form (defaults,
  create request, changed-fields PATCH, validation), bulk actions and outcome wording,
  visibility explanations, inventory store (context, selection, quantity, confirm all, reorder
  rollback), quantity stepper, inventory labels, compact freshness badge; Phase 4: map params,
  map query (visible radius, plan cap, 2-decimal centre, covered-area skipping), marker
  clustering and markers, `MapDiscoveryStore` (city vs own-area centre, debounce, filters,
  429 cap and retry, 400 fallback, preview + binder), preview card, map adapter helpers
  (escaping, icons), suggestions, discovery labels, search params, holder filters form.
- E2E (`npm run e2e`, Playwright/chromium; `npx playwright install chromium` once):
  - `e2e/smoke.spec.ts`: shell, navigation, legal draft banner, 404 (no API needed).
  - `e2e/auth.spec.ts`, `e2e/settings.spec.ts`, `e2e/admin.spec.ts` run against the **real
    local stack** and create fresh fictional users through the UI or the emulator REST API:
    sign-up with consents, email verification through the emulator's oob codes, onboarding
    (including clicking the Leaflet map), sign-out / sign-in, the 428 consent page,
    discoverability with a check that every JSON response carries at most 3 decimals for
    `lat`/`lng`, JSON export download, profile edits, deletion with re-authentication and
    cancel, admin suspend/unsuspend and the audit log, moderator/collector restrictions.
  - `e2e/catalog.spec.ts` (autocomplete to card detail with keyboard, printings and set page,
    filters in the URL, printing-code search, not-found) and `e2e/admin-rules.spec.ts` (super
    admin switches a flag with confirmation and edits a usage limit inline, both persist after a
    reload and are restored afterwards; admins read-only; game schema validation; mock catalog
    sync).
  - `e2e/inventory.spec.ts`: open the inventory from the navigation, add a card (autocomplete →
    printing → details, private), quantity stepper, create a binder, move the card into it, make
    it public and change its condition in the edit panel, publish the binder until disabled (and
    the privacy notice); bulk temporary publication for 24 hours, the visibility segmented
    control, bulk availability with a skipped card and its reason, bulk move and make private; a
    second collector opens the public binder from the owner's profile (region label, distance
    bucket, chips, no private notes, game filter, every JSON response ≤ 3 decimals); the
    `binders.max` limit-reached dialog.
  - `e2e/map.spec.ts`: a collector publishes a card and another collector (both at a random
    rural point, so earlier runs never crowd the map) finds them on `/map` (avatar marker),
    clicks the marker, sees the preview, uses the keyboard List toggle, opens the profile and the
    public binder; card search in the map's search box switches to "holders of" (markers + list
    with price and chips), then the card-holders view (price range validation, max price and
    availability filters in the URL) and the unified search (`?q=AZR-EN011` banner, Collectors
    tab). Every JSON response has at most 3 decimals for `lat`/`lng` and never contains a stored
    trading-area centre.
    Catalog pictures are served from memory in these specs (`stubCardImages`): the API
    counts every placeholder image against its anonymous 60/min per-IP rate limit, which the
    parallel suite shares.
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
