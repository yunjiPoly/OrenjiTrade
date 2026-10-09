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
cancel + export), `/onboarding` (profile, interests, "Where are you?"), `/settings/{profile,
privacy, notifications, location, account, appearance}` (`/settings/trading-area` redirects), `/collectors/:handle`,
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
  (`?printing=` selects a printing, `?rarity=` shows "Any printing in <rarity>" without picking one;
  hero picture, attributes rendered from the schema's
  `metadataFields`, printings table with market prices, "Add to inventory" (opens the add-card
  dialog on that printing), "Who has this in my region" (opens `/search?card=<id>`, the holders
  of the platform region on screen; ADR 0017) and "Add to wishlist"; `/sets/:id` (cards + paginated checklist). `GamesStore`
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
  (search, suggestions, card holders, ads, the map) sends `region`. Signed in: the home region of
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
  `/user/queue/messages|receipts|typing|presence|notifications` (the last one since Phase 6),
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
  unread badge. **`/messages`, `/messages/:id`**: the full-page messenger, two columns from 840 px,
  list or thread on phones; the open conversation lives in the URL. The collector profile's
  Message button opens `/messages/:id` (`shared/messaging/conversation-starter.service.ts`).
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
only (`WishlistService`, `NotificationsService`; plan cap from `PlansService.getMyPlan`, location
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
  path rebuilt from its ids; the SYSTEM limit notice opens `/premium`).
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
  `WishlistStore` (`GET /wishlist`, `DELETE` with confirmation, plan usage of
  `wishlist.items.max`, the location and privacy settings through `MyLocationStore`, quiet re-read
  on reconnection) → a prompt to set country and state when no location is set (alerts come from
  collectors of the region), "Let others see what you want" (the `wishlistVisible` privacy
  setting, explained), the summary (wishes and usage meter with a Premium link from 80 % while
  `premiumPlans` is on) and `WishCardComponent` (picture, which copy, public note, "Near Mint
  only" and price term chips with the approximate amount for one printing, Edit, Remove). No
  matches, filters or per-wish alert switch any more.
- **Add/edit dialog** (`shared/wishlist`, a lazy chunk opened by `WishlistActions` from the
  wishlist page, card detail (with its `?printing=` or `?rarity=`) and the card holders view;
  signed-out visitors go to sign in first): card autocomplete (`GET /cards/suggest`; a printing
  suggestion preselects it) → `WishFieldsComponent` (public note first, ≤ 280 characters;
  "Near Mint only"; at most one price term from `GET /wishlist/price-terms` (`PriceTermsStore`),
  "85% TCG ≈ 21.25 USD" with one printing's market price, its source and date in a tooltip) →
  the shared `PrintingPickerComponent` (`shared/catalog/printing-picker`: "Any printing" first
  and default, every printing with its picture, set, code, rarity, edition, language, finish and
  market price; rarity / set / edition / language filters, the rarity alone meaning any printing
  of that rarity; optional holder counts for the card page of stage S3). `wishlist-form.ts`:
  form, defaults, create / PATCH bodies, messages. Inline errors: 409 same selection, 429
  `LIMIT_REACHED` (the limit dialog opens as well), field errors of a 400.
- **Collector page**: "Looking for" (`GET /collectors/{handle}/wishlist`, only when the collector
  shows it; 404 hides the section): which copy, public note, chips.
- **Wishlist alerts (API)**: a public listing alerts the collectors of the same platform region
  whose wishes it fits, once per collector and listing; the `WISHLIST_ALERT` notification opens
  the card page with the wish's `?printing=` / `?rarity=`. Settings → Notifications has one
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
  Moderation and Ratings; transactions, disputes, payments, ads, subscriptions and credits
  arrived with Phases 9 and 10): Dashboard (`GET /admin/dashboard` tiles with links for admins; open /
  under-review reports and open flags for moderators; quick links), **Reports** (`/admin/reports`
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

## Premium, credits, ads and donations (Phase 10)

Contract: `docs/api/contracts/phase10-freemium-credits-ads-donations.md` (backend notes and
deviations in `apps/api/README.md`, "Subscriptions, credits, ads, donations (Phase 10)").
Generated client only (`PlansService`, `SubscriptionsService`, `CreditsService`, `AdsService`,
`DonationsService`, `AdminBillingService`, `AdminPlansService`). Every provider is a local fake:
no card, no money. Member screens follow their flags (`premiumPlans`, `credits`, `advertising`,
`donations`; hidden or guarded while off, 404 `FEATURE_DISABLED` explained); admin sections stay
available. Wording and refusals live in `shared/billing/billing-labels.ts`.

- **Premium** `/premium` (`features/premium`, `PremiumStore`): plan comparison from `GET /plans`
  (`PlanCardComponent`: create an account, "Sign in to upgrade", "Upgrade to Premium",
  "Continue to checkout" for an open checkout, "Current plan"), the live subscription
  (`SubscriptionCardComponent`: status, price, member since, renews / ends on, PAST_DUE note,
  "Cancel at period end" / "Cancel now" / "Close the checkout", each confirmed), usage meters
  from `GET /me/plan` (`UsageMetersComponent`: counters with bars, caps as values, unlimited,
  "Boosted" overrides), active boosts and a credits teaser. Upgrade ->
  `POST /me/subscription/checkout` (409 `ALREADY_SUBSCRIBED` explained; only local fake checkout paths
  or https provider pages are followed) -> `/checkout/fake-billing/:ref`. The limit-reached
  dialog's "See Premium" lands here and closes every open dialog on the way.
- **Fake billing checkout** `/checkout/fake-billing/:ref` and **fake donation checkout**
  `/checkout/fake-donation/:ref` (`features/checkout`, `ProviderCheckoutStore` with
  `FakeBillingCheckoutStore` / `FakeDonationCheckoutStore`, presentational
  `FakeProviderCheckoutComponent`): "Local test payment" banner, Pay / "Simulate a failed
  payment", polling until the synthetic webhook changed the checkout (a declined subscription
  attempt stays open: "Try again"), then `/premium?checkout=success` (session reloaded: plan and
  PREMIUM_USER role) or `/support?donation=thanks`.
- **Credits** `/credits` (`features/credits`, `CreditsStore`; account menu "Credits"): balance
  with the "never withdrawable or transferable" wording, products to unlock for a day
  (`CreditProductsComponent`, disabled with "You need N more"), `SpendCreditsDialogComponent`
  (cost, balance after, duration; one idempotency key per dialog so a retry never spends twice;
  409 `INSUFFICIENT_CREDITS` with balance and cost), active boosts, referral card (own code with
  copy / share, rewards, redeem form with 404 and 409 `REFERRAL_NOT_ALLOWED` reasons on the
  field) and the cursor-paged ledger ("Load more").
- **Sponsored placements** (`shared/ads`): `SponsoredSlotComponent`
  (`GET /ads?placement=&game=`) renders nothing while `advertising` is off, for `[]` (Premium,
  entitlements) or on errors, waits for the session and reloads when the member or plan
  changes. `SponsoredAdComponent` always shows the literal "Sponsored" label (with why, and
  "Remove ads" while Premium is sold) and links through the API's click route only
  (`adClickHref`: `/api/v1/ads/{id}/click?token=` or https; new tab, `rel="sponsored"`);
  `AdImpressionDirective` + `AdTrackingService` record one impression per serve token once half
  of the ad is visible. Slots: SEARCH_SPONSORED (`/search` results and card holders),
  MAP_PANEL (top of the map list panel), INVENTORY_SIDEBAR (`/inventory`), COLLECTOR_PROFILE
  (other collectors' profiles).
- **Support** `/support` (`features/support`, `SupportStore`; footer "Support OrenjiTrade",
  account menu): clearly labelled "Voluntary support" that never changes ratings, ranking or
  trust; `DonationFormComponent` (preset or custom amount, currency, private message up to 280
  characters, public-thanks opt-in; the API's accepted range and currencies are shown on the
  fields when it refuses), the public supporters wall (display names and month only) and the
  member's own donations. There is no member route for the accepted amounts: presets are
  suggestions and the API's 400 field errors carry the range.
- **Admin** (ADMIN area; every write confirmed and "in the audit log"): **Plans** `/admin/plans`
  (features and limits; SUPER_ADMIN edits name, description, price, currency, availability,
  order and feature switches), **Subscriptions** `/admin/subscriptions?status=&plan=&userId=` and
  `/admin/subscriptions/:id` (history, webhooks with payload on demand, cancel at the period end
  or now with a reason), **Credits** `/admin/credits?userId=` (ledger of all or one account with
  its balance, "Grant credits" dialog for grants and corrections, credit products and referral
  rules edited by SUPER_ADMIN), **Ads** `/admin/ads?tab=campaigns|advertisers|placements` and
  `/admin/ads/campaigns/:id` (campaign dialog with schedule, budgets, pricing and bid, priority
  and frequency cap; activate / pause / end; `TargetingEditorComponent` with kinds AND / values OR
  and coordinates refused; creatives dialog with https-or-site-path URLs; delivery tiles and daily
  statistics), **Donations** `/admin/donations?status=` and `/admin/donations/:id` (totals per
  currency, webhooks, full refund and accepted amounts for SUPER_ADMIN). The user page gains
  Subscriptions / Credits links and an **Entitlements** panel (grant a limit or feature override
  with an optional end and a note, revoke). Audit labels cover `subscription.cancel`,
  `credits.*`, `ads.*`, `donation.refund`, `donations.settings.update`.

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
    realtime/   RealtimeService (STOMP over WebSocket), frame codec, lazy STOMP connection
    notifications/ NotificationCenter, notification kinds and links, notification entry
    config/     AppConfigService    (/config.json)
    feature-flags/ FeatureFlagsService, featureGuard
    http/       interceptors, ApiError, friendlyError, HttpContext tokens
    limits/     limit-reached interceptor, service and dialog
    layout/     app-shell, top-bar, notification-bell, account-menu, session-banner, bottom-nav
                (<960px), footer, api-version, theme-toggle
    routing/    OrenjiTitleStrategy ("<page> · OrenjiTrade")
    theme/      ThemeService
  features/
    auth/       sign-in, sign-up, verify-email, reset-password, consent, suspended
    onboarding/ three-step wizard
    settings/   shell + profile, privacy, notifications, location, offers, payouts, blocked
                users, my reports, account, appearance
    offers/     /offers inbox (tabs, status filter, summary rows) and /offers/:id (action bar,
                history); data/ (OffersInboxStore, OfferDetailStore)
    trades/     /trades list and /trades/:id (next-action banner, steps, timeline, payment,
                shipment and dispute cards, payout reminder); data/ (TradesListStore,
                TradeDetailStore, TradeProtectionActions); dialogs/ (ship, open dispute)
    checkout/   /checkout/fake/:ref (payments), /checkout/fake-billing/:ref and
                /checkout/fake-donation/:ref (local fake providers); data/ (FakeCheckoutStore,
                ProviderCheckoutStore + billing / donation stores)
    credits/    /credits: data/ (CreditsStore), balance, products, spend dialog, referral card,
                ledger
    support/    /support: data/ (SupportStore), donation form, supporters wall, my donations
    disputes/   /disputes/:id (overview, evidence with uploads, thread, timeline); data/
                (DisputeStore)
    collectors/ public profile (container + presentational view, public wishlist, ratings and
                references section)
    admin/      shell, dashboard, users (list, detail, roles editor, suspend dialog, moderation
                panel), audit logs, games (schema editor), cards (search, editor, printing
                dialog, sync panel), feature flags, usage limits, community (channels, moderation
                flags), reports (list, detail, resolve dialog, history, notes), moderation
                (rules, flags), listings, binders, ratings, notifications, analytics, delist
                (auto-delist editor), health, payments (transactions, payments, payment detail
                with refund, webhooks, payment rules), disputes (queue, detail, resolve dialog),
                billing (plans, subscriptions, credits, ads with campaign detail and targeting,
                donations, user entitlements)
    catalog/    card search (filters, URL params), card detail (metadata, printings), set page
    inventory/  /inventory: data/ (params, store, item form, bulk actions, visibility status),
                binder list, toolbar, summary, items (grid card, table), bulk bar,
                binders (header, publish menu, form + manager dialogs), editor side panel,
                add-card dialog
    binders/    /binders/:id public binder (container + header)
    premium/    /premium: data/ (PremiumStore), plan card, subscription card, usage meters
    map/        /map: data/ (params, query, clusters, markers, MapDiscoveryStore), map canvas,
                preview card, discovery panel + collector list, filters bar, legend, area
                prompt, messages panel (the messenger)
    messages/   /messages: data/ (ConversationsStore, ThreadStore, drafts, previews, thread
                items), messenger, conversation list, thread (view, header, list, bubble),
                composer, realtime status
    community/  /community: data/ (CommunityStore, helpers), channel sidebar, post composer,
                post item, replies, moderator remove dialog
    search/     /search: data/ (params), unified results (tabs, collector result), card holders
                (filters form, result row)
    wishlist/   /wishlist: data/ (WishlistStore), list (wish card, summary)
    notifications/ /notifications: data/ (NotificationFeedStore, day groups)
    legal, not-found
  shared/
    catalog/    GamesStore, card tile / grid, card search box, catalog labels, card pictures
                (CardPictures: card + printing pictures for id-only listings), card data
                attribution (provider credits per game, footer and card/set pages)
    inventory/  inventory labels, item chips, public item card, public binder card
    plans/      PlansStore, plan and limit wording
    billing/    subscription / credit / donation wording and refusals, active boosts
    ads/        SponsoredSlot, sponsored ad card, impression directive and tracking, safe links
    discovery/  discovery labels (filters, ratings, listings), DiscoveryCentreService
    search/     UnifiedSearchBox (GET /search/suggest), suggestion grouping and routing
    domain/     games, place / last-active labels
    location/   LocationFields (region, country, state pickers, city), MyLocationStore
    regions/    RegionsStore (GET /regions), platform region names
    profile/    profile form, game / language / tag pickers, MyProfileStore
    links/      card / binder link pickers (autocomplete), shared link card
    messaging/  ConversationStarterService, BlockActionsService
    offers/     offer and trade labels, OfferTarget, offer form, refusals, make-offer button and
                dialog, card picker, reason dialog, deal summary, party card, status chip, offer
                link card and picker, CursorList, OfferActionsService
    wishlist/   WishlistActions, add/edit dialog (card picker, criteria fields), form, labels
    pipes/      relativeTime, mediaUrl
    ui/         avatar, card-art, card-image, confirm-dialog, game-chip, section-card,
                empty-state, error-state, skeleton, page-header, freshness-badge, condition-chip,
                availability-chip, visibility-badge, search-field, wordmark, quantity-stepper
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
  card search params, card metadata, game schema validation, usage-limit matrix and cell
  editor, admin metadata form, plan labels; Phase 3: inventory params, item form (defaults,
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
  rows and webhook payloads, dashboard links, notification links; Phase 10: billing labels
  and refusals (checkout, spend, referral, donation fields, safe checkout targets, idempotency
  keys), `PremiumStore` and usage rows, fake billing / donation checkout stores (outcomes, retry
  after a decline, give-up), `CreditsStore` (paging, spend, insufficient balance, redeem),
  `SponsoredSlotComponent` (label, click route, one impression, `[]`, flag off, waits for the
  session, reload on upgrade), donation form (presets, custom amount, API range), admin campaign
  form, targeting (no coordinates), creative URLs and entitlement values, the limit dialog
  closing every dialog.
- E2E (`npm run e2e`, Playwright/chromium; `npx playwright install chromium` once):
  - `e2e/smoke.spec.ts`: shell, navigation, legal draft banner, 404 (no API needed).
  - `e2e/auth.spec.ts`, `e2e/settings.spec.ts`, `e2e/admin.spec.ts` run against the **real
    local stack** and create fresh fictional users through the UI or the emulator REST API:
    sign-up with consents, email verification through the emulator's oob codes, onboarding
    (the "Where are you?" pickers), sign-out / sign-in, the 428 consent page,
    discoverability with a check that no JSON response carries a coordinate, JSON export
    download, profile edits, deletion with re-authentication and
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
    A's profile shows the public wishlist with the note and chips; B's binder is unpublished
    afterwards. A second test fills a FREE wishlist (20 wishes), sees the prompt to set a location
    for alerts and gets the limit dialog (429 `wishlist.items.max`) with the inline explanation.
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
  - `e2e/offers.spec.ts` (fresh collectors; the sellers declare a place): B makes
    a cash offer on A's public binder card through the dialog (amount required, a second offer on
    the card refused inline with a link to the open one) and shares it from the message composer;
    A has the OFFER_RECEIVED notification and sees the SYSTEM message and the OFFER_LINK card in
    the conversation, opens the offer, is refused an unchanged counter-offer and counters; B
    accepts from the Sent inbox ("Your turn") and lands on the trade page; both mark the
    in-person meetup and confirm the exchange (COMPLETED, A's copies drop from 2 to 1), B rates A
    from the trade page and A gets "Rate this collector" on B's profile. A second test: A switches
    off mixed offers in Settings → Offers, B's mixed offer is refused inline (422) and B sends a
    trade offer with two copies of a private card from A's profile; A's decline on a proposal
    that another device countered meanwhile gets 409 `STALE_OFFER` and the page moves to the live
    proposal; B declines the counter-offer with a reason and withdraws a cash offer on a
    sale-only card; the inbox status filter; a stranger gets the not-found state and 404. No
    JSON response carries a coordinate.
  - `e2e/payments.spec.ts` (fake payment provider, fresh collectors with declared places):
    a seller sets up payouts in Settings → Payouts; a buyer offers with "Use payment
    protection" (explanatory copy, no "escrow"); once accepted the buyer pays on the trade page,
    lands on the "Local test payment" checkout, pays and comes back PAID; the seller marks the
    card as shipped with tracking; the buyer confirms receipt: COMPLETED with the payout (amount
    minus the fee) shown to both. A second protected trade (prepared through the API up to the
    shipment) is disputed from the trade page (reason required), gets a previewed photo and a
    message; a stranger gets the not-found state and 404; an admin finds it in the queue, puts it
    on hold, adds a note and resolves it for the buyer after the review step; the payment shows
    the refund, the audit log lists `dispute.freeze`, `dispute.note` and `dispute.resolve`, and
    the buyer sees the decision, the refund and the cancelled trade. No JSON response carries a
    coordinate.
  - `e2e/freemium.spec.ts` (fake billing provider): a fresh FREE collector (discoverable in
    Quebec) sees the inventory's "Sponsored" placement, fills `binders.max`, gets the
    limit-reached dialog and follows "See Premium"; "Upgrade to Premium" opens the local fake
    billing checkout, a simulated decline keeps it open, "Pay" lands on
    `/premium?checkout=success` with binders 5 / 50; the sixth binder is created and no ad is
    left; "Cancel now" returns the collector to FREE (6 / 5).
  - `e2e/credits-ads.spec.ts`: a fresh collector redeems another one's referral code (an unknown
    code explained first) and spends the credits on a 24 h unlock (balance, ledger, boosts; the
    referrer earned 100); a signed-out visitor sees the map panel's "Sponsored" house ad
    (impression 204) whose click lands on `/premium`, a FREE collector sees a sponsored search
    result that disappears once Premium; a donation through the footer's "Support OrenjiTrade"
    shows the API's range on the field, passes the fake donation checkout and puts the opted-in
    name on the supporters wall (never the amount or message); an admin grants credits, creates,
    edits, targets (coordinates refused) and ends a campaign, grants and revokes an entitlement,
    and finds the audit entries.
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
  and `launch-config` (`e2e/launch-config.spec.ts` alone, after `chromium`, because it switches
  the stack's real feature flags off through the admin API and restores them); run the latter by
  itself with `npm run test:e2e -- e2e/launch-config.spec.ts --no-deps`.

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
