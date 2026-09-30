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
    binder, Message (Phase 5: opens or starts the conversation in the Messages panel when the
    collector accepts messages from the viewer; otherwise disabled with the reason; signed-out
    visitors get "Sign in to message"). Non-modal dialog: focus moves in, Escape closes and
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
    right-hand Messages panel (Phase 5, below).
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
- **`/wishlist`, `/wishlist/:id`** (`features/wishlist`; one route through
  `core/routing/optional-param.matcher.ts`, so the page survives opening a drawer):
  `WishlistStore` (`GET /wishlist`, alerts on/off with an optimistic `PATCH {active}`,
  `DELETE` with confirmation, plan usage of `wishlist.items.max`, match readiness from
  `GET /me/location`, quiet re-read on a pushed WISHLIST_MATCH and on reconnection) → summary
  (wishes, with matches, matches nearby, usage meter with a Premium link from 80 %), filter
  (All / With matches / Paused), `WishCardComponent` (card art, printing or "Any printing",
  criteria chips, private note, matches button, alerts switch, menu: edit, see matches,
  remove) and `MatchReadinessComponent` (explains that matches need a trading area and
  discoverability, with a link to the setting). `/wishlist/:id` (the notification deep link)
  opens `WishlistMatchesSheetComponent` in a side sheet: `WishlistMatchesStore`
  (`GET /wishlist/{id}/matches` cursor pages, new matches pushed for this wish arrive live,
  optimistic dismiss `POST /wishlist/matches/{id}/dismiss`) → `WishMatchCardComponent`
  (collector: avatar, approximate place, distance bucket, rating, activity; listing: picture,
  printing, condition / availability / offers chips, price, freshness, public note; Message
  through `ConversationStarterService`, View binder, On the map, Dismiss). Closing the sheet goes
  back to `/wishlist`.
- **Add/edit dialog** (`shared/wishlist`, a lazy chunk opened by `WishlistActions` from the
  wishlist page, card detail, the card holders view and the map's holders panel; signed-out
  visitors go to sign in first): card autocomplete (`GET /cards/suggest`; a printing suggestion
  preselects it) → printing or "Any printing" → minimum condition, edition, language, rarity
  (any printing only) from the game's `GameSchema`, maximum price + currency, radius slider
  bounded by `map.radius.max_km` (`GET /me/plan`, at most 100 km), trade preference, private
  notes, alerts switch (`wishlist-form.ts`: form, defaults, create/PATCH bodies, messages).
  Inline errors: 409 identical wish, 429 `LIMIT_REACHED` (the limit dialog opens as well), field
  errors of a 400. A new wish is confirmed with its matches found at once.
- **Collector page**: "Looking for" (`GET /collectors/{handle}/wishlist`, only when the collector
  shows it; 404 hides the section).
- **Limitation (API)**: matching measures distances between stored public points, which exist
  only for discoverable collectors with a trading area, so a wisher who is not on the map gets no
  match; the page says so (`MatchReadinessComponent`).

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
  Moderation and Ratings; transactions, disputes, payments, ads, subscriptions and credits stay
  listed as later phases): Dashboard (`GET /admin/dashboard` tiles with links for admins; open /
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
  model built from a public item and its owner, a card-holder result, a map "holders" listing or
  a wishlist match) and shows "Make an offer" only when the card accepts at least one kind and is
  not the viewer's own (signed-out visitors go to sign-in). Entry points: public binder cards,
  the collector page's public cards, card-holder results (`/search?card=`), the map's holders
  list and wishlist matches. `MakeOfferDialogComponent`: the card and its seller (region label
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
  with copies, the proposer's note), both parties (`OfferPartyCardComponent`: region label,
  distance bucket, rating; never a point), the chain's history (`OfferHistoryComponent`:
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
    realtime/   RealtimeService (STOMP over WebSocket), frame codec, lazy STOMP connection
    notifications/ NotificationCenter, notification kinds and links, notification entry
    config/     AppConfigService    (/config.json)
    feature-flags/ FeatureFlagsService, featureGuard
    http/       interceptors, ApiError, friendlyError, HttpContext tokens
    limits/     limit-reached interceptor, service and dialog
    layout/     app-shell, top-bar, notification-bell, account-menu, session-banner, bottom-nav
                (<960px), footer, api-version, theme-toggle
    routing/    OrenjiTitleStrategy ("<page> · OrenjiTrade"), optional-param matcher
    theme/      ThemeService
  features/
    auth/       sign-in, sign-up, verify-email, reset-password, consent, suspended
    onboarding/ three-step wizard
    settings/   shell + profile, privacy, notifications, trading-area, offers, payouts, blocked
                users, my reports, account, appearance
    offers/     /offers inbox (tabs, status filter, summary rows) and /offers/:id (action bar,
                history); data/ (OffersInboxStore, OfferDetailStore)
    trades/     /trades list and /trades/:id (next-action banner, steps, timeline, payment,
                shipment and dispute cards, payout reminder); data/ (TradesListStore,
                TradeDetailStore, TradeProtectionActions); dialogs/ (ship, open dispute)
    checkout/   /checkout/fake/:ref (local fake provider checkout); data/ (FakeCheckoutStore)
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
                with refund, webhooks, payment rules), disputes (queue, detail, resolve dialog)
    catalog/    card search (filters, URL params), card detail (metadata, printings), set page
    inventory/  /inventory: data/ (params, store, item form, bulk actions, visibility status),
                binder list, toolbar, summary, items (grid card, table), bulk bar,
                binders (header, publish menu, form + manager dialogs), editor side panel,
                add-card dialog
    binders/    /binders/:id public binder (container + header)
    premium/    plans and usage
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
    wishlist/   /wishlist: data/ (WishlistStore, WishlistMatchesStore), list (wish card, summary,
                match readiness), matches (side sheet, match card)
    notifications/ /notifications: data/ (NotificationFeedStore, day groups)
    legal, not-found
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
    links/      card / binder link pickers (autocomplete), shared link card
    messaging/  ConversationStarterService, BlockActionsService
    offers/     offer and trade labels, OfferTarget, offer form, refusals, make-offer button and
                dialog, card picker, reason dialog, deal summary, party card, status chip, offer
                link card and picker, CursorList, OfferActionsService
    wishlist/   WishlistActions, add/edit dialog (card picker, criteria fields), form, labels
    pipes/      relativeTime, mediaUrl
    ui/         avatar, card-art, confirm-dialog, game-chip, section-card, empty-state,
                error-state, skeleton, page-header, freshness-badge, condition-chip,
                availability-chip, visibility-badge, search-field, wordmark, quantity-stepper
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
  (escaping, icons), suggestions, discovery labels, search params, holder filters form; Phase 5:
  STOMP frame codec and connection (fake socket: CONNECT, heartbeats, ERROR, timeouts),
  `RealtimeService` (URL with token, backoff, token refresh after a refused handshake, resync,
  session following), message previews and drafts, thread items (day labels, groups, receipts,
  merging), `ConversationsStore` and `ThreadStore` (pushes, unread counts, paging, send errors,
  typing throttle), composer, conversation list (badges, keyboard), link choices, conversation
  starter, blocked users settings, community helpers and store, admin community helpers,
  media URLs; Phase 6: notification kinds and safe deep links, `NotificationCenter` (session
  following, pushes counted once, optimistic reads, resync and receipt re-reads), notification
  bell (badge, label, menu, mark read / all), `NotificationFeedStore` and day groups, optional
  parameter matcher, wishlist labels and form (slider cap, create / PATCH bodies, validation,
  server errors), `WishlistActions`, `WishlistStore` (filters, readiness, live re-reads,
  optimistic alerts, removal), `WishlistMatchesStore` (paging, live matches, dismiss rollback),
  wish card; Phase 7: report labels and refusals, the Report collector dialog (reasons in server
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
  rows and webhook payloads, dashboard links, notification links.
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
  - `e2e/messaging.spec.ts` (two browser contexts): A finds B on the map and presses Message in
    the preview; the panel opens the new conversation; A sends text and a card through the
    autocomplete; B, waiting on `/messages`, receives the conversation live (no reload) with two
    unread messages, opens it (card link to the catalog) and A sees "Seen"; B's typing indicator,
    answer and a photo reach A live; A blocks B from the thread menu (which also offers
    "Report collector"), B's next message is refused inline and `POST /conversations` answers 403
    `MESSAGING_BLOCKED`; A unblocks B in Settings → Blocked users. A second test starts a
    conversation from a profile (full page), rejects a text file, sends a photo, shows the 422
    moderation refusal inline and reopens the conversation from the list by keyboard.
  - `e2e/wishlist.spec.ts` (two collectors at a random rural point no other spec uses): A adds
    a wish through the dialog (autocomplete, minimum condition, maximum price, radius slider
    bounded by the FREE plan), sees its chips, adds a second wish from the card page and gets the
    identical one refused inline (409), removes it with confirmation; B lists the card nearby:
    A's bell badge and match count rise live without a reload, the bell menu entry opens
    `/wishlist/<id>` with the matches drawer (B's approximate place, distance bucket, price,
    binder link), a second copy arrives live in the open drawer and is dismissed, A messages B
    from the match, `/notifications` filters unread ones and marks all read, A's profile shows the
    public wishlist; B's binder is unpublished afterwards. A second test fills a FREE wishlist
    (20 wishes), pauses alerts and filters, sees the trading-area hint and gets the limit dialog
    (429 `wishlist.items.max`) with the inline explanation. Every JSON response has at most 3
    decimals for `lat`/`lng`.
  - `e2e/community.spec.ts`: `/community` opens the first regional channel; a collector moves to
    Montréal / Pokémon, posts with a card link, is refused a duplicate (409) and a banned term
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
  - `e2e/offers.spec.ts` (fresh collectors; the sellers live at a random rural point): B makes
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
    sale-only card; the inbox status filter; a stranger gets the not-found state and 404. Every
    JSON response has at most 3 decimals for `lat`/`lng`.
  - `e2e/payments.spec.ts` (fake payment provider, fresh collectors at a random rural point):
    a seller sets up payouts in Settings → Payouts; a buyer offers with "Use payment
    protection" (explanatory copy, no "escrow"); once accepted the buyer pays on the trade page,
    lands on the "Local test payment" checkout, pays and comes back PAID; the seller marks the
    card as shipped with tracking; the buyer confirms receipt: COMPLETED with the payout (amount
    minus the fee) shown to both. A second protected trade (prepared through the API up to the
    shipment) is disputed from the trade page (reason required), gets a previewed photo and a
    message; a stranger gets the not-found state and 404; an admin finds it in the queue, puts it
    on hold, adds a note and resolves it for the buyer after the review step; the payment shows
    the refund, the audit log lists `dispute.freeze`, `dispute.note` and `dispute.resolve`, and
    the buyer sees the decision, the refund and the cancelled trade. Every JSON response has at
    most 3 decimals for `lat`/`lng`.
  - `e2e/admin-moderation.spec.ts`: an administrator's dashboard counts, the listing review
    queue, hiding a collector's listing with a required reason from their listings, pausing and
    resuming the collector's listings (the collector sees the "under review" banner on
    `/inventory` without the reason), moderation rules with inline pattern validation, the
    auto-delist editor's inline ordering error and reset (nothing saved), notification
    statistics (broadcast locked for admins), analytics, system health and the audit entries.
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
