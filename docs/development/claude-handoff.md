# Claude Code handoff (2026-10-09, machine notes updated 2026-10-10, state updated 2026-10-14): continuing OrenjiTrade on the Mac

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

## 1. Where things stand (2026-10-14)

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
modal, #70, 2026-10-14) and **stage S6** (the final documents of the 2026-10-08 change, the
delivery report `docs/product/2026-10-08-change-delivery-report.md`, #71, 2026-10-14). Merged PRs
from 2026-10-05 on: #39 #40 #41 #45 #46 #47 #48 #49 #50 #51 #52 #53 #57 #58 #59 #60 #61 #67 #68
#69 #70 #71.

**Not on `main`:**

| What | Where | State |
| --- | --- | --- |
| Phone redesign, stage R1 ("Offers out, shipping wording, look"; ADR 0018) | branch `feature/r1-offers-out-shipping-look` (worktree `OrenjiTrade-regions`) | Built and under review on 2026-10-14 (its own section of IMPLEMENTATION_STATUS.md on that branch); migrations V115–V119 are its range. |
| Stage F1, "free for all" (owner, 2026-10-14; ADR 0019): Premium, ads, credits and donations removed from the API, the phone and the paused web app; the usage limits the same for everyone; protected payments kept | branch `feature/f1-free-for-all` (worktree `OrenjiTrade-s2-ux`), cut from `main` at `bf1135a` | Built on 2026-10-14 (IMPLEMENTATION_STATUS.md, "Free for all"): migrations V120–V123, ADR 0019, the legal drafts, the docs; the check list in that section. Waits for review and its ship step, **after R1** (merge notes in that section). The removed code is kept on the pushed branch `archive/paid-features` (`main` at `bf87f0b`). |
| Expo SDK 58 upgrade | draft PR #54, branch `feature/expo-sdk-58` | Done and verified, **held by owner decision (2026-10-07) until SDK 58 is stable**. Refresh steps are in the PR comment. |
| `backup/expo-sdk-58-deps` | branch only | A local experiment from the Windows machine, pushed as a backup. Not needed; do not merge. |

**Not built, by the owner's decisions:** stage S3 of the 2026-10-08 change (the printing picker
with holder counts on the card page, holders by rarity, "Find this card", "Who wants it", "Wanted by
N", have/want counts in search, the rarity and code query parsing, the server-side search history)
and stage S4 (photos in community posts): skipped on 2026-10-13 until the owner asks. The web
import screen of S5, and every web screen after 2026-10-12: the web app is paused. Phase 11 (ML
card scanning), the full French UI translation and every cloud deployment stay on hold.

**Decided next (owner, 2026-10-14): the phone redesign**, stages R1 to R8
([`docs/product/specs/2026-10-14-phone-redesign.md`](../product/specs/2026-10-14-phone-redesign.md),
verbatim). Nothing of it is built. Until a stage lands, every document describes the phone as it
is today (six tabs, offers on the phone).

**Free for all (owner, 2026-10-14, after the redesign spec):** *"can you remove the implementation
of premium subscription and ads? Just save pay service feature in a new branch for later. I am
trying to make this app free for all first."* Stage F1 does it (ADR 0019). Where the redesign spec
says Premium, credits, donations or ads "keep their flags" or "move into Settings", this later
decision wins: they are gone, and R2 to R8 build no screen for them.

The owner's local dev database was still at V105 on the Windows machine; a fresh Mac database
migrates to the newest level (V114 on `main`, V123 with stage F1) at the first `npm run dev`, and
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
| S4 community photos (no videos) | 5 | **not built**: skipped by the owner on 2026-10-13 (the region channels were done in S1) |
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

1. **Stage R1 of the phone redesign** ("Offers out, shipping wording, look"): built on
   `feature/r1-offers-out-shipping-look`; its review, then its ship step (merge `main`, the check
   list below, the pull request, merge on green CI), as the spec's section 15 says.
2. S6 is on `main` (#71); nothing left of the 2026-10-08 change except what the owner skipped.
3. **Stage F1, free for all**, after R1: review, then its ship step (merge `main` with R1: the
   merge notes in IMPLEMENTATION_STATUS.md, "Free for all", say how the conflicts resolve), the
   check list below, the pull request, merge on green CI.
4. **Then stage R2** of the phone redesign, from the new `main`; R3 to R8 follow in order, one
   branch and one PR each. None of them brings back a paid feature (ADR 0019).
5. Anything else waits for the owner's choice: the list is in the delivery report, section (j)
   (resume the web, S3 and S4, the Android SDK, the hardening list, the open launch decisions).

Checks every stage must pass before its PR (run them, retries off): `./gradlew exportOpenApi` and
`npm run generate:api` leave git clean; `npm run test:api`; `npm run test:web`;
`npm run build -w apps/web-angular` (initial bundle under the 900 kB warning budget: 899.93 kB
on `main`, 896.71 kB with stage F1); `npm run test:e2e -- --retries=0` (every spec green on the first
attempt); `npm run test:mobile`; `npx expo export --platform ios`, `--platform android` and
`--platform web`; `npm run test:mobile:e2e -- --retries=0`; `npm run audit:gate`;
`npm run test:scripts`; exactly what GitHub CI runs: `npm run lint -w apps/web-angular`,
`npm run format:check -w apps/web-angular`, `npm run typecheck -w apps/mobile`,
`npm run lint -w apps/mobile`, `npm run format:check -w apps/mobile`; and, when `apps/mobile`
changed, the full Maestro set (`npm run test:mobile:maestro -- --platform ios`, 30 flows, about
48 minutes) on the owner's simulator (section 4). While the web is paused its checks are
regression checks: a web failure is recorded, not fixed.

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
- **On hold:** Phase 11 ML card recognition (keep `mlScanning` off, no camera scanning); the Expo SDK
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
  stage F1, ADR 0019); protected payments are physical goods between people, outside in-app
  purchase rules (ADR 0011).
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
