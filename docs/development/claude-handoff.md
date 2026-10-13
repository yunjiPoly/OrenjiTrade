# Claude Code handoff (2026-10-09, machine notes updated 2026-10-10, state updated 2026-10-12): continuing OrenjiTrade on the Mac

Read this after `CLAUDE.md` and before `IMPLEMENTATION_STATUS.md` when you start a Claude Code
session on a new machine or after a long break. It records where the work stands, what to do next,
and the working agreements with the owner that are not written anywhere else (they lived in the
Windows machine's Claude memory). Machine setup: [macos-setup.md](macos-setup.md).

**The machine (2026-10-10).** A Mac mini (Apple M6, 12 cores, 24 GB RAM, macOS 27.0.1), not a
MacBook. Docker is **OrbStack** (Docker context `orbstack`, `/var/run/docker.sock` linked to it,
Rosetta on, 12 CPUs / 12 GB), not Docker Desktop. The only system JDK is Temurin 27, which works:
the Gradle daemon is pinned to Java 21 (`apps/api/gradle/gradle-daemon-jvm.properties`) and the E2E
harnesses pick a Java 21 for the API jar. Node 24.21.0, Xcode 27 with iOS 27 simulators (**the iOS
simulator is available**), Maestro 2.11.0. **No Android SDK is installed** (no adb, no emulator;
owner decision of 2026-10-10: skipped for now), so **the native Maestro check on this Mac is the
iOS run** (`npm run test:mobile:maestro`, which picks the iOS simulator when no Android device is
ready; [macos-setup.md](macos-setup.md) 9.5). Python 3.12 is not installed either (ML is on hold). The
macOS and OrbStack fixes of 2026-10-10 are on branch `chore/macos-ios-dev` until it is merged; a
branch without them needs `JAVA_HOME` set to a JDK 21 for Gradle. **After the fixes reach a branch,
run `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` once in every worktree that ever ran
Gradle on JDK 27** (`OrenjiTrade-regions` did on 2026-10-10). Gradle keeps the failed Spotless
result there (`:spotlessJava UP-TO-DATE`, then the same `NoSuchFieldError` lint errors) although
its daemon now runs on Java 21, and `npm run test:api` fails the same way because it reruns only
the tests. A new worktree can receive that failed result from the machine-wide Gradle build cache
(`:spotlessJava FROM-CACHE`); the same command clears it.

## 1. Where things stand

**On `main` (everything merged, CI green):** the web MVP (Phases 1–10), the mobile app
(Phases 1–10 + web parity, stages M1–M8), launch readiness (18+ rule, trading safety, French legal
pages, money features off by default, Law 25 operating docs), the low-cost first-year cloud profile
(ADR 0016, prepared only — nothing deployed), the E2E isolation from the dev database, and **stage S1
of the 2026-10-08 change** (platform regions replace geolocation; ADR 0017), **stage S2** (the
simplified wishlist and wishlist alerts, #60), the first run on Apple Silicon (#59) and the iOS
path of the native Maestro suite with the iOS defects it found (#61, 2026-10-12). Merged PRs
since 2026-10-04: #39 #40 #41 #45 #46 #47 #48 #49 #50 #51 #52 #53 #57 #59 #60 #61.

**Not on `main`:**

| What | Where | State |
| --- | --- | --- |
| Mobile stage M9 — regions on the phone (2026-10-12): the region switcher, the region map in the Map tab, the binders of a state or province, `react-native-maps` / `react-native-webview` / `leaflet` removed from the app | branch `feature/mobile-regions-map` (worktree `OrenjiTrade-s2-ux`), on top of `main` at `00714a9`, not pushed | Built and checked on the iOS simulator and the web export (IMPLEMENTATION_STATUS.md, "Mobile app: regions and the region map"). Reviewed on 2026-10-12 (17 findings, no blocker); fixed on 2026-10-13 ("Review fix 1" in that section). The second review approved it the same day with three minors, fixed at once ("Review fix 2"). Waits for the pull request. Android could not be verified on this Mac. |
| The binder / inventory deadlock fix | branch `fix/binder-count-deadlock` | In review; merges only with an approving final review. |
| Stages S3–S6 | — | Not started. **Owner order of 2026-10-12: mobile only, the web app is paused until a new order.** S3 is therefore next for the phone first: its API and its mobile screens (section 3). |
| Expo SDK 58 upgrade | draft PR #54, branch `feature/expo-sdk-58` | Done and verified, **held by owner decision (2026-10-07) until SDK 58 is stable** (it was npm `next`/beta on React Native 0.88 RC). Refresh steps are in the PR comment. |
| `backup/expo-sdk-58-deps` | branch only | A local experiment from the Windows machine (re-applied commits + Dependabot bumps), pushed as a backup. Not needed; do not merge. |

The owner's local dev database on Windows was still at V105 (unmigrated); a fresh Mac database
migrates to the newest level at the first `npm run dev`.

## 2. The 2026-10-08 change: stage plan

The owner's spec is in [`docs/product/specs/2026-10-08-have-want-regions.md`](../product/specs/2026-10-08-have-want-regions.md)
(verbatim, authoritative; it overrides older rules in CLAUDE.md and ADRs 0004/0010 where they
conflict). It is delivered in six stages, one PR each, in order:

| Stage | Spec sections | Status |
| --- | --- | --- |
| S1 geography | 1, 3 (+ forced parts) | merged (#57) |
| S2 simplified wishlist | 4 | merged (#60) |
| S3 search, card page printing picker, have/want, wanted-by, search history | 2, 2b | next: its API and its mobile screens first (owner order of 2026-10-12: mobile only) |
| S4 community photos (no videos), region channels already done in S1 | 5 | — |
| S5 inventory import: YDK + Collectr CSV | 6 | — |
| S6 final docs, definition-of-done walkthrough, completeness check | 8, 9, DoD | — |

Facts the spec gets wrong (already handled, keep handling): section 7 says the mobile app "calls
only GET /api/v1/meta" — it uses ~128 API paths, so every API change must adapt `apps/mobile`
(typecheck, lint, jest, mobile web E2E, Maestro) with mobile parity of new features recorded as a
follow-up; the `/mnt/project-files/...collectr-csv-import.md` prompt does not exist — build the
Collectr import from section 6 itself (export from Collectr, header aliases, never call Collectr,
never store Collectr prices).

## 3. Exact next steps on the Mac

1. Set the machine up with [macos-setup.md](macos-setup.md) (Claude Code with the `orenji` alias:
   bypass permissions + `--effort ultracode`, Docker with Rosetta, Java 21, Node 24, Android arm64
   AVD, Maestro). Done on 2026-10-10 except the Android SDK and its arm64 AVD (see "The machine"
   above).
2. Start Claude in the repo and point it here: *"Read CLAUDE.md, docs/development/claude-handoff.md
   and IMPLEMENTATION_STATUS.md, then continue the 2026-10-08 change from stage S2."*
3. **Finish S2:** done (merged as #60 on 2026-10-10 after the independent re-review).
4. **S3 → S6**, each the same way (section 4 below), each its own PR. Since the owner's order of
   2026-10-12 (mobile only, web paused) a stage is built as its API and its mobile screens; the
   web screens of that stage wait for a new order and are recorded as a follow-up.
5. The mobile follow-ups recorded in `IMPLEMENTATION_STATUS.md`: the region switcher, the state
   binder list, the region map and the `react-native-maps` removal are done (stage M9,
   2026-10-12); the printing picker with holder counts, have/want ("Who has it" / "Who wants it",
   "Wanted by N") and the search history on mobile come with S3.

Checks every stage must pass before its PR (run them, retries off): `./gradlew exportOpenApi` and
`npm run generate:api` leave git clean; `npm run test:api`; `npm run test:web`;
`npm run build -w apps/web-angular` (initial bundle under the 900 kB warning budget);
`npm run test:e2e -- --retries=0` (every spec green on the first attempt); `npm run test:mobile`;
`npx expo export --platform android` and `--platform web`; `npm run test:mobile:e2e`;
`npm run audit:gate`; `npm run test:scripts`; exactly what GitHub CI runs:
`npm run lint -w apps/web-angular`, `npm run format:check -w apps/web-angular`,
`npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`; and, when `apps/mobile` changed,
the full Maestro set (`npm run test:mobile:maestro`). **On this Mac that is the iOS run:** the
harness creates, boots and shuts down its own simulator ("OrenjiTrade Maestro"), so nothing has to
be started, and `npx expo export --platform ios` joins the export checks. The same flows run on
Android (`-- --platform android` with a booted emulator; the harness finds the SDK in
`~/Library/Android/sdk` by itself).

**What still needs an Android emulator** (none on this Mac): the Android half of every change to
`apps/mobile` or to `apps/mobile/.maestro`. The iOS run proves the flows and the app on iOS only;
Android has its own steps in the shared subflows (the back key, `hideKeyboard`, the swipe-based
scrolls, the `checked` state, `10.0.2.2`) and its own app behaviour (edge-to-edge insets, the
keyboard, dialogs as windows). Say in the PR report that Android "could not be verified on this
machine", never skip it silently; a flow change is written so that Android executes the steps it
executed before (platform-specific steps sit in `when: platform:` blocks).

## 4. How the work has been done (keep doing it)

- **One stage = builder → independent review → fix loop → PR.** The builder implements end to end
  (API + migrations + seeds with tests, web, mobile adaptation, docs). Then at least two independent
  reviewers run everything themselves: a functional verifier and a second lens that fits the stage
  (privacy audit, product/UX as a collector, French-language review). At most two fix rounds, then
  the ship step merges `origin/main`, pushes, and opens the PR with a plain-language report (what
  changed, decisions, how it was verified, what could not be verified, owner follow-ups).
- **Ultracode workflows** run these stages; split a large change into batches so the owner can
  check results between them. Prefer resuming a stopped workflow from its cache over redoing work.
- **Isolation:** do feature work in a separate git worktree; never build or commit in the owner's
  main checkout while they may be running the app. The owner's dev stack uses ports 8080 (API) and
  4200 (web) and the database `orenjitrade` — never bind those ports, never touch that database,
  never stop/restart/reset the Docker containers (`npm run infra:reset`, `docker compose down`).
  Test suites have their own stacks: web E2E `orenjitrade_e2e` on 8180/4300 (Redis db 2), mobile
  E2E `orenjitrade_mobile_e2e` on 8090/19006/8082 (Redis db 1); reviewers' live walks used
  8480/4480 (db `orenjitrade_regions_check`, Redis db 5) and 8490/4490 (`orenjitrade_regions_ux`,
  Redis db 6). Every E2E API gets its own card-image cache and media directories (start-up
  reconciliation deletes files its own database does not reference).
- **Gradle daemons are shared by every worktree.** Never run `./gradlew --stop`: it stops every
  daemon of that Gradle version, the one behind the owner's `npm run dev` API and other worktrees'
  running builds included. A build that needs its own daemon passes
  `-Dorg.gradle.daemon.registry.base=<a scratch directory>` and stops only that one with the same
  flag.
- **Stop every process you start**; leave no emulator, Metro or test stack running.
- **Walking the app by hand on the simulator** (`npm run test:mobile:maestro -- --platform ios
  --keep-running <one flow>` leaves the API, Metro and the simulator up; `-- --stop` ends them).
  The Metro of the harness does not pick up source edits (it runs without file watching): after a
  change to the app, `-- --stop` and start again. Screenshots: `xcrun simctl io "OrenjiTrade
  Maestro" screenshot <file>`; dark mode and text size: `xcrun simctl ui "OrenjiTrade Maestro"
  appearance dark` / `content_size accessibility-extra-extra-extra-large` (relaunch the app after
  a text size change: the screen on display keeps its old layout until it is drawn again), and
  put both back (`light`, `large`) before a run of the flows. The names VoiceOver reads are in
  `maestro --device <udid> hierarchy`.

## 5. Owner working agreements (from the Windows Claude memory)

- **Merging:** Claude may merge PRs into `main` once **all CI checks are green**: merge commits (not
  squash), in order for stacked PRs, then delete the branch. Dependabot PRs are not covered (the
  owner has not decided the Dependabot cleanup); the ones superseded by the SDK 58 upgrade (#14 #15
  #21 #26 #27, not #23) are closed when #54 merges.
- **Local-first and free:** no cloud deployment, no `terraform plan/apply`, no `gcloud`, no EAS
  (build/submit/update/login), no `expo login`, no Maestro Cloud or `maestro login`, no paid APIs or
  usage credits. The owner is budget-conscious: ask before anything that can cost money.
- **On hold:** Phase 11 ML card recognition (keep `mlScanning` off, no camera scanning); the Expo SDK
  58 upgrade until it is stable; the full French UI translation (the owner said "hold, don't start"
  on 2026-10-07 — the plan stays in IMPLEMENTATION_STATUS.md).
- **Launch decisions (2026-10-05):** discovery + messaging only (money feature flags off at launch),
  18+ self-declaration, legal texts in English and French that stay marked as drafts (never remove
  the draft banner, never claim legal compliance), Law 25 operating docs in `docs/security/`.
- **Regions (2026-10-08):** no coordinates, GPS, distances or geocoding anywhere; country +
  state/province + optional city (city only on the owner's public profile, hideable); three platform
  regions. This supersedes the earlier 3 km zone rule.
- **Mobile only (2026-10-12):** the owner paused the web app until a new order. Work in
  `apps/mobile` (and in the API when a mobile stage needs it); do not change `apps/web-angular`
  (reading it is fine: it is the reference for what the phone should offer). A lockfile change
  still gets `npm run build -w apps/web-angular` and `npm run test:web` once as a regression check.
- **Pausing:** when the owner says pause, stop every workflow and process at once and report exactly
  what is committed, pushed or pending; resume from the workflow cache on "continue".
- **Tasks and reports:** the owner gives work as long pasted specs; report back in plain language
  (what changed, verification, what needs an owner decision), list placeholders left for the owner
  or the lawyer, and say clearly when something could not be verified.
- Windows-only facts in the old memory (Android SDK on `D:\SDK`, `maestro.bat`, `python` instead of
  `python3`, JDK 17 local, starting Docker with `Start-Process`) do not apply on the Mac.

## 6. Open owner decisions

- In-app purchases for Premium/credits in store builds (IAP, link-out to the web, or web-only) — ADR
  0011 open question; nothing is sold at launch.
- An arm64 PostGIS image: `postgis/postgis:17-3.5` is amd64-only and runs under Rosetta on Apple
  Silicon; decide before macOS 28 (Rosetta's end).
- `security/npm-audit-allowlist.json`: the node-forge and braces entries expire on 2026-11-30;
  re-evaluate before then or `npm run audit:gate` fails everywhere.
- The `[to confirm]` placeholders for the owner and the lawyer listed in PR #52 (privacy officer,
  effective dates, data locations, retention periods, governing law, the French texts).
- OrbStack: its free use is limited; the owner checks OrbStack's current licence terms for
  commercial use and decides (macos-setup.md 4.4). On the owner's Mac it also publishes the dev
  ports (PostgreSQL, Redis, Auth emulator) on every network interface while the macOS firewall is
  off, and it does not start at login: after a restart of the Mac every test stack stops with
  "Docker is not running" until `orbctl start` (the three shared containers then come back by
  themselves; it happened on 2026-10-12).
- `CLAUDE.md` still says "Mobile Map tab is a placeholder for now" (the Maps row) and
  "region-scoped calls send the home region" (Frontend conventions, Mobile): both are out of date
  since mobile stage M9. An agent does not edit `CLAUDE.md` on its own; the owner updates the two
  sentences (proposed wording in IMPLEMENTATION_STATUS.md, stage M9, "Open (owner)").
- Installing the Android SDK and an arm64 AVD on the Mac (macos-setup.md 9.3): skipped for now
  (2026-10-10), the native suite runs on the iOS simulator there. Until it is installed, nothing
  on this Mac proves the Android half of a mobile change.
- Photo uploads from the Android app: on iOS no photo could be uploaded (Expo's fetch refuses
  React Native's file part) and that is fixed and proven on the simulator; Android runs the same
  fetch and is expected to fail the same way, but keeps its old code until an Android run can
  prove the fix (`apps/mobile/src/api/localFilePart.ts`; IMPLEMENTATION_STATUS.md, "Mobile app on
  the iOS simulator", Open).
- Uploaded photos can come out rotated on every client: the API drops a photo's EXIF orientation
  when it re-encodes the upload (same section). A backend fix, not started.
- Optional, offered and not chosen yet: Phase 13 hardening (accessibility pass, load test, index
  review, backup-restore drill, failure tests).
- The macOS issues of [macos-setup.md](macos-setup.md) section 12: items 1 to 4 and 7 to 13 were
  fixed on 2026-10-10 (item 2, the iOS path of the Maestro harness, and the macOS and Linux
  examples of `apps/mobile/README.md` with it). The Android run of the native suite on a Mac
  stays unproven until the Android SDK is installed (owner decision: skipped for now).
