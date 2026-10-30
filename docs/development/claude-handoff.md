# Claude Code handoff (2026-10-09, machine notes updated 2026-10-10, state updated 2026-10-29 after review fix 2 of the owner decisions of 2026-10-28 (branch `feature/owner-decisions-1028`, built and reviewed twice, not pushed), which follow the whole phone redesign: R1 to R6, G, R7 and R9 to R11 on main (#86), R12 to R15 and the wrap-up R8 on main (#87)): continuing OrenjiTrade on the Mac

Read this after `CLAUDE.md` and before `IMPLEMENTATION_STATUS.md` when you start a Claude Code
session on a new machine or after a long break. It records where the work stands, what to do next,
and the working agreements with the owner that are not written anywhere else (they lived in the
Windows machine's Claude memory, then were learned on the Mac). Machine setup:
[macos-setup.md](macos-setup.md).

**The machine (2026-10-10).** A Mac mini (Apple M6, 12 cores, 24 GB RAM, macOS 27), not a
MacBook. Docker is **OrbStack** (Docker context `orbstack`, `/var/run/docker.sock` linked to it,
Rosetta on, 12 CPUs / 12 GB), not Docker Desktop. The only system JDK is Temurin 27, which works:
the Gradle daemon is pinned to Java 21 (`apps/api/gradle/gradle-daemon-jvm.properties`, on `main`
since #59) and the E2E harnesses pick a Java 21 for the API jar. Node 24.21.0, Xcode 27 with iOS 27
simulators, Maestro 2.11.0 in `~/.maestro/bin`. **No Android SDK is installed** (no adb, no
emulator; owner decision of 2026-10-10: skipped for now), so **the native Maestro check on this Mac
is the iOS run** on the simulator the owner keeps booted (section 4). Python 3.12 is not installed
either (ML is on hold). A Spotless failure with `NoSuchFieldError ... EndPosTable` is a result
cached from a JDK 27 daemon: run `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` once in that
worktree.

## 1. Where things stand (2026-10-15)

**On `main` (everything merged, CI green):** the web MVP (Phases 1–10), the mobile app
(Phases 1–10 + web parity, stages M1–M8), launch readiness (18+ rule, trading safety, French legal
pages, money features off by default, Law 25 operating docs), the low-cost first-year cloud profile
(ADR 0016, prepared only — nothing deployed), the E2E isolation from the dev database, the first
run on Apple Silicon (#59), the iOS path of the native Maestro suite (#61), and the owner's change
of 2026-10-08 as far as it was built: **stage S1** (platform regions replace geolocation, ADR 0017,
#57), **stage S2** (the simplified wishlist and wishlist alerts, #60), **mobile stage M9** (the
region switcher and the region map on the phone, #67), **the inventory lock fix** (writes to one
collector's binders and cards take turns, #68), **stage S5** (the inventory import from a .ydk deck
file or a Collectr CSV, API and phone, #69), the scrim fix (a dark backdrop iOS took for a
modal, #70, 2026-10-14), **stage S6** (the final documents of the 2026-10-08 change, the
delivery report `docs/product/2026-10-08-change-delivery-report.md`, #71, 2026-10-14), **stage R1**
of the phone redesign (offers, trades, protected payments and disputes off the phone, ADR 0018;
the chat safety tip, shipping wording, the deckCore tokens, the fonts, the dark default; #72,
2026-10-14) and **stage F1**, free for all (Premium, ads, credits and donations removed from the
API, the phone and the web, ADR 0019; the same usage limits for everyone; merged with R1 on
2026-10-15, then its own pull request, #73), then **stage R2** of the phone redesign (the
Inventory, its filter sheet, Add cards, Choose the printing, Add to inventory with photos, Edit
card, the toasts with "View" and "Undo"; the asking price as typed, a condition not stated, the
undo of a delete for 10 minutes; merged with F1 on 2026-10-15, then its own pull request, #74),
**stage R3** (binders and deck cores, #75), **stage R4** (messages and Mark as sold, #76) and the
owner's inventory change of 2026-10-16 (the Public / Private tag and the "$" / "% TCG" price, #77).
Merged PRs from 2026-10-05 on: #39 #40 #41 #45 #46 #47 #48 #49 #50 #51 #52 #53 #57 #58 #59 #60 #61
#67 #68 #69 #70 #71 #72 #73 #74 #75 #76 #77.

**Not on `main`:**

| What | Where | State |
| --- | --- | --- |
| Expo SDK 58 upgrade | draft PR #54, branch `feature/expo-sdk-58` | Done and verified, **held by owner decision (2026-10-07) until SDK 58 is stable**. Refresh steps are in the PR comment. |
| `backup/expo-sdk-58-deps` | branch only | A local experiment from the Windows machine, pushed as a backup. Not needed; do not merge. |
| Stage R3 of the phone redesign (binders and deck cores, mockup screens 16 to 18) | merged as #75 (`2f9c5506`) | Builder done (V126; IMPLEMENTATION_STATUS.md, "Phone redesign R3"); reviewed, review fixes 1 and 2 done; on `main`. |
| Stage R4 of the phone redesign (messages and Mark as sold, mockup screens 22 to 25) | merged as #76 (`f26d531f`), from branch `feature/r4-messages-mark-as-sold` | Builder done (V127, the `deals` module; IMPLEMENTATION_STATUS.md, "Phone redesign R4"): the R3 leftovers R2-1, R2-2, U10 (and U8) fixed first; the chat's subject, `GET /conversations/{id}`, sharing one's own card, `POST /conversations/{id}/sales` and `POST /sales/{id}/undo`, the SALE interaction, the buyer's notification; on the phone the inbox, the chat with its pinned bar, tips, quick replies and + sheet, Settings › Shipping details, Mark as sold with its toast and Undo; native flows 3 (as far as R4 reaches) and 4; walked on the iPhone 18 Pro in dark and light at the default and the largest text size (three large-text fixes); the full check list run (the native suite 32 / 33, the one stale flow fixed and passing alone). Reviewed (a functional verifier and a privacy lens); **review fix 1 done** (IMPLEMENTATION_STATUS.md, R4 section, "Review fix 1"): Mark as sold names the card the seller saw (409 `SUBJECT_CHANGED`) and pins are pushed on `/user/queue/conversations`; the toast's Undo stays above the keyboard; sold deck cores leave `binders.max`; the tracking-number log rule has its test; nine minor fixes. **Review fix 2 done** ("Review fix 2"): a jest test that the open Mark as sold sheet keeps the card it opened with, and the quick reply chips' 44 pt touch targets on iOS (the row's padding). On `main`. |
| Stage R5 of the phone redesign (Search, mockup screens 11 to 15) | merged as #78 (`108655e8`), from branch `feature/r5-search` | Builder done, reviewed, review fix 1 done (IMPLEMENTATION_STATUS.md, "Phone redesign R5: search"): four tabs, Search's map, typing a card with the collectors, Who has this card, Search › Binders with Deck cores, Search › Wishlist with "Available", recent searches. On `main`. |
| Stage R6 of the phone redesign (Profiles, mockup screens 19 to 21, and Settings behind the gear) | merged as #82 (`3d56a090`), from branch `feature/r6-profiles` | Builder done, reviewed, review fixes 1 and 2 done (IMPLEMENTATION_STATUS.md, "Phone redesign R6: profiles"): another collector's profile, "I have it", your Profile tab with the gear that opens Settings. On `main`. |
| Stage G of the phone redesign (one game at a time, mockup v50 screens 34 and 35 and changes to 11, 12, 14, 15, 17 and 18; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section G) | merged as #85 (`c6e3118a`), from branch `feature/g-one-game` | Builder done (V130 One Piece, V131 `binder.game_id`; IMPLEMENTATION_STATUS.md, "Phone redesign G: one game at a time"; contract `docs/api/contracts/g-one-game.md`): the browsed game per account with the game pill and "Choose a game" (games without cards dimmed), the restyled "Choose a region", Search scoped to the game (no game chips), binders of one game (409 `BINDER_GAME_LOCKED` / `BINDER_GAME_MISMATCH`, the migration of existing binders), Inventory › Binders by game, New binder's Game picker, Edit binder's locked game, binder pickers by the card's game, `game=` on the discovery reads; native flow G (`one-game-at-a-time.yaml`); walked on the iPhone 18 Pro in dark and light at the default and the largest text size (three large-text fixes). Review fix 1 done (V132; `game=` leaves out binders made without a game that mix games, block tests with `game=`, the audit gate's vite / MCP server overrides, "Add a wish" by the browsed game, `gameLocked`, the cover's game; native suite 35 / 35). Review fix 2 done (one minor finding: a test of `game=` with a binder made without a game under a cover of another game; `CatalogMetadataIT` independent of the class order). On `main`. |
| Stage R7 of the phone redesign (Home, mockup v50 screens 10, 10b and 10c; owner prompt `docs/product/specs/2026-10-19-home-full-design.md`) | merged as #86 (`da3de820`), the first giant pull request (R7, R9, R10 and R11; owner, 2026-10-21) | Builder done (V133 `binder.core_since`; IMPLEMENTATION_STATUS.md, "Phone redesign R7: Home"; contract `docs/api/contracts/r7-home-feed.md`): Home as the first of five tabs (the app's first screen; old map links still open Search's map), the region and game pills with the bell, the search field, Get started (three steps, "Turn on", hidden for good per account on the phone), the chips pinned on scroll, the feed `GET /api/v1/feed` (30-day window as a server setting, new cards per collector and hour with "+n", wishes with "I have it", deck cores, blocks both ways in SQL before the limit, never the caller), the end, the quiet, empty, loading and error states; the seed's feed dated relative to now; native flows `home-feed.yaml` and `home-get-started.yaml`; walked on the iPhone 18 Pro in dark and light at the default and the largest text size (four layout fixes). Review fix 1 done (18 findings: blocks refresh Home, old map links followed once, the feed's later pages dated by the first page's time, "Back to the map", errors keep the chips and the title, the reader's place; tests for every surviving mutant). Review fix 2 done (round 2 found one minor finding: `FeedIT` now reads three pages and more, each keeping the first page's time). On `main` (#86). |
| Stage R9 of the phone redesign (Notifications and the bell, mockup v50 screen 31; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R9) | merged as #86 (`da3de820`), the first giant pull request (R7, R9, R10 and R11; owner, 2026-10-21) | Builder done (no migration; IMPLEMENTATION_STATUS.md, "Phone redesign R9: Notifications (31) and the bell"; contract `docs/api/contracts/r9-notifications.md`): the bell's orange dot and "Notifications, {n} new" on the five tabs, Notifications with New and "Mark all as read", Earlier, cursor paging, each kind's icon, colours, sentence and target, freshness reminders answered in place ("Still have them", "Review the binder"), the empty, loading and error states, a tapped push opening its row's target; API: optional `excludeTypes` on `GET /notifications` and its unread count (the phone sends `MESSAGE`), new `data` keys for wishlist alerts, sales and freshness notices; the paused web's client keeps the unread count without parameters (`packages/api-client/tools/web-omits.mjs`); native flow `notifications-bell.yaml`; walked on the iPhone 18 Pro in dark and light at the default and the largest text size (five fixes). Review fix 1 done (a notice that opens nothing shows its whole line, the chat's Back from a sale notification, a chat push opens the chat, New pages past 50 unread; the full check list green, the native suite 38 / 38). On `main` (#86). |
| Stage R10 of the phone redesign (Card data for Magic and Pokémon, mockup v50 screens 34 and 53 once a game has cards; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R10) | merged as #86 (`da3de820`), the first giant pull request (R7, R9, R10 and R11; owner, 2026-10-21) | Builder done (no migration, no API change; IMPLEMENTATION_STATUS.md, "Phone redesign R10: Card data for Magic and Pokémon"; ADR 0021; contract `docs/api/contracts/r10-card-sources.md`; `docs/providers/scryfall.md`, `docs/providers/tcgdex.md`): `ScryfallCardProvider` (the "Unique Artwork" bulk file, English paper cards, one image per artwork, refreshed at most daily, at most 10 requests a second) and `TcgdexCardProvider` (the card database's archive from GitHub with its MIT `LICENSE`, English only, Pokémon TCG Pocket left out, one card per English name, one image per printing), tested on hand-written fixtures only (`CardSourcesImportIT`: `hasCards` after a fixture import); printings on their own artwork; the credits under the pictures and in Settings › Appearance; Who has this card shows a chosen printing's picture; every harness turns the providers off; "never hotlink provider images" in ADR 0015 and CLAUDE.md. Walked on the iPhone 18 Pro with a fixture import on a stack of its own (before: Magic and Pokémon "Cards coming soon"; after: browsable with pictures and credits), dark and light, the default and the largest text size. **The owner runs the real imports** (the commands are in the section). Review fix 1 done (tests for the TCGdex set-code rule and the other surviving mutants; a Magic code typed as printed, `ZTK 0012`, finds `ZTK-12` in search and suggestions; ADR 0021's rejection of "Default Cards" corrected; owner decisions: "Unique Artwork" or "Default Cards" for Magic, the TCGdex MIT notice in the app). Review fix 2 done (a padded code typed as printed lists its own printings only, each once: `ZSK 001` never `ZSK-100`, `EMR 001` never `EMR-150`; the number without its zeros only as a fallback, read as the whole number). On `main` (#86). |
| Stage R11 of the phone redesign (Messages › Community, one simple room per game, mockup v50 screens 32 and 33 and screen 22's tabs; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R11) | merged as #86 (`da3de820`), the first giant pull request (R7, R9, R10 and R11; owner, 2026-10-21) | Builder done (V134; IMPLEMENTATION_STATUS.md, "Phone redesign R11: Messages > Community (32, 33): one simple room per game"; contract `docs/api/contracts/r11-community-rooms.md`): Messages with Chats \| Community and an orange dot on Chats while a chat is unread; one public room per platform region and game (15; every other channel archived, nothing deleted; `publicChat` on unless an admin chose); the browsed region's five rooms, the browsed game's first, each with its last post and a dot for posts newer than the last visit on this phone; a room read like a chat (rules, banner, day separators, "{province} · {time}" for discoverable authors only, never a city, up to 4 photos uploaded as `COMMUNITY` of 3 MB with EXIF and GPS stripped, a shared card, binder or deck core with its badge and price), the "⋯" sheet (Message, Report, Block, Delete your own), the message box with its "+" sheet, the 429, duplicate and network errors with "Try again"; posts never notify. The paused web's suites kept their old channels in their own E2E database (`PAUSED_WEB_CHANNELS`; local harness and CI) until web stage WF moved them to the rooms and dropped it. Native flow `community-post.yaml`; walked on the iPhone 18 Pro in dark and light at the default and the largest text size (four fixes). Review fix 1 done (an open room shows newer posts every 15 s, on coming back and with a pull; a post's avatar and handle open the profile; the line under the handle at large text sizes; Community closes when a refresh finds it off; a post's place decided for a member who is not the author; a binder the reader can no longer open left out with its name and handle, `payload.binderUnavailable`; the rooms' count of what the caller may see; `COMMUNITY` uploads refused while `publicChat` is off; the tests the reviewers asked for). Review fix 2 done (the check of fix 1 approved it with two minor findings at the largest text size: a post's time is never cut by a long province; the community's closed, empty and error states scroll, `StateScroll`). On `main` (#86). |
| Stage R12 of the phone redesign (Sign-in, sign-up and welcome, mockup v50 screens 36 to 46; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R12) | merged as #87 (`7bfc879e`), the second giant pull request (R12 to R15 and R8; owner, 2026-10-21) | Builder done (no migration, the next is still V135; IMPLEMENTATION_STATUS.md, "Phone redesign R12: Sign-in, sign-up and welcome (36 to 46)"; contract `docs/api/contracts/r12-sign-in-welcome.md`): Sign in with the wordmark and its line; Create your account with the documents in one card and the 18+ confirmation in its own (English only), "Create account" disabled until every box is ticked with one line saying what is missing; Reset password and Verify your email with their sent states in place; the welcome in three steps ("Who are you?" with the live handle check `GET /me/profile/handle-availability`, 60 per 10 minutes; "What do you collect?" with the game tiles, at least one game, "Opens first" on the first picked game with cards, which Home and Search open on; "Where do you ship from?" with its switches); no age step: an account without the 18+ confirmation is on Review our terms first (the age line alone when no document is due); Suspended, Scheduled for deletion ("Deletion cancelled" in place) and Could not load centred with a 72 pt icon. Native flows `sign-up-onboarding.yaml` and `age-step-existing-account.yaml` (rewritten); walked on the iPhone 18 Pro in dark and light at the default and the largest text size (six fixes: Sign in's last link above the home indicator, Review our terms in reading order, a drag hides the welcome's keyboard, the wordmark and the Google mark at the largest size, switches under their words at the largest size, the password's eye inside the field); the full check list green, the native suite 38 / 38, the mobile web E2E 62 / 62. Review fix 1 done (a screen kept for Review our terms or the welcome never opens for the next account and belongs to its collector, the welcome takes its own link; the keyboard never hides the field being typed in on the welcome and on Sign in, Create account and Reset password; "Choose your country." under the pickers, in view; the progress bar's 33, 67 and 100 %; Could not load's own words and `errorCode · requestId`; Reset password's "Resend in {n} s"; the welcome's tags without game and language tags; the first handle from the e-mail left to the owner). Review fix 2 done (a new account's first handle is `collector_` and six random characters, never a part of the e-mail; no field changed). Not pushed. |
| Stage R13 of the phone redesign (Settings, mockup v50 screens 47 to 59; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R13) | merged as #87 (`7bfc879e`), the second giant pull request (R12 to R15 and R8; owner, 2026-10-21) | Builder done (no migration, the next is still V135; IMPLEMENTATION_STATUS.md, "Phone redesign R13: Settings (47 to 59)"; contract `docs/api/contracts/r13-settings.md`: an optional `tags` on `PUT /me/profile`, saved with the profile in one transaction): Settings with the profile card and its groups and values (the place and the map, the theme, the blocked collectors' number, "{n} waiting", the email, the version); Edit profile with one "Save changes" ("No changes yet" while nothing differs), "Preview", the leave guard, the welcome's game tiles and "Add a tag"; Location with "Show me on the map" first, side-by-side pickers, the protection box and the remove sheet; Shipping details; Notifications as a grid of topics by channel (a channel that is off dims its column); Privacy saved at once ("All changes saved"); Appearance (Same as the phone, Light, Dark; version, server, credits); Blocked collectors; My reports with pills; Account; Delete account grey until ticked, the sheet, the working steps; Legal with seven documents (the payment and refund policies are the web's) and the amber draft banner; every page with its own top bar, whole words at the largest text size. Native flow `settings-pages.yaml` (new); walked on the iPhone 18 Pro in dark and light at the default and the largest text size (fixes: a toast hid a page's last row, a duplicated tag suggestion, About's icons, a cut "blocked {when}", mid-word breaks and cut titles at the largest size); the full check list green: test:api 1,270 tests, test:mobile 1,646, the web E2E 70 / 70, the mobile web E2E 62 / 62, the native suite 39 / 39 (1 h 0 min). **Review fix 1 done** (three reviewers, twelve findings: a Private profile off the map on Settings, Location and Privacy; Preview right after a save; Privacy's map switch waits for a place; a refused save said where the collector tapped; whole handles and words at the largest size; tests for the surviving mutants and a privacy contract test that reads a block and a report; F5 an automation artefact; P3 an owner follow-up; the full check list green: test:api 1,270 tests, test:mobile 1,658, the web E2E 70 / 70, the mobile web E2E 62 / 62, the native suite 39 / 39 (1 h 1 min)). **Review fix 2 done** (the last round: P3 answered with evidence, no code change; owner follow-up 7 restated with what the blocked side can still read over HTTP and the API remedy recommended; the quick checks green). Not pushed. |
| Stage R14 of the phone redesign (Report, rating, reference, binders, wishes, import and sets, mockup v50 screens 60 to 69; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R14) | merged as #87 (`7bfc879e`), the second giant pull request (R12 to R15 and R8; owner, 2026-10-21) | Builder done (no migration, the next is still V135; IMPLEMENTATION_STATUS.md, "Phone redesign R14: Report, rating, reference, binders, wishes, import and sets (60 to 69)"; contract `docs/api/contracts/r14-report-rate-wish-import-sets.md`: `dealName` and `soldToYou` on a sale's `RatingEligibilityInteraction`, through the ratings module's `SaleDeals` extension point implemented by deals): Report collector with the server's reasons as radio rows, "Send report" grey with "Choose a reason first." and Report sent in place; Rate with the deal ("{card} · sold to you {date}"), Overall's 34 pt stars and word, clearable details rows, "Write a reference instead", "Publish rating"; Write a reference; New binder with its game's line; "Add a wish" opening Search's card search, the form with price chips, Edit a wish with its remove sheet; the import's file step, Check the cards (trash, chips, amber bar with "Use the newest", compact lines with a tick box, the add button grey with its reason) and Import done; a set with "Who has cards of this set" and a three-column grid, paged; refusals said in the bar at the bottom; whole words at the largest text size. Walked on the iPhone 18 Pro in dark and light at the default size and at the largest size (fixes: refusals said in the bar at the bottom, Check the cards' lines right under the amber bar, a saved wish landing on its game, the chosen binder tile tinted, whole words and handles at the largest size, a toast never over the import's add button); the full check list green: test:api 1,272 tests, test:mobile 1,674, the web E2E 70 / 70, the mobile web E2E 62 / 62 (after the import spec followed R14), the native suite 38 / 39 then the three import flows 3 / 3 after the deck flow followed the sentence's new place (60 min). PR screenshots in `.local-dev/r14-notes/pr-shots/`. **Review fix 1 done** (phone and tests only: a refusal in the bottom bar held to the button's text size and a quarter of the window, Add a wish's field at the top at the largest size, Import done closes the toast, the binder picker's "You have no {game} cards yet.", "Leave out" under the amber bar with its lines shown left out, "×3" while the file names no condition, the price chips the terms alone, tests for a set's paging, the grid's columns, a cleared details row, the 600-character comment and Import done's count; the native report flow ends with a refusal at the largest size; IMPLEMENTATION_STATUS.md, "Review fix 1" in the R14 section). Not pushed. |
| Stage R15 of the phone redesign (Browse without an account, mockup v50 screens 70 to 75 and Sign in's close button; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R15) | merged as #87 (`7bfc879e`), the second giant pull request (R12 to R15 and R8; owner, 2026-10-21) | Builder done (no migration, the next is still V135; IMPLEMENTATION_STATUS.md, "Phone redesign R15: Browse without an account (70 to 75)"; contract `docs/api/contracts/r15-browse-without-account.md`): the app opens on Home for a signed-out visitor; Home and Search as a guest (the person button for the bell, "You’re browsing as a guest", "A collector" with a plain avatar and the place on every post and row); Inventory, Messages, Profile (with Appearance, Trading safely, Legal) and Search › Wishlist ask to sign in in place; every action that needs an account opens one sheet with its title (message, I have it, profiles, wishes, report) and finishes after the sign-in (and the welcome) back on the guest's screen, kept in memory by its listing; Sign in's close button "Not now, keep browsing"; sign-out to Home as a guest; a deep link to a member screen through Sign in; the guest's region and game under a guest key. API: `PrivacyPolicyService.canSeeWho` (a signed-out caller never reads a collector's id, handle, name, avatar, rating, activity or presence; name search, binder search by handle and suggestions find nobody), the feed open (GET), `GET /listings/owner` (members), the `guest-discovery` rate limit (20 per 10 s by address, an expiring Redis key only); the paused web's client keeps the identity fields typed as before (`WEB_CLIENT_NOT_NULL`). Checks green on the final code except the native suite: test:api 1,282 tests (1 old test reading a name signed out fixed, re-run alone), test:mobile 1,718, the web E2E 70 / 70, the mobile web E2E 64 / 64, scripts 147 / 147, the audit gate after an undici override (GHSA-xjj6-f33q-929c). **The walk on the iPhone 18 Pro, its PR screenshots and the native suite were not run: the owner's simulator was not booted (12:38 to 13:40 EDT, never booted by an agent)**; a walk of the web build instead (the resume through Review our terms worked; the guest card's gradient fixed). **Review fix 1 done** (2026-10-25): listing photos by opaque URLs that never name the owner (`/api/v1/public/item-images/{id}`, `/binder-images/{id}`; no migration), a guest's Message on a plain public binder opens the chat after sign-in, no profile tags for guests, the guest window 10 per 10 s, back to Search › Wishlist, a guest's binder search wording, a screen left by an ended session stays its collector's, a leftover guest action forgotten, the sign-up hold's test; checks green (test:api 1,285 + 13, test:mobile 1,727, web E2E 70, mobile web E2E 64 + the guest spec 3 / 3 after its own assertion was fixed); the native suite and the iPhone walk still not run (simulator not booted). **Review fix 2 done** (2026-10-25): the wishlist alert test's random "km" flake fixed (the distance check reads the server's own words; the seller always has a "km" handle), native flows `guest-message-binder.yaml` and `guest-wishlist-review-terms.yaml` prepared (syntax checked, never run); checks green (test:api 1,285 + 13, test:mobile 1,727, web E2E 70, mobile web E2E 66); **the native suite, the iPhone walk and the PR screenshots still wait for the owner's simulator** (Shutdown through four waits on 2026-10-25). **F3 closed by R8 (2026-10-26)**: the native suite on the iPhone 18 Pro (41 / 43; the two failures were R15 flows never run on the iPhone, fixed and re-run 2 / 2; then every flow 43 / 43 on `5182b992`, the reviewers' verifier), the walk of 70 to 75 and 36 in dark and light at both sizes (the guest card's tint fixed) and the PR screenshots in `.local-dev/r8-notes/pr-shots/`. Not pushed. |
| Stage R8 of the phone redesign (the wrap-up, spec section 15, done last in the giant pull request; owner's exception of 2026-10-21) | merged as #87 (`7bfc879e`), the second giant pull request (R12 to R15 and R8; owner, 2026-10-21) | Builder done (no migration, the next is still V135; no API change; IMPLEMENTATION_STATUS.md, "Phone redesign R8: Wrap-up of the phone redesign (spec section 15, R8), done last in the giant pull request"): the documents after the whole redesign (CLAUDE.md's tabs, modules and guest rule; the product overview; the contracts index, every endpoint since S6 in a contract; the test accounts with the guest; the seed data; the READMEs; this file), the full native suite on the owner's iPhone 18 Pro (the two R15 failures fixed; the reviewers' verifier then ran every flow on `5182b992`, 43 / 43), a walk of every mockup screen (v50) in dark and light with scratch Maestro flows: every screen at the default size (73 of 77; the scan's 27 to 30 need its development build) and, at the largest text size, the screens in R8's table (60 of 77 signed in, dark), one screenshot per screen in `.local-dev/r8-notes/pr-shots/`, and two fixes the walk proved needed, each with a test: the guest card's tint on iOS (`GradientFill`) and an empty state's title at the largest size; the full check list green (test:api 1,285 + 13, test:mobile 1,734, web E2E 70, mobile web E2E 66, scripts 147). **Review fix 1 done** (eight findings, one major: the guest card's tint fills the card on the web build again (`GradientFill` in a frame without padding, the same on iOS) and a test that the guest card draws the faint stops; an empty state's description never larger than its title; at large text sizes Who has this card's picture above the name, Add cards' "Coming later" under "Scan with camera", the deck core page's back button fixed with a band under the clock; the documents' account of the largest-size walk and of a suspended collector's messages, one owner decision with R12's; walked again at the largest size in dark and light; the native suite 42 / 43, the one failure a run crossing midnight, 1 / 1 alone). The ship step next. Not pushed. |
| Owner decisions of 2026-10-28 (R8 follow-ups 1 to 3, R12 follow-up 3, R13 follow-up 7) | branch `feature/owner-decisions-1028` (worktree `OrenjiTrade-r2`), from `main` `1efe4962` | Builder done (no migration, no ADR, no web change; IMPLEMENTATION_STATUS.md, "Owner decisions of 2026-10-28: suspended collectors, large text, quick replies after a sale, blocks"; contract `docs/api/contracts/od-2026-10-28-suspensions-blocks.md`): a suspension leaves the login on (a ban still disables it) and a suspended collector sees screen 44 with its end date while signed in and after signing in again; handles (`HandleText`, `HANDLE_MAX_FONT_SCALE`) and toasts (`toastLayout`, a quarter of the window at most) capped at the largest text sizes, paragraphs left alone; the quick replies switch to the after-sale ones once the card is marked sold (and back on undo); a collector who blocked you reads as an unknown handle on the profile, its ratings and references, and the blocked side's refused messages use the general words. Native flow `account-suspended.yaml` (new), `deal-mark-sold.yaml` (extended). Checks green (test:api 1,294 + 13 tests, test:mobile 1,772, web E2E 70 / 70, mobile web E2E 66 / 66, the native suite 43 / 44 with the new flow's own defect fixed and passed alone, then the 12 flows reaching the later fixes 12 / 12); walked on the iPhone 18 Pro in dark and light at the default and the largest text size (three fixes found by the walk: the confirmation dialog out of reach, a notification's overlapping lines, screen 44's repeated line). PR screenshots in `.local-dev/od-notes/pr-shots/`. Review fix 1 done (28 findings): a refused account reads the public routes as a guest, a suspension closes the realtime sessions opened before it and writes nothing, a new conversation refused for a block reads as a NOBODY refusal, the block decided in the handle lookup's one query; every label naming a handle on one line, the dialog's buttons stacked, screen 44's buttons pinned; re2js held at 2.8.8 (new advisory). Checks green (test:api 1,300 + 13, test:mobile 1,778, web E2E 70 / 70, mobile web E2E 66 / 66, native 43 / 44 with the failing flow made robust and passed alone). Review fix 2 done (1 finding, R1-1): handles and a toast's title are cut with "…" at their cap, never shrunk to fit (React Native 0.86 ignores `minimumFontScale` on iOS and Android and shrank a handle to 4 points; `__tests__/theme/noShrinkToFit.test.ts`); owner follow-ups 9 and 10. Not pushed. |
| Camera card scan ("Scan with camera", Yu-Gi-Oh!, mockup screens 26 to 30; owner spec `docs/product/specs/2026-10-15-card-scan.md`) | merged as #83 (`1fb2e4ea`), from branch `feature/card-scan` (worktree `OrenjiTrade-card-scan`), its own session beside the redesign | Built and reviewed (a functional verifier and a privacy / collector lens, three fix rounds, the third approved by the owner, then the last small fixes); merged with `main` (R4, #77, R5) on 2026-10-20 and the full check list green, the Maestro set 33 / 33 (IMPLEMENTATION_STATUS.md, "Card scan"). ADR 0020 (the owner lifted the Phase 11 hold on 2026-10-15 for this on-device text scan only), V129 (flag `cardTextScan`, on), contract `docs/api/contracts/card-scan.md`: the phone reads the name and the set code (Apple Vision / ML Kit through the local Expo module `OrenjiTextReader`), `POST /cards/scan-match` finds the printing, `POST /inventory/items/batch` adds the ready cards (`Idempotency-Key`). A development build for the iOS simulator only, by the owner's order (no phone build; on Android, the owner built `main` on Windows 11 with `npx expo run:android` and the scan worked on their phone (2026-10-20); this Mac still has no Android SDK). Real cards on the finished screens: 28 of 32 found right away, 2 after one pick, 0 wrong, 2 not read. Not pushed; its pull request next. |
| Web redesign stage WA (Tokens and the shell, boards W3, W28, W29 and W30; owner prompt `docs/product/specs/2026-10-28-web-redesign-stages.md`, spec `docs/product/specs/2026-10-20-web-redesign.md`) | branch `feature/wa-tokens-shell`, worktree `OrenjiTrade-web` (walk stack 8580 / 4400, `orenjitrade_wa_check`, Redis db 6) | Builder done, not pushed (IMPLEMENTATION_STATUS.md, "Web redesign WA: Tokens and the shell"): the tokens (light `onPrimary` in ink, shared with the phone), Material through the tokens, the new shell (top bar, rail, tab bar, pills, global search, account menu, toasts, shortcuts and the "?" dialog), the routes and redirects of spec 4.11, offers and payments out of the web UI; no API change, no migration. Review fixes 1 and 2 done (fix 2: the phone's per-tab top bars below 960, old offer notices headed as history, `re2js` 2.8.8 for `audit:gate`). Next: its pull request, then WB. |
| Web redesign stage WB (Inventory and Import, boards W10 to W17; spec section 9; decisions 8, 18, 19 and 20) | branch `feature/wb-inventory-import`, stacked on WA, worktree `OrenjiTrade-web` (walk stack 8580 / 4400, `orenjitrade_wb_check`, Redis db 6) | Builder done, not pushed (IMPLEMENTATION_STATUS.md, "Web redesign WB: Inventory and Import"): the phone's card model, the binder pane by game, the table and the grid, the bulk dock with Undo, inline edits, quick add rows, drag to binders with menu paths, the Edit card and Add cards drawers, the Binders tab, Edit binder, New binder, Import; the chips' AA contrast; the phone's web E2E harness refuses a stale build; no API change, no migration. The post-import selection waits (the commit returns no ids; decision 19). Next: its reviewers, then its pull request after #93, then WC. |
| Web redesign stage WC (Messages: the deal beside the chat, boards W18 to W21; spec sections 10.1 to 10.6 and 10.8; decision 9) | branch `feature/wc-messages-deal`, stacked on WB with the owner decisions of 2026-10-28 merged in, worktree `OrenjiTrade-web` (walk stack 8580 / 4400, `orenjitrade_wc_check`, Redis db 6) | Builder done, not pushed (IMPLEMENTATION_STATUS.md, "Web redesign WC: Messages: the deal beside the chat"): WB's V3-1 fixed first; the inbox (340), the chat and the deal panel (320) at lg, a drawer at md, one pane per route below 960; the pinned card with the seller's Mark as sold (copies, tracking) and its undo, the sale notes, quick replies, the "+" menu (address and e-Transfer email typed each time, never saved; a photo; a card from your inventory; a binder), Rate and Report as spec 10.5, the non-modal chat drawer from Who has this card, binders, Home and profiles (F6, Esc), Settings › Shipping details; no API change, no migration (next V135); the chat tokens reach the web. Reviewers ran; review fix 1 done (the drawer and the drafts follow the account, one Messages route, the drawer pushes the page at lg, a chat below 960 above the tabs, "+" and "⋯" sheets below 960, the deal panel's errors, focus and contrast; web only); review fix 2 done (round 2 of 2: at md Esc on the page closes the overlaying drawer, Remove attachment keeps the focus in the composer); targeted review fix 3 done (R2-2: an account deletion gives every conversation whose last message it erased the newest message left, so no inbox preview keeps the erased text, an API fix with no DTO, OpenAPI, schema or migration change; R2-1: at md a search field's Esc with text is the field's; the stored preview (R1-3) stays until the next message, a fixed preview is an owner follow-up; the "Accepted offer" label (R1-4) stays as history). **Merged** (#98, merge commit `31f53904`, 2026-10-29, after #93, #94 and #95). |
| Web redesign stage WD (Search, Who has this card, sets, binders and deck cores, boards W3 to W9; spec sections 6, 7 and 8; decisions 7, 10, 14, 15 and 17) | branch `feature/wd-search-cards` (WC #98 merged into `main` at `31f53904`, and `main` into the branch at `9ff27437`), worktree `OrenjiTrade-web` (walk stack 8580 / 4400, `orenjitrade_wd_check`, Redis db 6) | Builder done, not pushed (IMPLEMENTATION_STATUS.md, "Web redesign WD: Search, Who has this card, sets, binders and deck cores"): WC's V3-2 fixed first; the game pill reads `GET /games`; Search's list beside the map (Cards, Binders with the state list, Wishlist with the holder pane), a binder or deck core beside the list at lg and in a middle pane at xl (a view spent only on an explicit open), Who has this card at `/cards/:id` (no prices or card text, "Any printing ▾", "Jump to", "Also in a deck core", "I have this card" with Inventory's Add drawer over the page), set pages with "Add from this set", the binder and deck core pages; one additive API parameter (`sort` on `GET /public/binders/{id}/items`), no migration (next V135); the new decode-uri-component advisory allowlisted until 2026-11-30 (no CommonJS fix). Reviewers ran (51 findings); review fix 1 done (the map's real click with the outlines in their own pane, region and game switches, the wish dialog of spec 6.6 with Remove, account changes, `ownerRating` on `GET /public/binders/{id}` (additive), the narrow first view's map card, "Who has cards of this set" on that set's cards, the deck core panel, sets, keyboard paths and tests for every rule a mutant passed). Review fix 2 done (round 2 of 2: Search's set list sends the browsed game and the game pill drops the set; a tap by the set page's footer lands; the toasts clear the wishlist dock as measured; Esc hides a hovered note or state tooltip with the focus anywhere; the narrow state card above the tab bar as board W29 with "Canada · your province"; map tooltips inside the map; web only). Round 2 approved with one minor (R2-1, two note tooltips and Esc) and nits left open, carried into stage WE. **Merged** (#99, merge commit `46650aca`, 2026-10-30). |
| Web redesign stage WE (Home, profiles, notifications and settings, boards W1, W2 and W23 to W25; spec sections 5, 11, 12 and 13; decisions 13 and 16) | branch `feature/we-home-profiles`, made on WD (#99, merged; `main` merged in at `30eb9eb8`), worktree `OrenjiTrade-web` (walk stack 8580 / 4400, `orenjitrade_we_check`, Redis db 6) | Builder done, not pushed (IMPLEMENTATION_STATUS.md, "Web redesign WE: Home, profiles, notifications and settings"): WD's R2-1 and nits and WC's V3-1 fixed first (a deletion renames the deleted collector in others' message notifications and wishlist alerts); Home's feed with the chips, "New posts · Show" without a number, the end and day one, "I have it" with its draft, Get started or the guest card and a static SVG map card; profiles (W23, W23b); the bell's popover and `/notifications` without chats (`excludeTypes=MESSAGE`), reminders answered in place, old deals as history; Settings' grouped nav, Location with "Show me on the map" and what others see, Appearance tiles, Settings › Legal; one additive API parameter (`previews` on `GET /feed`), no migration (next V135). Reviewers ran (functional, product and UX, privacy, accessibility; 31 findings); review fix 1 done (the bell's popover takes and keeps the focus; a deletion also renames others' rating and sale notifications, the job handing participants the handle; guests on `previews=6` in GeoPrivacyContractTest; Shift+Tab never under Home's toolbar, the rail scrolls under it; the map card frames the region and says when its counts fail; Location's what others see follows the form and says nobody sees your place while hidden; a blocked profile reads nothing; focus kept or moved after every in-place change; tests for each surviving mutant). Review fix 2 done (round 2 of 2: the mouse wheel over Home's rail reaches the page again, no overscroll containment, with an E2E step; "Still have them" in the bell over `/notifications` keeps the focus in the popover, rows answer inside their own `data-notification-surface`, with a unit test; web only). Round 2 approved with one minor (R2-1, the focus after "Still have them" in the Unread view) and nits left open, carried into stage WF. Next: its pull request against `main`, merged on green. |
| Web redesign stage WF (Messages › Community, board W22; spec sections 10.7 and 10.8; decision 11; after phone R11) | branch `feature/wf-community`, stacked on WE (`feature/we-home-profiles`, #100), worktree `OrenjiTrade-web` (walk stack 8580 / 4400, `orenjitrade_wf_check`, Redis db 6) | Builder done, not pushed (IMPLEMENTATION_STATUS.md, "Web redesign WF: Messages > Community"; contract `docs/api/contracts/wf-web-community.md`): WE's R2-1 and nits fixed first (R2-2: `raterId` and `sellerId` in new rating and sale notifications, the deletion renaming by id, older rows by handle once the account existed); the five game rooms of the browsed region with Community's own region pill beside the open room (the browsed game's first; dots for posts since the last visit in this browser, removed on sign-out), posts read like a chat with a shared card, deck core or binder and a phone's photos read only, "⋯" (Message, Report this post with the post in the dialog, Block with Undo), the message box with "+" (your public cards and binders of the room's game), Room rules as the third pane, a drawer at md, a sheet below 960; one Messages route for the inbox, a chat and a room; the web E2E database no longer reactivates V134's archived channels (`PAUSED_WEB_CHANNELS` dropped from the harness and the CI job). No migration (next V135). Reviewers ran (functional, product and UX, privacy, accessibility; 27 findings); review fix 1 done ("Share a card" in a room searches all cards of the catalogue again below your own; a card and a binder together in a post, both shown; every page shown read again every 15 s so removed, blocked and suspended authors' posts leave older pages, the rooms list read again too and closed with the room; focus kept after Unblock, a tab switch, Message, the last older page and Try again; older posts put into the live log quietly; the rooms one Tab stop with j k; Skip to the message box; the photo viewer's Close named; Report this post as board W22; tests for every surviving mutant, API tests for older sale rows and the rating notification in GeoPrivacyContractTest; web and API tests only, no API source change). Next: round 2 of its reviewers, then its pull request after WE's. |

**Not built, by the owner's decisions:** stage S3 of the 2026-10-08 change (the printing picker
with holder counts on the card page, holders by rarity, "Find this card", "Who wants it", "Wanted by
N", have/want counts in search, the rarity and code query parsing, the server-side search history)
and stage S4 (photos in community posts): skipped on 2026-10-13 until the owner asks (stage R11, from the owner's prompt of 2026-10-20, brought a simpler version of its photos to the rooms). The web
import screen of S5, and every web screen after 2026-10-12: the web app is paused. Phase 11 (ML
card scanning), the full French UI translation and every cloud deployment stay on hold.

**Decided next (owner, 2026-10-14): the phone redesign**, stages R1 to R8
([`docs/product/specs/2026-10-14-phone-redesign.md`](../product/specs/2026-10-14-phone-redesign.md),
verbatim). **R1 and R2 are on `main`** (#72; R2, mockup screens 1 to 9, by its own pull request
after it merged F1 on 2026-10-15); **R3 is on `main`** (#75, binders and deck cores,
mockup screens 16 to 18); **R4 is on `main`** (#76, messages and Mark as sold, mockup screens
22 to 25); the owner's inventory change of 2026-10-16 (mockup v43: the Public / Private tag, the
price in "$" or "% TCG") is on `main` (#77); **R5 is on `main`** (#78, Search, mockup screens 11
to 15); **R6 is on `main`** (#82, profiles and Settings behind the gear), then stage G (#85,
one game at a time); R7, R9, R10 and R11 are on `main` by the first giant pull request (#86); R12 to
R15 and the wrap-up R8 are on `main` by the second (#87, `7bfc879e`, 2026-10-27; owner's exception of
2026-10-21; the owner's prompt of 2026-10-19/20 for G and R9 to R15). The documents describe the
phone as the whole redesign leaves it: five tabs (Home, Search, Inventory, Messages, Profile), the
app opening on Home (as a guest when signed out, R15), one game and one region at a time, no
offers, trades, protected payments or disputes on the phone (ADR 0018), deals in the chat by mail
with Mark as sold and its undo, nothing to buy (ADR 0019).

**Free for all (owner, 2026-10-14, after the redesign spec):** *"can you remove the implementation
of premium subscription and ads? Just save pay service feature in a new branch for later. I am
trying to make this app free for all first."* Stage F1 did it (ADR 0019; merged with R1 on
2026-10-15). Where the redesign spec
says Premium, credits, donations or ads "keep their flags" or "move into Settings", this later
decision wins: they are gone, and R2 to R8 build no screen for them (R2 has no sponsored row,
upgrade offer or paid entry point; its limit messages are F1's plain caps).

The owner's local dev database was still at V105 on the Windows machine; a fresh Mac database
migrates to the newest level of `main` (V127: R1's V115 and V116, F1's V120–V123, R2's V125,
R3's V126, R4's V127; V117–V119 and V124 unused: V124 was kept for the card scan, which took
V129, the newest level once it lands) at the
first `npm run dev`, and
loses its trading areas by design (S1).

## 2. The 2026-10-08 change: how it ended

The owner's spec is in [`docs/product/specs/2026-10-08-have-want-regions.md`](../product/specs/2026-10-08-have-want-regions.md)
(verbatim). It was delivered in stages, one PR each, and the owner changed the plan on the way:

| Stage | Spec sections | Status |
| --- | --- | --- |
| S1 geography | 1, 3 (+ forced parts) | merged (#57) |
| S2 simplified wishlist | 4 | merged (#60) |
| M9 regions on the phone (not a section: the phone catches up with S1) | — | merged (#67) |
| Lock fix (not a section) | — | merged (#68) |
| S3 search, card page printing picker, have/want, wanted-by, search history | 2, 2b | **not built**: skipped by the owner on 2026-10-13; the redesign of 2026-10-14 drops "Who wants it", "Wanted by N" and the holder counts from the phone and keeps recent searches on the phone |
| S4 community photos (no videos) | 5 | **not built**: skipped by the owner on 2026-10-13 (the region channels were done in S1); stage R11 of the owner's prompt of 2026-10-20 later brought a simpler version to the rooms (up to 4 photos of 3 MB per post, photos only, EXIF and GPS stripped; no admin setting, no gallery) |
| S5 inventory import: YDK + Collectr CSV | 6 | merged (#69): the API and the phone screens; not built: the web import screen (web paused) |
| S6 final docs, definition-of-done walkthrough | 8, 9, DoD | branch `feature/s6-final-docs`, waits for its ship step |

The clause-by-clause result (12 done, 5 partly, 5 not built), what each skipped piece would take
and the decisions the owner can still overrule are in the
[delivery report](../product/2026-10-08-change-delivery-report.md).

Facts the spec gets wrong (handled, keep handling): section 7 says the mobile app "calls only GET
/api/v1/meta" — it uses more than 120 API paths, so every API change must adapt `apps/mobile`; the
`/mnt/project-files/...collectr-csv-import.md` prompt does not exist (S5 was built from section 6
itself: export from Collectr, header aliases, never call Collectr, never store Collectr prices).

## 3. Exact next steps

0. **Owner order of 2026-10-20: stop all work on the French version, and the app supports
   English cards only.** Add no French text, no French legal work, no language switch and no
   card-language choice beyond English; the existing French legal texts and their flow stay as
   they are for now (removing them is not a stage's job until the owner asks).
   **The owner's two prompts of 2026-10-19, saved word for word:**
   [`docs/product/specs/2026-10-19-home-full-design.md`](../product/specs/2026-10-19-home-full-design.md)
   (Home, stage R7; it replaces the redesign spec's section 5 and adds to its feed endpoint) and
   [`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../product/specs/2026-10-20-finish-the-phone-ui.md)
   (stage G, one game at a time, and stages R9 to R15; no Inventory › Wanted tab and no
   WANTED_ALERT). **All of it is on `main`:** R6 (#82), G (#85), R7 with R9, R10 and R11 (#86,
   the first giant pull request) and R12 to R15 with the wrap-up R8 (#87, `7bfc879e`,
   2026-10-27, the second). The phone redesign is complete.
1. **Exact next task: ship the owner decisions of 2026-10-28** (branch
   `feature/owner-decisions-1028`, worktree `OrenjiTrade-r2`; IMPLEMENTATION_STATUS.md, "Owner
   decisions of 2026-10-28: suspended collectors, large text, quick replies after a sale, blocks",
   and NEXT TASK): its pull request (merge on green CI); both review rounds are done. The owner decided R8's
   follow-ups 1 to 3 (cap handles and toasts only; screen 44 with the login left on, one decision
   with R12's follow-up 3; the quick replies after a sale) and R13's follow-up 7 (a block answered
   as "not found"). **Then decision 5**, Magic's Scryfall file: "Default Cards" (owner,
   2026-10-28), once the Scryfall import fix of the other session (`fix/scryfall-jsonl-bulk`) is on
   `main`. The TCGdex MIT notice in the app is a question for the owner's lawyer; the real catalog
   imports are the owner's step; the card scan's Android run waits for an Android device. None
   brings back a paid feature (ADR 0019). Migrations: the newest on `main` is V134 (R11's rooms;
   V124 and V128 unused); the next is **V135** (the batch adds none); an ADR takes **0022** or
   later.
2. R1 (#72), F1 (#73) and R2 are on `main`: R1 and F1 merged together on 2026-10-15
   (IMPLEMENTATION_STATUS.md, "Free for all", "Merged with R1 (2026-10-15)"), then R2 merged
   `main` (IMPLEMENTATION_STATUS.md, "Phone redesign R2", "Merged with free for all
   (2026-10-15)"); S6 is on `main` (#71); nothing is left of the 2026-10-08 change except what
   the owner skipped.
3. Anything else waits for the owner's choice: the list is in the delivery report, section (j)
   (resume the web, S3 and S4, the Android SDK, the hardening list, the open launch decisions).

Checks every stage must pass before its PR (run them, retries off): `./gradlew exportOpenApi` and
`npm run generate:api` leave git clean; `npm run test:api`; `npm run test:web`; `npm run build -w
apps/web-angular` (initial bundle under the 900 kB warning budget: 899.31 kB after stage R1,
896.09 kB with R1 and F1, the same with R2, which changes no web file; the English legal texts
sit in the main bundle, and the deckCore tokens are kept out of `tokens.css`); `npm run test:e2e
-- --retries=0` (every spec green on the first attempt); `npm run test:mobile`; `npx expo export
--platform ios`, `--platform android` and `--platform web`; `npm run test:mobile:e2e --
--retries=0`; `npm run audit:gate`; `npm run test:scripts`; exactly what GitHub CI runs: `npm run
lint -w apps/web-angular`, `npm run format:check -w apps/web-angular`, `npm run typecheck -w
apps/mobile`, `npm run lint -w apps/mobile`, `npm run format:check -w apps/mobile`; and, when
`apps/mobile` changed, the full Maestro set (`npm run test:mobile:maestro -- --platform ios`,
33 flows since R4 (R2 renamed `inventory-add-edit-delete.yaml` to `inventory-add-edit-undo.yaml`,
native flow 1 of the redesign; R3 added `deck-core.yaml`, native flow 2; R4 added
`deal-deck-core-chat.yaml` and `deal-mark-sold.yaml`, native flows 3 and 4; R5 replaced
`holders-filters.yaml` with `search-who-has-this-card.yaml`, native flow 3 in full, and extended
`deck-core.yaml`, native flow 2 in full; R6 added `profile-pages-settings-gear.yaml`, native flow
6, so 34 flows; 38 since R11 and R12: R7, R9 and R11 added theirs, R12 rewrote two), about 60 minutes) on
the owner's simulator (section 4). Since Xcode 27.1 (on this Mac since 2026-10-16) iOS's
accessibility tree no longer lists the texts inside an accessible view apart: a flow matches such a
view (a banner, a form message) by its whole name, as `legal-french.yaml` now does. While the web is paused its checks are regression checks: a web failure is
recorded, not fixed.

**What still needs an Android emulator** (none on this Mac): the Android half of every change to
`apps/mobile` or to `apps/mobile/.maestro`. The iOS run proves the flows and the app on iOS only;
Android has its own steps in the shared subflows (the back key, `hideKeyboard`, the swipe-based
scrolls, the `checked` state, `10.0.2.2`) and its own app behaviour (edge-to-edge insets, the
keyboard, dialogs as windows, the file part of uploads). Say in the PR report "the Android run could
not be verified", never skip it silently; a flow change is written so that Android executes the
steps it executed before (platform-specific steps sit in `when: platform:` blocks).

## 4. How the work has been done (keep doing it)

- **One stage = builder → independent review → fix loop → PR.** The builder implements end to end
  (API + migrations + seeds with tests, the phone, docs). Then at least two independent reviewers
  run everything themselves: a functional verifier and a second lens that fits the stage (privacy
  audit, product/UX as a collector, French-language review). At most two fix rounds, then the ship
  step merges `origin/main`, pushes, and opens the PR with a plain-language report (what changed,
  decisions, how it was verified, what could not be verified, owner follow-ups).
- **Ultracode workflows** run these stages; split a large change into batches so the owner can
  check results between them. Prefer resuming a stopped workflow from its cache over redoing work.
- **Isolation:** do feature work in a separate git worktree (sibling folders of the main checkout,
  `/Users/yunji/Dev/OrenjiTrade-<name>`); never build or commit in the owner's main checkout while
  they may be running the app. The owner's dev stack uses ports 8080 (API) and 4200 (web) and the
  database `orenjitrade` — never bind those ports, never touch that database, never
  stop/restart/reset the Docker containers `orenjitrade-postgres`, `orenjitrade-redis` and
  `orenjitrade-firebase-auth` (`npm run infra:reset`, `docker compose down`). Test suites have
  their own stacks: web E2E `orenjitrade_e2e` on 8180/4300 (Redis db 2), mobile E2E
  `orenjitrade_mobile_e2e` on 8090/19006/8082 (Redis db 1); reviewers' live walks used 8480/4480
  (a database of their own such as `orenjitrade_s6_check`, Redis db 5) and 8490/4490 (Redis db 6),
  each dropped or flushed at the end. Every isolated API gets its own card-image cache and media
  directories (start-up reconciliation deletes files its own database does not reference;
  `scripts/lib/web-e2e-guard.mjs` shows the environment; the web E2E job of CI must give its API
  the same, `scripts/lib/web-e2e-ci-parity.test.mjs` fails otherwise).
- **Gradle daemons are shared by every worktree.** Never run `./gradlew --stop`: it stops every
  daemon of that Gradle version, the one behind the owner's `npm run dev` API and other worktrees'
  running builds included. Stop only a daemon you started, by its PID (`pgrep -f GradleDaemon`
  before and after), or give a build its own registry with
  `-Dorg.gradle.daemon.registry.base=<a scratch directory>`.
- **The shell environment of every agent that runs Gradle, an npm test script or Maestro** (learned
  on the Mac):
  `export JAVA_HOME=/Users/yunji/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.12.1+1/Contents/Home`,
  `PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"`,
  `DOCKER_HOST=unix:///Users/yunji/.orbstack/run/docker.sock`,
  `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` and
  `ORENJI_IOS_SIMULATOR_UDID=<the UDID of the owner's booted iPhone>`. After a restart of the Mac
  OrbStack is not running until `orbctl start`, and `/var/run/docker.sock` is gone until it is, so
  Testcontainers fails without the two Docker variables (do not recreate the link: it needs admin
  rights). The three shared containers come back by themselves; the Auth emulator loses its
  accounts.
- **The owner's simulator** (owner order of 2026-10-12). The owner keeps an iPhone simulator booted
  for the native runs (an iPhone 18 Pro, iOS 27.0, since 2026-10-13). Every native run sets
  `ORENJI_IOS_SIMULATOR_UDID` to it (`xcrun simctl list devices booted`); without it the harness
  would create and boot its own "OrenjiTrade Maestro" simulator, which is not allowed here. Never
  boot, create, erase, shut down, restart or delete any simulator, and do not use the desktop app's
  simulator panel or tools: each boot makes the desktop app ask the owner for permission. If it is
  not booted when you need it, wait for it and say so. Screenshots:
  `xcrun simctl io <UDID> screenshot <file>`; appearance and text size:
  `xcrun simctl ui <UDID> appearance dark` / `content_size accessibility-extra-extra-extra-large`
  (or the launch argument of `subflows/relaunch-large-text.yaml`), put back to `light` and `large`
  afterwards; everything else through Maestro (`maestro --device <UDID> ...`). Leave no file in its
  Files storage and stop Expo Go at the end (a one-step Maestro flow with `stopApp`).
- **The simulator lock.** Sessions share that simulator and the ports 8090, 8082 and 19006 one at a
  time: before any native run, mobile web E2E run or walk, take the lock with
  `mkdir /Users/yunji/Dev/.orenji-simulator.lock` (it fails while someone holds it) and write who
  you are and since when into its `holder` file; remove it (`rm -rf` of that folder) as soon as the
  stack is stopped and the ports are free. If `mkdir` fails, read the holder and wait with one plain
  background loop, doing meanwhile what needs neither the simulator nor those ports. A lock older
  than two hours whose holder runs no `maestro` or `test.mjs` process is stale: say so, remove it
  and take it. Never hold it while you are not using it.
- **Agents' notes files.** The network of this Mac drops now and then, and an agent that loses it
  is cut without warning. Every agent of a stage keeps a running notes file under
  `.local-dev/<stage>-notes/` in its worktree (git-ignored; it survives a restart, the scratch
  folder does not) with what is done, each result, every finding and what is next, and commits
  each finished part at once (`wip:` commits are allowed and tidied before the end; nothing is
  pushed until the ship step). An agent that finds such a file continues from it instead of
  starting over.
- **Stop every process you start**; leave no Metro, test stack, web server or test database
  running.
- **Walking the app by hand on the simulator**: `npm run test:mobile:maestro -- --platform ios
  --keep-running <one flow>` leaves the API and Metro up (`-- --stop` ends them). The Metro of the
  harness does not pick up source edits (it runs without file watching): after a change to the
  app, `-- --stop` and start again. Relaunch the app after a text size change (the screen on
  display keeps its old layout until it is drawn again). The names VoiceOver reads are in
  `maestro --device <UDID> hierarchy`.
- **Maestro's debug output** (`--debug-output`): every run leaves its screenshots and logs in
  `.local-dev/mobile-e2e/maestro/.maestro/tests/<YYYY-MM-DD_HHMMSS>/` of its worktree, 1 to 3 GB
  for a full set, and Maestro never deletes them (on 2026-10-20 about 230 GB had piled up across
  the worktrees and the Mac had 2 GB free). The harness now deletes, before each run, all but the
  3 newest of those folders (`ORENJI_MAESTRO_KEEP_RUNS=<n>` keeps another number, `0` none; the
  run that starts comes on top) and logs how many it deleted. Only folders named like a run's
  timestamp directly inside `.maestro/tests` are touched; `report.xml` stays. A worktree that has
  not run the harness since keeps its old folders: delete them by hand.

## 5. Owner working agreements

- **Merging:** Claude may push, open PRs and merge them into `main` once **all CI checks are
  green**: merge commits (not squash), in order for stacked PRs, then delete the branch. Dependabot
  PRs are not covered (the owner has not decided the Dependabot cleanup); the ones superseded by the
  SDK 58 upgrade (#14 #15 #21 #26 #27, not #23) are closed when #54 merges.
- **Local-first and free:** no cloud deployment, no `terraform plan/apply`, no `gcloud`, no EAS
  (build/submit/update/login), no `expo login`, no native build, no Maestro Cloud or
  `maestro login`, no paid APIs or usage credits. Seeds, tests and agents never call YGOPRODeck (a
  real catalog import is the explicit `npm run catalog:import`, an owner step), and nothing ever
  calls Collectr. The owner is budget-conscious: ask before anything that can cost money, and run
  multi-agent work in moderate batches.
- **On hold:** Phase 11 ML card recognition (keep `mlScanning` off, no camera scanning; the owner
  lifted the hold on 2026-10-15 for the on-device text scan of ADR 0020 only); the Expo SDK
  58 upgrade until it is stable; the full French UI translation (the owner said "hold, don't start"
  on 2026-10-07 — the plan stays in IMPLEMENTATION_STATUS.md).
- **Launch decisions (2026-10-05):** discovery + messaging only (protected payments off at launch),
  18+ self-declaration, legal texts in English and French that stay marked as drafts (never remove
  the draft banner or a `[to confirm]` placeholder, never claim legal compliance), Law 25 operating
  docs in `docs/security/`.
- **Regions (2026-10-08):** no coordinates, GPS, distances or geocoding anywhere; country +
  state/province + optional city (city only on the owner's public profile, hideable); three platform
  regions. This supersedes the earlier 3 km zone rule.
- **Mobile only (2026-10-12):** the owner paused the web app until a new order. Work in
  `apps/mobile` (and in the API when a mobile stage needs it); do not change `apps/web-angular`.
  Reading, building, testing and walking it are fine and wanted (it is the reference for what the
  phone should offer); a defect found there is recorded, not fixed. A lockfile change still gets
  `npm run build -w apps/web-angular` and `npm run test:web` once as a regression check.
- **S3 and S4 skipped (2026-10-13):** after the map, only S5 and S6; build nothing of S3 or S4 until
  the owner asks, and never describe them as done.
- **The phone redesign (2026-10-14):** approved as final (mockup v32); built in stages R1 to R8 from
  its spec. Until a stage lands, documents describe the phone as it is.
- **Free for all (2026-10-14):** no Premium, credits, donations or ads anywhere (ADR 0019); the
  usage limits stay, the same for every collector, and a reached limit never offers anything to
  buy. Protected payments, offers, trades and disputes stay on the server. The paid code is on
  `archive/paid-features`; bringing a feature back is an owner decision and a new migration.
- **CLAUDE.md is the owner's:** agents propose exact sentences in their reports (the open proposals
  are listed at the end of the delivery report) instead of editing it.
- **Pausing:** when the owner says pause, stop every workflow and process at once and report exactly
  what is committed, pushed or pending; resume from the workflow cache on "continue".
- **Tasks and reports:** the owner gives work as long pasted specs; report back in plain language
  (what changed, verification, what needs an owner decision), list placeholders left for the owner
  or the lawyer, and say clearly when something could not be verified.
- Windows-only facts in the old memory (Android SDK on `D:\SDK`, `maestro.bat`, `python` instead of
  `python3`, JDK 17 local, starting Docker with `Start-Process`) do not apply on the Mac.

## 6. Open owner decisions

- The owner decisions of 2026-10-28 (IMPLEMENTATION_STATUS.md, that section's "Owner
  follow-ups"): whether screen 44 should show a reason written for the collector (a field on the
  paused web's admin page; today's moderator notes are not sent), whether a blocked pair's chat
  should stay visible to the blocked side (today it leaves both inboxes, which tells a block from a
  suspension), and whether a new conversation refused for a block should answer 404 like a
  suspended recipient (it changes the paused web's E2E assertion). Decision 5 ("Default Cards" for
  Magic) waits for the Scryfall fix on `main`; the TCGdex MIT notice is with the lawyer.

- In-app purchases in store builds: no longer open for Premium, credits or donations (removed by
  stage F1, ADR 0019), and the phone takes no payment at all since stage R1 (ADR 0018: no
  protected payments on the phone); the question of ADR 0011 comes back only if a paid feature or
  payment protection returns to the phone.
- Stage R1 of the phone redesign (IMPLEMENTATION_STATUS.md, "Phone redesign R1"): confirm that the
  web exception for the "Trading safely" text also covered the two web spec files that pinned the
  old text (one assertion of `legal-page.component.spec.ts`, three strings of
  `e2e/launch-safety.spec.ts`; the guard of the new text reads the phone's copy, so the web's
  `legal-content.spec.ts` is as S6 left it); the lawyer's list of the meetup, offer and protection wording
  left in the Terms, the Privacy Policy, the Community Guidelines, the Marketplace, Payment
  Protection, Refund and Dispute and Acceptable Use policies; whether the phone's legal index
  keeps the Payment Protection and Refund and Dispute policies (ADR 0018: no claim of protection
  on the phone); the defaults R1 chose (old offer and trade notifications open nothing, a removed
  link lands on Messages, the chat tip opens "Trading safely", a holder row without a price reads
  "Open to offers" until R2, the keyboard and the iOS system views follow the app's theme, the
  splash is dark); the owner's database keeps its earlier seed texts (meetup, café) until a reset
  (`seed-data.md`).
- An arm64 PostGIS image: `postgis/postgis:17-3.5` is amd64-only and runs under Rosetta on Apple
  Silicon; decide before macOS 28 (Rosetta's end).
- `security/npm-audit-allowlist.json`: the node-forge and braces entries expire on 2026-11-30;
  re-evaluate before then or `npm run audit:gate` fails everywhere.
- The `[to confirm]` placeholders for the owner and the lawyer listed in PR #52 (privacy officer,
  effective dates, data locations, retention periods, governing law, the French texts).
- OrbStack: its free use is limited; the owner checks OrbStack's current licence terms for
  commercial use and decides (macos-setup.md 4.4). On the owner's Mac it also publishes the dev
  ports (PostgreSQL, Redis, Auth emulator) on every network interface while the macOS firewall is
  off, and it does not start at login (section 4).
- Installing the Android SDK and an arm64 AVD on the Mac (macos-setup.md 9.3): skipped for now
  (2026-10-10). Until it is installed, nothing on this Mac proves the Android half of a mobile
  change.
- Photo and file uploads from the Android app: on iOS no photo could be uploaded (Expo's fetch
  refuses React Native's file part) and that is fixed and proven on the simulator; Android runs the
  same fetch and is expected to fail the same way, for photos and for the import's file, but keeps
  its old code until an Android run can prove the fix (`apps/mobile/src/api/localFilePart.ts`;
  IMPLEMENTATION_STATUS.md, "Mobile app on the iOS simulator", Open).
- Uploaded photos can come out rotated on every client: the API drops a photo's EXIF orientation
  when it re-encodes the upload (same section). A backend fix, not started.
- The inventory import (stage S5; the delivery report, section (f), lists each with the one place to
  change it): (1) a card whose file names no condition starts at the lowest grade of its game
  (`DAMAGED`); confirm, or say `NEAR_MINT` (`ImportMatcher.defaultCondition`). (2) No limit caps
  the size of an inventory: V113 adds `inventory.items.max` without a number; give it one (for
  everyone) in `/admin/usage-limits` or leave it open. (3) Collectr's real CSV header was never seen; try a real
  export once. (4) An import never raises a card the collector shows (its copies become a private
  card). (5) "Use the most recent printing" takes the plain copy where a set holds several versions
  and marks the line; there is no "confirm all" for those lines. (6) Whether a preview line should
  show the file's variant (a migration and a contract change). (7) The web import screen and a web
  admin page for the `inventory.import.*` settings are not built (web paused). The redesign keeps
  (1) and (2) open (its section 16).
- Blocked collectors in the collectors section of `GET /search`: removed after a cache that every
  viewer shares, so the section can hold fewer rows than asked; excluding them before the limit
  means a cache per viewer (stage S6, recorded).
- The freshness job no longer waits for a row another write holds (the lock fix): such a binder or
  item is aged, warned, hidden or unlisted one hour later. Confirm, or ask for the waiting job back
  (it is what deadlocked).
- A dialog on screen with an empty accessibility tree (found during stage S5): **cause found and
  fixed on 2026-10-13**, branch `fix/ios-second-modal-accessibility`, merged as #70 on 2026-10-14
  (IMPLEMENTATION_STATUS.md on `main`, "A scrim iOS takes for a modal"). iOS takes a window-sized
  view with a translucent pure black background for the dimming view of a modal, the native view
  keeps that mark, and React Native reuses it: the dark theme's scrim was such a black. A view that
  covers the window takes `palette.scrim`, never a pure black. Left for the owner, optional: hear a
  sheet then a dialog with VoiceOver on a real iPhone in the dark theme (the verdict rests on
  UIKit's own traversal on the simulator).
- Optional, offered and not chosen yet: Phase 13 hardening (accessibility pass, load test, index
  review, backup-restore drill, failure tests), with the follow-ups of the lock fix (a lock timeout
  on inventory writes, the after-commit analytics listeners that can exhaust the connection pool).
- The macOS issues of [macos-setup.md](macos-setup.md) section 12: items 1 to 4 and 7 to 13 were
  fixed on 2026-10-10 (item 2, the iOS path of the Maestro harness, and the macOS and Linux
  examples of `apps/mobile/README.md` with it). The Android run of the native suite on a Mac
  stays unproven until the Android SDK is installed (owner decision: skipped for now).
