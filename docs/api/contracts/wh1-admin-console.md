# Web stage WH1 contract — the admin console: shell, overview and moderation

> Owner prompt of 2026-10-28 ([`docs/product/specs/2026-10-28-web-redesign-stages.md`](../../product/specs/2026-10-28-web-redesign-stages.md)),
> stage WH1; spec [`2026-10-20-web-redesign.md`](../../product/specs/2026-10-20-web-redesign.md)
> sections 15.1 to 15.4, the parts of 15.8 these pages need and 15.9; decision 3; boards A1 to A6
> and A24. Every change is additive: one migration (**V135**, a new column with a default), new
> fields and one new endpoint; nothing the phone reads is removed or retyped (the phone has no
> admin screen). Field-level truth: `../openapi.json`.

All under `/api/v1/admin`, staff only (Spring Security: `/admin/reports/**`,
`/admin/moderation/**`, `/admin/community/**`, `/admin/ratings/**` and `/admin/references/**`
accept MODERATOR, ADMIN and SUPER_ADMIN; every other `/admin/**` path ADMIN and SUPER_ADMIN).
Places: no admin list carries a place, a city never; GeoPrivacyContractTest reads every response
below (ADR 0017).

## API changes (spec 15.8, WH1's part)

| # | Change | Where |
| --- | --- | --- |
| 1 | **Report numbers.** V135 adds `collector_report.report_number` (bigint, unique, from the sequence `collector_report_number_seq`, starting at 1001; existing reports numbered by their filing date, then id). `number` (int64) on `ReportSummary`, `ReportDetail` and `HistoryReport`. `GET /admin/reports?number=1047` finds one report by its number (with the other filters; `number` ≥ 1, else 400). The console reads it as "#1047" | `reports` module |
| 2a | **Names on ratings.** `AdminRating` gains `ratee` (`RatingAuthor`: handle, displayName, avatarUrl; "Deleted collector" for a gone account) and `hiddenByHandle` (nullable) | `ratings` module |
| 2b | **Names on flags.** `ModerationFlag` gains `authorDisplayName` and `resolvedByHandle` (both nullable; the existing `authorHandle` stays) | `moderation` module |
| 3 | **The room and text of a flagged post or reply.** `ModerationFlag.community` (`FlaggedCommunityContent`, nullable): `postId` (a reply's post), `roomSlug`, `roomName`, `regionCode` (the room's platform region code, `null` for a channel that is not a platform region's), `game`, `text`, `removed`. For an archived channel of the old model named after a city (V041's "Montréal / Yu-Gi-Oh!"), `roomSlug`, `roomName` and `regionCode` are all `null` (review fix 1: the slug and the name carry the city, which a flag would tie to the post's author; ADR 0017). Only for `COMMUNITY_POST` and `COMMUNITY_REPLY`; **a private message's flag never carries its text** (`community` is `null` for `MESSAGE` and `USER`). The moderation module reads it through the SPI `FlaggedContentPreviews`, implemented by the community module (which already depends on moderation) | `moderation`, `community` |
| 4 | **The reported conversation hides shared details.** `ReportedConversationMessage.sharedDetail` (`SHIPPING_ADDRESS` or `ETRANSFER_EMAIL`, nullable): a message that carries one of the chat's "+" templates is sent with that kind and an empty `body`: `ship to:` anywhere in it, `e-Transfer to` at the start of any line (the phone puts the detail after what is already typed, on a line of its own), or an email address or a phone number together with the words e-Transfer (`e-transfer`, `etransfer`, `e transfer`) or Interac; any case, Unicode spaces (a no-break space) included. Hiding one message too many is the safe side. Other messages are unchanged (`e-Transfer sent!` and `I will ship to you tomorrow` keep their text). The audit of `report.conversation.view` is unchanged | `reports` (`SharedDetail`) |
| 4b | **Archived city channels (review fix 1).** `GET /admin/community/channels` sends `regionLabel` only when it is a platform region code (never an old city label) and a new `cityChannel` (boolean) for a channel of the old model named after a city; `PATCH /admin/community/channels/{id}` refuses to restore one (`status: ACTIVE`, 400 on `status`: "a channel named after a city stays archived"), as restoring would list a city to members. The console names such a channel "Archived channel · {game}", never its name, slug or description | `community` (`CityChannels`) |
| 4c | **Open flags of a reported collector (review fix 1).** `ModerationHistory.openFlags` lists the open flags on the account and on what it wrote (a private message, a post, a reply: the flag's author), as board A2 counts them; it listed account flags only | `moderation` |
| 5 | **References list.** `GET /admin/references?subjectId&authorId&state&page&size` (MODERATOR+), newest first, `PageResponse<AdminReference>`. `AdminReference` gains `subject` (`RatingAuthor`), `hiddenByHandle` and `hiddenAt` | `ratings` module |

Not in WH1 (stage WH2): the staff search's one endpoint, `updatedBy` names on flags, limits and
import settings, readable audit targets. Until then the console's staff search composes the
existing lists (below).

## What the console reads and writes

| Screen | Requests |
| --- | --- |
| The shell's counts (Reports, Flags and rules) | Admins: `GET /admin/dashboard` (`openReports` = Open and Under review together, `unassignedReports`, `openModerationFlags`). Moderators (the dashboard is ADMIN only): `GET /admin/reports?status=OPEN&size=1`, `?status=UNDER_REVIEW&size=1`, `GET /admin/moderation/flags?state=OPEN&size=1` (the `totalItems`). Refreshed by the Overview's Refresh and after an assignment, a decision or a resolved flag |
| The PAYMENTS group | `GET /public/feature-flags` (`protectedPayments`): Transactions, Disputes and Payments show only while it is on; typed into the address bar while it is off, their routes say "Protected payments is not available right now." and open the Overview (review fix 1); their pages are unchanged |
| The staff search ("/") | A report number (`#1047` or `1047`): `GET /admin/reports?number=…&size=5`, for everyone. Admins, a text of 2 characters or more: `GET /admin/users?query=…&size=5` (handle, email, display name) and `GET /cards?query=…&size=5`, never for a text with an "@" (an email or a handle goes to accounts only, so it never reaches the public card search's address; review fix 1). Results grouped Collectors, Cards, Reports; Enter opens the active or the first; when a request failed and nothing came back, "Search failed. Try again." |
| Overview (A1) | The dashboard; `GET /admin/reports?status=OPEN&size=5` and `?status=UNDER_REVIEW&size=5` (the queue, newest first, 5), `POST /admin/reports/{id}/assign {}` ("Assign to me"); `GET /admin/moderation/flags?state=OPEN&size=5`; `GET /admin/system/health` (status, `db` and `redis`, `outbox.incomplete`, the `freshness` job); `GET /admin/card-images/status` (the meter, by game); `GET /admin/audit-logs?size=50`, the first five by an ADMIN actor (staff; a collector's own rows are left out, review fix 1) |
| Overview (A24, moderators) | The moderator counts; `GET /admin/reports?assignedTo={me}&status=UNDER_REVIEW&size=20` and `…&status=OPEN&size=20` (review fix 1: asked by status, so decided reports never crowd the desk out; "All reports" opens `?mine=1&status=UNDER_REVIEW`), `?status=OPEN&size=10` (unassigned kept), `?status=UNDER_REVIEW&size=100` (who holds them: "2 with you · 1 with @alex_m") |
| Reports (A2) | `GET /admin/reports?status&reason&assignedTo&reportedUserId&page&size=20` (tabs Open (default), Under review, Action taken, Dismissed, All; All is the default for "Assigned to me" and for one collector, review fix 1; URL `?status=&reason=&mine=1&reportedUserId=&page=`); the open report `GET /admin/reports/{id}`; `POST /admin/reports/{id}/assign`, `POST /admin/reports/{id}/notes {body}` |
| Resolve (A3) | `POST /admin/reports/{id}/resolve {status, action, note, notifyReporter, suspendUntil?}` as before; SUSPENDED and BANNED stay ADMIN+ (403 for moderators, and the dialog disables them) |
| Flags and rules (A4) | `GET /admin/moderation/flags?state&subjectType&page&size=20` (URL `?state=&subject=`), `POST /admin/moderation/flags/{id}/resolve {note?}`; `GET /admin/moderation/rules` (the rule that fired, and the Rules tab: today's create, edit, delete) |
| Community (A5) | `GET /admin/community/channels` (the 15 rooms by `{region}-{game}` and the rest as "Archived channels"), `PATCH /admin/community/channels/{id}` (name, description, `postRateLimitPerHour` 1–1000, `sortOrder` 0–100000, `status` ARCHIVED or ACTIVE), the community flags' count from `GET /admin/moderation/flags?state=OPEN&subjectType=COMMUNITY_POST|COMMUNITY_REPLY&size=1`. No `POST /admin/community/channels` from the console any more (no "New channel"; the endpoint stays) |
| Ratings (A6) | `GET /admin/ratings?rateeId&raterId&state&page&size=20` and `GET /admin/references?subjectId&authorId&state&page&size=20` (URL `?tab=references&state=&rateeId=&raterId=&page=`; the All, Visible and Hidden counts from `size=1` reads), `POST /admin/ratings/{id}/hide {reason}` / `unhide`, `POST /admin/references/{id}/hide {reason}` / `unhide` |

Every write ends with a toast "{result}" and "Recorded in the audit log." (the API audits each one
as before). Errors show the request id and "Try again".
