# OrenjiTrade mobile (`apps/mobile`)

React Native app built with **Expo SDK 57**, **expo-router** and strict TypeScript. Six tabs today,
as decided in `CLAUDE.md`: **Map | Inventory | Search | Messages | Wishlist | Profile**. The phone
redesign the owner approved on 2026-10-14 (stages R1 to R8,
`docs/product/specs/2026-10-14-phone-redesign.md`) changes them to five (Home, Search, Inventory,
Messages, Profile) and takes offers, trades, payment protection and disputes off the phone. **Stage
R1 is built** ("Offers out, shipping wording, look"; ADR 0018 "Deals happen in the chat"): the
offer, trade, protected-payment, payout and dispute screens are gone (the API keeps them for the
paused web), every chat opens with a shipping safety tip, ratings no longer ask about meetups, the
app opens in the dark theme on a new install and draws its text in Sora, Inter and JetBrains Mono.
**Stage R2 is built** ("Inventory and adding cards", mockup screens 1 to 9, contract
`docs/api/contracts/r2-inventory-phone.md`): the Inventory draws its own header (title, bell, "Add
cards"), "Cards {n} | Binders {n}", "Search your cards" with the filter sheet (Recently added /
Name / Price, game, binder, who can see it, "Show {n} cards"), rows of only the picture, name,
code, the asking price as typed and the copies; "Add cards" opens the search first (cards and
exact printings while typing), the deck and Collectr imports and the camera "Coming later";
"Choose the printing"; the card form (copies, asking price as text, Private | Public, binder,
public note, up to 4 photos uploaded after the card); Edit card ("No changes yet" until a change,
a save confirms the card, photos saved with the button, "1 photo wasn't saved. Try again.");
deleting asks in a sheet and "Undo" restores the card within 10 minutes. Condition, language,
edition, finish, "Available for", "Accepts offers", currency, "Temporarily public" and private
notes are gone from the phone's forms. **Stage R3 is built** ("Binders and deck cores", mockup
screens 16 to 18 and Inventory › Binders, contract `docs/api/contracts/r3-binders-deck-cores.md`):
Inventory › Binders lists the deck cores first (photo, "{n} photos · Public", the purple tag "Deck
core · {price}"), then the binders (a fan of three cards, "{n} cards · Public" or "· Private"), with
"New binder", the tip "Selling a whole deck?" and "Reorder"; a row opens Edit binder (also New
binder: name, Private | Public, the "Sell as a deck core" card with up to 4 photos, the asking price
as typed and the public note, "Key cards · optional" or "Cards inside" with cards picked from the
inventory, "Save changes" disabled until a change, "Delete binder" asked in a sheet); the deck core
page (photo pager, tag, game, name and price, the seller row, the note, key card chips, "Message
{handle}"); the plain public binder restyled. A public deck core shows every card in it as a key
card; the cards keep the visibility their collector gave them (none is made public to join a core). Stages R4 to R8 are not built: the rest of this
README describes the app as it is (six tabs until R5).

Since the owner's order of 2026-10-12 the phone is the client of new work and the web app is
paused. Of the owner's change of 2026-10-08, stages S3 (the printing picker with holder counts on
the card screen, "Who wants it", "Wanted by N", a server-side search history) and S4 (photos in
community posts) are **not built** (skipped by the owner on 2026-10-13); the recent searches of the
Search tab are kept on the device only (stage M2).

Read the root `CLAUDE.md`, `IMPLEMENTATION_STATUS.md` (mobile rows) and
`docs/architecture/adr/0006-angular-web-react-native-mobile.md` first. Privacy (ADR 0017, which
superseded ADR 0004) and the card image rules (ADR 0015) apply to the app exactly as to the web.

## Status

Phase 1 (accounts) is implemented and verified on the web build (Playwright), on Android
(Expo Go on a local emulator, Maestro) and, since 2026-10-10, on iOS (Expo Go on the iOS
simulator, the same Maestro flows): sign-up with the versioned legal documents, email
verification, sign-in, password reset, session restore, sign-out, consent and account-state
screens (suspended, deletion pending with cancel and export), the three-step onboarding, the
Profile tab with a public preview, and Settings (profile, location and discoverability, privacy,
notifications, account with data export and deletion, appearance, legal).

Phases 2 and 3 (stage M2) are implemented on the same API as the web: the **Search** tab (card
catalog across games, live typo-tolerant search, game / set / rarity / language / edition filters,
infinite results, recent searches), the **card detail** (`cards/[id]`: picture with the provider
credit, attributes, printings and market prices, "Add to inventory", "Who has this in my region"
opens the card holders), the **Inventory** tab (stage R2: cards with search, the filter sheet,
totals, stale or hidden cards with "Confirm all", paused listings with "Resume"; binders), adding
cards (`items/new`: Add cards → search → printing → details), Edit card and deleting one with
"Undo" (`items/[id]`),
and **binders** (stage R3: Inventory › Binders; `binders/new` and `binders/edit` are New binder and
Edit binder, with "Sell as a deck core"; `binders/[id]` opens Edit binder for the owner and, for
anyone else or with `?view=public`, the deck core page or the public binder page). The publication
for 1 h / 24 h of the paused web is not offered any more (Private | Public, as for cards). Usage limits (`binders.max`, binder views per day; the same for every
collector since stage F1) are explained where they happen.

Phase 4 (stage M3, reworked by stage S1 / ADR 0017 on 2026-10-08 and by stage M9 on 2026-10-12):
there are no positions or distances any more. The app browses one **platform region**, chosen with
the **region switcher** (the Map and Search tabs, the card holders' header): the collector's own
region by default, and a line says "Not your region" in any other one. The **Map** tab is the
**region map**: the states and provinces of the browsed region, drawn on the device from borders
the app ships and shaded by their number of public binders, and the same places as a list with
their counts; a state or province opens its public binders (`regions/[region]/[code]`). "Who has
this in my region" lists the card holders of the browsed region; the **collector profile**
(`collectors/[id]`) shows the state or province and, when its owner shows it, the city, with
ratings and references, public binders and cards. "Message" opens or starts the conversation
(`POST /conversations`) in a thread (`messages/[id]`).

Phases 5 and 6 (stage M4) are implemented on the same API and realtime channel as the web: a
**realtime** STOMP 1.2 client over the app's WebSocket (`/ws`; live while a ready account is
signed in, paused in the background, reconnecting with backoff), the **Messages** tab (Inbox |
Community: the inbox with unread counts and previews, the full conversation with card / binder /
photos, read markers, typing, "Seen", mute / archive / block; old offer links and offer or trade
updates read "Offer (no longer available)" since stage R1, in the chat and in the inbox; the public community
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
(`report`: the API's reasons, details, a confirmation; from profiles, conversations, community
posts and public binders; the map preview of stage M3 is gone since S1) and **My reports** (`settings/reports`, the
status only); **ratings and references** (`ratings/rate`, `ratings/reference`: overall and three
criteria (communication, card condition, shipping; "meetup reliability" left with stage R1) after
an eligible interaction, edits for 14 days, one reference per collector, from profiles and
conversations). Stage M5 also built **offers** and **trades**; stage R1 of the phone redesign
deleted them (ADR 0018: deals happen in the chat): their screens, Settings → Offers and the
Profile tab's rows are gone, an old offer or trade notification opens nothing and says so, and a
link to `offers/…`, `trades/…` or `disputes/…` lands on Messages. Admin and moderator consoles
stay on the web.

Phases 9 and 10 (stage M6) were implemented on the same API and the same local **fake providers**
as the web (no card, no money; each checkout was a screen of the app with a "Local test payment"
banner). Stage M6 built payment protection, disputes and Settings → Payouts; stage R1 deleted them
with offers and trades (ADR 0018: payment stays outside the app, no protection is claimed). Stage
M6 also brought Premium, credits, "Support OrenjiTrade" donations and "Sponsored" placements;
stage F1 removed them on 2026-10-14 (ADR 0019: the app is free for all, and the code is kept on the
branch `archive/paid-features`). Since both, the phone has no checkout, sells nothing and takes no
payment; a link to any of those screens lands on a screen that exists, with a note
(`src/navigation/removedRoutes.ts`). The phone never says "payment protection" or "escrow".

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
language; the UI around the texts stays English), the **safety tip** at the start of every chat
(stage R1 replaced the dismissible "Trade safely" notice of M8: a shield and one line for the
deal's side, buying, selling or a chat without a card, the last one until chats get a pinned card
in R4; it opens the "Trading safely" page; Report and Block stay in the conversation menu),
**Block / Unblock on the collector profile** next to Report, and the **money-off follow-ups**
(neutral limit wording; since stage F1 no limit message offers anything to buy and the limit
notification never opens a removed screen). Nothing here claims legal compliance:
the legal texts stay drafts (banner kept).

Stage S5 (2026-10-13) adds the **inventory import** (`items/import`, "Import a deck" and "Import
from Collectr" on Add cards since stage R2, which open it on that source; the phone is its only client, a web screen is a recorded follow-up): a Yu-Gi-Oh! **deck file
(.ydk)** or a **Collectr CSV export**, chosen with the system file picker or pasted as text, is
uploaded and becomes a **preview** the API keeps for an hour. Nothing reaches the inventory before
the collector confirms. The preview says on top how many new cards the import adds, how many go
into cards already owned, how many lines still need a printing and how many were not recognised;
a deck shows its three sections as switches with their card counts; the lines are a long list
loaded page by page (the card with its picture, the copy or "Choose printing", the condition, the
copies, in or out) with a filter for "needs a printing" and "not recognised". "Which copy" lists
the card's printings as the card page does, the ones that fit a CSV row first. Two actions work
on many lines at once: "Use the most recent printing for all unchosen rows" and one condition for
the cards whose file names none. The commit button says what it adds; while lines need a printing
it is disabled and says why, unless the collector ticks "Leave out the N cards that still need a
printing". The result says what was added, what was merged and what was left out, and leads to
the inventory, where the new cards are Private. An import left open is offered again ("Continue
your import"), one that expired says so, leaving asks first, and a commit sent twice adds nothing
twice. OrenjiTrade never calls Collectr and never reads its prices.

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

On a Mac with Xcode and an iOS runtime, the iOS simulator needs nothing else (no Android SDK, no
CocoaPods, no native build):

```bash
npm run infra:up && npm run api:dev     # terminal 1, repository root: the local stack and the API on :8080
npm run ios -w apps/mobile              # terminal 2: = cd apps/mobile && npx expo start --ios
```

Expo CLI boots a simulator when none is booted (or uses the first booted one), installs the
matching Expo Go on it and opens the app, which reaches the API at `localhost:8080`. DeviceHub
(`open -a DeviceHub`; Simulator on Xcode 26) shows the device. The native test suite never uses
that simulator: it has its own (see [Native flows](#native-flows-maestro-on-the-android-emulator-or-the-ios-simulator)).

Never run `npm install` inside this folder: the root `package-lock.json` is the only lockfile, and
dependencies are added with `npx expo install <pkg>` (SDK-compatible, pinned). Every script below
also works from the root as `npm run <script> -w apps/mobile`.

The npm workspace also holds the Angular app, whose toolchain uses Babel 8. The root
`package.json` pins `@babel/generator` and `@babel/traverse` 7.x so Babel 7 is hoisted: the
react-native-worklets Babel plugin needs it, and without it every native bundle fails with
`[Worklets] Babel plugin exception` (guarded by `__tests__/config/babel-toolchain.test.ts` and the
`expo export --platform android` step of the CI mobile job).

## The card scan's development build (simulator)

The card scan reads text on the phone through the local Expo module `OrenjiTextReader`
(`modules/orenji-text-reader`: Apple Vision on iOS, ML Kit's bundled model on Android), which Expo
Go does not hold. Expo Go, the web export and jest run without it (the scan is then unavailable);
reading cards needs a local development build. The scan's own app installs beside every other
app: `ORENJI_APP_VARIANT=scan` gives it the bundle id `com.orenjitrade.app.scan` and the name
"OrenjiTrade Scan" (app.config.ts); without the variable nothing changes. Free and local: no EAS,
no Apple account, no signing for the simulator. Builds for a phone belong to the phone-install
task (its signing flag will sit next to the variant).

Once per Mac: Xcode with an iOS runtime, and CocoaPods (`brew install cocoapods`; `pod` needs a
UTF-8 locale). The commands below use the card scan's isolated stack: an API on `:8470` (database
`orenjitrade_card_scan`, Redis db 9, its own card-image cache and media folders, environment as in
`scripts/lib/web-e2e-guard.mjs`), Metro on `:8084`, and the simulator kept booted for this work
(never boot, erase or shut one down from here). `ios/` and `android/` are generated and git-ignored.

```bash
cd apps/mobile
ORENJI_APP_VARIANT=scan npx expo prebuild --platform ios --clean --no-install
git checkout -- package.json          # prebuild rewrites the "ios" and "android" scripts
cd ios && LANG=en_US.UTF-8 pod install
xcodebuild -workspace OrenjiTradeScan.xcworkspace -scheme OrenjiTradeScan -configuration Debug \
  -sdk iphonesimulator -destination 'id=<udid>' \
  -derivedDataPath <scratch>/DerivedData RCT_METRO_PORT=8084 build
xcrun simctl install <udid> <scratch>/DerivedData/Build/Products/Debug-iphonesimulator/OrenjiTradeScan.app

cd ..                                 # apps/mobile: Metro of the debug build, pointed at the API on :8470
EXPO_PUBLIC_API_BASE_URL=http://localhost:8470 npx expo start --port 8084
xcrun simctl launch <udid> com.orenjitrade.app.scan
```

- `-destination 'id=<udid>'` builds for that simulator only (its own architecture, arm64 on Apple
  silicon); `generic/platform=iOS Simulator` would compile x86_64 too.
- `RCT_METRO_PORT=8084` makes the debug build load its JavaScript from that Metro; the Auth
  emulator stays the default `localhost:9099`. Sign in with a seed account
  (`docs/development/test-accounts.md`). On a fresh database the seed accounts have not confirmed
  being 18+ yet (they predate the rule): the first sign-in stops at the onboarding "Age" step;
  tick the box and continue, once per account and database.
- iOS 27 stops an app built with Xcode 27 at launch unless it adopts the scene life cycle; Expo SDK
  57's native template does not, so the variant applies `plugins/withIosSceneLifecycle.js` (Expo's
  `ExpoAppSceneDelegate`, as SDK 58's template does). Builds without the variant are unchanged.
- Library photos for the scan: `xcrun simctl addmedia <udid> <photos>` (it changes that simulator's
  Photos: ask the owner first). Fictional card faces only; no photo is ever committed.
- The areas of the card the scan reads are set in one place, `src/features/scan/cardAreas.ts`.
  The camera-path times measured on the simulator hold for a card exactly under the frame; a card
  slightly off it misses the set code area and costs a whole-photo read (`AREA_MARGIN`, to tune
  with real cards).
- For the phone-install task: the scan app keeps the owner app's URL scheme (`orenjitrade`), its
  associated domains and its Google sign-in redirect (`src/auth/googleNative.ts` names
  `com.orenjitrade.app`). With both apps on one phone, `orenjitrade://` links may open either, and
  Google sign-in from the scan app returns to the owner's app: give the variant its own scheme
  (`orenjitrade-scan`) and derive the redirect id from the variant, or sign in to the scan app by
  email only. On the simulator it does not matter.
- Android (`ORENJI_APP_VARIANT=scan npx expo prebuild --platform android`, then Gradle): written,
  but it could not be verified on this Mac (no Android SDK); the owner tries it on an Android
  phone.

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
  (tabs)/index.tsx         the Map tab: the region map and its list of states and provinces
                           (`/?region=&subdivision=` opens it on a region and a state; ADR 0017)
  regions/[region]/[code]  the public binders of one state or province
  collectors/[id].tsx      public profile (also the "Public preview" of the own profile)
  (tabs)/messages.tsx      Inbox | Community (`?view=community`), realtime status
  messages/[id].tsx        a conversation (thread, links, photos, receipts, mute / archive / block)
  community/[slug].tsx     a public channel (posts, replies, own edits)
  (tabs)/wishlist.tsx      wishes; wishlist/new (`?cardId=&printingId=&rarity=`), edit (`?id=`)
  notifications.tsx        the notification centre (the bell in every tab header opens it)
  report.tsx               "Report collector" (`?userId=&name=&handle=&source=` + context id)
  ratings/                 rate (`?userId=&handle=&name=`, `&kind=`, `&rating=` to edit),
                           reference (one per collector)
  settings/reports.tsx     My reports
  +not-found.tsx           unknown links; a link to a screen that left the phone lands on a
                           screen that exists with a note (src/navigation/removedRoutes.ts):
                           offers, trades, disputes, the payment checkout, offer and payout
                           settings (stage R1) on Messages or Settings; Premium, credits, support
                           and their checkouts (stage F1) on the Profile tab
  cards/[id].tsx           card detail (`?printing=<id>` selects a printing, `?rarity=` any printing of
                           it, `?printing=any` any printing: neither picks one)
  items/new.tsx, [id].tsx  add a card (search -> printing -> details), edit / delete a card
  items/import.tsx         import cards from a deck file or a CSV export (stage S5): source ->
                           file or pasted text -> preview -> result
  binders/                 [id] (Edit binder for the owner, else the deck core page or the public
                           binder; `?view=public`), new, edit (`?id=`): stage R3
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
  features/safety/         the chat safety tip (ChatSafetyTip) and its wording per side
                           (chatSafetyTips: buying, selling, none; dealSideOf for stage R4)
  features/reports/, features/ratings/   their rules and routes
  features/limits/         LimitReachedNotice (the same limits for everyone, nothing to buy)
  realtime/                STOMP 1.2 codec + connection, RealtimeClient, RealtimeProvider
                           (AppState / NetInfo), RealtimeCacheSync (pushes -> query caches)
  lib/                     pure helpers (places and region names, card picture URLs, dates, ...)
  theme/                   tokens.ts (generated from packages/design-tokens), palette, ThemeProvider
                           (a new install starts in dark; Settings → Appearance: System / Light /
                           Dark; on iOS the keyboard, alerts and pickers follow the chosen theme,
                           and the splash is dark), fonts.ts + useAppFonts.ts (Sora, Inter,
                           JetBrains Mono, loaded before the first screen;
                           components/ui/Text.tsx maps family + weight to the loaded face, so
                           every screen imports Text and TextInput from there: lint refuses
                           React Native's own in app/ and src/)
```

Conventions later stages reuse:

- **API**: only through `src/api/client.ts` (`api.GET('/api/v1/...')`, types from
  `@orenji/shared-types`); never hand-written DTOs. Regenerate with `npm run generate:api` at the
  root when `docs/api/openapi.json` changes.
- **Queries**: keys in `src/api/queryKeys.ts` (everything of the signed-in collector under
  `['me', uid, ...]`, dropped on sign-out); `networkMode: 'offlineFirst'`, cached data kept a day,
  4xx never retried; a read (`GET`, `HEAD`) is given up after 20 seconds without an answer
  (`withReadTimeout` in `src/api/client.ts`) and is not tried again by itself, so a screen shows
  "No answer from OrenjiTrade" with "Try again" instead of a skeleton for minutes (writes are
  left alone); mutations invalidate the narrowest key they change. Screens render
  `QueryState` (skeleton, empty, error with retry) and the root `OfflineBanner` covers offline use.
- **Lists**: paged endpoints use `useInfiniteQuery` (`nextPage`) in a `FlatList` with
  `ListFooter` (spinner / retry), pull to refresh and `keepPreviousData` while filters change
  (region-scoped lists keep the previous results within one region only: `previousOfSameRegion`
  in `src/api/hooks/search.ts`). A list with a text field in its head keeps its `RefreshControl`
  whatever it shows: React Native builds a list's content again when that control is added or
  removed, and the field would lose the keyboard.
  Writes refresh the narrowest keys: every inventory or binder write invalidates
  `['me', uid, 'inventory']` and `['me', uid, 'binders']` (counts and freshness change everywhere),
  never refetching what was just deleted.
- **Forms**: `TextField`, `PasswordField`, `Checkbox`, `SwitchRow`, `RadioGroup`, `Stepper`,
  `ChoiceChips` (a few values as radio chips) and `SelectSheet` (a field opening a bottom sheet of
  options) with inline errors and accessibility state; server field errors map through
  `src/api/errorMessages.ts`; `429 LIMIT_REACHED` is explained in place (`LimitReachedNotice`,
  `src/lib/limits.ts`: what is counted, used / allowed, when it resets; the same limits for
  everyone, nothing to buy).
- **Inventory vocabulary** (`src/lib/inventory.ts`, the web's `inventory-labels`): the trade / sell
  intents are the API's `availability` (trade or sale, trade, sale, collection only, not available)
  plus the separate "accepts offers" flag; wanting a card is a wishlist entry. Visibility is
  private / public / temporarily public (1 h to 30 days); `visibilityStatus.ts` explains why
  something set to public is not visible yet (binder private, hidden until confirmed, owner hidden).
- **Inventory import** (stage S5, `src/features/inventory/import/`, hooks in
  `src/api/hooks/inventoryImport.ts`, contract `docs/api/contracts/s5-inventory-import.md`):
  - **The upload** is one multipart part `file` whatever the collector did. A picked file is the
    local file it is (`localFilePart`: on iOS an `expo-file-system` `File`, what Expo's fetch
    reads). A pasted text takes the same road: it is written to a file of the cache directory,
    sent as that file and deleted once the upload answered (`importFile.ts`; the web build sends a
    Blob, `importFile.web.ts`). **Nothing of a file stays on the device**: the system picker
    hands the app a copy of the chosen file in `<caches>/DocumentPicker` and never removes it, so
    `discardUpload` deletes that copy after the upload, after a refusal before sending, on "Keep
    it" and when the screen is left (and only ever a file of that folder). The file picker is `expo-document-picker` and offers every file
    (`*/*`): a `.ydk` has no registered type and a CSV is reported under several, so a filter
    would grey out the very file the collector looks for; the API decides from the content. A file
    larger than the admin limit (`GET /inventory/imports/limits`) is refused before any upload;
    the API checks again whatever the app did. The wait is shown as an indeterminate progress line
    (the typed client has no byte progress, and a file is at most 2 MB).
  - **Refusals** are worded by `importRefusal` (`importLabels.ts`) from the problem's `reason`,
    `fileLimit` and `missingColumns`: too large, too many lines or rows, not a text file, the
    column that could not be found (named), an empty file, too many imports in a short time.
  - **The preview** (`ImportPreview.tsx`) is a `FlatList` over `useImportRows` (pages of 50, one
    list per filter). Every edit is sent as it is made and answers with the new counts; edits of
    one preview run one after the other (a mutation `scope`), so the last answer is the last edit.
    **The commit is in that queue too** (`useCommitImport`), and the button waits while an edit is
    on its way (`useImportEditsPending`, "Saving your changes…"): on a slow connection a commit
    pressed right after unticking a card would otherwise reach the API first, and the card shown
    as left out would be imported. The filter is pinned above the list (its text size capped like
    the commit bar) and brings the first line of its list up; the counts "need a printing" and
    "not recognised" are buttons that set it. The limit is read from `GET /me/limits` and said
    on top before any commit (`limitRoomText`).
    **The lines whose copy was assumed stay in reach** (review fix 2): "Use the most recent
    printing" says once, in a snackbar, how many lines got the plain copy. While
    `summary.assumedPrintings` is above zero a card above the lines counts them ("Plain copy
    assumed for 115 lines", `assumedCopiesText`) and its button lists them; the pinned filter gets
    the chip "115 assumed" (the filter `MOST_RECENT_ASSUMED`, sent as `printingChoice`; a screen
    reader hears "115 assumed: the lines whose plain copy was assumed",
    `ChoiceOption.accessibilityLabel`, which starts with the words on screen so that Voice Control
    reaches the chip by them; a deck says "cards"). It is the third
    chip of the row and is cut at the screen's edge: its count leads so that the count is the part
    in view. The chips stand in the order of what they ask (All, Needs a printing, the assumed
    copies, Not recognised), and the row brings the chosen chip whole on screen when
    something else than a press on it chose it (`ChoiceChips revealSelected`). Picking the plain
    copy again in "Which copy" confirms it: the line leaves that list and the count.
    **The commit button shows a label that fits one line** (`commitState().shortLabel`: "Add 434
    cards (1,266 copies)", "Add 434 cards, leave 12 out"); the whole sentence is its accessible
    name, which the tests and the flows read, and it always starts with the words on screen ("…
    to my inventory", "Add 434 cards, leave 12 out (1,266 copies added)"; WCAG 2.5.3, label in
    name).
    Leaving a line out shows at once and is put back if the API refuses. A row that changes its
    status, or whose assumed copy was confirmed or changed, reads the filtered lists again (a row
    that got its printing leaves "needs a printing", and the next page would otherwise skip a
    row); an action on the whole preview keeps the first page only and reads it again. The rows are not read again just because the app came back to
    the foreground.
  - **Which copy** is the card's printings (`GET /cards/{id}`) in `PrintingList`, the list of the
    card page and of "Add a card", in a bottom sheet; a pick is saved at once. The condition and
    the copies are a form dialog (its fields stay above the keyboard).
  - **The commit** is `POST .../commit`, with `skipUnresolved` only when the collector ticked
    "Leave out the N cards that still need a printing". When the answer is lost the import is read
    again: a commit that went through shows its result, one that did not can be pressed again, and
    the API adds nothing twice. A commit that was cut between two parts (`COMMITTING`) shows
    "Finish the import". `LIMIT_REACHED` (`inventory.items.max`) shows the app's limit notice (nothing
    to buy).
  - **Leaving**: an open preview or a pasted text holds the screen (`useLeaveGuard`, React
    Navigation's `usePreventRemove`): the back button, the back gesture and Android's back key ask
    "Leave this import?" first. Leaving loses nothing of a preview: the start screen offers it
    again until it expires. Discarding it, or replacing it by a new file, asks before the choices
    are thrown away. (The web build does not hold the browser's own Back button; the header's
    button asks.)
  - **Large text**: the commit bar stays on screen under the list, so its text follows the system
    size only a little (`PINNED_MAX_FONT_SCALE`), like the "Import" and "Select" buttons of the
    Inventory tab; from a text scale of 1.4 a line puts its name and controls under the picture,
    across the width, and the counts stand one per line.
- **Card pictures**: `CardImage` (expo-image) renders only API picture URLs
  (`/api/v1/public/card-images/{id}`, placeholders) with the provider credit line of the web;
  anything else (for example a YGOPRODeck URL) shows the placeholder.
- **Places (ADR 0017)**: the app handles no coordinates, distances or GPS. Collectors declare a
  region, country, state or province and an optional city (`src/features/location/`:
  `LocationFields` with SelectSheet pickers fed by `GET /regions` through `useRegions`,
  `locationDraft.ts` for the draft rules), in onboarding ("Where are you?") and Settings →
  Location (`PUT` / `DELETE /me/location`). Others see a collector's state or province
  (`src/lib/place.ts`); a profile adds the city only when the API sends it (its owner shows it).
  `expo-location` is not installed and no location permission is requested; there is no map SDK
  either (`react-native-maps`, `react-native-webview` and `leaflet` left the app in stage M9). The
  jest suite scans `src/` and `app/` for coordinate identifiers and location modules
  (`__tests__/privacy/coordinateLiterals.test.ts`), checks every answer and request of the place
  screens (`__tests__/privacy/placePrivacy.test.tsx`) and keeps "near" / "nearby" wording out of
  the app (`__tests__/privacy/regionWording.test.ts`).
- **The browsed region (stage M9)**: `src/features/regions/browsingRegion.ts` (`useBrowsingRegion`)
  is the one place that says which platform region the app browses, and every region-scoped call
  sends it explicitly (`/search`, `/search/card-holders`, the two region-map endpoints);
  the server stays the judge of what a region holds. In this order: the region picked with the
  switcher or opened by a link in this session; the collector's home region (`homeRegion` of
  `GET /me`); the last region picked on this device (AsyncStorage key
  `orenjitrade.browsing-region.v1`, read and written in try / catch: a region code, never a
  place); Americas (North). A pick belongs to the account and home region it was made under, so
  another account, or a location saved in another region, starts from its own region. Only a
  region that exists is browsed or kept (`useKnownRegions`): the three regions the app ships
  until `GET /regions` was read in the session, then what that list holds; a code from a link or
  from the device that the server does not list is not followed, and is removed from the device
  once the list says so.
  `RegionBar` is the switcher (a `SelectSheet` bottom sheet with the three regions, "Your region"
  on the collector's own): a pill on top of the Map and Search tabs, a round button in the card
  holders' header. On the Search tab the pill and the segments are all that stays on screen above
  the list (`pinned`): they follow the system text size only a little (`PINNED_MAX_FONT_SCALE`,
  like the tab bar; a long press shows them enlarged on iOS), and the field, the game pills, the
  filters and every state of the results are one list that scrolls under them, so the field and
  the results stay within reach at the largest text sizes; pressing the Search tab again brings
  the list back to its top, where the field is (`useScrollToTop` in each segment's list). In another region than one's own the switcher takes the accent colour, a line
  says "Not your region." and "Back to <region>" goes home in one press; copy names the region
  instead of "your region" (`regionPhrase`).
- **Map tab (stage M9)**: `app/(tabs)/index.tsx` shows the browsed region as **Map | List**
  (`src/features/map/`). `RegionMap` draws the region with `react-native-svg` from a file of the
  app: one path for every state and province, one for the country borders, one per state that has
  binders (five shades, the web's steps, outlined in a strong colour) and one for the state opened
  last; a place with binders that is only a few points wide at the current zoom also gets a dot,
  tinted like the place itself (the legend's step of its count, over the land's colour).
  A tap opens a state (hit-tested in JS on the drawing, a dot first, with ten points of reach for
  small ones); holding a place names it first (its name, its number of public binders, "Open").
  While the whole region is on screen a finger dragged over the map scrolls the page; once zoomed
  in (a pinch or the buttons, up to 16x) it moves the map and the page stands still. During a
  gesture the drawn picture is only slid and scaled, and the vectors are drawn again once when
  the fingers lift. The map takes the height the page has left under the switcher, the title and
  the Map | List switch (`mapFrameHeight`: 240 to 520 points), so its buttons are on screen
  without scrolling. `PlaceList` is the same
  region as a list grouped by country, each row a link named "Quebec, 2 public binders", with a
  filter field and "Only places with binders"; the tab opens on the list while VoiceOver or
  TalkBack is on, and remembers the view chosen. Both open `regions/[region]/[code]`: the public
  binders of that place (name, kind, cards, owner by name and handle, the owner's state or
  province and country and never a city, last update), read by cursor
  (`GET /regions/{region}/subdivisions/{code}/binders`), with a skeleton, an empty state and an
  error state with retry. Counts come from `GET /regions/{region}/binder-counts`. A link
  (`/?region=&subdivision=`) is used up once followed, so the same link works every time, and a
  link to a region that does not exist changes nothing. Another region starts at the top of its
  list, and pressing the Map tab again scrolls back up. A collector without a location still gets
  "Where are you?", compact and dismissible for the visit. Discoverability defaults to off.
- **Boundaries (stage M9)**: `npm run sync:boundaries` (`scripts/sync-boundaries.mjs`,
  `scripts/lib/boundaryOutlines.js`) makes `assets/boundaries/<region>.json` from the web app's
  boundary files (`apps/web-angular/public/boundaries`, Natural Earth 5.1.1, public domain; see
  `docs/development/regions-boundaries.md`), which are neither moved nor edited. The mobile copies
  are already projected (Web Mercator, as the web's map) into whole drawing units and written as
  SVG path data: the app holds no degrees, and the files weigh 104 / 62 / 139 kB instead of 241 /
  145 / 316 kB. `--check` and `__tests__/features/regionOutlines.test.ts` fail when a copy drifts
  from its web file. Native bundles carry the three files and build a region's drawing the first
  time it is shown (`outlineFiles.ts`, a `require` inside a function); the web export puts each
  in its own chunk, downloaded when that region is shown (`outlineFiles.web.ts`). Nothing about
  geography is ever asked from a server.
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
  where they happen. Every chat starts with the safety tip of its side (`ChatSafetyTip`,
  `src/features/safety/chatSafetyTips.ts`: buying, selling, or a chat without a card, which every
  chat reads until stage R4 pins a card; it opens "Trading safely"). An old offer (an OFFER_LINK,
  or a SYSTEM message the API posted on an offer or trade update) reads as one grey line, "Offer
  (no longer available)" (`OfferUnavailableLine`; the text sent with an offer link stays in its
  bubble), and so does the inbox line of a chat whose last message is one (`listPreview`).
- **No offers, trades, protected payments or disputes on the phone** (ADR 0018, "Deals happen
  in the chat"; the API keeps them for the paused web): an old offer, trade, payment or dispute
  notification opens nothing and says where deals happen (`DEALS_IN_CHAT_NOTE`, the
  `{ kind: 'note' }` target of `notificationKinds.ts`); a link to a removed screen
  (`orenjitrade://offers/…`, `trades/…`, `disputes/…`, `checkout/fake/…`, `settings/offers`,
  `settings/payouts`) lands on Messages or Settings with that note (`removedRouteTarget`,
  `src/navigation/removedRoutes.ts`, through the not-found screen); the notification settings no
  longer list the OFFER and TRADE categories (their stored values are sent back unchanged).
- **Usage limits** (`src/api/hooks/limits.ts` with `GET /me/limits`, `src/lib/limits.ts`,
  `src/features/limits/LimitReachedNotice.tsx`): the same limits for every collector (stage F1,
  ADR 0019); a reached limit says which one, how much is used and when it resets, never offers a
  plan. Premium, credits, donations and sponsored placements are gone: an old notification to
  `/premium`, `/credits` or `/support` says "OrenjiTrade is free for every collector now"
  (`FREE_FOR_ALL_NOTE`, a `{ kind: 'note' }` target), and a link to one of them or to their
  checkouts lands on the Profile tab with that note (`removedRouteTarget`, as above).
- **Ratings and reports** (`src/features/collectors/ratingLabels.ts`, `src/features/ratings/`,
  `src/features/reports/`): the rate, reference and report screens take the collector (and the
  report's context or the rating to edit) in their route params (`ratingParams`,
  `reportParams`, validated again when read); eligibility comes from `GET /ratings/eligibility`
  and is never guessed; a report is sent with an `Idempotency-Key` and the reporter only ever
  sees statuses.
- **Notifications** (`src/features/notifications/notificationKinds.ts`, the web's
  `notification-kinds.ts`): an icon / tone / label per type, and the web path of a notification
  (`data.deepLink` when it is a safe same-app path, else rebuilt from its ids) mapped to an app
  screen (`mobileTarget`: My reports and `?tab=ratings` included), or a note: for the settings that
  stay on the web; since stage R1, for offers, trades, disputes and the offer and payout settings,
  which say that deals happen in the chat (ADR 0018); since stage F1, for the removed Premium,
  credits and support pages, which say that the app is free (ADR 0019).
- **Sessions**: a 401 on a request that carried a token while signed in means the session ended:
  `src/api/client.ts` reports it, the session signs out and the gate shows the sign-in screen with
  "Your session has ended". A link opened while signed out is kept (`src/account/pendingLink.ts`)
  and reopened after signing in.
- **Testing hooks**: screens carry `testID="screen-<name>"`, tab buttons `tab-<route>`. Keep
  controls off the top-right corner just below the header: Expo Go on Android floats its tools
  button there and a Maestro tap would open the developer menu instead. (On iOS, Expo Go floats
  it over the right end of the header itself; the flows switch it off, see
  `.maestro/subflows/hide-tools-button.yaml`.)

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
| `npm run sync:boundaries`               | make `assets/boundaries/` from the web's boundary files   |
| `npm run doctor`                        | `expo-doctor`                                             |

## Tests

| Command (repository root)     | What runs                                                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:mobile`         | typecheck, lint, Jest (unit + screen tests in `__tests__/`, every screen with loading / empty / error / validation states) and the E2E harness guard tests (`node --test scripts/lib/mobile-e2e-guard.test.mjs`; `npm run test:scripts` runs every `scripts/lib` test) |
| `npm run test:mobile:e2e`     | Playwright (`apps/mobile/e2e`) driving the Expo **web** build against a real, isolated stack                                                                                                                                                                           |
| `npm run test:mobile:maestro` | Maestro flows (`apps/mobile/.maestro`) in Expo Go on a running Android emulator or on the iOS simulator (`-- --platform android\|ios`; a Mac without an Android device runs them on iOS)                                                                               |

A Jest test file that ends with a real timer of 5 s or more still armed fails (`jest.setup.ts`),
and is told where the timer was armed: such a timer keeps its worker alive, and Jest then prints
"A worker process has failed to exit gracefully" without naming the file. The usual cause is a
mocked request that never answers, behind which the read timeout of the API client (20 s) stays
armed: hold the answer back and give it before the test ends, or use fake timers.

### Isolation of the end-to-end suites

Both end-to-end suites use their own stack and never touch a developer's: the database
`orenjitrade_mobile_e2e` (dropped and recreated per run, migrated and seeded by the API), an API
jar on **:8090** (profile `local`, Redis database 1 (flushed with the database) with its own realtime channels
`e2e-mobile:rt:user:*`, media, card-image cache and provider snapshots under
`.local-dev/mobile-e2e/`, mock catalog only: YGOPRODeck disabled and pointed at a closed local port,
no image downloads; plus, since stage S5, the three fictional deck passcodes of
`SEED_IMPORT_FIXTURES` (910000001 to 910000003, `ImportFixtureSeedContributor`), which only this
isolated database gets: a deck file is matched through the provider `ygoprodeck`, and a
developer's database, which can import the real catalog, never receives an invented passcode),
the shared Auth emulator, and the web build on **:19006** (Playwright) or
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
settings), `catalog.spec.ts` (the field back on screen when the Search tab is pressed again down
the list; search -> game and language filters -> card detail -> printings, every
picture an API URL; printing-code match, an unknown card), `inventory.spec.ts` (stage R2: add a
card with a text price and a photo through Add cards -> typing -> Choose the printing -> Add to
inventory, "Saved", Edit card ("No changes yet", a save sends only the change and `confirm`),
delete after the sheet and Undo; add from a card page, the filter sheet's price sort, game and
"Show {n} cards", Clear all), `binders.spec.ts`
(create a binder -> add a card -> publish for 24 hours -> make private -> remove the card -> rename
-> delete; the `binders.max` limit; another collector's public binder: public cards and notes
only; the owner's state, never their city), `map.spec.ts` (the Map tab draws the home
region from the app's own files: every request goes to the app's origin or the isolated API; the
invitation for a collector without a location, a profile with the state and the shown city,
"Message" opens the conversation and sends), `regions.spec.ts` (stage M9: a state opened from the
map and from the list, its binders with the owner and the state and never the owner's city, a
binder opened, a state without a binder, only the drawing of the region on screen downloaded; the
region switcher re-scopes search (the request names the region) and the map, says "Not your
region" and goes home in one press, and no sponsored placement is asked for any more (stage
F1); a link opens the tab on a region and a state, and a new visit starts in the home region; the
same link opened twice, a link to a region that does not exist and a code an
older install kept on the device, which is neither browsed nor kept; the list back at its top
when the Map tab is pressed again and when the region changes), `messages.spec.ts` (a second
collector writes over the API: the inbox badge, the thread, live delivery, a reply, "Seen", a
photo; a card link, mute and a block both ways), `community.spec.ts` (channels with their
activity, post, edit, reply, delete), `wishlist.spec.ts` (two collectors of Americas (South): a wish
with a public note, Near Mint only, "85% TCG" and one printing, none of the removed fields, then a
listing: one wishlist alert rises live on the bell, names the holder's state only and opens the
card; and a typed printing code shared by a 1st Edition and an Unlimited printing starts the wish
on "Any printing" while a code of one printing preselects it, then the alert for that "Any
printing" wish opens the card screen on "Any printing" with no printing selected), `session.spec.ts` (a signed-out profile link reopens after sign-in; an ended session
leads to sign-in with the notice), `reports.spec.ts` (report a collector from the profile with
the API's reasons -> "Report sent" -> My reports with the status; a second open report refused
(409); a report from a conversation's options), `old-offers.spec.ts` (stage R1: an offer made
and declined through the API leaves two "Offer (no longer available)" lines in the chat, its
notification opens nothing and says that deals happen in the chat, an old `/offers/<id>` link lands
on Messages with that note, and the app never calls the offer routes), `ratings.spec.ts` (stage
R1: after three messages each, "Rate" from the conversation menu; Overall, Communication, Card
condition and Shipping, no meetup reliability; the rating on the API without a meetup score),
`google.spec.ts` (a Google sign-up through the emulator's simulated account: the fake OAuth
credential checked, consent -> onboarding -> tabs, Google as the only sign-in method; the chooser
dismissed; Google with the e-mail of a verified password account signs in to it and links Google,
the password still works; an unverified one is taken over, Firebase's rule), `search-segments.spec.ts`
(collectors by name or handle with their state, the browsed region in the request, a collector
who opted out of name search or lives in another region never appears, recent searches per segment, the profile from a row;
public binders by name with their owner, the public binder from a row), `holders.spec.ts` ("Who has
this in my region" from a card: the request names the region, both copies with prices and the
holder's state, sort by price, accepts offers, a validated price range, availability and condition
filters, "Clear filters", the holder's profile with the city it shows; no "Make an offer" since
stage R1), `collector-wishlist.spec.ts` ("Looking for" on
a profile with the condition only, never the price; nothing for a collector who hides it,
404), `blocked.spec.ts` (block from a conversation -> the blocked profile's Message reason links to
Blocked users -> Unblock, checked on the API and on what the other collector can send),
`item-photos.spec.ts` (a text file refused before any upload, a PNG uploaded and served through the
API's media route, removed; saved with "Save changes" since stage R2), `bulk-actions.spec.ts`
(select two cards -> Make public, select all -> Make private with the skipped one explained, Still
available, Move to binder, delete after the sheet and Undo), `inventory-import.spec.ts` (stage S5: a fictional deck file through the
file chooser, after a picture that is refused as "not a text file": the counts, the sections, a
printing chosen in "Which copy", the most recent printing for the other card, one condition for
all, a section switched off, the condition and copies of a line, a line left out and put back,
the commit, three Private cards on the API, the same commit sent again adding nothing, the cards
in the Inventory tab; a fictional Collectr CSV pasted, after one whose card name column is
missing: the row added to the copies already owned, the row that fits nothing with what the file
said and no price anywhere, the commit raising the owned card to four copies; an import left open
that the header's back button asks about, that is offered again and that is discarded only after
a question), `age-confirmation.spec.ts` (an account from
before the 18+ rule, created with `confirmAge: false`, is asked for the confirmation alone on its
next sign-in, a link opened meanwhile is remembered and reopened after it, the consent checked on
the API; Sign out from the step), `legal-french.spec.ts` (French by default for a `fr-CA` browser,
the EN / FR switch, the choice remembered across a reload, the draft banner and the translation
marking, the "Trading safely" page in both languages, deals by mail since stage R1),
`safety-notice.spec.ts` (stage R1: the safety tip at the start of a chat in the wording of a chat
without a card, the "Trading safely" page from it, the composer never blocked, Report and Block
from the conversation menu, the tip still there after a reload; Block / Unblock on the collector
profile). `offers.spec.ts` and `payments.spec.ts` were deleted with offers and protected payments
(stage R1), `billing.spec.ts` with Premium, credits, donations and ads (stage F1). `auth.spec.ts` ticks the 18+ checkbox at sign-up and on
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

### Native flows (Maestro on the Android emulator or the iOS simulator)

Free and local: an emulator or a simulator, Expo Go and the Maestro CLI; never EAS, never Maestro
Cloud. One set of flows runs on both platforms.

On the owner's Mac (owner order of 2026-10-12) the flows run on the iPhone simulator the owner
keeps booted: export `ORENJI_IOS_SIMULATOR_UDID=<its UDID>` (`xcrun simctl list devices booted`)
before every run, and never boot, create, erase or shut down a simulator (each boot makes the
desktop app ask the owner); `docs/development/claude-handoff.md` has the rest of that agreement.

```bash
# iOS simulator (a Mac with Xcode and an iOS runtime): nothing to start, the harness has its own simulator
npm run test:mobile:maestro -- --platform ios
npm run test:mobile:maestro -- --platform ios apps/mobile/.maestro/sign-in.yaml   # one flow
npm run test:mobile:maestro -- --platform ios --keep-running    # keep API + Metro + simulator (stop: -- --stop)

# Android: start an emulator first and wait until Android has booted
~/Library/Android/sdk/emulator/emulator -avd Pixel_6_API_35 -no-snapshot-save -no-boot-anim &     # macOS
~/Android/Sdk/emulator/emulator -avd Pixel_6_API_35 -no-snapshot-save -no-boot-anim &             # Linux
"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd Pixel_6_API_34 -no-snapshot-save -no-boot-anim   # Windows
adb wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 2; done'
npm run test:mobile:maestro -- --platform android
npm run test:mobile:maestro -- apps/mobile/.maestro/sign-in.yaml        # one flow
npm run test:mobile:maestro -- --keep-running                            # keep API + Metro (stop: -- --stop)
```

- **Platform.** `--platform ios|android` (or `ORENJI_MAESTRO_PLATFORM`). Without a choice: Android
  when an Android device is ready, otherwise the iOS simulator on a Mac with Xcode.
- **Maestro** is found on `PATH` or in `~/.maestro/bin`. Elsewhere, set `MAESTRO_BIN`:
  `MAESTRO_BIN=$HOME/tools/maestro/bin/maestro` on macOS and Linux,
  `MAESTRO_BIN=D:/maestro/bin/maestro.bat` on Windows. It needs a `java` (17 or newer).
- **adb** is found through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, the SDK's default folder of the
  platform, then `PATH`. `ANDROID_SERIAL` picks one device when several are attached.

#### The iOS simulator of the suite

The harness never drives your own simulators. It has one dedicated device, **"OrenjiTrade
Maestro"**: created when it is missing (the newest standard iPhone on the newest installed iOS
runtime), booted with `simctl` alone (no Simulator / DeviceHub window is needed, and none is
opened), and shut down at the end unless `--keep-running` is given. To watch a run, open DeviceHub
(Xcode 27; Simulator on Xcode 26) yourself: it shows the booted device.

What makes the runs repeatable is set **inside that simulator only**, never in the Mac's settings
(`scripts/lib/ios-simulator.mjs`):

| Setting of the dedicated simulator                                            | Why                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AutoFill Passwords off                                                        | iOS would put its "Save Password?" sheet over the app after every sign-in                                             |
| Language and region: US English                                               | a simulator inherits the Mac's languages and region; the app follows the device for its legal pages, dates and prices |
| Keyboard: no auto-correction, no predictions, no "slide to type" introduction | the keyboard types exactly what a flow gives it                                                                       |
| `exp://` links open in Expo Go                                                | iOS would otherwise ask "Open in Expo Go?" for every project and deep link                                            |

Expo Go is installed on that simulator by Expo CLI's own installer (`scripts/lib/expo-go-ios.mjs`:
the matching Expo Go from Expo's servers, cached in `~/.expo`), whatever other simulator is booted;
`expo start --ios` is not used because it opens the project on the first booted simulator it
finds and brings the simulator window forward.

| Variable                    | Meaning                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ORENJI_IOS_SIMULATOR_NAME` | another name for the dedicated simulator (default `OrenjiTrade Maestro`)                                                                                                                   |
| `ORENJI_IOS_SIMULATOR_TYPE` | the iPhone model to create, for example `iPhone 17 Pro` (an existing dedicated simulator is kept as it is: delete it with `xcrun simctl delete "OrenjiTrade Maestro"` to change its model) |
| `ORENJI_IOS_SIMULATOR_UDID` | use this existing simulator instead. It receives the settings above, so name one you keep for tests                                                                                        |

#### What the harness does

It starts (or reuses) the isolated API, then starts Metro on :8082 with the app pointed at the
machine as the device sees it, checks that the platform's bundle targets the isolated API, and
runs the flows with the platform's `APP_ID` (Expo Go) and `APP_URL`:

|                                           | Android emulator                                                                    | iOS simulator                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Metro                                     | `expo start --port 8082 --android --clear`                                          | `expo start --port 8082 --clear`                             |
| `EXPO_PUBLIC_API_BASE_URL`                | `http://10.0.2.2:8090`                                                              | `http://localhost:8090`                                      |
| `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | `10.0.2.2:9099`                                                                     | `localhost:9099`                                             |
| Expo Go                                   | installed by `expo start --android` when missing; the harness waits up to 6 minutes | installed on the dedicated simulator by Expo CLI's installer |
| `APP_ID`                                  | `host.exp.exponent`                                                                 | `host.exp.Exponent`                                          |
| `APP_URL`                                 | `exp://10.0.2.2:8082`                                                               | `exp://127.0.0.1:8082`                                       |

A Metro kept by `--keep-running` serves one platform (the API address is inlined into its
bundle): `npm run test:mobile:maestro -- --stop` before switching platforms. The accounts a run
created are deleted from the Auth emulator at the end on both platforms.

#### The flows

Flows: `sign-in.yaml`,
`sign-up-onboarding.yaml` (the location step with the pickers), `profile-edit.yaml`,
`discoverability.yaml` (Canada, Ontario and a city with the pickers, save,
`scripts/check-location.js` checks on the host the declared codes and that `GET /me/location`
carries no coordinate, radius or distance; map opt-in), `sign-out.yaml` (session restore after a
relaunch, then sign-out), `search-card-detail.yaml` (down the catalog the field has scrolled
away and the Search tab pressed again brings it back; search, a schema language filter, card
detail, the French printing), `inventory-add-edit-undo.yaml` (native flow 1 of the redesign,
stage R2: add a card with a text price and a photo (a fictional picture put in the simulator's
library by `addMedia`, picked in the system picker by `subflows/pick-newest-photo.yaml`), see
"Saved", edit it, delete it and Undo; `scripts/check-inventory.js` checks the API after each
step),
`dialog-after-sheet.yaml` (in the app's Dark theme, chosen again in Settings > Appearance (a new
install's default since stage R1) with the device left as it is: on Edit card the binder sheet, then "Delete this card" (a sheet since R2) with its
title and both buttons found by id, the sheet again, the dialog again, and the card gone on the
API; it holds the scrim that iOS must not take for a modal, see `src/theme/scrim.ts`),
`inventory-import-deck.yaml` (stage S5: the text of a fictional deck file pasted, the preview
with its counts and the commit that says why it cannot be pressed, a printing chosen in "Which
copy", "Use the most recent printing for all unchosen rows", one condition for the cards of the
file, the commit, three cards in the inventory as Private; `scripts/check-import.js` checks the
API before and after the commit), `inventory-import-csv.yaml` (the text of a fictional Collectr
CSV pasted by a collector who already has two copies of a card, given on the host by
`scripts/own-printing.js`: the preview says the row goes into the card already owned, the row
nothing fits is shown with what the file said, and the commit raises the owned card to four
copies instead of adding a second one), `inventory-import-assumed.yaml` (a pasted CSV whose two
cards get the plain copy from "Use the most recent printing": once the snackbar is gone the
filter that stays on screen and a card above the lines still count them, the card's button lists
them, one is confirmed by picking its copy again, one is changed, and the commit adds the copies
the collector chose), `binder-create-add-item.yaml` (a card added on the host by `scripts/add-card.js`, a new binder,
"Add cards", publish for 24 hours, checked on the API), `map-region-binders.yaml` (stage M9: a seed
collector's Map tab draws Americas (North) and counts its binders, the zoom buttons, the list of
states and provinces, a state without a binder, Quebec and its public binders with the owner and
"Quebec, Canada" and never a city, a binder opened; then a profile with the state and the shown
city; `scripts/region-map.js` reads on the host what the state holds), `region-switch.yaml` (the
region sheet, Europe on the map, in its list and in Search with "Not your region", "Back to
Americas (North)", a link that opens the tab on a region and a state), `map-gestures-links.yaml`
(a collector without a location: a finger dragged over the map scrolls the page, the "Where are
you?" prompt is put away, a tap on the map itself opens a place, holding it names it first, a
zoomed-in map moves under the finger while the page stands still, the list goes back to its top
when the tab is pressed again and when the region changes, a link works twice and a link to a
region that does not exist changes nothing), `large-text.yaml` (the largest text size, asked for
that launch only by `subflows/relaunch-large-text.yaml` with the iOS launch argument
`UIPreferredContentSizeCategoryName`, no setting of the device changed; Android keeps its own
size: the Search field and a result stay within reach at home and in another region, and a drag
on the map scrolls the page), `card-holders-region.yaml` (a card collector1 lists, read on the
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
both in Montevideo): one wishlist alert on the bell, live, naming the state, which opens the card),
`conversation-rating.yaml` (stage R1: both collectors sent three messages, `scripts/messaging.js`
`qualify`; "Rate" from the conversation menu, a form with Overall, Communication, Card condition
and Shipping and no meetup reliability, the rating checked on the API without a meetup score),
`report-collector.yaml` (report a collector from the profile, the confirmation, My reports,
checked on the API through `scripts/reports.js`), `limit-reached.yaml` (stage F1: a collector with
the five binders everyone may have (`scripts/limits.js`) gets "You have used 5 of 5 binders" with
nothing to buy, the Profile tab has no Premium, credits or support row, an old link to the Premium
screen lands on the Profile tab with the free-for-all note), `google-sign-in.yaml`
(a fresh password collector continues with Google under the same e-mail through the emulator's
simulated account: the chooser dismissed, then the sign-in lands on the tabs of that account and
Settings -> Account names both methods), `collector-search-looking-for.yaml` (the Collectors
segment finds a collector of the region set up by `scripts/parity.js`, with his state, typed in
two steps: the field keeps the keyboard while the first results arrive under it; his profile and "Looking for" with the condition only; the wish opens the card),
`holders-filters.yaml` (a card listed twice by a collector of the region: the holders list with
both prices and the holder's state, sorted by price, narrowed to the Lightly Played copy,
cleared), `blocked-users.yaml`
(block from a conversation -> Settings -> Blocked users -> Unblock, checked on the API; the other
collector can write again), `age-step-existing-account.yaml` (a collector created on the host
without the 18+ confirmation (`CONFIRM_AGE=false`) signs in, sees the "Age" step alone, is refused
unticked, confirms, lands on the tabs with "Welcome back", `scripts/check-age.js` checks the
consent on the API, a relaunch never asks again), `legal-french.yaml` (from the sign-in screen:
the legal index, FR with the French banner and the translation marking, "Trading safely" in French
then in English, the choice kept across a relaunch), `safety-notice.yaml` (stage R1: Ada's chat
opens with the safety tip of a chat without a card, the tip opens the "Trading safely" page
in-app, the composer keeps working, the tip is still there after a relaunch). The flows
`offer-trade-rating.yaml` and `payment-protection.yaml` were deleted with offers and protected
payments (stage R1), `premium.yaml` with Premium (stage F1). The seed flows (`sign-in.yaml`, `map-region-binders.yaml`, `region-switch.yaml`, `large-text.yaml`) first record the
seed's 18+ confirmation on the host (`scripts/confirm-age.js`, idempotent) and every host script
that creates a collector records it too (the sign-up flow ticks the checkbox itself). Flows scroll only with the scroll subflows (on Android an edge swipe: a slow swipe in the middle can start on a text
field); option lists of the pickers scroll with `scrollUntilVisible`. A list with a bar that stays on screen under it
(the commit bar of the import preview) scrolls with `scroll-down-above.yaml` and
`scroll-to-top-below.yaml`: on iOS the accessibility tree also lists what the list holds under such
a bar, so `scrollUntilVisible` takes a covered element for a visible one, starts its centring swipe
on the bar, which does not scroll, and the tap lands on the bar. The system file picker is another
process that Maestro cannot see, so the import flows paste the text of their files; the picker is
walked by hand (a fictional `.ydk` and `.csv` copied into the simulator's "On My iPhone" folder).
Shared steps are in `.maestro/subflows/` (cleared
launch in Expo Go, dismissing the Expo Go developer menu and an "isn't responding" dialog,
sign-in, and scrolls that swipe along the screen edge so a slow swipe never starts on a filled
text field, which Android turns into a text-selection long press) and host-side helpers in
`.maestro/scripts/` (create a fictional collector through the emulator and the API, verify an
email with the emulator's code, check a declared location, add a card, check an inventory, the
collectors of the stage M7 flows and the blocks of an account in `parity.js`).
Screenshots and reports: `.local-dev/mobile-e2e/maestro/`. Edit nothing in the repository while
flows run (Metro re-crawls the workspace and Expo Go may lose the packager) and restart a kept
Metro after source changes (`npm run test:mobile:maestro -- --stop`).

#### One set of flows for two platforms

Every flow and subflow has `appId: ${APP_ID}`; a manual `maestro test` passes `-e APP_ID=...`
with the other variables of `.maestro/config.yaml`. What the platforms do differently sits in the
subflows, in `when: platform:` blocks, so a flow never calls `hideKeyboard`, `back` or `checked:`
itself:

| Subflow                                                                | Android                                                                                  | iOS                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hide-keyboard.yaml`                                                   | `hideKeyboard` (the back key)                                                            | a short drag in the middle of the screen, above the keyboard (Search and the card pickers let go of the keyboard when a drag begins), then, while a keyboard is still on screen, a tap in the page's right padding (a form and a conversation close it on a tap outside their controls) |
| `hide-keyboard-in-dialog.yaml`                                         | `hideKeyboard`                                                                           | nothing: a dialog sits above the keyboard and its buttons are pressed with the keyboard up                                                                                                                                                                                              |
| `go-back.yaml`                                                         | `back`                                                                                   | the back button of the navigation header (`BackButton`)                                                                                                                                                                                                                                 |
| `scroll-down-to.yaml`, `scroll-up-to.yaml`, `scroll-down-to-text.yaml` | swipes along the right edge until the element is on screen                               | `scrollUntilVisible` with `centerElement`: iOS also lists what a page holds under the tab bar and the header, so the element is brought clear of them                                                                                                                                   |
| `assert-checked.yaml`, `assert-unchecked.yaml`                         | `checked: true / false`                                                                  | the element's value: "checkbox, checked" / "checkbox, unchecked" (a switch: 1 / 0)                                                                                                                                                                                                      |
| `dismiss-dev-menu.yaml`                                                | the "isn't responding" dialog, the developer-menu introduction, Close, then the back key | the developer-menu introduction and Close                                                                                                                                                                                                                                               |
| `hide-tools-button.yaml` (from `wait-for-app.yaml`)                    | not run: Expo Go 57 puts its tools button below the header                               | switches off Expo Go's floating developer-tools gear, which covers the right end of the header (the notification bell)                                                                                                                                                                  |

Writing a flow that passes on both:

- **iOS exposes an accessible control as one element.** A row, a button or a checkbox with an
  accessible name is a single element on iOS (its nested texts are not listed), where Android
  lists the texts inside it too. Match such a control by its id, or with a pattern that fits the
  whole name (`'.*Je confirme avoir 18 ans ou plus'`).
- **"Visible" is wider on iOS**: an element of a scrolling page that sits under the tab bar or the
  navigation header counts as visible. Bring it into reach with a scroll subflow before a tap.
- **The snackbar sits just above the last button of a form** and overlaps its top edge for four
  seconds. A tap on that button right after a save lands on the button (its centre is below the
  message) on both platforms; if the end of a form changes, check that this still holds.
- Never add a step for one platform outside a `when: platform:` block, and keep the Android steps
  of a subflow as they are: the Android run cannot be repeated on a Mac without the Android SDK.

## Deep links

- Custom scheme: `orenjitrade://collectors/<handle>`, `orenjitrade://cards/<id>`,
  `orenjitrade://binders/<id>`, and every other app route (`orenjitrade://messages/<id>`,
  `orenjitrade://wishlist`, `orenjitrade://community/<slug>`, `orenjitrade://notifications`,
  `orenjitrade://settings/reports`, `orenjitrade://holders?card=<id>` (or `?printing=<id>`),
  `orenjitrade://sets/<id>`, `orenjitrade://settings/blocked`).
  Signed out, a link leads to sign-in and opens after signing in.
- Links to the screens stage R1 removed (`orenjitrade://offers/<id>`, `trades/<id>`,
  `disputes/<id>`, `checkout/fake/<ref>`) land on Messages, and `settings/offers` and
  `settings/payouts` on Settings, with a note that deals happen in the chat (ADR 0018); links to
  the screens stage F1 removed (`orenjitrade://premium`, `credits`, `support`,
  `checkout/fake-billing/<ref>`, `checkout/fake-donation/<ref>`) land on the Profile tab with a
  note that the app is free (ADR 0019); never on a blank or not-found screen.
- Universal/App Links: `https://www.orenjitrade.com/(collectors|cards|binders)/<id>` via
  `ios.associatedDomains` and Android `intentFilters` (`autoVerify`) in `app.config.ts`.

## Not yet wired (tracked in `IMPLEMENTATION_STATUS.md`)

- The admin / moderator consoles (web only, including dispute resolution, refunds and usage
  limits). Store builds: real payment providers are not wired, and nothing is sold or paid in the
  app since stages R1 and F1, so no in-app purchase is needed; the fake providers are local only.
  Moderators remove community posts on the web only; photos come from the library (no camera).
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
- EAS: `extra.eas.projectId` stays a placeholder; no EAS build is used (local and free only).
- Not built, by the owner's decision of 2026-10-13 (stages S3 and S4 of the 2026-10-08 change):
  the printing picker with holder counts on the card screen (the card screen still preselects a
  printing), "Who wants it", "Wanted by N" on inventory items, a server-side search history and
  photos in community posts. The redesign of 2026-10-14 drops S3's "Who wants it", "Wanted by N"
  and holder counts, and keeps recent searches on the phone (its section 2).
