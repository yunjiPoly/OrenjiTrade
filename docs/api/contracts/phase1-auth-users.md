# Phase 1 contract — auth, users, profiles, location, settings, deletion

> **ADR 0017 (2026-10-08):** the location part of this contract (trading area, `publicPoint`,
> `distanceBucket`, `showDistance`, `PUT /me/location/trading-area`, `onboarding.tradingAreaSet`)
> is superseded by [s1-regions-location.md](s1-regions-location.md): collectors declare a
> country, a state or province and an optional city; no coordinate exists anywhere.

Orchestration contract for Phase 1. The backend implements exactly these endpoints; the
OpenAPI export then becomes the source of truth for clients. All paths are under `/api/v1`
unless stated. Auth: `Authorization: Bearer <Firebase ID token>` for everything except
`/public/**` and `/meta`. Errors follow `docs/api/README.md`.

## Identity and session

`GET /me` → `MeResponse`
```json
{
  "id": "uuid", "handle": "maika", "displayName": "Maïka Tremblay", "email": "…", "emailVerified": true,
  "roles": ["USER"], "status": "ACTIVE",
  "avatarUrl": "https://…|null", "createdAt": "…", "lastActiveAt": "…",
  "onboarding": { "profileComplete": true, "tradingAreaSet": true, "interestsSet": true, "ageConfirmed": true },
  "requiredConsents": [ { "documentType": "TERMS", "version": "2026-09-01" } ],
  "plan": "FREE"
}
```
First authenticated call provisions the account (role USER, status ACTIVE, handle derived from
email local part + suffix until the user picks one). `403 ACCOUNT_SUSPENDED` when suspended.
`428 TERMS_ACCEPTANCE_REQUIRED` on every non-exempt route while `requiredConsents` is non-empty
(exempt: `/me`, `/me/consents`, `/public/**`, `/meta`, `/me/deletion-requests`).

`GET /public/legal/documents` → `[ { "documentType": "TERMS|PRIVACY|COMMUNITY_GUIDELINES|MARKETPLACE_POLICY|PAYMENT_PROTECTION|REFUND_DISPUTE|COOKIES|ACCEPTABLE_USE|AGE_CONFIRMATION", "version": "2026-09-01", "title": "…", "url": "/legal/terms", "requiredAtRegistration": true } ]`

`POST /me/consents` body `{ "documentType": "TERMS", "version": "2026-09-01", "language": "fr" }`
→ 204. Stores version, the language of the text that was shown (`en` or `fr`; optional, `en` when
omitted so older clients keep working; V104), timestamp, hashed IP, user agent. `409` if version is
not current, `400 VALIDATION_FAILED` (field `language`) for another code. The French legal pages are
a translation of the English draft, so one document version covers both languages and the consent
records which one the collector read; the admin user detail and the data export (`ConsentSummary`)
expose `language` next to the version.

### 18+ rule (2026-10-05, V103)

The attestation "I confirm I am 18 years of age or older" is a consent like any other:
`POST /me/consents` body `{ "documentType": "AGE_CONFIRMATION", "version": "2026-10-05" }` → 204
(timestamp, hashed IP, user agent and an audit row; the version is the current
`AGE_CONFIRMATION` row of `legal_document`, published with `requiredAtRegistration: false` and
`url: "/legal#age-confirmation"`, so the terms filter never asks for it and admin / staff
routes keep working). `onboarding.ageConfirmed` (optional in the schema; older clients ignore
it) reports whether any version was recorded. The service layer refuses, until it exists, with
`403 AGE_CONFIRMATION_REQUIRED` (`message`, `requestId`, `timestamp`, and the `requiredConsents`
extension naming the document to record):

- `PUT /me/settings/privacy` with `discoverable: true` (becoming or staying on the map;
  `searchDiscoverable` is not gated);
- `POST /conversations` and `POST /conversations/{id}/messages` (reading is never gated);
- `POST /community/channels/{slug}/posts` and `POST /community/posts/{id}/replies`;
- `POST /offers` and `POST /offers/{id}/counter` (accepting, declining or withdrawing an
  existing offer is not gated).

Clients show the sign-up checkbox (never ticked by default) and, for existing accounts, the
onboarding "Age" step before anything else. Self-declaration only: no identity verification.

## Profile

`GET /me/profile` / `PUT /me/profile` body:
```json
{ "handle": "maika", "displayName": "Maïka Tremblay", "bio": "…", "games": ["yugioh","pokemon"],
  "languages": ["fr","en"] }
```
Handle: 3–24 chars `[a-z0-9_]`, unique (case-insensitive), reserved list rejected; `409 HANDLE_TAKEN`.
Games are game slugs from the `games` module seed (`yugioh`, `pokemon`, `mtg`, `riftbound`).

`POST /me/profile/avatar` multipart `file` (jpeg/png/webp ≤ 5 MB) → `{ "avatarUrl": "…" }`.
Server re-encodes to WebP 512×512, strips metadata, stores through `ObjectStorage`.
`DELETE /me/profile/avatar` → 204.

`GET /tags?query=&category=&limit=` → `[ { "id":"uuid","slug":"local-meetups","label":"Local Meetups","category":"GAME|ROLE|STYLE|LOGISTICS|LANGUAGE|CUSTOM","usageCount":12 } ]`
`PUT /me/profile/tags` body `{ "tagIds": ["uuid"], "customLabels": ["Cube drafter"] }` (max 12
total; custom labels 2–24 chars, banned-term check; created with category CUSTOM) → `TagResponse[]`.

`GET /collectors/{handle}` → `CollectorProfileResponse` (public view, respects privacy):
```json
{ "id":"uuid","handle":"maika","displayName":"…","avatarUrl":"…|null","bio":"…",
  "games":["yugioh"],"tags":[{"slug":"trader","label":"Trader"}],
  "location": { "publicLabel":"Plateau-Mont-Royal, Montréal", "publicPoint": {"lat":45.522,"lng":-73.581}, "distanceBucket":"KM_1_5|null" } ,
  "memberSince":"2026-…","lastActiveBucket":"TODAY|THIS_WEEK|THIS_MONTH|LONGER_AGO|HIDDEN",
  "onlineStatus":"ONLINE|OFFLINE|HIDDEN",
  "rating": { "average": null, "count": 0 }, "publicBinderCount": 0,
  "canMessage": true, "isBlocked": false }
```
`404` when the profile is PRIVATE to the requester or the user is deleted/suspended.
`location` is `null` when the collector is not discoverable. `distanceBucket` requires the
requester to have a trading area and the target to allow distance display.

## Location (ADR 0004)

`GET /me/location` → `{ "tradingArea": { "lat":45.52,"lng":-73.58,"radiusKm":5,"source":"MANUAL|DEVICE","label":"Plateau-Mont-Royal, Montréal" } | null, "publicPoint": {"lat":…,"lng":…} | null, "discoverable": true }`
(the owner sees their own chosen centre; this is the only endpoint that returns it).
`PUT /me/location/trading-area` body `{ "lat":45.52,"lng":-73.58,"radiusKm":5,"source":"MANUAL" }`
(radiusKm 1–50; source DEVICE only records that the centre came from the device, the server
still snaps). Recomputes `publicPoint` and `publicLabel`. → same as GET.
`DELETE /me/location` → 204 (removes all location rows; collector disappears from the map).

## Settings

`GET|PUT /me/settings/privacy`
```json
{ "discoverable": false, "showDistance": true, "showOnlineStatus": false, "showLastActive": true,
  "profileVisibility": "PUBLIC|MEMBERS|PRIVATE", "messagingPermission": "EVERYONE|MEMBERS_WITH_PROFILE|NOBODY",
  "wishlistVisible": false, "searchDiscoverable": true }
```
Defaults favour safety: `discoverable=false`, `showOnlineStatus=false`, `profileVisibility=MEMBERS`,
`messagingPermission=MEMBERS_WITH_PROFILE`, `wishlistVisible=false`.

`GET|PUT /me/settings/notifications`
```json
{ "pushEnabled": true, "emailEnabled": false, "inAppEnabled": true,
  "categories": { "WISHLIST_MATCH": {"push":true,"email":false,"inApp":true}, "MESSAGE": {...}, "OFFER": {...},
                  "RATING": {...}, "TRADE": {...}, "BINDER_FRESHNESS": {...}, "REPORT_DECISION": {...}, "MARKETING": {"push":false,"email":false,"inApp":false} },
  "quietHours": { "enabled": false, "start": "22:00", "end": "08:00", "timezone": "America/Toronto" } }
```

## Account deletion and export

`GET /me/export` → JSON document assembled by `ExportContributor`s (profile, settings,
consents, location trading area; later inventory, messages…). Rate-limited (1/hour).
`POST /me/deletion-requests` body `{ "reason": "…|null", "exportFirst": false }`; requires
the ID token `auth_time` within the last 5 minutes → `401 REAUTHENTICATION_REQUIRED` otherwise.
Response `{ "id":"uuid","status":"PENDING","requestedAt":"…","scheduledFor":"…(+7 days)","blockers":[] }`.
`409 DELETION_BLOCKED` with `blockers: ["OPEN_DISPUTE", ...]` from `DeletionParticipant.blockers()`.
On request: status → `DELETION_REQUESTED`, Firebase user disabled (sessions revoked), public
inventory hidden (participants), collector removed from map.
`DELETE /me/deletion-requests/{id}` (cancel during grace period; re-enables account) → 204.
`POST /internal/jobs/account-deletion` (service token / OIDC; also `@Scheduled` under `local`)
processes due requests: anonymise account (`deleted+<id>@anonymized.invalid`, display name
"Deleted collector"), delete profile/tags/location/settings/avatar, call every
`DeletionParticipant.purge(userId)`, delete Firebase user, keep consents/audit/ledger, write
audit entry, status COMPLETED.

## Admin (ADMIN, SUPER_ADMIN; audit every write)

`GET /admin/users?query=&status=&role=&page=&size=` → `PageResponse<AdminUserSummary>`
`GET /admin/users/{id}` → `AdminUserDetail` (account, roles, consents, location label only —
never coordinates —, deletion request, recent audit entries).
`POST /admin/users/{id}/suspend` body `{ "reason": "…", "until": "…|null" }` → 204
`POST /admin/users/{id}/unsuspend` → 204
`PUT /admin/users/{id}/roles` body `{ "roles": ["USER","MODERATOR"] }` (SUPER_ADMIN only for
ADMIN/SUPER_ADMIN grants) → 204
`GET /admin/audit-logs?actorId=&targetType=&targetId=&action=&from=&to=&page=&size=` →
`PageResponse<AuditLogEntry>` `{ id, occurredAt, actor: {id, handle, type:"USER|ADMIN|SYSTEM"}, action, targetType, targetId, details, requestId }`

## Rate limiting (properties, DB override later)

| Route group | Limit |
| --- | --- |
| default (authenticated) | 120 / min / user |
| default (anonymous) | 60 / min / IP |
| `POST /me/profile/avatar`, `/me/export` | 10 / hour / user |
| `/me/deletion-requests` | 5 / day / user |
| `/tags` search | 60 / min / user |

Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.
