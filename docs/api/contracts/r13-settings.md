# Stage R13 contract — Settings (47 to 59)

> Owner prompt of 2026-10-19/20
> ([`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md)),
> section "R13. Settings (47 to 59)"; mockup v50 screens 47 to 59. Extends
> [phase1-auth-users.md](phase1-auth-users.md) (the profile and its tags). One optional field on one
> endpoint, nothing else changed: no migration, no new endpoint, nothing removed or retyped; the
> paused web builds and passes its checks against the regenerated client, unchanged. Field-level
> truth: `../openapi.json`.

Settings and its pages keep every call they made before: `GET /me` (the profile card, member
since, the staff roles), `GET|PUT /me/profile`, `POST|DELETE /me/profile/avatar`, `GET /tags`,
`GET /me/profile/handle-availability` (R12's live check, `CURRENT` for one's own handle),
`GET /games`, `GET|PUT|DELETE /me/location`, `GET /regions`, `GET|PUT /me/settings/privacy`,
`GET|PUT /me/settings/notifications`, `GET /me/blocks`, `DELETE /users/{id}/block`,
`GET /me/reports`, `GET /me/export`, `POST /me/deletion-requests`, `GET /public/legal/documents`,
`GET /meta`. Settings (47) reads `GET /me/location`, `GET /me/blocks` and `GET /me/reports` for the
values of its rows ("{province}, {country} · On the map", the number of blocked collectors, "{n}
waiting"); a value that cannot load is left out.

## `PUT /api/v1/me/profile`: the tags in the same save (optional)

Edit profile (48) has one "Save changes" for the handle, the display name, the bio, the games, the
languages and the tags. The body `UpdateProfileRequest` gains one optional field:

| Field | Rule |
| --- | --- |
| `tags` | optional `UpdateProfileTagsRequest` (`tagIds`, `customLabels`): the profile tags, replaced **in the same transaction** as the other fields, by the rules of `PUT /me/profile/tags` (at most 12 in all, active tags only, custom labels of 2 to 24 characters past the banned-term check). Left out or `null`: the tags stay as they are |

- **All or nothing.** `ProfileService.updateWithTags` saves the fields, then replaces the tags, in
  one transaction: a refused field (400, 409 `HANDLE_TAKEN`) or a refused tag (400
  `VALIDATION_FAILED` with `errors[].field` `customLabels[n]` or `tagIds`) saves nothing, the
  handle change and its `user.handle.change` audit row included.
- **The answer** is the saved profile (`MyProfileResponse`), its `tags` included.
- **Without `tags`** the endpoint answers as before: the paused web, the welcome's first save
  (stage R12, which still saves its tags with `PUT /me/profile/tags`) and older phones are
  unchanged. `PUT /me/profile/tags` stays.
- The phone sends `tags` only when they changed; a save of the details alone sends none.

Tests: `ProfileIT.theProfileAndItsTagsAreSavedTogetherOrNotAtAll` (one save with a curated tag
and a custom label; a refused label leaves the handle, the name, the games and the tags as they
were, and no audit row of the refused handle; a save without `tags` keeps them; empty `tags`
clears them).

## What the phone does with the other answers (no API change)

- **Location (49):** "Show me on the map" saves `PUT /me/settings/privacy` at once, as before; it
  is disabled while no place is saved (the API's 409 `LOCATION_REQUIRED` stays the rule). "Remove
  my location" asks in a sheet, then `DELETE /me/location`.
- **Notifications (51):** the grid shows each topic of `categories` by channel (`inApp`, `push`,
  `email`); while a channel's master switch (`inAppEnabled`, `pushEnabled`, `emailEnabled`) is off,
  its column is dimmed, reads as unticked and cannot change, and the stored values are sent back
  unchanged. `OFFER` and `TRADE` stay hidden and are sent back unchanged (ADR 0018).
- **Privacy (52):** every change is one `PUT /me/settings/privacy` of the whole document, in order;
  a failure restores the last saved state. "Remember my searches" stays on the phone.
- **My reports (55):** the status pill of `MyReport.status`: `OPEN` "Open" (amber), `UNDER_REVIEW`
  "Under review", `ACTIONED` "Action taken" (teal), `DISMISSED` "Dismissed" (grey).
- **Legal (58):** the phone lists seven documents of `GET /public/legal/documents` (Terms of
  Service, Privacy Policy, Community Guidelines, Trading safely, Marketplace Policy, Acceptable Use
  Policy, Cookie Policy) with their published version; the Payment Protection and the Refund and
  Dispute policies are the web's (ADR 0018) and still open from a link.

## Privacy (ADR 0017)

No response changed shape except `MyProfileResponse`'s tags after a save with `tags`. The pages
show places as "state or province, country"; the city only on Location (the owner's own) and on the
owner's own profile. Nothing new reaches another collector, so `GeoPrivacyContractTest` needs no new
endpoint; the caller's own `PUT /me/profile` answer carries no place.
