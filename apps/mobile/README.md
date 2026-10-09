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
credit, attributes, printings and market prices, "Add to inventory", "Who has this in my region"
opens the card holders), the **Inventory** tab (cards with search, binder / game / intent filters and sorting,
totals, stale or hidden cards with "Confirm all", paused listings with "Resume"; binders), adding a
card (`items/new`: catalog search → printing → details), editing and deleting one (`items/[id]`),
and **binders** (`binders/new`, `binders/edit`, `binders/[id]`: create, rename, publish for 1 h /
24 h / until disabled, make private, confirm, delete, add or remove cards; the public view of
anyone's public binder). Freemium limits (`binders.max`, binder views per day) are explained where
they happen.

Phase 4 (stage M3, reworked by stage S1 / ADR 0017 on 2026-10-08): there are no positions or
distances any more. The **Map** tab is a placeholder that names the home region and leads to
region-scoped search until it draws the web's boundary map (follow-up); "Who has this in my
region" lists the card holders of the home region; the **collector profile** (`collectors/[id]`)
shows the state or province and, when its owner shows it, the city, with ratings and references,
public binders and cards. "Message" opens or starts the conversation (`POST /conversations`) in a
thread (`messages/[id]`).

Phases 5 and 6 (stage M4) are implemented on the same API and realtime channel as the web: a
**realtime** STOMP 1.2 client over the app's WebSocket (`/ws`; live while a ready account is
signed in, paused in the background, reconnecting with backoff), the **Messages** tab (Inbox |
Community: the inbox with unread counts and previews, the full conversation with card / binder /
offer links, photos, read markers, typing, "Seen", mute / archive / block; the public community
channels with posts, replies and own edits), the **Wishlist** tab (stage S2: which copy, public
note, "Near Mint only" and price term chips, edit, remove, "Let others see what you want", a prompt
to set a location for alerts; "Add to wishlist" on the card detail with its printing or rarity;
no matches) and the **notification centre** (a bell
with a live unread badge on every tab, the list, mark read, a deep link per notification kind).
Device push is not wired (it needs an EAS project and a real FCM sender): notifications arrive in
the app. An ended session leads to the sign-in screen with an explanation, and a link opened while
signed out reopens after signing in. Card recognition (Phase 11) is on hold: no scan flow, the
`mlScanning` flag stays off.

Phases 7 and 8 (stage M5) are implemented on the same API as the web: **Report collector**
(`report`: the API's reasons, details, a confirmation; from profiles, the map preview,
conversations, community posts and public binders) and **My reports** (`settings/reports`, the
status only); **ratings and references** (`ratings/rate`, `ratings/reference`: overall and the four
criteria after an eligible interaction, edits for 14 days, one reference per collector, from
profiles, conversations and completed trades); **offers** ("Make an offer" on public cards from
binders, profiles and the holders list; `offers/new`, `offers/counter`, the
inbox `offers` with Received / Sent and status filters, one offer `offers/[id]` with accept /
counter / decline / withdraw and the history; offer settings; offer links in chat open the offer
and can be shared); **trades** (`trades`, `trades/[id]`: the next move, meetup, confirming the
exchange, cancelling with a reason, the timeline, rating once completed). Admin and moderator
consoles stay on the web.

Phases 9 and 10 (stage M6) are implemented on the same API and the same local **fake providers**
as the web (no card, no money; each checkout is a screen of the app with a "Local test payment"
banner): **payment protection** on the trade screen ("Use payment protection" on a new cash offer,
Pay through `checkout/fake/[ref]`, Mark as shipped with a carrier and tracking, Confirm receipt,
which releases the payout, Open a dispute within the window; the payment, shipment and dispute
cards; a seller's reminder to set up payouts), **disputes** (`disputes/[id]`: the decision or the
hold, evidence (statements and photos from the library; photos are fetched with the ID token),
the thread with the other collector and OrenjiTrade, the timeline), **Settings → Payouts**
(`settings/payouts`), **Premium** (`premium`: plans, the live subscription, subscribe / continue /
close / cancel through `checkout/fake-billing/[ref]`, usage and boosts; every reached plan limit
offers "See Premium"), **Credits** (`credits`: balance, unlocks for a day with one idempotency key
per dialog, referral code with "Share" and redemption, the append-only ledger), **Support
OrenjiTrade** (`support`: voluntary donations through `checkout/fake-donation/[ref]`, supporters,
own donations) and **"Sponsored" placements** (search results, the map list, the inventory and other
collectors' profiles: the impression recorded once, a tap opens the API's click route in the
browser). Everything follows its feature flag (`protectedPayments`, `premiumPlans`, `credits`,
`donations`, `advertising`), evaluated for the signed-in collector, like the web. The wording is
"payment protection", never "escrow". Selling Premium or donations in a store build raises the
app-store in-app purchase rules: an open owner question recorded in ADR 0011 (no IAP and no real
provider are added).

Stage M7 closes the gaps a comparison with the web app found, each on the web's endpoints:
**Google sign-in and sign-up** ("Continue with Google" / "Sign up with Google": Firebase's pop-up
on the web build, an OAuth ID token through expo-auth-session on a device with the platform's
client id, and, against the local Auth emulator, a simulated Google account sent as the emulator's
fake OAuth credential; proven only against the emulator, see below; a Google sign-up collects the
legal consent like the web and skips the e-mail verification; an existing e-mail/password account
of the same verified e-mail is linked; Settings → Account names the sign-in methods; deleting an
account without a password re-authenticates with Google), the **Search** tab's Cards | Collectors
| Binders segments (collectors by name or handle with their state or province,
public binders by name with their owner, recent searches per segment), the **card holders list**
(`holders`: "Who has this in my region" from a card as a list with sort (freshness or price),
availability, condition, price range, freshness, edition, language and accepts-offers filters,
paged), **"Looking for"** on a collector's profile (the public wishlist of a collector
who enabled "Let others see what you want"), **Settings → Blocked users** (list and unblock;
linked from Settings, from a blocked profile's Message reason, from the block dialog and from the
settings deep links), inventory **owner photos** on a card (view, add from the library, remove;
the web's upload rules, no camera) and **multi-select bulk actions** (visibility including
temporary, move to binder, availability, confirm, delete), the inventory **visibility filter**,
**binder reordering**, the Map tab's **freshness and tags filters and search box**, and **set
pages** (`sets/[id]`, from a card's set link).

Stage M8 (launch readiness on mobile, the mobile half of the web's `feature/launch-readiness`
work) adds, each like the web: the **18+ rule** (a bilingual checkbox "I confirm I am 18 years of
age or older / Je confirme avoir 18 ans ou plus" at sign-up, never ticked by "Accept all",
recorded as the `AGE_CONFIRMATION` consent; the same checkbox on the consent screen for an account
that never gave it, e.g. a Google sign-up; a first, non-editable onboarding "Age" step for
existing accounts, which return to where they came from once confirmed; `needsOnboarding` while
`/me` reports `ageConfirmed: false`; a friendly message for `403 AGE_CONFIRMATION_REQUIRED`, which
also reloads `/me` so the gate shows the step; Sign out on the step so nobody is stuck), the
**consent language** (every `POST /me/consents` carries `language`: `fr` when the device's
primary language is French through `expo-localization`, an explicit EN / FR choice wins), the
**French legal pages** (`npm run sync:legal` copies both web files, an EN / FR switch on the legal
index and every document, French by default on a French device, the choice remembered on the
device, the draft banner in both languages and the French translation marking as on the web, the
"Trading safely" page, the document titles of the sign-up and consent checkboxes in the active
language; the UI around the texts stays English), the dismissible **"Trade safely" notice**
(link to the guide, Report, Block, Dismiss; under the conversation header and at the top of the
offer and trade screens; dismissal kept on the device per collector and per context, as the web
keeps it in local storage: there is no server-side preferences mechanism), **Block / Unblock on
the collector profile** next to Report, and the **money-off follow-ups** (neutral plan-limit
wording and no "See Premium" unless `premiumPlans` is on; the plan-limit notification opens
Premium only when the API's payload carries `upgradeUrl`). Nothing here claims legal compliance:
the legal texts stay drafts (banner kept).

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

| Variable                                  | Purpose                                                                                                                                                                                                 | Default                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`                | API origin                                                                                                                                                                                              | `http://10.0.2.2:8080` (Android), else `localhost` |
| `EXPO_PUBLIC_FIREBASE_API_KEY`            | Firebase web API key                                                                                                                                                                                    | `demo-local-key`                                   |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`        | Firebase auth domain                                                                                                                                                                                    | `<project>.firebaseapp.com`                        |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID`         | Firebase project id                                                                                                                                                                                     | `orenjitrade-local`                                |
| `EXPO_PUBLIC_FIREBASE_APP_ID`             | Firebase app id                                                                                                                                                                                         | empty                                              |
| `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | Auth emulator `host:port`; `off` for a real project                                                                                                                                                     | `10.0.2.2:9099` (Android), else `localhost:9099`   |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`        | Google sign-in OAuth client id of the web build (public; from the Firebase project, deferred); empty locally: against the Auth emulator "Continue with Google" signs in with a simulated Google account | empty                                              |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`    | Google sign-in OAuth client id of the Android app (expo-auth-session, redirect `com.orenjitrade.app:/oauthredirect`); without it a device build says Google sign-in is not configured                   | empty                                              |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`        | Google sign-in OAuth client id of the iOS app                                                                                                                                                           | empty                                              |

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
  onboarding.tsx           (age, for an account that never confirmed being 18+) -> profile ->
                           interests -> "Where are you?" (+ map opt-in, off by default)
  (tabs)/                  Map | Inventory | Search | Messages | Wishlist | Profile
  settings/                profile, location, privacy, notifications, account, delete-account,
                           appearance (screens of the root stack, no nested stack)
  legal/                   index + [key] (versioned documents read in-app, EN / FR switch)
  (tabs)/index.tsx         the Map tab (a placeholder: the home region, search; ADR 0017)
  collectors/[id].tsx      public profile (also the "Public preview" of the own profile)
  (tabs)/messages.tsx      Inbox | Community (`?view=community`), realtime status
  messages/[id].tsx        a conversation (thread, links, photos, receipts, mute / archive / block)
  community/[slug].tsx     a public channel (posts, replies, own edits)
  (tabs)/wishlist.tsx      wishes; wishlist/new (`?cardId=&printingId=&rarity=`), edit (`?id=`)
  notifications.tsx        the notification centre (the bell in every tab header opens it)
  report.tsx               "Report collector" (`?userId=&name=&handle=&source=` + context id)
  ratings/                 rate (`?userId=&handle=&name=`, `&kind=TRADE`, `&rating=` to edit),
                           reference (one per collector)
  offers/                  index (Received / Sent, `?tab=&status=`), [id] (one proposal), new
                           (`?item=`, the card handed over by "Make an offer"), counter (`?id=`)
  trades/                  index (`?status=`), [id] (one trade: next move, steps, timeline)
  settings/reports.tsx     My reports; settings/offers.tsx: mixed offers; settings/payouts.tsx
  checkout/                fake/[ref] (protected payment), fake-billing/[ref] (Premium),
                           fake-donation/[ref] (donation): the local fake provider checkouts
  disputes/[id].tsx        a dispute (`?opened=1` after opening it from the trade)
  premium.tsx, credits.tsx, support.tsx   Premium (`?checkout=success`), Credits, Support
                           (`?donation=thanks`)
  cards/[id].tsx           card detail (`?printing=` selects a printing, `?rarity=` any printing of it)
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
  features/legal/          the legal texts of both languages (legalTexts), the device / stored
                           language rule (legalLanguage, expo-localization + AsyncStorage), the
                           EN / FR switch, the draft banner, the 18+ checkbox (ageConfirmation)
  features/safety/         the "Trade safely" notice and its per-collector dismissal store
  features/offers/         offer vocabulary and rules (offerLabels, offerForm, offerProblems,
                           offerTarget + the in-memory target store), the editor, the deal, the
                           history, the action bar; features/trades/: trade labels, steps,
                           timeline; features/reports/, features/ratings/: their rules and routes
  features/payments/       payment-protection vocabulary (paymentLabels, paymentProblems,
                           protectedForms, checkoutTargets), the explainer; features/disputes/:
                           overview, evidence list and composer, thread, timeline;
                           features/checkout/: useProviderCheckout + the fake checkout card;
                           features/billing/: plans, subscription, usage, credits, donations;
                           features/ads/: SponsoredSlot (label, impression, click route)
  realtime/                STOMP 1.2 codec + connection, RealtimeClient, RealtimeProvider
                           (AppState / NetInfo), RealtimeCacheSync (pushes -> query caches)
  lib/                     pure helpers (places and region names, card picture URLs, dates, ...)
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
- **Places (ADR 0017)**: the app handles no coordinates, distances or GPS. Collectors declare a
  region, country, state or province and an optional city (`src/features/location/`:
  `LocationFields` with SelectSheet pickers fed by `GET /regions` through `useRegions`,
  `locationDraft.ts` for the draft rules), in onboarding ("Where are you?") and Settings →
  Location (`PUT` / `DELETE /me/location`). Others see a collector's state or province
  (`src/lib/place.ts`); a profile adds the city only when the API sends it (its owner shows it).
  Region-scoped calls (search, card holders, ads) send the home region of `GET /me`
  (`useHomeRegion`, `americas-north` without a location). `expo-location` is not installed and no
  location permission is requested; `react-native-maps` stays installed (its config plugin runs
  without a key) for the follow-up boundary map. The jest suite scans `src/` and `app/` for
  coordinate identifiers and location modules (`__tests__/privacy/coordinateLiterals.test.ts`) and
  checks every answer and request of the place screens (`__tests__/privacy/placePrivacy.test.tsx`).
- **Map tab**: a placeholder (`app/(tabs)/index.tsx`) that names the home region, leads to search
  and invites a collector without a location to choose one. Discoverability defaults to off.
- **Realtime** (`src/realtime/`, the web's `core/realtime`): `RealtimeProvider` connects while a
  ready account is signed in, subscribes only to the caller's own queues
  (`/user/queue/messages|receipts|typing|presence|notifications`) and sends only `/app/typing`.
  The ID token goes in the handshake's `Authorization` header (native) or `?access_token=` (web
  build), never in a frame or a log. Backoff 1 s -> 30 s with jitter, a fresh token after a refused
  handshake, paused in the background (`AppState`), immediate retry when NetInfo reports the
  network back; after every (re)connection `resync` re-reads over REST what pushes may have
  missed. `RealtimeCacheSync` applies pushes to the react-query caches (threads, inbox order and
  unread counts, receipts, presence, the notification badge and lists), so
  screens only read their queries. React Native's WebSocket drops the NUL that ends a STOMP frame:
  native builds send frames as binary UTF-8 (NUL included) and restore the NUL of received text
  frames (`nulSafeFrames`); keep that when touching `stompConnection.ts`.
- **Messages and community** (`src/features/messages/`, `src/features/community/`): the inbox and
  threads are cursor queries patched in place (`conversationCache.ts`) rather than refetched; the
  read marker is sent only while the thread is visible; photos are checked (JPEG / PNG / WebP,
  8 MB) before `POST /uploads/images?kind=MESSAGE`; refusals (`MESSAGING_BLOCKED`,
  `MESSAGE_BLOCKED`, `POST_BLOCKED`, `DUPLICATE_POST`, 429 with `retryAfterSeconds`) are explained
  where they happen. Offer links open the offer; "Share an offer" links a negotiation with the
  other collector (OFFER_LINK).
- **Offers and trades** (`src/features/offers/`, `src/features/trades/`, the web's
  `shared/offers` and `features/{offers,trades}`): "Make an offer" (`MakeOfferButton`) shows only
  on a card that accepts a kind of offer and is not the viewer's; it hands the card over to
  `offers/new` in memory (`offerTargetStore`: no endpoint reads one public item; a reloaded page
  asks to choose the card again). The form offers only the kinds the availability allows, sends
  once with an `Idempotency-Key` fixed for the screen, and words every refusal through
  `offerProblem` (the web's wording; `LIMIT_REACHED` with used / allowed and the reset). Answers
  always send the version on screen; `STALE_OFFER` moves to `latestOfferId`, other conflicts
  re-read. Screens only offer the API's `allowedActions` / `allowedOperations`. A counter-offer
  that arrives while its offer is open replaces it on screen (`router.setParams`). Pushed OFFER_* and
  trade notifications invalidate `['me', uid, 'offers' | 'trades']`.
- **Payment protection and disputes** (`src/features/payments/`, `src/features/disputes/`,
  `src/api/hooks/payments.ts`, the web's `shared/payments`, `features/{trades,checkout,disputes}`
  and `settings/payouts`): the trade screen offers only the API's `allowedOperations` (Pay, Mark as
  shipped, Confirm receipt, Open a dispute; hidden while `protectedPayments` is known to be off);
  refusals are worded by `paymentProblem` (SELLER_NOT_ONBOARDED, DISPUTE_WINDOW_CLOSED with the
  date, EVIDENCE_LIMIT_REACHED, FEATURE_DISABLED). Pay follows only the app's fake checkout path
  or an https provider page (`checkoutTargets.ts`); the checkout polls until the synthetic webhook
  lands (`useProviderCheckout`, about 45 s at most) and goes back to the trade with
  `?payment=secured|failed` (`router.dismissTo`). Evidence photos are checked (JPEG / PNG / WebP,
  8 MB) before the multipart upload and shown from the authenticated file route as `data:` URIs
  (never a public URL, never a disk cache). DISPUTE_UPDATE notifications refresh the dispute.
- **Premium, credits, donations and ads** (`src/features/billing/`, `src/features/ads/`,
  `src/api/hooks/billing.ts`, the web's `features/{premium,credits,support,checkout}` and
  `shared/{billing,ads}`): a plan change (checkout, cancel) re-reads `/me`, the plan, the ads and
  discovery; a credit spend keeps one idempotency key per dialog; donations validate the amount
  (two decimals) and show the API's range on the field; a sponsored slot serves nothing while
  `advertising` is off or for Premium (`[]`), always says "Sponsored", records one impression per
  serve token once laid out and only opens the API's click route or an https page.
  `LimitReachedNotice` and the other limit messages offer "See Premium" while premium plans are
  sold.
- **Ratings and reports** (`src/features/collectors/ratingLabels.ts`, `src/features/ratings/`,
  `src/features/reports/`): the rate, reference and report screens take the collector (and the
  report's context or the rating to edit) in their route params (`ratingParams`,
  `reportParams`, validated again when read); eligibility comes from `GET /ratings/eligibility`
  and is never guessed; a report is sent with an `Idempotency-Key` and the reporter only ever
  sees statuses.
- **Notifications** (`src/features/notifications/notificationKinds.ts`, the web's
  `notification-kinds.ts`): an icon / tone / label per type, and the web path of a notification
  (`data.deepLink` when it is a safe same-app path, else rebuilt from its ids) mapped to an app
  screen (`mobileTarget`: offers, trades, disputes, Premium, credits, support, My reports, payouts
  and `?tab=ratings` included), or a note for the settings that stay on the web (blocked users).
- **Sessions**: a 401 on a request that carried a token while signed in means the session ended:
  `src/api/client.ts` reports it, the session signs out and the gate shows the sign-in screen with
  "Your session has ended". A link opened while signed out is kept (`src/account/pendingLink.ts`)
  and reopened after signing in.
- **Testing hooks**: screens carry `testID="screen-<name>"`, tab buttons `tab-<route>`. Keep
  controls off the top-right corner just below the header: Expo Go floats its tools button there
  and a Maestro tap would open the developer menu instead.

## Scripts

| Script                                  | What it does                                              |
| --------------------------------------- | --------------------------------------------------------- |
| `npm start` / `android` / `ios` / `web` | `expo start` (+ platform)                                 |
| `npm run typecheck`                     | regenerate the typed routes, then `tsc --noEmit`          |
| `npm run typegen`                       | regenerate `.expo/types/router.d.ts` (no Metro needed)    |
| `npm run lint`                          | `expo lint` (eslint-config-expo + prettier compatibility) |
| `npm run format` / `format:check`       | Prettier                                                  |
| `npm test`                              | Jest (`jest-expo`, `@testing-library/react-native`)       |
| `npm run sync:tokens`                   | regenerate `src/theme/tokens.ts` from the design tokens   |
| `npm run sync:legal`                    | copy the web's legal texts (EN and FR) into `src/legal/`  |
| `npm run doctor`                        | `expo-doctor`                                             |

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
validation, tags, public preview), `location.spec.ts` (the pickers: region, country, state,
city; what is missing; the `PUT /me/location` body; map opt-in; the city on the profile only;
removal), `account.spec.ts` (export, deletion request and cancel, privacy and notification
settings), `catalog.spec.ts` (search -> game and language filters -> card detail -> printings, every
picture an API URL; printing-code match, an unknown card), `inventory.spec.ts` (add a card through
search -> printing -> details, edit it (only the changed fields are sent), delete it with a
confirmation; add from a card detail, intent / game filters and sorting), `binders.spec.ts`
(create a binder -> add a card -> publish for 24 hours -> make private -> remove the card -> rename
-> delete; the `binders.max` limit; another collector's public binder: public cards and notes
only; the owner's state, never their city), `map.spec.ts` (the Map tab placeholder with the
home region and no map provider request, the invitation for a collector without a location, a
profile with the state and the shown city, "Message" opens the conversation and sends), `messages.spec.ts` (a second
collector writes over the API: the inbox badge, the thread, live delivery, a reply, "Seen", a
photo; a card link, mute and a block both ways), `community.spec.ts` (channels with their
activity, post, edit, reply, delete), `wishlist.spec.ts` (two collectors of Americas (South): a wish
with a public note, Near Mint only, "85% TCG" and one printing, none of the removed fields, then a
listing: one wishlist alert rises live on the bell, names the holder's state only and opens the
card), `session.spec.ts` (a signed-out profile link reopens after sign-in; an ended session
leads to sign-in with the notice), `reports.spec.ts` (report a collector from the profile with
the API's reasons -> "Report sent" -> My reports with the status; a second open report refused
(409); a report from a conversation's options), `offers.spec.ts` (a cash offer from a public
binder -> the seller's counter-offer (API) followed live -> accept -> the trade -> both confirm
(the seller through the API, the completion arrives live) -> rate from the trade and a reference
(a banned term refused); a received offer countered from the app and declined with a reason),
`payments.spec.ts` (with the fake payment provider: a buyer's protected offer -> the seller
accepts (API) -> Pay on the app's fake checkout -> shipped (API, followed live) -> Confirm receipt
-> the payout released; a seller sets up payouts, accepts a protected offer, sees the payment
arrive live, marks the card as shipped with tracking and sees the payout; a dispute opened from
the trade with a reason, a statement, a photo from the library (shown through the authenticated
route) and messages both ways, a stranger gets 404), `billing.spec.ts` (`binders.max` -> "See
Premium" -> the fake billing checkout declines then succeeds -> the sixth binder, no ads ->
"Cancel now"; a referral code redeemed, unlimited binder views unlocked for a day with credits, both in the
ledger; a voluntary donation through the fake donation checkout and the supporters; a FREE
collector's "Sponsored" search result: one impression (204), the click route's 302 to the landing
page), `google.spec.ts` (a Google sign-up through the emulator's simulated account: the fake OAuth
credential checked, consent -> onboarding -> tabs, Google as the only sign-in method; the chooser
dismissed; Google with the e-mail of a verified password account signs in to it and links Google,
the password still works; an unverified one is taken over, Firebase's rule), `search-segments.spec.ts`
(collectors by name or handle with their state, the home region in the request, a collector
who opted out of name search or lives in another region never appears, recent searches per segment, the profile from a row;
public binders by name with their owner, the public binder from a row), `holders.spec.ts` ("Who has
this in my region" from a card: the request names the region, both copies with prices and the
holder's state, sort by price, accepts offers, a validated price range, availability and condition
filters, "Clear filters", the holder's profile with the city it shows), `collector-wishlist.spec.ts` ("Looking for" on
a profile with the condition only, never the price; nothing for a collector who hides it,
404), `blocked.spec.ts` (block from a conversation -> the blocked profile's Message reason links to
Blocked users -> Unblock, checked on the API and on what the other collector can send),
`item-photos.spec.ts` (a text file refused before any upload, a PNG uploaded and served through the
API's media route, removed), `bulk-actions.spec.ts` (select two cards -> public, select all ->
private with the skipped one explained, temporarily public for 24 hours, an availability, delete
after a confirmation), `age-confirmation.spec.ts` (an account from
before the 18+ rule, created with `confirmAge: false`, is asked for the confirmation alone on its
next sign-in, a link opened meanwhile is remembered and reopened after it, the consent checked on
the API; Sign out from the step), `legal-french.spec.ts` (French by default for a `fr-CA` browser,
the EN / FR switch, the choice remembered across a reload, the draft banner and the translation
marking, the "Trading safely" page in both languages), `safety-notice.spec.ts` (the notice in a
first conversation: the guide, Report, Block with its confirmation, Dismiss, gone after a reload;
Block / Unblock on the collector profile). `auth.spec.ts` ticks the 18+ checkbox at sign-up and on
the consent screen. The global setup records the `AGE_CONFIRMATION` consent for the seed
collectors the specs sign in to (through the API, in the isolated database: the seed predates the
rule), and `createOnboardedCollector` records it for every collector it creates unless
`confirmAge: false`. The static web export served by `expo serve`
has no rewrites for dynamic routes
(`/cards/<id>` answers 404 on a full page load), so specs open them inside the running app
(`openInApp` in `e2e/support/stack.ts`). A privacy fixture scans every JSON answer of the API for coordinate, radius and distance
keys (none exists since ADR 0017) and fails a test on any request to a map provider, a tile
server or the developer API; such requests are aborted (the app draws no map).
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
`sign-up-onboarding.yaml` (the location step with the pickers), `profile-edit.yaml`,
`discoverability.yaml` (Canada, Ontario and a city with the pickers, save,
`scripts/check-location.js` checks on the host the declared codes and that `GET /me/location`
carries no coordinate, radius or distance; map opt-in), `sign-out.yaml` (session restore after a
relaunch, then sign-out), `search-card-detail.yaml` (search, a schema language filter, card
detail, the French printing), `inventory-add-edit-delete.yaml` (add through search -> printing ->
details, edit, delete; `scripts/check-inventory.js` checks the API after each step),
`binder-create-add-item.yaml` (a card added on the host by `scripts/add-card.js`, a new binder,
"Add cards", publish for 24 hours, checked on the API), `map-placeholder-profile.yaml` (a seed
collector's Map tab placeholder with the home region, "Search your region", then a profile with
the state and the shown city), `card-holders-region.yaml` (a card collector1 lists, read on the
host by `scripts/public-card.js`, opened by deep link -> "Who has this in my region" -> collector1's
copy with the state), `messages-inbox-thread.yaml` (a second collector set up and driven on the host by
`scripts/messaging.js`: the conversation reaches the inbox with its unread badge over the
realtime channel ("Live"), opening it marks it read, a reply shows "Sent" and is checked on the
API with the read marker, the other collector's answer appears live in the open thread),
`community-post.yaml` (Messages ->
Community -> General, a post and a reply checked on the API by `scripts/community.js`; the texts
carry the run's handle because the channel keeps earlier runs' posts),
`wishlist-alert-notification.yaml` (a wish made in the app with a public note, Near Mint only and
"85% TCG", a Near Mint listing by a second collector of the same region (`scripts/wishlist.js`,
both in Montevideo): one wishlist alert on the bell, live, naming the state, which opens the card), `offer-trade-rating.yaml` (a cash offer on a public card
opened by deep link, the seller's counter-offer from the host (`scripts/offers.js`) followed live,
accept, the trade, both confirmations and the live completion, a rating checked on the API),
`report-collector.yaml` (report a collector from the profile, the confirmation, My reports,
checked on the API), `payment-protection.yaml` (a cash offer with "Use payment protection" on a
public card opened by deep link, the seller (payouts set up, `scripts/payments.js`) accepts from
the host, Pay on the app's fake checkout, the shipment from the host followed live, Confirm
receipt, the payout checked on the API), `premium.yaml` (the binder limit -> "See Premium" ->
"Upgrade to Premium" -> the fake billing checkout declines, then succeeds -> the welcome and the
plan checked on the API -> the sixth binder -> "Cancel now" -> FREE again), `google-sign-in.yaml`
(a fresh password collector continues with Google under the same e-mail through the emulator's
simulated account: the chooser dismissed, then the sign-in lands on the tabs of that account and
Settings -> Account names both methods), `collector-search-looking-for.yaml` (the Collectors
segment finds a collector of the region set up by `scripts/parity.js`, with his state; his profile and "Looking for" with the condition only; the wish opens the card),
`holders-filters.yaml` (a card listed twice by a collector of the region: the holders list with
both prices and the holder's state, sorted by price, narrowed to the Lightly Played copy,
cleared), `blocked-users.yaml`
(block from a conversation -> Settings -> Blocked users -> Unblock, checked on the API; the other
collector can write again), `age-step-existing-account.yaml` (a collector created on the host
without the 18+ confirmation (`CONFIRM_AGE=false`) signs in, sees the "Age" step alone, is refused
unticked, confirms, lands on the tabs with "Welcome back", `scripts/check-age.js` checks the
consent on the API, a relaunch never asks again), `legal-french.yaml` (from the sign-in screen:
the legal index, FR with the French banner and the translation marking, "Trading safely" in French
then in English, the choice kept across a relaunch), `safety-notice.yaml` (Ada's first conversation
shows the "Trade safely" notice, the guide opens in-app, the composer keeps working, Dismiss, gone
after a relaunch). The seed flows (`sign-in.yaml`, `map-placeholder-profile.yaml`) first record the
seed's 18+ confirmation on the host (`scripts/confirm-age.js`, idempotent) and every host script
that creates a collector records it too (the sign-up flow ticks the checkbox itself). Flows scroll only with the edge-swipe subflows (a slow swipe in the middle can start on a text
field); option lists of the pickers scroll with `scrollUntilVisible`. Shared steps are in `.maestro/subflows/` (cleared
launch in Expo Go, dismissing the Expo Go developer menu and an "isn't responding" dialog,
sign-in, and scrolls that swipe along the screen edge so a slow swipe never starts on a filled
text field, which Android turns into a text-selection long press) and host-side helpers in
`.maestro/scripts/` (create a fictional collector through the emulator and the API, verify an
email with the emulator's code, check a declared location, add a card, check an inventory, the
collectors of the stage M7 flows and the blocks of an account in `parity.js`).
Screenshots and reports: `.local-dev/mobile-e2e/maestro/`. Edit nothing in the repository while
flows run (Metro re-crawls the workspace and Expo Go may lose the packager) and restart a kept
Metro after source changes (`npm run test:mobile:maestro -- --stop`).

## Deep links

- Custom scheme: `orenjitrade://collectors/<handle>`, `orenjitrade://cards/<id>`,
  `orenjitrade://binders/<id>`, and every other app route (`orenjitrade://messages/<id>`,
  `orenjitrade://wishlist`, `orenjitrade://community/<slug>`, `orenjitrade://notifications`,
  `orenjitrade://offers/<id>`, `orenjitrade://trades/<id>`, `orenjitrade://settings/reports`,
  `orenjitrade://disputes/<id>`, `orenjitrade://premium`, `orenjitrade://credits`,
  `orenjitrade://support`, `orenjitrade://settings/payouts`, `orenjitrade://holders?card=<id>`
  (or `?printing=<id>`), `orenjitrade://sets/<id>`, `orenjitrade://settings/blocked`).
  Signed out, a link leads to sign-in and opens after signing in.
- Universal/App Links: `https://www.orenjitrade.com/(collectors|cards|binders)/<id>` via
  `ios.associatedDomains` and Android `intentFilters` (`autoVerify`) in `app.config.ts`.

## Not yet wired (tracked in `IMPLEMENTATION_STATUS.md`)

- The admin / moderator consoles (web only, including dispute resolution, refunds, plans,
  campaigns and donation refunds). PDF evidence of a dispute is listed by name and size and opened
  on the website (the app adds statements and photos). Store builds: real payment providers and
  in-app purchase are not wired (open owner question, ADR 0011); the fake providers are local
  only. "Make an offer" is not on the Map tab's list rows (the preview sheet and the holders list
  have it). Moderators remove community posts on the web only; photos come from the library (no
  camera).
- Google sign-in on a device needs the OAuth client ids of the real Firebase project
  (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`, deferred with that project: `docs/deployment/DEFERRED.md`);
  locally it is proven only against the Auth emulator's simulated account, and a device build
  without its client id says so on the button. The web build's Firebase pop-up and the device
  flow are implemented but have not run against a real project.
- Signed-out browsing (the web's anonymous routes: public profiles, cards, binders, the map
  without an account) is not mirrored: every screen needs a signed-in collector, and a link
  opened while signed out reopens after signing in.
- Device push notifications (preferences are saved; Expo / FCM push tokens need an EAS project
  and a real FCM sender, so notifications arrive in the app and over the realtime channel only).
- Sora / Inter fonts (system font until `expo-font` loading is added).
- EAS: `extra.eas.projectId` stays a placeholder; no EAS build is used (local and free only).
