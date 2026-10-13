# Web acceptance suite

End-to-end proof that the MVP works locally (product spec § 50 for the web), run against the
**real** local E2E stack: docker compose (PostGIS, Redis, Firebase Auth emulator), the API with the
`local` profile on :8180 against its own database `orenjitrade_e2e` (fake payment/billing
providers, log push/e-mail) and the Angular app on :4300 (`ng serve --configuration e2e`), all
started by `npm run test:e2e` next to the developer's `npm run dev`, which they never touch. Every
account is fresh and fictional (`e2e-<run id>-…@example.test`); nothing needs cloud credentials.

| Spec                         | Scenario                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registration.spec.ts`       | register with consents → verify (emulator code) → profile → interests → "Where are you?" (region, country, state, city; no map, no GPS) → sign out → sign in into the home region                                                            |
| `inventory.spec.ts`          | open inventory → add card (private) → create binder → move card in → public → condition → save → publish → another collector sees it                                                                                                         |
| `map.spec.ts`                | A publishes (discoverable + binder) → B opens the region map → A's state is shaded, no tile or provider, no DOM coordinate → the state's panel lists A's binder (handle, never the city) → full profile (city by A's choice) → public binder |
| `search.spec.ts`             | top-bar card search → "Who has this in my region" → card-holders view (state, price, no distance) → another region lists nothing → unified search by printing code                                                                           |
| `wishlist.spec.ts`           | A wants a card ("Any printing" in the picker, no radius) → B of the same region publishes it → one wishlist alert live (STOMP) naming B's state → the alert opens the card page                                                              |
| `messaging.spec.ts`          | A messages B from the profile → B receives it in realtime with an unread badge → "Seen" → B answers live                                                                                                                                     |
| `offers.spec.ts`             | create → counter → accept (trade opens) → decline with a reason                                                                                                                                                                              |
| `rating.spec.ts`             | no rating without interaction → qualified conversation → rating published → unrelated collector cannot rate (403)                                                                                                                            |
| `reporting.spec.ts`          | profile → report popup → reason → confirm → admin sees → admin action (assign, warning) → audit log → reporter informed                                                                                                                      |
| `freemium.spec.ts`           | `binders.max` reached → upgrade prompt → fake billing checkout → Premium entitlement lifts the limit                                                                                                                                         |
| `privacy.spec.ts`            | the scanner catches planted leaks (coordinates, distances, radii, a city; HTTP + STOMP); a sweep of every place-bearing surface (region map, holders, search, profile, binder, wishlist, live wishlist alert)                                |
| `account-deletion.spec.ts`   | deletion request → public inventory and the state's binder gone → grace period fast-forwarded → `/internal/jobs/account-deletion` (service token) → anonymised, consents/audit kept                                                          |
| `payment-protection.spec.ts` | payouts → protected offer → accept → fake checkout → shipment with tracking → receipt → payout                                                                                                                                               |
| `community.spec.ts`          | post with a card → reply from another collector → delete                                                                                                                                                                                     |
| `stale-listings.spec.ts`     | the owner's last confirmation backdated 44 days → freshness job (`/internal/jobs/freshness`) → STALE → admin review queue → Restore → ACTIVE again → audit log                                                                               |

## Shared support (`support/`)

- `fixtures.ts` — the suite's `test`: the automatic **privacy** fixture, `api` (seeding
  shortcuts) and `actors` (extra signed-in browser contexts for two-party scenarios). Requests to
  map providers or tile servers are aborted (and reported), placeholder card pictures are served
  from memory in every context; `openState(page, place)` opens a state's binder panel on `/map`.
- `privacy.ts` — the ADR 0017 scanner. It reads every JSON response and every STOMP frame of every
  browser context of a test, plus every answer of the API shortcuts, and fails the test on any
  `lat`/`lng`, any distance or radius field, a registered city outside its owner's profile (and the
  owner-only `/me/location` and `/me/export`), or a call to a map provider; `scanDom(page)` also
  checks every DOM attribute of a page (aria labels, titles, data attributes, links; not inline
  styles or SVG path data, which hold pixels) for a coordinate.
- `api.ts` — fresh emulator collectors (terms accepted, profile, a self-declared place whose city is
  registered with the scanner), binders, items, publication, conversations, staff (demoted afterwards), internal jobs
  with the service token (`E2E_SERVICE_TOKEN`, default `local-service-token`) and the two test-clock
  shortcuts: ending a deletion grace period and backdating a listing's last confirmation in the
  E2E database (`docker exec` into `E2E_DB_CONTAINER`, default `orenjitrade-postgres`, database
  `E2E_DB_NAME`, default `orenjitrade_e2e`). Its teardown (`cleanUp()`, never failing a test)
  retires every collector the test created: a deletion request through the API (off the map at
  once), `discoverable: false` when an open trade blocks the deletion, then the emulator account
  is deleted. Seed accounts are never touched.
- `answers.ts` — `recordAnswers(page, url)`: the API answers a page receives for matching requests,
  fetched and parsed in a route before the page gets them (`route.fetch()` → `route.fulfill()`).
  A spec that asserts on an answer's body uses it instead of `waitForResponse()` +
  `response.json()`, which reads Chromium's DevTools buffer: that buffer does not keep every fetch
  body, and under the load of a full run such a read failed ("No data found for resource with
  given identifier").
- `places.ts` — one state per spec (US states no seed collector uses; the wishlist spec in Lisbon,
  Europe, since wishlist alerts work per platform region), and `cityToken()` for distinctive fictional
  cities the scanner can trace.

## Running

```bash
npm run test:e2e                                  # whole suite: E2E database, API jar, ng serve, Playwright
npm run test:e2e -- e2e/acceptance                # acceptance suite only
npm run test:e2e -- --stack-only                  # start the E2E stack and keep it running
npm run test:e2e -- --reuse-running e2e/acceptance/map.spec.ts   # reuse that stack (never the dev API)
npm run test:e2e -- --stop                        # stop it
```

Specs skip with a clear message when the stack is unreachable; `E2E_REQUIRE_STACK=1` (CI) turns
that into a failure. CI runs the whole suite in `.github/workflows/e2e.yml`.
