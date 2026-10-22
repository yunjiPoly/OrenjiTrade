# Stage R12 contract — Sign-in, sign-up and welcome

> Owner prompt of 2026-10-19/20
> ([`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md)),
> section "R12. Sign-in, sign-up and welcome (36 to 46)"; mockup v50 screens 36 to 46. Extends
> [phase1-auth-users.md](phase1-auth-users.md) (the profile, the handle rules, the rate limits). One
> new endpoint, nothing else changed: no migration, nothing removed or retyped; the paused web builds
> and passes its checks against the regenerated client, unchanged. Field-level truth:
> `../openapi.json`.

The screens keep every call they made before: Firebase sign-in, sign-up and reset;
`GET /public/legal/documents`, `POST /me/consents` (the documents and the `AGE_CONFIRMATION`
attestation), `GET /me`, `GET|PUT /me/profile`, `PUT /me/profile/tags`, `GET /tags`,
`GET|PUT /me/location`, `GET|PUT /me/settings/privacy`, `GET /me/deletion-requests`,
`DELETE /me/deletion-requests/{id}`, `GET /me/export`. The server checks stay the only truth:
the documents due (`requiredConsents`, 428 on other routes), `onboarding.ageConfirmed` (403
`AGE_CONFIRMATION_REQUIRED` where the 18+ rule applies), the handle rules (409 `HANDLE_TAKEN`,
400 `VALIDATION_FAILED`).

## `GET /api/v1/me/profile/handle-availability?handle=`

The welcome step "Who are you?" (screen 40) checks the handle while the collector types: a teal
check when it is free, "That handle is already taken. Try another one." when it is not.

| Parameter | Rule |
| --- | --- |
| `handle` | required (400 `VALIDATION_FAILED` without it); read as the save reads it: trimmed and lower-cased |

Answer `HandleAvailabilityResponse`:

| Field | Meaning |
| --- | --- |
| `handle` | the handle as it would be saved (trimmed, lower-cased) |
| `status` | `AVAILABLE` (free), `CURRENT` (the caller's own handle), `TAKEN` (held by another account, case-insensitively, **or reserved**), `INVALID` (not 3 to 24 characters of `[a-z0-9_]`) |
| `available` | `true` for `AVAILABLE` and `CURRENT`: saving it with `PUT /me/profile` would succeed |

- **The save's own rules** (`HandleRules`, `UserAccountService.changeHandle`): `AVAILABLE` and
  `CURRENT` save, `TAKEN` is the save's 409 `HANDLE_TAKEN`, `INVALID` its 400. A reserved word
  answers `TAKEN`, as the save does, so the check never tells a reserved word from a used one; a
  seed staff account keeping its reserved handle reads `CURRENT`.
- **Nothing is saved or audited**; a malformed or reserved handle, or the caller's own, never
  reaches the database. The answer names no account and no place (no id, no display name, no
  state or province): `GeoPrivacyContractTest.handleCheckOfStageR12CarriesNoPersonOrPlace`.
- **Members only** (anonymous: 401); the documents due first (428 as on every non-exempt route).
- **Rate limit** `handle-availability`: **60 per 10 minutes per member** (the phone checks once the
  collector stops typing for 400 ms; a 429 shows no mark and the save still decides).
- The save (`PUT /me/profile`) still decides: a handle taken between the check and the save is the
  save's 409, shown on the field.

## What the phone does with the rest (no API change)

- **Sign-up (37)** records every document due at registration and the `AGE_CONFIRMATION`
  attestation with `POST /me/consents`, as before; "Create account" waits until every box is ticked
  (the API refuses a missing document or age the same as before).
- **An account whose `onboarding.ageConfirmed` is `false`** (a Google sign-up, an account from
  before the 18+ rule) is sent to **Review our terms (43)**, which asks only the age line when no
  document is due; `needsOnboarding` still requires `ageConfirmed`. The welcome has three steps
  (profile, games, place) and **no age step**.
- **The welcome's games step** needs at least one game (`PUT /me/profile` with `games`; tags stay
  optional with `PUT /me/profile/tags`, at most 12). The API's `onboarding.interestsSet` keeps its
  meaning (a game or a tag), so an account that finished the welcome before with tags only is not
  asked again, and the paused web's onboarding is unchanged.
- **The first game picked** is the browsed game Home and Search open on (the phone's choice per
  account, stage G); the API stores the games in the order picked (`text[]`, unchanged).
- **The place step (42)** saves `PUT /me/location` (`showCity` from "Show my city on my profile")
  and `discoverable` with `PUT /me/settings/privacy` (off by default), as before.
