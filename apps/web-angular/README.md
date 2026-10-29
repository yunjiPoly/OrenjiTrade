# OrenjiTrade web (`apps/web-angular`)

Angular 22 · TypeScript strict · Angular Material (Material 3) · standalone components · signals ·
ESLint + Prettier · Vitest unit tests · Playwright E2E · nginx container for Cloud Run.

Read [`CLAUDE.md`](../../CLAUDE.md) and ADR 0006 before changing conventions.

**The web redesign** (`docs/product/specs/2026-10-20-web-redesign.md`, stages WA to WH2 of the
owner's prompt of 2026-10-28) is built one stage at a time; see "The shell (web redesign WA)"
below for what stage WA changed. Offers, trades, checkout and disputes are gone from the web UI
(decision 2, ADR 0018): their sections below describe the server modules and the old pages.

## The shell (web redesign WA)

The frame of every page (`core/layout`, spec section 4, boards W1, W3, W28, W29 and W30):

- **Top bar** (64, sticky; `top-bar`): the wordmark (Home), the **region pill** and the **game
  pill** in the page's scope (Home and Search both, card, set and binder pages the region pill,
  the rest none; route `data.shell.pills`), the **global search** (a deferred chunk; hidden on
  Search), the **bell** (an orange dot, "Notifications, N new") and the **avatar** with the
  account menu; a guest gets "Sign in". The region and game pills open lazy popovers (`Popovers`,
  CDK overlay; a bottom sheet below 960): "Choose a region" (the home region marked, "Not your
  region" with the way back) and "Choose a game" (Yu-Gi-Oh! only until stage WD, the other games
  "Cards coming soon", "{n} of your cards" from `GET /inventory/summary`). **Below 960**, on the
  five tabs' own pages (route `data.shell.tabBar`: `/`, `/search`, `/inventory`, `/messages*`,
  `/profile`), it is the phone's **per-tab bar** (spec 16, board W29): the tab's title in Sora 28
  (`ShellLayout.tabTitle`; Home shows its two pills instead), the pills on Home and Search, the
  bell, and on Profile the avatar with the account menu; the page's own title is then visually
  hidden (`ShellTabTitleDirective`, `app-page-header`'s `tabTitle`), so each page keeps one h1.
  Every other page keeps the wordmark, the pills in scope, the bell and the avatar.
- **Global search** (`global-search`): `/` or Ctrl/Cmd+K, an ARIA combobox; empty, the recent
  searches of this browser (`core/search/recent-searches.service.ts`, localStorage per account,
  at most 8, never sent anywhere; Settings › Privacy › "Remember my searches"); typing (150 ms,
  from 2 characters) up to 8 cards of the browsed game (`GET /cards/suggest`), up to 3 collectors
  of the browsed region for a signed-in collector (`GET /search/collectors`), and "Search binders
  and deck cores for '…'"; no counts. A code matching one printing opens it preselected.
- **Rail** (72, `rail`, at 960 and wider) and **tab bar** (`tab-bar`, below 960): Home, Search,
  Inventory, Messages (unread chats badge, `unread-chats`, a deferred probe of
  `GET /conversations`) and Profile; Admin for staff and the "?" button on the rail.
- **Account menu**: View my profile (`/profile`), Settings, Appearance › (Same as the system,
  Light, Dark), Keyboard shortcuts, Trading safely, Admin console (staff), Sign out.
- **Keyboard** (`core/keyboard`): `/`, Ctrl/Cmd+K, `g` then h s i m p, `n` (Add cards), `?` (the
  lazy "Keyboard shortcuts" dialog); single keys never fire in a field or over a dialog or menu,
  and Settings › Appearance › "Single-key shortcuts" turns them off (`KeyboardPrefs`).
- **Toasts** (`core/feedback`): every `MatSnackBar.open()` of the app becomes a shell toast
  (`ToastSnackBar`): bottom-left beside the rail (above the tab bar below 960), up to 3, 6 s or
  10 s with an Undo, paused on hover or focus.
- **Skip links** ("Skip to content", "Skip the map" while the map is shown), the **session
  banner** ("We could not load your account." with "Try again"), and the **footer** of reading
  pages only (`data.shell.layout`).
- **Routes and old links** (`app.routes.ts`, `core/routing/legacy-redirects.ts`, spec 4.11): Home
  (`/`, the region's map until stage WE), Search with Cards | Binders | Wishlist (Binders without a
  text is the map until stage WD), Messages with Chats | Community (`/messages/community/:room`),
  `/profile`; `/map` → Search › Binders, `/cards?q=` → Search › Cards, `/wishlist` → Search ›
  Wishlist, `/community` → Messages › Community, `/offers` and `/trades` → Messages with the toast
  "Offers are no longer available. Deals happen in the chat.", `/checkout` and `/disputes` → a
  notice, `/settings/offers|payouts` → Settings. Only the landing and Legal are indexable
  (decision 6, `OrenjiTitleStrategy`).

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
  "environment": "local"
}
```

- Local: `public/config.json` (served by `ng serve`).
- Container: rendered from environment variables by `docker-entrypoint.sh` (see Docker below).
- Missing/invalid file: defaults from `app-config.model.ts` and a console warning; the app boots.

Only public values belong here (the Firebase web config). Never secrets. There is no map key:
the map draws bundled boundary files (see Maps below, ADR 0017).

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
   (`core/limits`, lazy chunk: the limit's label, used/limit, reset time and "Every collector
   has the same limits."; no plan, no link, nothing to buy since stage F1). The error still
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
cancel + export), `/onboarding` (profile, interests, "Where are you?"), `/settings/{profile,
privacy, notifications, location, account, appearance}` (`/settings/trading-area` redirects), `/collectors/:handle`,
`/admin` (dashboard), `/admin/users`, `/admin/users/:id`, `/admin/audit-logs`; Phase 2 adds
`/cards`, `/cards/:id`, `/sets/:id`, `/admin/games`, `/admin/cards[/:id]`,
`/admin/feature-flags`, `/admin/usage-limits`.

Local accounts: `docs/development/test-accounts.md` (password `LocalDev!2026`, emulator only).
In the emulator no email is sent: verification and reset links appear in the emulator logs and
the Emulator UI (http://localhost:4000/auth).

## Catalog and platform rules (Phase 2)

- **Feature flags** (`core/feature-flags`): `FeatureFlagsService` loads
  `GET /public/feature-flags` (with the ID token when signed in, so partial rollouts are
  evaluated per account) on the first navigation outside `/auth/**`, and again after a sign-in
  or sign-out. `isEnabled()` / `enabled()` are `false` until known, so switched-off features
  never flash. Used by the top bar (Community needs `publicChat`) and the protected payment
  entry points (`protectedPayments`); `featureGuard(key, label)` protects flag-gated routes
  (`/community`).
- **Limits**: `LimitReachedService` + interceptor (see HTTP layer); limit wording in
  `shared/limits/limit-labels.ts`; the collector's usage comes from `GET /me/limits`
  (`LimitsService`). The same limits apply to every collector (stage F1, ADR 0019).
- **Catalog** (`features/catalog`, `shared/catalog`): the top bar's search is the shell's
  `GlobalSearchComponent` (`core/layout/global-search`, stage WA: cards of the browsed game from
  `GET /cards/suggest`, collectors for members, Enter on free text opens Search › Cards, a typed
  printing code opens that printing; a deferred chunk with the plain field as placeholder);
  the card pickers share `uniqueSuggestions` (`shared/catalog/card-suggestions.ts`);
  `/cards` (its text in `text=`, since an old `/cards?q=` link opens Search › Cards; game pills + set/rarity/language/edition from the game's `GameSchema`,
  every piece of state in the URL, paginated grid, printing-code badge); `/cards/:id`
  (`?printing=<id>` selects a printing, `?rarity=` shows "Any printing in <rarity>" and
  `?printing=any` shows "Any printing", both without picking, highlighting or pricing one;
  hero picture, attributes rendered from the schema's
  `metadataFields`, printings table with market prices, "Add to inventory" (opens the add-card
  dialog on that printing), "Who has this in my region" (opens `/search?card=<id>`, the holders
  of the platform region on screen; ADR 0017) and "Add to wishlist"; `/sets/:id` (cards + paginated checklist). `GamesStore`
  (`GET /games`) also feeds the profile game picker, so hidden games disappear there.
- **Admin**: `/admin/games` (list incl. hidden, edit names/status/order and the schema JSON with
  live validation and a preview), `/admin/cards` (find cards, catalog sync with polling and the
  latest runs), `/admin/cards/:id` (card fields, schema-driven attributes, printings dialog),
  `/admin/feature-flags` (switch with confirmation; SUPER_ADMIN, read-only for ADMIN),
  `/admin/usage-limits` (one row per limit, the same for everyone; inline edit with validation;
  SUPER_ADMIN).
- Not in the generated client, so not in the UI yet: `metadata.<key>` catalog filters (the
  generator did not emit the dynamic query parameters).

## Inventory, binders and public binders (Phase 3)

Contract: `docs/api/contracts/phase3-inventory.md` (web section). Generated client only
(`InventoryService`, `BindersService`, `PublicBindersService`).

- **`/inventory`** and **`/inventory/import`** (`features/inventory`, web redesign stage WB, spec
  section 9, boards W10 to W17; `inventory.routes.ts`, two lazy chunks; CDK drag-drop only in the
  Inventory chunk). The phone's card model (decision 8): copies, the price as "$ | % TCG" saved as
  one text (`data/item-price.ts`, `data/card-form.ts`, ported from the phone), Private or Public, a
  binder of the card's game, the public note, photos. Signed-out visitors get a sign-in invitation.
  The container (`InventoryPageComponent`) keeps the view in the URL
  (`?tab=cards|binders&binder=<id>|unfiled&q=&game=&visibility=PUBLIC|PRIVATE&freshness=&sort=created|name|price&dir=&view=table|grid&item=<id>`,
  `data/inventory-params.ts`; the table or grid choice is also remembered in this browser) and
  provides `InventoryStore` (100 cards a load with "Load more", the selection with Shift ranges,
  highlights of new rows, inline saves with `confirm: true`, restores), `InventoryActions` (deletes
  with Undo through `POST /items/{id}/restore` one card at a time, bulk outcomes that name what
  changed and why, Ctrl/Cmd+Z for the last Undo outside a text field) and `BinderActionsService`.
  - Layout: at lg and xl the binder pane (256), the list and a 440 drawer that pushes it; at md the
    pane hides (a Binder menu in the toolbar) and drawers lie over the list with a scrim; below 960
    the phone's design (drawers between the per-tab bar and the tab bar, one scrolling row of
    filters, an icon bulk dock, no drag and no quick add rows).
  - `BinderPaneComponent`: All cards, Unfiled, one section per game (stage G) with binder rows (a
    24 px cover, lock or globe, count, deck core tag), a "⋯" menu (also on right-click: Edit binder,
    Make public or private, Move up, Move down, Delete binder), reorder by drag within a game, and
    the drop targets of a card drag (same-game binders outlined, others dimmed "Only … cards can go
    in").
  - Header: "Inventory", Cards | Binders with your counts, Import, the orange Add cards split
    button (Quick add rows · Shift+N, Import a deck (.ydk), Import from Collectr (.csv)). The
    summary line, the binder strip ([Private | Public], Edit binder), the freshness banner ("Still
    have them" = bulk CONFIRM of every stale or hidden card, "Show them"), the visibility banner,
    the paused-listings banner.
  - `InventoryToolbarComponent`: search ("/" focuses it), Game, [All | Public | Private], Sort
    (Recently added, Name, Price) with its direction, Clear filters, Select (grid), [Table | Grid].
  - `InventoryTableComponent` (`role=grid`, 72 px rows, sticky header; container queries give the
    phone's row with the drawer open and drop Binder and Updated at md): the art (a 160 px preview
    on hover; drag starts here), name, game monogram, code and rarity, a same-game binder menu, the
    visibility tag (click toggles Private and Public), a copies stepper on hover or focus, the
    inline price (`PriceEditorComponent`: Enter saves, Esc cancels, "Was: …" for an old text), the
    age with a freshness dot, the "⋯" menu (Edit, Move to binder, Make public or private, Still have
    it, Check TCGplayer price, Delete). One tab stop (the active row): ↑↓ or j/k, Enter, Space or x,
    Ctrl/Cmd+A, Esc. `InventoryGridComponent`: tiles (art ≤160, badge, checkbox, name, code, price,
    copies).
  - `BulkDockComponent`: "6 selected" · Make public · Make private · Move to binder (by game,
    Unfiled, New binder…) · Still have them · Delete (confirm, then "6 cards deleted" with Undo) ·
    Clear (Esc anywhere on the page while nothing lies on top). No "Set price" and no "Select all
    that match" (decision 19). Its buttons stay focusable while an action runs (`aria-disabled`).
    Undo (and Ctrl/Cmd+Z) restores four cards at a time; a 429 `RATE_LIMITED` pauses for the
    server's `retryAfterSeconds` (twice at most), and the cards still waiting keep an Undo of their
    own ("Try again in 40 s") until the server's 10 minutes end. An inline save is announced
    ("Price saved") through `LiveAnnouncer`.
  - `QuickAddRowsComponent` (Shift+N): a code resolves its printing through `/cards/suggest`, a
    name opens a printing list; Enter adds the row (one `POST /inventory/items`), copies reset to 1;
    each added row has Undo for 10 minutes; errors and the 429 stay inline.
  - Drawers (`drawer/`): `EditCardDrawerComponent` (Previous and Next with Alt+↑ / Alt+↓, each
    saving first; "Discard your changes?", also when leaving Inventory (`leaveInventoryGuard`);
    Ctrl/Cmd+Enter; a stated condition, language and edition (the old web form, or a Collectr
    import) read-only as "Stated when it was added: …" with "Add to public note"; a binder change
    keeps the card's stored visibility (a temporary publication stays temporary); photos in four
    slots, images dropped on the
    drawer go there), `AddCardsDrawerComponent` (Card, Printing, Details; "Keep these for the next
    card"; the loop back to the search; "Add many at once").
  - Binders (`binders/`): `BindersTabComponent` (by game, covers, freshness with "Still have
    them", Move up / Move down, the deck core tip), `EditBinderDrawerComponent` (name, the game
    locked once the binder holds a card, [Private | Public], the purple "Sell as a deck core" with
    photos, price, note and key cards), `NewBinderDialogComponent` (five game tiles, "Cards coming
    soon" for a game without cards, the deck core switch, "Cards inside" from a selection; the
    stage G 409s and the binder limit in plain words).
  - A `.ydk` or `.csv` dropped anywhere on Inventory opens Import with it (`ImportHandoff`); any
    other file is answered with a toast and never uploaded. While a drawer is open the app's
    single-key shortcuts are off (`data-shortcuts-off` on the drawer frame). Printings that share a
    code say what tells them apart (edition, language, finish: `printingVariant`, the phone's rule)
    in Add cards, quick add rows and the import's printing menu. A public binder offers "View
    public page" (strip, pane menu, Binders tab card and menu, Edit binder); a temporary one says
    when it ends.
- **`/inventory/import`** (`import/`, contract `docs/api/contracts/s5-inventory-import.md`):
  `ImportSourceComponent` (deck or Collectr, the drop zone, the limits read from
  `GET /inventory/imports/limits`, paste the text), the check (chips All | Which copy? | Not
  recognised, "Use the newest", `ImportRowsComponent` with the deck sections, the printing menu,
  copies and status), the sticky footer ("34 cards · 69 copies will be added", Add, Discard) and
  `ImportDoneComponent`. Every row control holds (aria-disabled, still focusable) while its row
  saves, while the check works ("Use the newest", a section) or its lines reload, and a box always
  ends showing what its row holds (WB review R2-1). An open preview (60 minutes) or a cut commit is
  picked up again. The commit returns no item ids, so the imported cards do not open already
  selected (decision 19): Inventory opens sorted by Recently added.
- **`/binders/:id`** (`features/binders`): public binder (`GET /public/binders/{id}` + items, sent
  with the ID token when signed in so `binder.views.per_day` counts and blocks apply). Owner
  card with the owner's state or province only (ADR 0017), game pills, search and
  availability filter in the URL, public item cards (condition, availability, price, offers,
  public notes; never private notes). States: not available (404), daily view limit (429),
  error with retry.
- **Collector page**: "View public binder" opens the first public binder; public binders
  (`GET /collectors/{handle}/binders`) and a preview of public cards
  (`GET /collectors/{handle}/inventory`) are listed.

## Map discovery and search (Phase 4, platform regions since ADR 0017)

Contracts: `docs/api/contracts/phase4-map-search.md` and `docs/api/contracts/s1-regions-location.md`.
Generated client only (`RegionsService`, `SearchService`, `PublicBindersService`, `CatalogService`).

- **Region switcher** (top left, `core/region/region-context.service.ts`): every region-scoped call
  (search, suggestions, card holders, the map) sends `region`. Signed in: the home region of
  `GET /me` (`homeRegion`); signed out: the last choice kept in `localStorage`, else
  `americas-north`. Changing it updates `?region=` on `/map`.
- **`/map`** (`features/map`): one Leaflet vector map (`boundary-map`, Leaflet 1.9.4 lazy-loaded,
  its non-injected `leaflet.css` added on first use) of the bundled Natural Earth boundaries
  `public/boundaries/<region>.json` (`data/boundaries.ts`, fetched lazily per region; no tiles, no
  map provider), states shaded by public binder counts (`GET /regions/{region}/binder-counts`,
  `data/region-map.store.ts`), with "Made with Natural Earth" credit. Beside it
  `SubdivisionListComponent`, an accessible list of every state with its count (keyboard and
  screen-reader alternative). Choosing a state (click, Enter, or the list) opens
  `SubdivisionPanelComponent` and the URL `/map?region=..&subdivision=..`: the state's public
  binders in cursor pages (`GET /regions/{region}/subdivisions/{code}/binders`, "Load more"), with a
  skeleton, an empty state, an error with retry; states listed but not drawn (too small or newer
  than the data) are reachable from the list. The right-hand Messages panel (Phase 5) stays.
- **Location** (`shared/location`): `LocationFieldsComponent` (region, country and state pickers
  fed by `GET /regions`, optional city ≤ 80 characters, "Show my city on my profile") in onboarding
  ("Where are you?") and Settings → Location (`PUT/DELETE /me/location`); a gentle prompt invites
  collectors without a location. No GPS, no geolocation API (the CSP's `Permissions-Policy` denies
  it), no map picker.
- **`/search`** (`features/search`, the mobile Search tab), all state in the URL
  (`data/search-params.ts`):
  - `?q=&tab=cards|collectors|binders`: `GET /search` in tabs (cards + printings + sets,
    collectors with their matching listings, public binders with their owner block). When the
    query resolves to a card or printing, a banner lists the holders of the region with "All
    holders and prices".
  - `?card=|printing=` + `availability`, `condition`, `minPrice`, `maxPrice`, `freshness`,
    `edition`, `language`, `offers`, `sort=freshness|price`, `page`: the card-holders view
    (`GET /search/card-holders` in the browsed region) with `HolderFiltersComponent` (reactive
    form; prices validated inline, min <= max) and paginated `HolderRowComponent`s (listing +
    holder with their state or province, View binder).
  - Every search sends the browsed region (the region switcher); there is no centre or distance.

## Messaging, realtime and community (Phase 5)

Contract: `docs/api/contracts/phase5-chat.md` ("Web"). Generated client only (`MessagingService`,
`UploadsService`, `BlocksService`, `CommunityService`, `AdminCommunityService`,
`AdminModerationService`). STOMP payloads other than `MessageResponse` are not in the OpenAPI
document; their shapes live in `core/realtime/realtime-events.ts` with runtime guards.

- **Realtime** (`core/realtime`): `RealtimeService` (started by `provideRealtime()`) connects while
  a collector is signed in with a ready account and disconnects on sign-out or account change.
  STOMP 1.2 over a native WebSocket (`stomp-frames.ts` codec + `stomp-connection.ts` client, a
  lazy chunk, heartbeats both ways, no dependency) at `wsBaseUrl` (`/config.json`, derived from
  `apiBaseUrl` when empty) with the ID token as `access_token`. Subscribes only to
  `/user/queue/messages|receipts|typing|presence|notifications|conversations` (notifications
  since Phase 6, conversations since web stage WC),
  sends only `/app/typing`. `state` signal
  (`disabled | connecting | connected | reconnecting`, shown by `RealtimeStatusComponent` as
  "Live" / "Reconnecting…"); exponential backoff 1 s → 30 s with jitter, immediate retry when the
  browser comes back online or the tab becomes visible; a failure before CONNECTED forces a fresh
  ID token on the next attempt; `resync$` after every (re)connection makes the stores re-read
  over REST what pushes may have missed.
- **Messenger** (`features/messages`), one set of components for the map panel and the full page:
  `MessengerComponent` (container of `ConversationsStore`: inbox on `GET /conversations` with
  cursor pages, live preview / order / unread counts from pushes, presence dots, receipts from the
  caller's other tabs, re-read on unknown conversations and reconnections, mute/archive with
  `PATCH`, pages older conversations until a linked one is found) →
  `ConversationListComponent` (avatars, online dot, "You: …", muted icon, unread badge, arrow
  keys / Home / End) and `ThreadViewComponent` (container of `ThreadStore`: newest page first,
  older pages when the top sentinel scrolls into view with the position kept, read marker
  `POST /conversations/{id}/read` only while the thread is on screen and the tab visible, typing
  notices throttled to one per 3 s, "typing…" for 5 s, receipts turn "Sent" into "Seen", send
  errors inline: 403 `MESSAGING_BLOCKED`, 422 `MESSAGE_BLOCKED` (generic wording), 429 with the
  wait) → `ThreadHeaderComponent` (profile link, mute, archive, "Rate" when eligible (Phase 7),
  block/unblock with confirmation, "Report collector"), `MessageListComponent` (day separators, sender
  groups, `role="log"`), `MessageBubbleComponent` (text, shared card / binder, photo, offer,
  removed) and `MessageComposerComponent` (Enter sends, Shift+Enter new line, attachment menu:
  card via `/cards/suggest` autocomplete, one of the caller's public binders, or a JPEG/PNG/WebP
  photo ≤ 8 MB with preview, uploaded through `POST /uploads/images` kind MESSAGE on send).
  Shared pickers and link cards live in `shared/links`; `MediaUrlPipe` points API-relative media
  paths of pushed payloads at the API origin.
- **Map panel** (`features/map/messages-panel.component.ts`): the messenger in the right-hand
  sidenav with the live indicator and "Open full page"; the preview's Message button opens (or
  creates, `POST /conversations`, idempotent) the conversation there; the panel toggle carries the
  unread badge. **`/messages`, `/messages/:id`**: the full-page messenger; since web stage WC the
  inbox beside the chat from 960 px, one pane per route below (section "Messages: the deal beside
  the chat" below). "Message" buttons open the chat drawer (`shared/messaging/chat-drawer.service.ts`).
- **Messages: the deal beside the chat (web redesign WC, spec 10, boards W18 to W21).**
  - **Layout** (`messages-page.component.ts`, `messenger/`): at lg (1280 and wider) the inbox (340,
    with the page's H1 and Chats | Community projected as `[inboxHeader]`), the chat (its thread
    centred at 720) and the deal panel (320; "Deal" in the chat's header, `aria-pressed`, its
    state remembered in this browser under `orenjitrade.messages.dealPanel`); at md (960 to 1279)
    the inbox (300) and the chat, the deal panel a 360 drawer with a scrim, a focus trap and Esc;
    below 960 one pane per route, the deal panel a full-screen sheet. Esc in the chat gives the
    focus back to the inbox row.
  - **Inbox** (`conversation-list/`): "Search chats" (the page's own search, `/` focuses it),
    [All | Unread], rows of 76 (44 avatar and online dot, the handle, the phone's times "2 min",
    "Yesterday", "Sat", "Oct 14", orange when unread, the last message on one line: "You: …", a
    sale worded for the reader, an old offer as "Offer (no longer available)", the chat's card or
    deck core as a 28×40 thumbnail), the selected row `surfaceVariant` with a 2 px orange inset;
    ↑↓ or j k (single-key shortcuts, off with Settings › Appearance's switch), Enter; "No chats
    yet" with [Search cards]; "No chats match …" with "Show all chats".
  - **Chat** (`thread/`): the header (36 avatar, the handle, "Online · Quebec", the state or
    province only; "Deal"; "⋯": Rate {h} when eligible, Mute, Archive, Report {h}, Block {h});
    the pinned bar (`pinned-bar.component.ts`: 30×42 art, name, "{code} · {rarity}", the price as
    typed; the seller's "· your card" and the teal outline **Mark as sold**, the only entry; a
    "Sold" tag after the sale; "No longer listed" for a buyer); the shield tip of the reader's
    side (it replaces the dismissible trading safety notice of 2026-10-05, spec 20); the thread
    (bubbles ≤ 480, `chat.otherBubble`, a shared card as the 280 card with its price, the sale
    note in the `chat.sale*` tokens with "Tracking {n}", [Rate {other}] and, for the seller,
    Undo for 10 minutes, then gone; undone sales dropped from the thread when their pushed copy
    arrives); the quick replies of the side (`data/deal-rules.ts`, the phone's rule with the owner
    decision of 2026-10-28: the later replies for both once sold); the composer
    (`composer/`: the 40 round "+" menu, the field of 1 to 6 lines, Enter or Ctrl/Cmd+Enter sends,
    Shift+Enter a new line, a photo dropped on the chat attaches, "Not sent · {reason}" with
    "Try again"; the draft of each chat kept in memory by `shared/messaging/chat-drafts.service.ts`).
  - **"+" menu** (`dialogs/`): "Send my address" and "Send my e-Transfer email" open a 440 dialog
    typed each time (`autocomplete="off"`, the text only in the dialog's signals, sent at once with
    "Send in this chat", the preview of what the other collector reads, "OrenjiTrade doesn't keep
    this…"; decision 9: nothing is written to localStorage, sessionStorage or IndexedDB, an E2E
    reads all three); "Send a photo"; "Share a card from your inventory" (a 520 picker on
    `GET /inventory/items`, sent as `CARD_LINK` with `inventoryItemId`, which pins the chat's
    subject) and "Share a binder" (the public binders and deck cores of `GET /binders`).
  - **Mark as sold** (`dialogs/mark-sold-dialog.component.ts`, 480): the card row, "Copies sold"
    − 1 + up to the copies held (a deck core sells as one), "Tracking number · optional" (the API's
    rule as typed), the live sentence ("You keep 1 copy in your inventory." / "It was your last
    copy…"), `POST /conversations/{id}/sales` with the subject shown (409 `SUBJECT_CHANGED` closes
    with the news), refusals inline; then the toast "Marked as sold" with Undo
    (`POST /sales/{id}/undo`). Tracking numbers are never logged by the web.
  - **Deal panel** (`deal/deal-panel.component.ts`): "THIS CHAT IS ABOUT" (96×140 art, name, code,
    price, View card / View deck core); the seller's copies, visibility and binder
    (`GET /inventory/items/{id}`) with "Open in Inventory" (`/inventory?item=`), after the sale
    "Sold Oct 20 · Tracking …" with Undo and [Rate]; the buyer's "How deals work here" (four steps),
    "OrenjiTrade never holds the money and does not protect payments." and Trading safely; "WITH"
    (48 avatar, handle, "★4.9 · 14 ratings" and "Member since" from `GET /collectors/{handle}`, the
    place from the chat's participant, never the profile's city); the buyer's "More from {seller}"
    (four 64 tiles from the existing `GET /collectors/{handle}/inventory?excludeDeckCoreItems=true`,
    the chat's card left out, no counts; a tile puts "Could you add your {card} ({price}) to the
    same package?" in the composer; 404 shows none).
  - **Chat drawer** (`drawer/chat-drawer.component.ts`, a `@defer` chunk of the shell that shares
    the chat's code with Messages; `shared/messaging/chat-drawer.service.ts`): "Message" on a
    holder of Who has this card (`/search?card=`, about that copy), a public binder (about the deck
    core when it sells as one), Home's binders and a collector profile opens the chat in a 440
    non-modal drawer under the top bar (`aria-modal="false"`, no scrim): header (avatar, handle,
    status, "Open in Messages ↗", Close), pinned bar, tip, thread, quick replies, composer. One at a
    time (another replaces it, each draft kept); Esc closes it from inside and the focus goes back
    to the opener; F6 moves between the page and the drawer. At lg and xl it pushes the page; at
    md it overlays it, and Esc on the page closes it too, the focus staying where it is (a control
    under the drawer shows again; a menu, a dialog, an open list or a text field's own Esc comes
    first). Below 960 "Message" goes to `/messages/:id`; going to Messages closes it. One realtime
    connection for all of it.
  - **Realtime**: `RealtimeService` also subscribes to `/user/queue/conversations` (stage R4: a pin
    of the other collector), so the pinned bar and the inbox follow it.
  - **Refusals** read the same for every reason (owner decision of 2026-10-28): a send refused with
    403 `MESSAGING_BLOCKED` reads "This collector cannot receive messages right now.", never a
    block; the blocker alone sees "You blocked {h}…".
  - **Rate and Report** (`shared/ratings`, `shared/reports`, also from profiles): Rate names the
    deal ("{card} · sold Oct 20", stage R14's `dealName`), the words Poor, Not great, Okay, Good,
    Excellent, "Write a reference instead" and "Publish rating"; Report is "Report {handle}" with
    "Why are you reporting them?", "Send report" disabled with "Choose a reason first.", then
    "Report sent" with Done and "Follow it in My reports".
  - **Settings › Shipping details** (`/settings/shipping`): "On the web, OrenjiTrade doesn't save
    your address or e-Transfer email. …" (decision 9), nothing to fill in.
- **Blocks**: `shared/messaging/block-actions.service.ts` (confirmation + snack bar) from the thread
  menu and the community post menu; **Settings → Blocked users** (`GET /me/blocks`, Unblock).
- **`/community`, `/community/:slug`** (`features/community`, behind `featureGuard('publicChat')`;
  the nav link is hidden while the flag is off): `CommunityStore` (channels, feed with cursor
  pages, reply threads, writes that resolve to the inline message of a refusal: 409
  `DUPLICATE_POST`, 422 `POST_BLOCKED`, 429 with the wait), `ChannelSidebarComponent` (game
  filter; groups by city, games, topics; collapses behind a button on narrow screens),
  channel header, `PostComposerComponent` (1–2000 characters, card / public binder links,
  Ctrl+Enter), `PostItemComponent` (edit in place, delete with confirmation, block the author,
  moderator "Remove" with a required reason, "Report collector" (Phase 7)) and
  `PostRepliesComponent` (inline replies, Enter sends, delete own, moderator remove).
- **Admin → Community** (`features/admin/community`, moderators and admins): channels (create,
  edit, archive/restore with `POST/PATCH /admin/community/channels`) and the automatic moderation
  flags (`GET /admin/moderation/flags` by state, resolve with an optional note); `?tab=flags`.

## Wishlist, matching and notifications (Phase 6)

Contract: `docs/api/contracts/phase6-wishlist-notifications.md` ("Web / mobile"). Generated client
only (`WishlistService`, `NotificationsService`; the cap from `LimitsService.getMyLimits`, location
state from `LocationService.getMyLocation`). No web push registration (no FCM locally).

- **Notification centre** (`core/notifications`): `NotificationCenter` (started by
  `provideNotifications()`, follows the session like `RealtimeService`): unread count
  (`GET /notifications/unread-count`), the latest 8 for the bell menu (`GET /notifications`),
  `markRead` (optimistic, `POST /notifications/{id}/read`) and `markAllRead`
  (`POST /notifications/read-all`); every push on `/user/queue/notifications` (a
  `NotificationResponse`) raises the count once, joins the menu, is announced to screen readers
  and re-emitted on `pushed$`; reads made anywhere go out on `readChanges$`; the count is re-read
  after each reconnection and after the caller's own read receipts (reading a conversation marks
  its MESSAGE notifications read server side). `notification-kinds.ts`: icon / tone / label per
  type and the page a notification opens (`data.deepLink` when it is a safe in-app path, else a
  path rebuilt from its ids; the SYSTEM limit notice opens `/wishlist` for wishlist alerts, else
  `/notifications`; an old link to `/premium`, `/credits`, `/support` or their checkouts is never
  followed).
- **Top-bar bell** (`core/layout/notification-bell`): unread badge (bumps on arrival, "99+"),
  `aria-label` "Notifications, N unread", `data-realtime` = connection state; menu with the latest
  notifications (tinted icon per type, unread dot, relative time), opening one marks it read and
  follows its deep link, "Mark all as read", "See all notifications"; signed-out visitors are
  invited to sign in.
- **`/notifications`** (`features/notifications`): `NotificationFeedStore` (cursor pages
  "Load older notifications", `?unread=1` filter, live prepends, reads applied from anywhere,
  the unread view drops what became read, re-read after reconnection), day sections (Today,
  Yesterday, Earlier this week, Older), per-row "Mark as read", "Mark all as read", link to
  Settings → Notifications.
- **`/wishlist`** (`features/wishlist`, stage S2; old `/wishlist/<id>` links redirect to it):
  `WishlistStore` (`GET /wishlist`, `DELETE` with confirmation, the usage of
  `wishlist.items.max` from `GET /me/limits`, the location and privacy settings through
  `MyLocationStore`, quiet re-read
  on reconnection) → a prompt to set country and state when no location is set (alerts come from
  collectors of the region), "Let others see what you want" (the `wishlistVisible` privacy
  setting, explained), the summary (wishes and usage meter, nothing to buy) and `WishCardComponent`
  (picture, which copy, public note, "Near Mint
  only" and price term chips with the approximate amount for one printing, Edit, Remove). No
  matches, filters or per-wish alert switch any more.
- **Add/edit dialog** (`shared/wishlist`, a lazy chunk opened by `WishlistActions` from the
  wishlist page, card detail (with its `?printing=` or `?rarity=`) and the card holders view;
  signed-out visitors go to sign in first): card autocomplete (`GET /cards/suggest`; a typed
  printing code preselects a printing only when exactly one printing of the card carries it,
  otherwise the form starts on "Any printing" with the picker narrowed to that code) →
  `WishFieldsComponent` (public note first, ≤ 280 characters;
  "Near Mint only"; at most one price term from `GET /wishlist/price-terms` (`PriceTermsStore`),
  "85% TCG ≈ 21.25 USD" with one printing's market price, its source and date in a tooltip) →
  the shared `PrintingPickerComponent` (`shared/catalog/printing-picker`: "Any printing" first
  and default, every printing with its picture, set, code, rarity, edition, language, finish and
  market price; rarity / set / edition / language filters, the rarity alone meaning any printing
  of that rarity; optional holder counts for the card page of stage S3). `wishlist-form.ts`:
  form, defaults, create / PATCH bodies, messages. Inline errors: 409 same selection, 429
  `LIMIT_REACHED` (the limit dialog opens as well), field errors of a 400; after a refused save
  the keyboard focus stays on the save button; a click on the backdrop does not close the dialog
  while the form holds unsaved input (Escape and Cancel do).
- **Collector page**: "Looking for" (`GET /collectors/{handle}/wishlist`, only when the collector
  shows it; 404 hides the section): which copy, public note, chips.
- **Wishlist alerts (API)**: a public listing alerts the collectors of the same platform region
  whose wishes it fits, once per collector and listing; the `WISHLIST_ALERT` notification opens
  the card page with the wish's selection (`?printing=<id>`, `?rarity=` or `?printing=any`); the
  bell menu never cuts an alert before the place. Settings → Notifications has one
  "Wishlist alerts" switch; `/admin/wishlist` edits the price terms.

## Ratings, collector reports and the admin console (Phase 7)

Contract: `docs/api/contracts/phase7-ratings-reports-admin.md` (backend notes and deviations in
`apps/api/README.md`). Generated client only (`RatingsService`, `ReportsService`,
`ListingHealthService`, `AdminReportsService`, `AdminRatingsService`, `AdminListingsService`,
`AdminBindersService`, `AdminConsoleService`, `AdminNotificationsService`,
`AdminAnalyticsService`, `AdminModerationService`, `AdminDelistingService`).

- **Report collector** (`shared/reports`): `ReportActionsService.report(target, context)` opens
  `ReportCollectorDialogComponent` (product spec § 23): the collector, "Why are you reporting
  this user?" with the reasons of `GET /public/report-reasons` as radio buttons in server order
  (cached by `ReportReasonsService`, retry on failure), optional details ≤ 1000, Cancel /
  Confirm; Confirm stays disabled until a reason is chosen. `POST /reports/collectors` carries an
  `Idempotency-Key` fixed for the dialog and the context (PROFILE, CONVERSATION + conversationId,
  POST + postId, BINDER + binderId); refusals are explained inline (`report-errors.ts`: 409
  `REPORT_ALREADY_OPEN` keeps Confirm disabled, 422 `CANNOT_REPORT_SELF`, 404, 429 daily limit, 400) and success turns the dialog into a "Report sent" confirmation (focus on Done). Entry
  points: the collector profile (Report), the map preview (flag button, signed in), the
  conversation menu, the community post menu and the public binder owner card.
- **Settings → My reports** (`features/settings/reports`, `GET /me/reports`): reported
  collector, reason, sent / reviewed times and where the review stands, never the decision's
  specifics (the REPORT_DECISION notification links here).
- **Ratings on the collector page** (`features/collectors/ratings`): `CollectorRatingsStore`
  (component scoped: `GET /collectors/{handle}/ratings` summary + cursor pages of 5,
  `GET /collectors/{handle}/references`, `GET /ratings/eligibility?userId=` for other collectors)
  → `CollectorRatingsSectionComponent` ("Ratings & references": `RatingSummaryComponent` with
  the average, stars, count and one bar per criterion; `RatingItemComponent` with rater,
  interaction kind, date, comment and criteria, "Edit" on the viewer's own rating while
  `editableUntil`; references; "Rate this collector" only when an unrated interaction exists and
  "Write a reference" after any interaction, otherwise a hint explaining why). The profile's
  side card follows the fresh summary; `?tab=ratings` (RATING_RECEIVED deep link) scrolls to the
  section. Shared dialogs in `shared/ratings`: `RateCollectorDialogComponent` (interaction
  picker, required overall score, optional communication / card condition / shipping / meetup
  reliability, comment ≤ 600; `POST /ratings` or `PUT /ratings/{id}`; 403 / 409 / banned terms
  inline), `WriteReferenceDialogComponent` (≤ 400, `POST /references`), `StarRatingInputComponent`
  (radio group, roving tab stop, arrows / Home / End, Clear for optional criteria),
  `StarRatingComponent` (read-only, partial stars), `RatingActionsService` (dialogs + snack bars).
  The conversation menu offers "Rate <name>" when eligible.
- **Paused listings** (`features/inventory/listing-status`): `/inventory` shows
  `GET /me/listings/status`: a banner when public listings are paused (Resume listings with a
  confirmation for UNRESPONSIVE pauses, `POST /me/listings/resume`; "under review" wording
  otherwise, never the moderator's reason) and a reminder while unanswered conversations count
  as strikes.
- **Notifications**: RATING_RECEIVED, REPORT_DECISION (→ `/settings/reports`) and the SYSTEM
  notices LISTINGS_PAUSED (→ `/inventory`) and MODERATION_WARNING (→ Community Guidelines) get
  their icons and links.
- **Admin console** (`features/admin`; moderators see Dashboard, Community, Reports,
  Moderation and Ratings; transactions, disputes and payments arrived with Phase 9; the Phase 10
  ads, subscriptions and credits left with stage F1): Dashboard (`GET /admin/dashboard` tiles
  with links for admins; open / under-review reports and open flags for moderators; quick
  links), **Reports** (`/admin/reports`
  filters status, reason, "assigned to me", one collector in the URL; `/admin/reports/:id` with
  the report, the reported conversation when there is one, reporter and reported collector
  cards, the moderation history, moderator notes, Assign to me, Resolve dialog: take action
  (warning, pause listings; suspend with an optional end or ban for admins only) or dismiss, a
  required note, notify the reporter), **Moderation** (rules grouped by scope with kind / action
  chips and rate patterns in words; create / edit / delete for admins with the API's validation
  mirrored in `moderation-rule-labels.ts`; the flags queue), **Listings** (review queue of STALE
  / HIDDEN listings and a search of every listing by card, game, freshness and owner; Restore on
  the owner's behalf, Hide with a reason), **Binders** (search, visibility, Unpublish with a
  reason), **Ratings** (visible / hidden, one collector; Hide with a reason, Restore), **Users**
  (the user page gains the listing status with Pause (reason, optional end) / Resume and the
  moderation history), **Notifications** (statistics per period, per type and per channel
  state; broadcast composer for SUPER_ADMIN with a confirmation), **Analytics** (local
  aggregate: total, events per day, totals per event), **Auto-delist rules** (policy editor with
  a live freshness timeline and the API's ordering rules checked inline), **System health**
  (components, outbox, pending notifications, scheduled jobs). Every write asks for a
  confirmation (or a reason), shows "… The action is in the audit log." and appears in Audit
  logs (new action labels; REPORT targets link to the report).

## Offers and trades (Phase 8)

> **Removed from the web UI in stage WA (decision 2, ADR 0018).** `/offers` and `/trades` lead to
> Messages with the toast "Offers are no longer available. Deals happen in the chat."; old offer
> messages read as history (no link), old offer notifications open the list. The screens below
> were deleted with their E2E specs; the server modules stay. The rest of this section is history.

Contract: `docs/api/contracts/phase8-offers-trades.md` (backend notes and deviations in
`apps/api/README.md`, "Offers and trades (Phase 8)"). Generated client only (`OffersService`,
`TradesService`, `MessagingService`, `RatingsService`).

- **Make an offer** (`shared/offers`): `MakeOfferButtonComponent` takes an `OfferTarget` (a view
  model built from a public item and its owner, a card-holder result or a map "holders" listing)
  and shows "Make an offer" only when the card accepts at least one kind and is
  not the viewer's own (signed-out visitors go to sign-in). Entry points: public binder cards,
  the collector page's public cards, card-holder results (`/search?card=`) and the map's holders
  list. `MakeOfferDialogComponent`: the card and its seller (region label
  only), the kinds the availability allows (`allowedOfferKinds`: SALE → cash, TRADE → trade,
  TRADE_OR_SALE → cash / trade / cash + cards), amount (> 0, 2 decimals) and currency, the
  buyer's own cards through `OfferCardPickerComponent` (search `GET /inventory/items`, private
  cards included, copies with the shared quantity stepper, at most 10 cards), a note ≤ 500, the
  expiry (12 hours, 1, 3 or 7 days) and a live summary; `POST /offers` with an `Idempotency-Key`
  fixed per dialog. Refusals inline (`offer-problems.ts`): 422 `OFFERS_NOT_ACCEPTED` (with a hint
  to try another kind), 409 `OFFER_ALREADY_OPEN` with a link to the open offer, 404, 403, 400
  field errors; 429 `LIMIT_REACHED` also opens the limit dialog. Success: snack bar with "View
  offer".
- **Offer page** `/offers/:id` (`features/offers/detail`, `OfferDetailStore`): the card, the deal
  side by side (`DealSummaryComponent`: the seller's card against cash and/or the buyer's cards
  with copies, the proposer's note), both parties (`OfferPartyCardComponent`: state or
  province, rating; never a city or a distance), the chain's history (`OfferHistoryComponent`:
  proposals with terms and notes, reasons, the other party's latest "viewed") and
  `OfferActionBarComponent` with only the `allowedActions`: Accept (confirmation, opens the
  trade), Counter (the same dialog in counter mode: the current proposal; a seller can only keep,
  drop or reduce the buyer's cards; the deal must change), Decline (optional reason), Withdraw
  (the buyer while OPEN, optional reason), Message. Every answer sends the `version` on screen;
  409 `STALE_OFFER` moves to `latestOfferId` with an explanation, `NOT_YOUR_TURN` /
  `INVALID_STATE_TRANSITION` / `ITEM_UNAVAILABLE` re-read the offer, 403 `TRADING_BLOCKED` is
  explained; a superseded proposal links to the live one, an accepted one to its trade; offer
  notifications of the chain re-read the page (and follow a counter-offer) live.
- **Offers inbox** `/offers?tab=received|sent&status=all|active|accepted|closed`
  (`OffersInboxStore` on the shared `CursorList`): Received (`role=seller`) and Sent
  (`role=buyer`) tabs, status filter, cursor pages, "Your turn" badges and count, live re-reads
  on offer notifications.
- **Trades** `/trades?status=` (`TradesListStore`) and `/trades/:id` (`TradeDetailStore`): the
  next-action banner (`nextAction` in words, the viewer's operations as buttons from
  `allowedOperations`: "We meet in person" (`/meetup`), "Confirm the exchange" (`/complete`,
  with a confirmation), Message; the payment-protection steps are described under Phase 9),
  progress with both parties' meetup marks and confirmations, the deal, the other collector,
  the timeline and Cancel trade (required reason). Completed trades offer "Rate <name>" (the
  TRADE interaction through `RatingActionsService`; the profile's ratings section offers it too)
  and "Add to my inventory" for the received cards (`/inventory?add=<printing>&card=<card>`: the
  API only removes the given cards).
- **Messages**: SYSTEM messages about offers and trades and OFFER_LINK messages render an offer
  card (`OfferLinkCardComponent`: the live proposal's summary and status, linking to
  `/offers/:id`); the composer's attach menu gains "Share an offer" (`OfferLinkPickerComponent`:
  the caller's recent negotiations with the other participant, sent as `OFFER_LINK`). The
  messages page links to Offers and Trades.
- **Settings → Offers** (`features/settings/offers`, `GET/PUT /me/settings/offers`): "Accept
  mixed offers (cash + cards)", saved on change.
- **Notifications and navigation**: OFFER_CANCELLED ("Offer withdrawn") and OFFER_EXPIRED kinds;
  offer notifications open `/offers/:id` (or the trade), TRADE_UPDATE opens `/trades/:id`; the
  account menu lists Offers and Trades.
- Deviation: the Problem Details extensions `latestOfferId`, `offerId` and `currentStatus` are
  not declared by the generated `ProblemDetail`; `problemExtension()` reads them defensively.

## Payment protection and disputes (Phase 9)

> **Removed from the web UI in stage WA (decision 2, ADR 0018).** `/checkout/*` and
> `/disputes/*` show a notice ("Payments and disputes aren't part of OrenjiTrade…") with "Go to
> Messages"; Settings › Payouts left; the admin console keeps its payment pages. The rest of this
> section is history.

Contract: `docs/api/contracts/phase9-payments-disputes.md` (backend notes and deviations in
`apps/api/README.md`, "Payment protection and disputes (Phase 9)"). Generated client only
(`PaymentsService`, `DisputesService`, `AdminPaymentsService`, `TradesService`). Wording is always
"payment protection": OrenjiTrade is an intermediary and the payment provider holds the money
until the buyer confirms receipt (never "escrow"; `PROTECTION_COPY` in
`shared/payments/payment-labels.ts`, rendered by `ProtectionExplainerComponent`). Member screens
follow the `protectedPayments` flag (hidden while off; 404 `FEATURE_DISABLED` explained); admin
sections stay available. Locally the API runs the fake provider: no card, no money.

- **Offer dialog**: new cash / cash + cards offers get "Use payment protection" (with the
  collapsible "How it works") while the flag is on; the request carries `protectionRequested`,
  the summary says "with payment protection"; counter-offers keep the negotiation's choice. The
  offer page shows a "Payment protection" chip.
- **Settings → Payouts** `/settings/payouts` (`features/settings/payouts`, `SellerAccountService`
  on `GET /me/seller-account`): the seller onboarding card (status chip, provider, payouts
  enabled, "Local test provider" note); "Set up payouts" → `POST /me/seller-account/onboarding`
  (return path `/settings/payouts[?returnTo=/trades/<id>]`; the fake provider activates at once
  and comes back with `?onboarding=complete`, a hosted https link is followed otherwise); "Back
  to your trade" when a trade sent the seller. The link is hidden and the route guarded while the
  flag is off.
- **Trade page** (`TradeDetailStore` + `TradeProtectionActions`): protected trades show the
  "Payment protection" chip, five steps (accepted → payment secured → shipped → received or the
  dispute → payout released), the payment card (`TradePaymentCardComponent`: status, what the
  buyer pays, platform fee, the seller's share, refunds, the released payout, dispute window end,
  payout on hold), the shipment card and the dispute card; the timeline words `PAYMENT_*`,
  `SHIPPED` (with tracking), `RECEIPT_CONFIRMED` (automatic too), `PAYOUT_RELEASED`,
  `DISPUTE_*` and `REFUNDED`. Operations from `allowedOperations`: **Pay** (`POST /trades/{id}/pay`
  → the checkout URL, a web path with the fake provider; 409 `SELLER_NOT_ONBOARDED` explained),
  **Mark as shipped** (dialog: carrier ≤ 80, tracking ≤ 100, note ≤ 500, a tip without tracking),
  **Confirm receipt** (confirmation naming the payout), **Open a dispute** (dialog: reason +
  description ≥ 10 / ≤ 2000, window end; 409 `DISPUTE_WINDOW_CLOSED` with the date; then
  `/disputes/:id?opened=1`), "Meet in person instead". A seller waiting for the payment without a
  ready payout account gets "Set up payouts" (`TradePayoutSetupComponent`). PAYMENT_UPDATE,
  SHIPMENT_STATUS and DISPUTE_UPDATE notifications re-read the trade and the trade list.
- **Fake checkout** `/checkout/fake/:ref` (`features/checkout`, `FakeCheckoutStore`): the local
  stand-in for the provider's hosted checkout (buyer only; not-found state otherwise) with a
  "Local test payment" banner, the amount and "Pay" / "Simulate a failed payment"
  (`POST /payments/fake/{ref}/confirm`), then polls `GET /payments/fake/{ref}` until the synthetic
  webhook moved the payment and returns to `/trades/:id?payment=secured|failed` (the trade page
  says how it went).
- **Dispute page** `/disputes/:id` (`features/disputes`, `DisputeStore`; parties only, the
  not-found state for anybody else): `DisputeOverviewComponent` (reason, status, the buyer's
  description, parties by handle, paid / refunded / payout on hold or released, carrier and
  tracking, the decision with the refund and the note), evidence of both sides
  (`EvidenceListComponent`: statements and tracking as text, https tracking links, photos as
  previews and PDFs as downloads through the authenticated file route, `blob:` URLs revoked on
  leave), `EvidenceUploaderComponent` (photo JPEG / PNG / WebP ≤ 8 MB or PDF ≤ 10 MB checked and
  previewed locally, optional caption, `evidenceLeft` of 10; 409 `EVIDENCE_LIMIT_REACHED`, 413,
  415 explained), the thread (`DisputeThreadComponent`, ≤ 2000, OrenjiTrade support messages
  highlighted) and the timeline. FROZEN and resolved disputes are read-only with an explanation.
- **Admin** (ADMIN area): **Transactions** `/admin/transactions?view=&status=` (views all,
  pending shipment, pending confirmation; `AdminTransactionTableComponent`); **Disputes**
  `/admin/disputes?status=` and `/admin/disputes/:id` (the member view plus both parties with
  rating summaries and collapsible moderation histories, internal notes, trade timeline, payment
  events, refunds, webhooks; Put on hold (optional reason kept as a note), Lift the hold, notes,
  messages as OrenjiTrade support, Resolve (`ResolveDisputeDialogComponent`: buyer / seller /
  split with a refund below the refundable amount, a note both collectors see, a review step
  stating the money moves); Audit log and Payment links); **Payments** `/admin/payments?status=`,
  `/admin/payments/:id` (amounts, dates, events, refunds, webhooks; Refund only when
  `refundAllowed`, amount ≤ refundable + reason, then a confirmation step), **Webhook events**
  `/admin/payments/webhooks?status=&provider=` (payload on demand) and **Settings**
  `/admin/payments/settings` (payment rules; super admins edit with a confirmation). Every write
  ends with "The action is in the audit log."; the audit labels know `dispute.*`,
  `payment.refund` and `payments.settings.update`; the dashboard's open-dispute and
  webhook-failure tiles link to their queues.
- **Notifications**: DISPUTE_UPDATE kind (opens `/disputes/<id>`); PAYMENT_UPDATE and
  SHIPMENT_STATUS open the trade (or their deep link, e.g. `/settings/payouts`).
- Deviation (client): the API's JSON TEXT / TRACKING evidence route shares the operationId
  `addDisputeEvidence` with the multipart route, so the generated `DisputesService` only exposes
  the multipart form (IMAGE / DOCUMENT). The dispute page therefore uploads photos and PDFs and
  shows existing TEXT / TRACKING evidence, and written statements go to the thread; the TEXT /
  TRACKING forms need a distinct operationId in the API and a client regeneration.

## Premium, credits, ads and donations: removed (stage F1, 2026-10-14)

Phase 10 built Premium (`/premium`, the fake billing checkout), credits (`/credits`, referrals),
sponsored placements (`shared/ads`, the SEARCH_SPONSORED, MAP_PANEL, INVENTORY_SIDEBAR and
COLLECTOR_PROFILE slots), voluntary donations (`/support`, the fake donation checkout, the
supporters wall) and their admin pages (`/admin/plans`, `/admin/subscriptions`, `/admin/credits`,
`/admin/ads`, `/admin/donations`, the user's Entitlements panel). The owner made the app free for
all on 2026-10-14 ([ADR 0019](../../docs/architecture/adr/0019-free-for-all-no-paid-features.md)):
all of it is removed, the routes answer "Page not found", the account menu and the footer have
no Premium, Credits or "Support OrenjiTrade" entry, and no page shows a "Sponsored" row. The
code is kept on the branch `archive/paid-features`.

What stays: the usage limits, the same for every collector. A 429 `LIMIT_REACHED` opens the
plain limit dialog (`core/limits`); the wishlist summary shows `wishlist.items.max` from
`GET /me/limits`; a SUPER_ADMIN edits the limits in `/admin/usage-limits`
(`AdminUsageLimitsService`, one row per key). Protected payments (Phase 9) are unchanged.

## Maps

One map, no provider (ADR 0017, amending ADR 0010): `features/map/boundary-map` draws the bundled
GeoJSON boundary files of `public/boundaries/` with Leaflet (lazy chunk `leaflet-src`, about 150 kB
raw); there is no `MapAdapter`, no Google Maps, no OpenStreetMap tiles and no key. The files and
their provenance (Natural Earth 5.1.1, public domain, built with mapshaper 0.7.59) are described in
`docs/development/regions-boundaries.md`.

## Theming and design tokens

- Tokens: `packages/design-tokens/tokens.json` → `dist/tokens.css` (CSS custom properties) and
  `dist/tokens.ts` (typed constants). `src/styles.scss` imports the CSS by relative path. Use
  `var(--color-primary)`, `var(--spacing-4)`, `var(--radius-md)`, `var(--font-display)`,
  `var(--color-status-fresh)`, ... — never raw hex.
- Material 3 (web redesign WA, spec 2.7): `src/theme/_theme-colors.scss` was generated with
  `ng generate @angular/material:theme-color --primary-color=#F4761A --tertiary-color=#0F766E`.
  `styles.scss` applies one `mat.theme()` on `html` (typography, density, shape) and maps every
  `--mat-sys-*` colour to a design token, so the tokens decide light, dark and the system
  preference; elevation is off (`--mat-sys-level*: none`), ripples are off
  (`MAT_RIPPLE_GLOBAL_OPTIONS`), and the dialog, menu, select, autocomplete, form field and
  tooltip overrides give the redesign's radii. Light `onPrimary` is ink (decision 21).
- The games' accents and monograms come from the `gameTile` tokens (`shared/domain/games.ts`,
  `light-dark()`); no game colour is hard-coded.
- `ThemeService` (`core/theme`) holds `preference` (`light | dark | system`, persisted in
  `localStorage`, "Same as the system" by default) and `resolved`; it sets `html[data-theme]`.
  The account menu's Appearance › and Settings › Appearance drive it.
- Icons: Material Symbols Rounded (`MatIconRegistry.setDefaultFontSetClass`).
- Fonts (Sora, Inter, JetBrains Mono) and icons come from Google Fonts (preconnected in
  `index.html`); the CSP allows exactly those origins.

## Structure

```
src/app/
  app.config.ts, app.routes.ts       providers, lazy routes with data.shell ("" Home, "**" not found)
  core/
    account/    AccountExportService (GET /me/export -> JSON download)
    api/        provideApiClient()  (generated client wiring)
    auth/       AuthService, FirebaseAuthPort, SessionService, guards, interceptors, roles
    realtime/   RealtimeService (STOMP over WebSocket), frame codec, lazy STOMP connection
    notifications/ NotificationCenter, notification kinds and links, notification entry
    config/     AppConfigService    (/config.json)
    feature-flags/ FeatureFlagsService, featureGuard
    http/       interceptors, ApiError, friendlyError, HttpContext tokens
    limits/     limit-reached interceptor, service and dialog
    layout/     app-shell, ShellLayout (route data.shell, breakpoints), top-bar (+ pill styles),
                rail (>=960px), tab-bar (<960px), region-pill and game-pill (lazy popovers),
                popover (Popovers), global-search (deferred), notification-bell, account-menu,
                session-banner, footer, unread-chats, shell-icon, api-version
    feedback/   ToastService, ToastHostComponent, ToastSnackBar (MatSnackBar stand-in)
    keyboard/   KeyboardShortcuts, KeyboardPrefs, the "?" dialog (lazy)
    search/     RecentSearches (this browser only)
    game/       GameContext (the browsed game)
    routing/    OrenjiTitleStrategy ("<page> · OrenjiTrade", robots), legacy-redirects
    theme/      ThemeService
  features/
    auth/       sign-in, sign-up, verify-email, reset-password, consent, suspended
    onboarding/ three-step wizard
    settings/   shell + profile, privacy, notifications, location, blocked users, my reports,
                account, appearance (offers and payouts left with stage WA)
    notice/     the notice of old /checkout and /disputes links (stage WA)
    profile/    /profile: your own collector page (stage WA)
    collectors/ public profile (container + presentational view, public wishlist, ratings and
                references section)
    admin/      shell, dashboard, users (list, detail, roles editor, suspend dialog, moderation
                panel), audit logs, games (schema editor), cards (search, editor, printing
                dialog, sync panel), feature flags, usage limits, community (channels, moderation
                flags), reports (list, detail, resolve dialog, history, notes), moderation
                (rules, flags), listings, binders, ratings, notifications, analytics, delist
                (auto-delist editor), health, payments (transactions, payments, payment detail
                with refund, webhooks, payment rules), disputes (queue, detail, resolve dialog)
    catalog/    card search (filters, URL params), card detail (metadata, printings), set page
    inventory/  /inventory: data/ (params, store, item form, bulk actions, visibility status),
                binder list, toolbar, summary, items (grid card, table), bulk bar,
                binders (header, publish menu, form + manager dialogs), editor side panel,
                add-card dialog
    binders/    /binders/:id public binder (container + header)
    map/        the region's map (Home and Search › Binders since stage WA): boundary map,
                states list, a state's binders; data/ (RegionMapStore, boundaries)
    messages/   /messages: data/ (ConversationsStore, ThreadStore, drafts, previews, thread
                items), messenger, conversation list, thread (view, header, list, bubble),
                composer, realtime status
    community/  Messages › Community: data/ (CommunityStore, helpers), channel sidebar, post
                composer, post item, replies, moderator remove dialog
    search/     /search (Cards | Binders | Wishlist): data/ (params), unified results (tabs,
                collector result), card holders (filters form, result row)
    wishlist/   Search › Wishlist: data/ (WishlistStore), list (wish card, summary)
    notifications/ /notifications: data/ (NotificationFeedStore, day groups)
    legal, not-found
  shared/
    catalog/    GamesStore, card tile / grid, card search box, catalog labels, card pictures
                (CardPictures: card + printing pictures for id-only listings), card data
                attribution (provider credits per game, footer and card/set pages)
    inventory/  inventory labels, item chips, public item card, public binder card
    limits/     limit wording (labels, windows, values)
    discovery/  discovery labels (filters, ratings, listings), DiscoveryCentreService
    search/     UnifiedSearchBox (GET /search/suggest), suggestion grouping and routing
    domain/     games, place / last-active labels
    location/   LocationFields (region, country, state pickers, city), MyLocationStore
    regions/    RegionsStore (GET /regions), platform region names
    profile/    profile form, game / language / tag pickers, MyProfileStore
    links/      card / binder link pickers (autocomplete), shared link card
    messaging/  ConversationStarterService, BlockActionsService
    offers/     offer and trade labels, refusals, status chip, and the offer card of old chat
                messages (history, no link); the rest left with offers (stage WA)
    wishlist/   WishlistActions, add/edit dialog (card picker, criteria fields), form, labels
    pipes/      relativeTime, mediaUrl
    ui/         avatar, card-art, card-image (never wider than 160 px), confirm-dialog, game-chip,
                section-card, empty-state, error-state, skeleton, page-header, freshness-badge,
                condition-chip, availability-chip, visibility-badge, search-field, wordmark,
                quantity-stepper, underline-tabs
```

### Card pictures (ADR 0015)

Every card picture goes through `shared/ui/card-image` (`<app-card-image>`), whatever the game:
`src` is always a URL the API sent (`primaryImageUrl`, `PrintingSummary.images`, suggestion,
card-link, wishlist and binder cover URLs; API-relative paths from realtime payloads are resolved
against the API origin). Never build provider image URLs in the client: re-host-only providers
(YGOPRODeck) are served from OrenjiTrade's own `/api/v1/public/card-images/{id}`, the API falls
back to its placeholder SVG, and the component falls back to the game's placeholder card art when
a URL is missing or fails. Inputs: `src`, `alt` (the card name; `''` only inside a control that
already names the card, such as an autocomplete option), `size` (`xs` 36 px, `sm` 56, `md` 120,
`lg` 240, `xl` 360, `fill` = container width, the default), `game` (placeholder tint), `eager`
(the card detail hero). The frame is a fixed 5:7 trading-card ratio with explicit width/height,
lazy loading, async decoding, a shimmer skeleton (static under reduced motion), dark-mode tokens,
and `data-state` `loading | loaded | placeholder | error`. Parents restyle it through
`--card-image-width`, `--card-image-radius`, `--card-image-shadow` and `--card-image-fit`.
Provider credits (`shared/catalog/card-data-attribution`, wording from
`docs/providers/<provider>.md`) show in the footer and on card and set pages of games with an
external catalog source (Yu-Gi-Oh!: YGOPRODeck, Konami / 4K Media).

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
  mapping, 428/403 handling, consents), guards, roles, friendly errors, the boundary map
  (real Leaflet in jsdom, no tiles), the location fields and region pickers, profile
  form rules, avatar validation, admin helpers, sign-in page, `relativeTime`, freshness,
  `AppConfigService`, legal pages; Phase 2: feature flags (deferral on account pages, reload on
  sign-in, guard), limit-reached parsing/interceptor/dialog, card search box, catalog labels,
  card search params, card metadata, game schema validation, usage-limit rows and cell
  editor, admin metadata form, limit labels; Phase 3: inventory params, item form (defaults,
  create request, changed-fields PATCH, validation), bulk actions and outcome wording,
  visibility explanations, inventory store (context, selection, quantity, confirm all, reorder
  rollback), quantity stepper, inventory labels, compact freshness badge; Phase 4: map params,
  map query (visible radius, plan cap, 2-decimal centre, covered-area skipping), marker
  clustering and markers, `MapDiscoveryStore` (city vs own-area centre, debounce, filters,
  429 cap and retry, 400 fallback, preview + binder), preview card, map adapter helpers
  (escaping, icons), suggestions, discovery labels, search params, holder filters form; Phase 5:
  STOMP frame codec and connection (fake socket: CONNECT, heartbeats, ERROR, timeouts),
  `RealtimeService` (URL with token, backoff, token refresh after a refused handshake, resync,
  session following), message previews and drafts, thread items (day labels, groups, receipts,
  merging), `ConversationsStore` and `ThreadStore` (pushes, unread counts, paging, send errors,
  typing throttle), composer, conversation list (badges, keyboard), link choices, conversation
  starter, blocked users settings, community helpers and store, admin community helpers,
  media URLs; Phase 6: notification kinds and safe deep links, `NotificationCenter` (session
  following, pushes counted once, optimistic reads, resync and receipt re-reads), notification
  bell (badge, label, menu, mark read / all), `NotificationFeedStore` and day groups, wishlist
  labels and form (stage S2: only the new fields, note length, create / PATCH bodies, server
  errors), the printing picker (any printing, one printing, rarity only, filters, holder counts),
  the wish fields (note first, at most one term, approximate amounts), `WishlistActions`,
  `WishlistStore` (alert readiness, visibility switch, removal), wish card, notification settings
  (the wishlist alerts switch), the admin price terms page; Phase 7: report labels and refusals, the Report collector dialog (reasons in server
  order, Confirm disabled until a reason, request with context and idempotency key, 409 inline,
  retry), rating labels (rateable interactions, edit window, criteria, refusals), star input
  (keyboard, clear, disabled), rate dialog (required overall, POST / PUT bodies, inline 409),
  ratings section (eligibility-driven Rate / reference actions, own-rating edit, errors), My
  reports, paused-listings banner, preview Report button, resolve-report request rules,
  moderation rule validation, delist policy validation and timeline, dashboard tiles, analytics
  summary; Phase 8: offer labels (kinds per availability, terms, statuses, history wording,
  expiry, "Make an offer" visibility), offer form (cash and card rules, create and counter
  bodies, unchanged deal), offer refusals and trade labels, the offer dialog (kinds, validation,
  idempotency key, trade cards with copies, 409 link, counter with version, stale hand-off),
  `OfferDetailStore` (turns, accept, 409 STALE_OFFER to the live proposal, re-read on conflicts,
  live follow), `OffersInboxStore` (query, paging, live re-reads), `TradeDetailStore`
  (operations, refusals, cancel reason, live re-reads), action bar, offer cards in the
  conversation, offer link picker, OFFER_LINK drafts; Phase 9: payment labels (statuses,
  reasons, evidence files, dispute timeline, refundable amounts, no "escrow"), payment refusals,
  trade labels with the protected steps, ship / dispute forms, `TradeDetailStore` (pay, ship,
  confirm receipt, open dispute, refusals, payment notifications), the offer dialog's protection
  option (flag on / off), payment card and protected steps, `FakeCheckoutStore` (polling,
  failure, 409, give-up), `DisputeStore` (uploads, limit and hold refusals, messages, live
  re-reads), evidence uploader, Settings → Payouts, admin money and resolve forms, transaction
  rows and webhook payloads, dashboard links, notification links (old links to the removed
  pages are not followed); stage F1: the plain limit dialog (no plan, no link) and the usage
  limits page (one row per key).
- E2E (`npm run e2e`, Playwright/chromium; `npx playwright install chromium` once):
  - `e2e/smoke.spec.ts`: the shell for a guest (Home with the pills, the rail, Sign in), the
    region pill, the map without a provider, legal draft banner, 404.
  - `e2e/auth.spec.ts`, `e2e/settings.spec.ts`, `e2e/admin.spec.ts` run against the **real
    local stack** and create fresh fictional users through the UI or the emulator REST API:
    sign-up with consents, email verification through the emulator's oob codes, onboarding
    (the "Where are you?" pickers), sign-out / sign-in, the 428 consent page,
    discoverability with a check that no JSON response carries a coordinate, JSON export
    download, profile edits, deletion with re-authentication and
    cancel, admin suspend/unsuspend and the audit log, moderator/collector restrictions.
  - `e2e/catalog.spec.ts` (autocomplete to card detail with keyboard, printings and set page,
    filters in the URL, printing-code search, not-found) and `e2e/admin-rules.spec.ts` (super
    admin raises a usage limit inline (`binder.views.per_day`, one row for everyone), it persists
    after a reload and `GET /me/limits` follows, then it is restored; admins read-only; game schema
    validation; mock catalog
    sync).
  - `e2e/inventory.spec.ts`: open the inventory from the navigation, add a card (autocomplete →
    printing → details, private), quantity stepper, create a binder, move the card into it, make
    it public and change its condition in the edit panel, publish the binder until disabled (and
    the privacy notice); bulk temporary publication for 24 hours, the visibility segmented
    control, bulk availability with a skipped card and its reason, bulk move and make private; a
    second collector opens the public binder from the owner's profile (the owner's state, chips,
    no private notes, game filter, no coordinate in any JSON response); the `binders.max`
    limit-reached dialog.
  - `e2e/map.spec.ts` (ADR 0017): the boundary map of a region with states shaded by binder
    counts (no tile or map provider request), the accessible state list, choosing a state by
    click and keyboard opens its binder panel and `/map?region=&subdivision=` (cursor pages,
    empty state, error with retry), the region switcher changes the map; card holders and the
    unified search in the browsed region. No JSON response carries a coordinate or distance.
  - `e2e/messaging.spec.ts` (two browser contexts): A finds B's binder in B's state on the map
    (`/map?region=americas-north&subdivision=US-WY`) and presses Message on B's profile; the panel opens the new conversation; A sends text and a card through the
    autocomplete; B, waiting on `/messages`, receives the conversation live (no reload) with two
    unread messages, opens it (card link to the catalog) and A sees "Seen"; B's typing indicator,
    answer and a photo reach A live; A blocks B from the thread menu (which also offers
    "Report collector"), B's next message is refused inline and `POST /conversations` answers 403
    `MESSAGING_BLOCKED`; A unblocks B in Settings → Blocked users. A second test starts a
    conversation from a profile (full page), rejects a text file, sends a photo, shows the 422
    moderation refusal inline and reopens the conversation from the list by keyboard.
  - `e2e/wishlist.spec.ts` (two collectors of Americas (South), a region no other spec uses):
    A turns "Let others see what you want" on, adds a wish through the dialog (autocomplete,
    public note, Near Mint only, "85% TCG" with its approximate amount once one printing is
    checked in the printing picker; none of the old fields), sees its copy, note and chips, adds
    a second wish from the card page and gets the same selection refused inline (409), removes it
    with confirmation; B of the same region lists a Lightly Played copy (no alert: Near Mint
    only) then a Near Mint one: A's bell badge rises live without a reload, the bell entry
    ("… was just listed by @B in Montevideo, Uruguay.") opens `/cards/<id>?printing=<id>`,
    `/notifications` holds one alert, Settings → Notifications shows the "Wishlist alerts" switch,
    A's profile shows the public wishlist with the note and chips (and never scrolls sideways at
    375 px); B's binder is unpublished afterwards. A second test types a printing code that a 1st
    Edition and an Unlimited printing share (the wish starts on "Any printing"; a code only one
    printing has preselects it), then follows the alert for that "Any printing" wish: shown in
    full in the bell menu at 1280 px and 375 px, it opens `/cards/<id>?printing=any` on "Any
    printing" (no selected printing, no highlighted row, no price). A third test fills a FREE
    wishlist (20 wishes), sees the prompt to set a location for alerts and gets the limit dialog
    (429, without the technical limit key) with the inline explanation and the focus back on the
    save button.
    No JSON response carries a coordinate.
  - `e2e/community.spec.ts`: `/community` opens the channel of the browsed platform region (the
    former city channels show as archived); a collector posts with a card link, is refused a duplicate (409) and a banned term
    (422) inline, edits the post; a second collector replies inline; the author sees the reply
    after a reload and deletes the post. A moderator removes a post with a required reason, then
    resolves the flag a banned-term post raised in Admin → Community.
  - `e2e/reporting.spec.ts`: a collector opens another collector's profile, presses Report, the
    "Report collector" popup asks "Why are you reporting this user?" with the seven reasons in
    order, Confirm is disabled until one is chosen, the report is confirmed; a second report is
    refused inline (409); Settings → My reports shows it waiting. A moderator (dashboard, no
    Users section) opens it in Admin → Reports, assigns it, adds a note and resolves it with a
    warning (suspension disabled for moderators, note required); an administrator finds
    `REPORT_RESOLVED`, `report.assign` and `report.note` in the audit log; the reporter sees
    "Your report was reviewed" and the outcome, the reported collector got the warning notice.
    A second test reaches the dialog from the conversation menu (keyboard), a community post
    menu and a public binder's owner card (sent with the BINDER context).
  - `e2e/rating.spec.ts`: two collectors exchange three messages each (qualified conversation);
    the conversation menu offers "Rate"; the profile's "Rate this collector" dialog requires an
    overall score, takes a criterion by keyboard and a comment; the summary and the profile card
    update, the rating is edited within its window and a reference is written; the rated
    collector gets RATING_RECEIVED without the comment; an unrelated collector sees no rate or
    reference action and the API refuses their rating (403 `RATING_NOT_ELIGIBLE`).
  - `e2e/shell.spec.ts` (stage WA): the five areas from the rail at 1440 and 1024 and from the
    tab bar at 390 (no horizontal scroll); the region and game popovers from the keyboard
    ("Your region", "Not your region" and the way back, "Cards coming soon"); the top bar's search
    with `/` and Ctrl/Cmd+K, cards, recent searches and "Remember my searches" off; the account
    menu (no Offers, Trades or Payouts; Appearance › Dark and back); the "?" dialog, `g` then `i`,
    and the single-key switch; the skip links; the session banner with "Try again"; the theme
    following the system; every old link of spec 4.11 with its toast or notice. (`offers.spec.ts`,
    `payments.spec.ts` and the acceptance offers and payment protection specs left with their
    screens.)
  - `e2e/usage-limits.spec.ts` (stage F1): a fresh collector (discoverable in Quebec) fills
    `binders.max` (5, the same for everyone); the sixth binder gets the plain limit dialog ("you
    used 5 of 5", "Does not reset on its own", "Every collector has the same limits.", no link,
    no plan); `GET /me/limits` answers 5 / 5 without `planCode` or `upgradeUrl`; the account menu
    has no Premium, Credits or Support entry; `/premium`, `/credits` and `/support` are "Page not
    found"; no request goes to `/ads`, `/plans` or `/me/plan`; no JSON answer carries a
    coordinate.
  - `e2e/admin-moderation.spec.ts`: an administrator's dashboard counts, the listing review
    queue, hiding a collector's listing with a required reason from their listings, pausing and
    resuming the collector's listings (the collector sees the "under review" banner on
    `/inventory` without the reason), moderation rules with inline pattern validation, the
    auto-delist editor's inline ordering error and reset (nothing saved), notification
    statistics (broadcast locked for admins), analytics, system health and the audit entries.
    Catalog pictures are served from memory in these specs (`stubCardImages`), so the
    parallel suite spends no picture requests; `e2e/card-images.spec.ts` checks the real ones.
  - `e2e/card-images.spec.ts`: card pictures on the top-bar suggestions, the catalog grid, the
    card detail (eager hero, printings table, provider attribution in the page and the footer),
    the set page, the inventory, a public binder, the collector profile and the wishlist, all
    from the API's own picture routes with a non-zero natural size and none failed; no request,
    `img` src or JSON answer points at `images.ygoprodeck.com` (provider hosts are blocked).
    Offline: the seed catalog's placeholder pictures are not stubbed in this spec.
    They skip with a clear message only when the API (`E2E_API_URL`, default
    `http://localhost:8180`) or the Auth emulator (`E2E_AUTH_EMULATOR_URL`, default
    `http://localhost:9099`) is unreachable.

  The suite runs on its own stack, never against `npm run dev`: run `npm run test:e2e` at the
  repository root (database `orenjitrade_e2e`, API :8180, `ng serve --configuration e2e` on
  :4300, see docs/development/local-setup.md, "E2E test data and the purge"). To iterate on a
  spec, keep that stack running (`npm run test:e2e -- --stack-only`), then
  `npm run test:e2e -- --reuse-running e2e/map.spec.ts` or `npm run e2e` here. The global setup
  refuses any API without the E2E identity block (`e2e/support/isolation.ts`), so the developer
  API on :8080 is never used. Two Playwright projects: `chromium` (every spec, fully parallel)
  and `launch-config` (`e2e/launch-config.spec.ts` and `e2e/admin-flags.spec.ts`, after
  `chromium`, serially, because they switch the stack's real feature flags through the admin API
  and restore them: `protectedPayments` off for the launch configuration, `publicChat` off and on
  for the flag page); run the latter by itself with
  `npm run test:e2e -- e2e/launch-config.spec.ts e2e/admin-flags.spec.ts --no-deps`.

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
FIREBASE_APP_ID, FIREBASE_AUTH_EMULATOR_HOST, ENVIRONMENT`,
renders `nginx.conf` (listen `$PORT`, default 8080) and starts nginx.

`nginx.conf`: SPA fallback, gzip, immutable caching for hashed assets, `no-cache` for
`index.html` and `config.json`, `/healthz`, and security headers (`X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (denies geolocation), CSP
allowing self, Google Fonts, Firebase Auth / Identity Toolkit, the Firebase auth domain and
`ws(s)` to the API; no map or tile host since ADR 0017: the boundary files are served by the app
itself).

Ignore rules live in `.dockerignore` and its BuildKit twin `Dockerfile.dockerignore` (the
latter is the one Docker reads when the context is the repo root; keep both identical).
