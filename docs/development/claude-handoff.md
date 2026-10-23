# Claude Code handoff (2026-10-09, machine notes updated 2026-10-10, state updated 2026-10-20 after stages R1 to R6, F1, the owner's inventory change of 2026-10-16 (#77), the card scan (#83) and the builder of stage G): continuing OrenjiTrade on the Mac

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
| Stage R7 of the phone redesign (Home, mockup v50 screens 10, 10b and 10c; owner prompt `docs/product/specs/2026-10-19-home-full-design.md`) | branch `feature/r7-home` (worktree `OrenjiTrade-r2`) | Builder done (V133 `binder.core_since`; IMPLEMENTATION_STATUS.md, "Phone redesign R7: Home"; contract `docs/api/contracts/r7-home-feed.md`): Home as the first of five tabs (the app's first screen; old map links still open Search's map), the region and game pills with the bell, the search field, Get started (three steps, "Turn on", hidden for good per account on the phone), the chips pinned on scroll, the feed `GET /api/v1/feed` (30-day window as a server setting, new cards per collector and hour with "+n", wishes with "I have it", deck cores, blocks both ways in SQL before the limit, never the caller), the end, the quiet, empty, loading and error states; the seed's feed dated relative to now; native flows `home-feed.yaml` and `home-get-started.yaml`; walked on the iPhone 18 Pro in dark and light at the default and the largest text size (four layout fixes). Review fix 1 done (18 findings: blocks refresh Home, old map links followed once, the feed's later pages dated by the first page's time, "Back to the map", errors keep the chips and the title, the reader's place; tests for every surviving mutant). Review fix 2 done (round 2 found one minor finding: `FeedIT` now reads three pages and more, each keeping the first page's time). Ship step next. Not pushed. |
| Stage R9 of the phone redesign (Notifications and the bell, mockup v50 screen 31; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R9) | branch `feature/r7-home` (worktree `OrenjiTrade-r2`), for the one giant pull request of R7, R9 to R15 and R8 (owner, 2026-10-21) | Builder done (no migration; IMPLEMENTATION_STATUS.md, "Phone redesign R9: Notifications (31) and the bell"; contract `docs/api/contracts/r9-notifications.md`): the bell's orange dot and "Notifications, {n} new" on the five tabs, Notifications with New and "Mark all as read", Earlier, cursor paging, each kind's icon, colours, sentence and target, freshness reminders answered in place ("Still have them", "Review the binder"), the empty, loading and error states, a tapped push opening its row's target; API: optional `excludeTypes` on `GET /notifications` and its unread count (the phone sends `MESSAGE`), new `data` keys for wishlist alerts, sales and freshness notices; the paused web's client keeps the unread count without parameters (`packages/api-client/tools/web-omits.mjs`); native flow `notifications-bell.yaml`; walked on the iPhone 18 Pro in dark and light at the default and the largest text size (five fixes). Review fix 1 done (a notice that opens nothing shows its whole line, the chat's Back from a sale notification, a chat push opens the chat, New pages past 50 unread; the full check list green, the native suite 38 / 38). Re-review next. Not pushed. |
| Stage R10 of the phone redesign (Card data for Magic and Pokémon, mockup v50 screens 34 and 53 once a game has cards; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R10) | branch `feature/r7-home` (worktree `OrenjiTrade-r2`), for the one giant pull request | Builder done (no migration, no API change; IMPLEMENTATION_STATUS.md, "Phone redesign R10: Card data for Magic and Pokémon"; ADR 0021; contract `docs/api/contracts/r10-card-sources.md`; `docs/providers/scryfall.md`, `docs/providers/tcgdex.md`): `ScryfallCardProvider` (the "Unique Artwork" bulk file, English paper cards, one image per artwork, refreshed at most daily, at most 10 requests a second) and `TcgdexCardProvider` (the card database's archive from GitHub with its MIT `LICENSE`, English only, Pokémon TCG Pocket left out, one card per English name, one image per printing), tested on hand-written fixtures only (`CardSourcesImportIT`: `hasCards` after a fixture import); printings on their own artwork; the credits under the pictures and in Settings › Appearance; Who has this card shows a chosen printing's picture; every harness turns the providers off; "never hotlink provider images" in ADR 0015 and CLAUDE.md. Walked on the iPhone 18 Pro with a fixture import on a stack of its own (before: Magic and Pokémon "Cards coming soon"; after: browsable with pictures and credits), dark and light, the default and the largest text size. **The owner runs the real imports** (the commands are in the section). Review fix 1 done (tests for the TCGdex set-code rule and the other surviving mutants; a Magic code typed as printed, `ZTK 0012`, finds `ZTK-12` in search and suggestions; ADR 0021's rejection of "Default Cards" corrected; owner decisions: "Unique Artwork" or "Default Cards" for Magic, the TCGdex MIT notice in the app). Review fix 2 done (a padded code typed as printed lists its own printings only, each once: `ZSK 001` never `ZSK-100`, `EMR 001` never `EMR-150`; the number without its zeros only as a fallback, read as the whole number). The lead's check of fix 2 next, then R11. Not pushed. |
| Stage R11 of the phone redesign (Messages › Community, one simple room per game, mockup v50 screens 32 and 33 and screen 22's tabs; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R11) | branch `feature/r7-home` (worktree `OrenjiTrade-r2`), for the one giant pull request | Builder done (V134; IMPLEMENTATION_STATUS.md, "Phone redesign R11: Messages > Community (32, 33): one simple room per game"; contract `docs/api/contracts/r11-community-rooms.md`): Messages with Chats \| Community and an orange dot on Chats while a chat is unread; one public room per platform region and game (15; every other channel archived, nothing deleted; `publicChat` on unless an admin chose); the browsed region's five rooms, the browsed game's first, each with its last post and a dot for posts newer than the last visit on this phone; a room read like a chat (rules, banner, day separators, "{province} · {time}" for discoverable authors only, never a city, up to 4 photos uploaded as `COMMUNITY` of 3 MB with EXIF and GPS stripped, a shared card, binder or deck core with its badge and price), the "⋯" sheet (Message, Report, Block, Delete your own), the message box with its "+" sheet, the 429, duplicate and network errors with "Try again"; posts never notify. The paused web's suites keep their old channels in their own E2E database (`PAUSED_WEB_CHANNELS`; local harness and CI). Native flow `community-post.yaml`; walked on the iPhone 18 Pro in dark and light at the default and the largest text size (four fixes). Review fix 1 done (an open room shows newer posts every 15 s, on coming back and with a pull; a post's avatar and handle open the profile; the line under the handle at large text sizes; Community closes when a refresh finds it off; a post's place decided for a member who is not the author; a binder the reader can no longer open left out with its name and handle, `payload.binderUnavailable`; the rooms' count of what the caller may see; `COMMUNITY` uploads refused while `publicChat` is off; the tests the reviewers asked for). Review fix 2 done (the check of fix 1 approved it with two minor findings at the largest text size: a post's time is never cut by a long province; the community's closed, empty and error states scroll, `StateScroll`). The lead's check of fix 2 next, then R12. Not pushed. |
| Stage R12 of the phone redesign (Sign-in, sign-up and welcome, mockup v50 screens 36 to 46; owner prompt `docs/product/specs/2026-10-20-finish-the-phone-ui.md`, section R12) | branch `feature/r7-home` (worktree `OrenjiTrade-r2`), for the one giant pull request | Builder done (no migration, the next is still V135; IMPLEMENTATION_STATUS.md, "Phone redesign R12: Sign-in, sign-up and welcome (36 to 46)"; contract `docs/api/contracts/r12-sign-in-welcome.md`): Sign in with the wordmark and its line; Create your account with the documents in one card and the 18+ confirmation in its own (English only), "Create account" disabled until every box is ticked with one line saying what is missing; Reset password and Verify your email with their sent states in place; the welcome in three steps ("Who are you?" with the live handle check `GET /me/profile/handle-availability`, 60 per 10 minutes; "What do you collect?" with the game tiles, at least one game, "Opens first" on the first picked game with cards, which Home and Search open on; "Where do you ship from?" with its switches); no age step: an account without the 18+ confirmation is on Review our terms first (the age line alone when no document is due); Suspended, Scheduled for deletion ("Deletion cancelled" in place) and Could not load centred with a 72 pt icon. Native flows `sign-up-onboarding.yaml` and `age-step-existing-account.yaml` (rewritten); walked on the iPhone 18 Pro in dark and light at the default and the largest text size (six fixes: Sign in's last link above the home indicator, Review our terms in reading order, a drag hides the welcome's keyboard, the wordmark and the Google mark at the largest size, switches under their words at the largest size, the password's eye inside the field); the full check list green, the native suite 38 / 38, the mobile web E2E 62 / 62. Review fix 1 done (a screen kept for Review our terms or the welcome never opens for the next account and belongs to its collector, the welcome takes its own link; the keyboard never hides the field being typed in on the welcome and on Sign in, Create account and Reset password; "Choose your country." under the pickers, in view; the progress bar's 33, 67 and 100 %; Could not load's own words and `errorCode · requestId`; Reset password's "Resend in {n} s"; the welcome's tags without game and language tags; the first handle from the e-mail left to the owner). The reviewers' check of fix 1 next, then R13. Not pushed. |
| Camera card scan ("Scan with camera", Yu-Gi-Oh!, mockup screens 26 to 30; owner spec `docs/product/specs/2026-10-15-card-scan.md`) | merged as #83 (`1fb2e4ea`), from branch `feature/card-scan` (worktree `OrenjiTrade-card-scan`), its own session beside the redesign | Built and reviewed (a functional verifier and a privacy / collector lens, three fix rounds, the third approved by the owner, then the last small fixes); merged with `main` (R4, #77, R5) on 2026-10-20 and the full check list green, the Maestro set 33 / 33 (IMPLEMENTATION_STATUS.md, "Card scan"). ADR 0020 (the owner lifted the Phase 11 hold on 2026-10-15 for this on-device text scan only), V129 (flag `cardTextScan`, on), contract `docs/api/contracts/card-scan.md`: the phone reads the name and the set code (Apple Vision / ML Kit through the local Expo module `OrenjiTextReader`), `POST /cards/scan-match` finds the printing, `POST /inventory/items/batch` adds the ready cards (`Idempotency-Key`). A development build for the iOS simulator only, by the owner's order (no phone build; on Android, the owner built `main` on Windows 11 with `npx expo run:android` and the scan worked on their phone (2026-10-20); this Mac still has no Android SDK). Real cards on the finished screens: 28 of 32 found right away, 2 after one pick, 0 wrong, 2 not read. Not pushed; its pull request next. |

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
to 15); **R6 is built on its branch** (profiles, mockup screens 19 to 21, and Settings behind the
gear), waiting for its reviews; R7 and R8 are not built. The documents describe the phone as R1 to
R6 leave it: four tabs (Search, Inventory, Messages, Profile) until R7 adds Home, the Profile tab
being your page as others see it with a gear that opens Settings, no offers, trades, protected
payments or disputes on the phone
(ADR 0018), deals in the chat by mail with Mark as sold and its undo, nothing to buy (ADR 0019),
the Inventory and the adding of cards, the binders and deck cores, the Messages and the profiles
of the redesign.

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
   WANTED_ALERT). **The order now:** R6 (profiles, screens 19 to 21, and Settings behind the gear,
   from the redesign spec), then G, then R7 with the Home prompt, then R8, then R9 to R15 (R15
   after R12), one branch and one PR each. The mockup is version 50 of the owner's design canvas;
   ask the owner for a screenshot of any screen you need. Item 1 below predates these prompts: R5
   is merged (#78), and **R6 is built** on `feature/r6-profiles` (IMPLEMENTATION_STATUS.md, "Phone
   redesign R6: profiles"): its reviews (a functional verifier and a product / UX lens as a
   collector) ran and **review fix 1 is done** (the "⋯" sheet's Share profile, "I have it" leaving
   the chat's card alone until send, the Inventory link, the block rule of the references page,
   deck cores first, the own page's notes); **next: the reviewers' check of those fixes** (at
   most one more fix round), then its ship step, then G.
1. **The reviews of stage R5** (branch `feature/r5-search`, builder done; IMPLEMENTATION_STATUS.md,
   "Phone redesign R5: search"): a functional verifier, a privacy lens and a product / UX lens (as
   a collector), at most two fix rounds, then the ship step (merge `main`, the full check list
   below, the pull request, the merge on green). **Then stage R6** (profiles, mockup screens 19 to
   21, and Settings behind the gear), R7 (Home, the first of five tabs; it turns the hidden `index`
   route of the tabs, which redirects to Search today, into Home) and R8, in order, one branch and
   one PR each, none of them bringing back a paid feature (ADR 0019). Migrations: the newest on
   `main` is R4's V127 (R5 has none); V124 is unused (the card scan, which had it, took V129); the
   next is **V128** until the card scan's V129 lands, then **V130** (Flyway, without `outOfOrder`,
   refuses a version older than the database's newest one).
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
  `scripts/lib/web-e2e-guard.mjs` shows the environment).
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
