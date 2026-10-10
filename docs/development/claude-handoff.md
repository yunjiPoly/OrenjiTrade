# Claude Code handoff (2026-10-09): continuing OrenjiTrade on the MacBook

Read this after `CLAUDE.md` and before `IMPLEMENTATION_STATUS.md` when you start a Claude Code
session on a new machine or after a long break. It records where the work stands, what to do next,
and the working agreements with the owner that are not written anywhere else (they lived in the
Windows machine's Claude memory). Machine setup: [macos-setup.md](macos-setup.md).

## 1. Where things stand

**On `main` (everything merged, CI green):** the web MVP (Phases 1–10), the mobile app
(Phases 1–10 + web parity, stages M1–M8), launch readiness (18+ rule, trading safety, French legal
pages, money features off by default, Law 25 operating docs), the low-cost first-year cloud profile
(ADR 0016, prepared only — nothing deployed), the E2E isolation from the dev database, and **stage S1
of the 2026-10-08 change** (platform regions replace geolocation; ADR 0017). Merged PRs since
2026-10-04: #39 #40 #41 #45 #46 #47 #48 #49 #50 #51 #52 #53 #57.

**Not on `main`:**

| What | Where | State |
| --- | --- | --- |
| Stage S2 — simplified wishlist, matches removed, region wishlist alerts (spec section 4) | branch `feature/regions-s2-wishlist` (no PR yet) | Built; two review rounds. Round 1 blockers (alert link landed on a silent printing pick; wish-dialog error out of view) fixed and re-approved by the product/UX reviewer. The last functional review found that migration V112 failed on a populated pre-V112 database (rarity cleared after the duplicate collapse, so the unique index failed). **Fix round 2 is committed** (`c1b9df7` V112 normalises the selection before collapsing, proven by `SimplifiedWishlistMigrationIT`; `be24294` review polish; `b52211a` status notes) **but not re-reviewed yet.** |
| Stages S3–S6 | — | Not started. |
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
| S2 simplified wishlist | 4 | branch `feature/regions-s2-wishlist`, re-review pending |
| S3 search, card page printing picker, have/want, wanted-by, search history | 2, 2b | next |
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
   AVD, Maestro).
2. Start Claude in the repo and point it here: *"Read CLAUDE.md, docs/development/claude-handoff.md
   and IMPLEMENTATION_STATUS.md, then continue the 2026-10-08 change from stage S2."*
3. **Finish S2:** `git switch feature/regions-s2-wishlist`, `npm ci`, then an **independent
   re-review** (a functional verifier and a product/UX reviewer, in parallel) of the whole stage
   with special attention to V112 on a populated database, followed by a fix loop if needed. Then
   merge `origin/main` into the branch, push, open the S2 PR against `main`, and merge it when CI
   is green.
4. **S3 → S6**, each the same way (section 4 below), each its own PR.
5. After S6: the mobile follow-ups recorded in `IMPLEMENTATION_STATUS.md` (region switcher, printing
   picker, have/want, state binder list and search history on mobile; `react-native-maps` removal).

Checks every stage must pass before its PR (run them, retries off): `./gradlew exportOpenApi` and
`npm run generate:api` leave git clean; `npm run test:api`; `npm run test:web`;
`npm run build -w apps/web-angular` (initial bundle under the 900 kB warning budget);
`npm run test:e2e -- --retries=0` (every spec green on the first attempt); `npm run test:mobile`;
`npx expo export --platform android` and `--platform web`; `npm run test:mobile:e2e`;
`npm run audit:gate`; `npm run test:scripts`; exactly what GitHub CI runs:
`npm run lint -w apps/web-angular`, `npm run format:check -w apps/web-angular`,
`npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`; and, when `apps/mobile` changed,
the full Maestro set on the Android emulator (`npm run test:mobile:maestro`; on macOS set
`ANDROID_HOME=$HOME/Library/Android/sdk`, see macos-setup.md section 12).

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
- **Stop every process you start**; leave no emulator, Metro or test stack running.

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
- Optional, offered and not chosen yet: Phase 13 hardening (accessibility pass, load test, index
  review, backup-restore drill, failure tests) and fixing the 21 macOS issues listed in
  [macos-setup.md](macos-setup.md) section 12.
