# Phase 7 contract — ratings, references, collector reporting, moderation, admin console, auto-delisting

## Ratings and references

Tables: `interaction(id, kind TRADE|OFFER_ACCEPTED|CONVERSATION_QUALIFIED, user_a, user_b, subject_type, subject_id, occurred_at, unique(kind, subject_id))` — an eligible interaction exists when: a trade completed, an offer was accepted, or a conversation has ≥ 3 messages from each side (qualified). `rating(id, interaction_id, rater_id, ratee_id, overall 1–5, communication 1–5 null, condition_accuracy null, shipping null, meetup_reliability null, comment ≤ 600, created_at, updated_at, moderation_state OK|HIDDEN, unique(interaction_id, rater_id))`. `reference(id, author_id, subject_id, body ≤ 400, created_at, moderation_state, unique(author_id, subject_id))` (requires ≥1 interaction). `rating_summary(user_id, average, count, communication_avg, …)` maintained.

- `GET /ratings/eligibility?userId=` → `{ eligible: bool, interactions: [ { id, kind, occurredAt, alreadyRated } ] }`
- `POST /ratings` `{ interactionId, overall, communication?, conditionAccuracy?, shipping?, meetupReliability?, comment? }` → 201 (`403 RATING_NOT_ELIGIBLE` when no interaction; `409 ALREADY_RATED`); editable for 14 days.
- `GET /collectors/{handle}/ratings?cursor=` → `CursorPage<RatingResponse>` `{ id, rater: {handle, displayName, avatarUrl}, overall, breakdown, comment, createdAt, interactionKind }` + `summary`
- `POST /references` `{ subjectId, body }`, `GET /collectors/{handle}/references`
- Admin: `POST /admin/ratings/{id}/hide` `{ reason }` / `unhide` — audited.

## Collector reporting (only reportable subject: a collector)

`collector_report(id, reporter_id, reported_user_id, reason SCAM|COUNTERFEIT|HARASSMENT|SPAM|INAPPROPRIATE_BEHAVIOR|MISLEADING_LISTINGS|OTHER, details ≤ 1000, context jsonb ({source: PROFILE|CONVERSATION|POST|BINDER, conversationId?, postId?, binderId?}), status OPEN|UNDER_REVIEW|ACTIONED|DISMISSED, created_at, assigned_to null, resolved_at null, resolution_note null, resolution_action NONE|WARNING|LISTINGS_PAUSED|SUSPENDED|BANNED null, unique(reporter_id, reported_user_id) WHERE status IN ('OPEN','UNDER_REVIEW'))`
`moderator_note(id, report_id, author_id, body, created_at)`.

- `GET /public/report-reasons` → `[ { code, label, description } ]` (order per spec)
- `POST /reports/collectors` `{ reportedUserId, reason, details?, context? }` → 201 `{ id, status:"OPEN", createdAt }` (`409 REPORT_ALREADY_OPEN`, `422 CANNOT_REPORT_SELF`, rate 5/day). Confirmation returned to the user; emits `CollectorReported` (analytics + threshold check: ≥3 open reports from distinct reporters within 7 days → `moderation_flag` + auto-pause listings pending review, never a ban).
- `GET /me/reports` → the reporter's own reports (status only).
- Admin/moderator: `GET /admin/reports?status=&reason=&reportedUserId=&page=` → `PageResponse<ReportSummary>`; `GET /admin/reports/{id}` → detail incl. reporter, reported user summary, context, moderator notes, reported user's recent history (`recentReports`, `recentRatings`, `recentPostsRemoved`, `suspensions`, `listingsPaused`) — no private message bodies unless `context.conversationId` is present (then that conversation only); `POST /admin/reports/{id}/assign`, `POST /admin/reports/{id}/notes`, `POST /admin/reports/{id}/resolve` `{ status: ACTIONED|DISMISSED, action, note, notifyReporter: bool }` → applies the action (warning notification / pause listings / suspend with reason and optional until / ban = suspend + mark) and writes `audit_log` (`REPORT_RESOLVED`, details with action). Reporter gets a `REPORT_DECISION` notification without disclosing specifics.

## Auto-delisting (policy table from Phase 3)

- Admin: `GET /admin/delist-policies`, `PUT /admin/delist-policies/{id}` (validated ordering aging < stale < hidden; audited), `GET /admin/listings/stale?state=STALE|HIDDEN&page=` → `PageResponse<StaleListing>` `{ item, owner, confirmedAt, state, warnedAt }`, `POST /admin/listings/{itemId}/restore` (admin restore with audit), `POST /admin/users/{id}/pause-listings` / `resume-listings`.
- Strikes: `user_responsiveness(user_id, unanswered_conversations_30d, strikes, paused_until)` updated nightly; `policy.max_strikes` default 3; only pauses public listings (never deletes), user can resume by confirming.

## Admin console (web `/admin`, RBAC: MODERATOR sees Reports, Moderation, Community, Ratings; ADMIN sees all but Feature Flags/Plans writes; SUPER_ADMIN everything)

Sections and their backing endpoints:
| Section | Endpoints |
| --- | --- |
| Dashboard | `GET /admin/dashboard` → counts (users, active collectors 7d, public items, open reports, stale/hidden items, open disputes, notifications failed 24h, webhook failures 24h) |
| Users | Phase 1 admin endpoints + `pause-listings`, `GET /admin/users/{id}/history` |
| Listings | `GET /admin/listings?query=&state=&game=` + hide/restore |
| Binders | `GET /admin/binders?…`, `POST /admin/binders/{id}/unpublish` |
| Games / Cards | Phase 2 admin endpoints |
| Public Chat | Phase 5 admin endpoints |
| Collector Reports / Moderation | above + `GET /admin/moderation/rules`, `PUT /admin/moderation/rules/{id}`, flags |
| Transactions / Disputes / Payments | Phases 8–9 |
| Ratings | above |
| Ads / Subscriptions / Usage Limits / Credits | Phase 10 |
| Notifications | `GET /admin/notifications/stats`, `POST /admin/notifications/broadcast` (SUPER_ADMIN, audited) |
| Analytics | `GET /admin/analytics/summary` (from BigQuery adapter or local aggregate stub) |
| Auto-Delist Rules | above |
| Feature Flags | `GET /admin/feature-flags`, `PUT /admin/feature-flags/{key}` `{ enabled, rolloutPercent?, note }` (SUPER_ADMIN, audited, Redis invalidation) |
| Audit Logs | Phase 1 endpoint with filters |
| System Health | `GET /admin/system/health` → actuator health + queue depths + last job runs (`job_run` table) |

Every admin write goes through `AuditService.record(...)` inside the same transaction.
