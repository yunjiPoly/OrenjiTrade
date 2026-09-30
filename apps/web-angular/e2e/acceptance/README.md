# Web acceptance suite

End-to-end proof that the MVP works locally (product spec § 50 for the web), run against the
**real** local stack: docker compose (PostGIS, Redis, Firebase Auth emulator), the API with the
`local` profile on :8080 (fake payment/billing providers, log push/e-mail) and the Angular app on
:4200. Every account is fresh and fictional (unique emails per run); nothing needs cloud
credentials.

| Spec                         | Scenario                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registration.spec.ts`       | register with consents → verify (emulator code) → profile → interests → approximate area on the map → sign out → sign in                                                       |
| `inventory.spec.ts`          | open inventory → add card (private) → create binder → move card in → public → condition → save → publish → another collector sees it                                           |
| `map.spec.ts`                | A publishes (discoverable + binder) → B opens the map → A at an approximate point → marker → preview → full profile → public binder                                            |
| `search.spec.ts`             | top-bar card search → "Who has this near me" → holders list + marker → card-holders view → unified search by printing code; public points only                                 |
| `wishlist.spec.ts`           | A wants a card → B publishes it nearby → match → A notified live (STOMP) → matches drawer                                                                                      |
| `messaging.spec.ts`          | A messages B from the profile → B receives it in realtime with an unread badge → "Seen" → B answers live                                                                       |
| `offers.spec.ts`             | create → counter → accept (trade opens) → decline with a reason                                                                                                                |
| `rating.spec.ts`             | no rating without interaction → qualified conversation → rating published → unrelated collector cannot rate (403)                                                              |
| `reporting.spec.ts`          | profile → report popup → reason → confirm → admin sees → admin action (assign, warning) → audit log → reporter informed                                                        |
| `freemium.spec.ts`           | `binders.max` reached → upgrade prompt → fake billing checkout → Premium entitlement lifts the limit                                                                           |
| `privacy.spec.ts`            | the scanner catches planted leaks (HTTP + STOMP); a sweep of every geo surface (map, preview, map search, holders, search, profile, binder, wishlist match, live notification) |
| `account-deletion.spec.ts`   | deletion request → public inventory and map marker gone → grace period fast-forwarded → `/internal/jobs/account-deletion` (service token) → anonymised, consents/audit kept    |
| `payment-protection.spec.ts` | payouts → protected offer → accept → fake checkout → shipment with tracking → receipt → payout                                                                                 |
| `community.spec.ts`          | post with a card → reply from another collector → delete                                                                                                                       |
| `stale-listings.spec.ts`     | the owner's last confirmation backdated 44 days → freshness job (`/internal/jobs/freshness`) → STALE → admin review queue → Restore → ACTIVE again → audit log                 |

## Shared support (`support/`)

- `fixtures.ts` — the suite's `test`: the automatic **privacy** fixture, `api` (seeding
  shortcuts) and `actors` (extra signed-in browser contexts for two-party scenarios). Map tiles
  and placeholder card pictures are served from memory in every context.
- `privacy.ts` — the ADR 0004 scanner. It reads every JSON response and every STOMP frame of every
  browser context of a test, plus every answer of the API shortcuts, and fails the test on any
  `lat`/`lng` with more than 3 decimals, any pair equal to a stored trading-area centre (except the
  owner's own `/me/location`), or any raw numeric distance.
- `api.ts` — fresh emulator collectors (terms accepted, profile, trading area registered with the
  scanner), binders, items, publication, conversations, staff (demoted afterwards), internal jobs
  with the service token (`E2E_SERVICE_TOKEN`, default `local-service-token`) and the two test-clock
  shortcuts: ending a deletion grace period and backdating a listing's last confirmation in the
  local database (`docker exec` into `E2E_DB_CONTAINER`, default `orenjitrade-postgres`).
- `places.ts` — one latitude band per spec in northern Ontario / Manitoba (no other spec uses it),
  centres on the API's public-grid latitude lines so a derived public point can never equal a
  stored centre by chance.

## Running

```bash
npm run test:e2e                                  # whole suite: infra, API jar, ng serve, Playwright
npm run test:e2e -- e2e/acceptance                # acceptance suite only
cd apps/web-angular && npx playwright test e2e/acceptance   # against an API/web already running
```

Specs skip with a clear message when the stack is unreachable; `E2E_REQUIRE_STACK=1` (CI) turns
that into a failure. CI runs the whole suite in `.github/workflows/e2e.yml`.
