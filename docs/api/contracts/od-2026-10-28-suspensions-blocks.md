# Owner decisions of 2026-10-28: suspended collectors and blocks

The owner's answers of 2026-10-28 to the open follow-ups of stages R8, R12 and R13 that change the
API: a suspension leaves the login on (R8 follow-up 2, R12 follow-up 3), and a collector you
blocked reads your profile as if it did not exist (R13 follow-up 7). No endpoint, field, parameter
or migration is added or removed; the OpenAPI changed in descriptions only. The two phone-only
decisions of the same day (large text, the quick replies after a sale) are in
`IMPLEMENTATION_STATUS.md`, section "Owner decisions of 2026-10-28".

## A suspension leaves the login on (extends 1 and 7)

The owner's words: "Leave the login on during a suspension. They sign in and land on the Account
suspended screen with its end date. They still can't do anything, because the API refuses every
request."

| What | Before | Now |
| --- | --- | --- |
| `POST /admin/users/{id}/suspend` | the Firebase user disabled, its refresh tokens revoked | the Firebase user untouched (enabled, tokens kept) |
| `POST /admin/reports/{id}/resolve`, `SUSPENDED` | the same | the same as above |
| `POST /admin/reports/{id}/resolve`, `BANNED` | the Firebase user disabled | unchanged: disabled (and its tokens revoked) |
| `POST /admin/users/{id}/unsuspend` | `enableUser` | unchanged: `enableUser` (an account disabled under the earlier rule, or banned, gets its login back) |
| Every non-public request of a suspended account | `403 ACCOUNT_SUSPENDED` | unchanged: `403 ACCOUNT_SUSPENDED`, message "This account is suspended", `suspendedUntil` (ISO instant) while the suspension has an end; no other field (below) |
| The public routes (`GET /feed`, `/search/**`, `/regions/**`, `/collectors/{handle}/binders` and `/inventory`, `/public/**`) with the account's token | read as a member (who: ids, handles, names), until the last ID token expired (about an hour) | read exactly as a signed-out visitor reads them: places, never who; the guests' rate limits (review fix 1) |
| The realtime connection (`/ws`, STOMP CONNECT) | refused (`RealtimeAuthenticator`) | unchanged: refused |
| A realtime session opened before the suspension | kept sending (typing), subscribing and refreshing presence | closed at the suspension (review fix 1) |
| `last_active_at`, and the e-mail and its verified flag from the identity provider | written by every request, refused ones included | left as they were until the suspension ends (review fix 1) |
| A suspension whose end has passed | the account acts again | unchanged |

- **Why the refresh tokens are kept too.** The API verifies ID tokens without the revocation check
  (`checkRevoked=false`) and refuses a suspended account from its own database on every request
  (`AccountAccessFilter`, `RealtimeAuthenticator`), so a token gives a suspended collector nothing.
  Revoking the refresh tokens would make the Firebase SDK fail its next refresh (hourly, or the
  forced refresh after a `401`), and the phone would say "Your session has ended. Sign in again to
  continue." before the collector could see the suspension: the detour the owner wants gone. With
  the tokens kept, a phone already signed in reaches "Account suspended" at its next request.
- **What the phone shows** (no phone change was needed for the route): any `403 ACCOUNT_SUSPENDED`
  is an account signal; the gate shows "Your account is suspended" (mockup v50 screen 44) with the
  API's message, "The suspension ends on {date}." when `suspendedUntil` is present (no date for an
  open-ended suspension or a ban), the appeal line with support@orenjitrade.com, "Community
  guidelines" and Sign out. Signing in again lands there too (`GET /me` answers the same `403`).
  A banned collector still reads "This account has been disabled. Contact support if you think
  this is a mistake." on Sign in.
- **Screen 44's payload.** `403 ACCOUNT_SUSPENDED` holds `type`, `title`, `status`, `detail`,
  `instance`, `errorCode`, `message`, `requestId`, `timestamp` and, while the suspension has an
  end, `suspendedUntil`: nothing else (no e-mail, handle, reason or note; pinned by
  `SuspensionKeepsTheLoginIT`).
- **A refused account reads the public routes as a guest** (review fix 1, P1 and F2).
  `AccountAccessFilter` drops the token of an account it refuses (a suspension in force, a
  deletion pending, a deleted account) on every public route: the request runs as a signed-out
  visitor's (stage R15's rules: places, never who; name search finds nobody). With the login on,
  the token would otherwise have kept reading members-only details for as long as the suspension
  lasts. Its own routes (`/collectors/{handle}`, `/me`, everything else) stay `403`. Tests:
  `RefusedAccountBrowsesAsGuestIT` (nine public reads compared with a guest's, body for body, for
  a suspension, a deletion pending and a deleted account; a member's view again once the
  suspension is over).
- **Realtime sessions opened before** (review fix 1, P3 and F3). `RealtimeSessions` keeps the open
  WebSocket sessions of the instance and closes an account's on `UserSuspendedEvent` (a
  suspension or a ban), `AccountDeletionRequestedEvent` and `AccountDeletedEvent` (close status
  1008 "This account cannot connect"); nothing more the session sends reaches anyone. An instance
  that did not see the event (the scale-up path, ADR 0016) refuses the session at its next presence
  check, at most 20 s later (`StompSecurityInterceptor`, the same words). The phone also drops its
  connection once the account leaves `ready`. Tests: `RealtimeIT` (typing reaches the partner, the
  suspension closes the session, nothing more arrives; a deletion request closes one too) and
  `StompSecurityInterceptorTest`.
- **Nothing is written while suspended** (review fix 1, P5 and F10). A refused request no longer
  sets `last_active_at` (the profile would say "Active this week" while the phone sits on screen
  44) and no longer copies a new e-mail from the identity provider: the account keeps the e-mail
  it was suspended with, the one moderators know, until the first request after the end.
- **Accounts suspended before this change** (review fix 1, P10 and F12): their Firebase user is
  still disabled. They read "This account has been disabled" instead of screen 44, and, when a
  temporary suspension ends, they stay locked out until an admin lifts it (`unsuspend` enables the
  login; nothing re-enables it at the end). No environment is in production yet; an environment
  that holds such accounts needs a one-off: `unsuspend` (or the Firebase console's "Enable") for
  every `SUSPENDED` account whose `banned_at` is null. Recorded as an owner follow-up.
- **The moderator's reason is not sent.** `user_account.suspension_reason` and a report's
  resolution note are moderators' notes written for the audit log, and a report's note can name or
  hint at the reporter. A separate "message to the collector" would need its own field on the
  admin page (the paused web). Recorded as an owner follow-up.
- Tests: `SuspensionKeepsTheLoginIT` (an admin suspension and a report's never call the identity
  provider; a ban does; unsuspend enables; every request kind refused and nothing written; an
  open-ended one without `suspendedUntil`; the reason never in the answer; an expired suspension),
  `AuditIT`, `ReportFlowIT`, `RealtimeIT` (an admin suspension refused at CONNECT both ways, back
  after unsuspend; a session opened before closed by it), `RefusedAccountBrowsesAsGuestIT`; the
  phone's `auth-gate.test.tsx` and `account-states.test.tsx`; native flow
  `account-suspended.yaml`.

## A collector who blocked you does not exist for you (extends 1, 5, 7 and R6)

The owner's words: "The server would answer the blocked person as if your profile didn't exist
(the same not found as an unknown name). It would also use the same error wording for a block as
for anyone else who can't receive messages."

The rule replaces R6's "Blocks (today's rule, kept)" (`r6-profiles.md`). "The blocked side" is a
caller whom the profile's owner blocked and who did not block the owner; "the blocker" is a
caller who blocked the owner (also when both blocked each other).

| Read or write | The blocked side | The blocker |
| --- | --- | --- |
| `GET /collectors/{handle}` | `404 NOT_FOUND` "Collector not found": the unknown handle's answer, field for field | `200` with `isBlocked: true`, `canMessage: false` (unchanged) |
| `GET /collectors/{handle}/ratings`, `/references` | `404` "Collector not found" (was `200`) | `200` (unchanged) |
| `GET /collectors/{handle}/inventory`, `/binders` | `404` "Collector not found" (unchanged) | `404` (unchanged) |
| `GET /collectors/{handle}/wishlist` | `404` "Wishlist not found" (unchanged; the unknown handle's answer) | `404` (unchanged) |
| `POST /conversations/{id}/messages` | `403 MESSAGING_BLOCKED` "This collector cannot receive messages right now", the answer for an inactive participant (was "You cannot message this collector") | `403 MESSAGING_BLOCKED` "You cannot message this collector" (unchanged) |
| `POST /conversations {recipientId}` | `403 MESSAGING_BLOCKED` "This collector does not accept new conversations": the answer of a recipient who accepts none (messaging permission NOBODY), field for field (was "You cannot message this collector"; review fix 1, P2 and F1) | `403 MESSAGING_BLOCKED` "You cannot message this collector" (unchanged) |

- The block is part of the handle lookup itself (review fix 1, P9 and F9): one query
  (`CollectorHandleRepository`, through `CollectorLookup`) finds the account holding the handle
  only when it is publicly visible and did not block the caller (unless the caller blocked it
  too), so an unknown handle, a suspended, deletion-pending or deleted account and a collector who
  blocked the caller all end at that one query, before any of the account's data is read; the
  extra `EXISTS` query (and its measurable 0.2 to 0.3 ms) is gone. The profile, its ratings and
  references, its cards, binders and wishes use it; cards, binders and wishes still answer the
  blocker `404` too (both directions, as before). The bodies are compared with an unknown
  handle's apart from `requestId`, `timestamp` and the handle in `instance`
  (`BlockAnsweredAsNotFoundIT`, which also checks the lookup for each kind of caller;
  `CollectorLookupTest`).
- Why the NOBODY words on a new conversation, and not the unknown recipient's `404`: they are the
  words of a collector who cannot receive messages (the owner's), any collector may choose that
  setting, and the paused web's E2E (`messaging.spec.ts`) asserts `403 MESSAGING_BLOCKED` for that
  call (owner order: the web keeps passing). The refusal comes before any earlier chat is looked
  up, so the blocked side never gets the chat back from this call.
- `isBlocked` now reaches the blocker only, so it no longer tells the blocked side anything.
- The `errorCode` of a refused message stays `MESSAGING_BLOCKED` for every refusal (blocks,
  inactive participants, the messaging permission); its `title` "Messaging blocked" is the code's
  and the same for all of them. The phone and the paused web word a refusal by its `errorCode`
  ("You cannot message this collector. They may have blocked messages or you blocked them."), so
  neither changed.
- Accepted limits, recorded as owner follow-ups (`IMPLEMENTATION_STATUS.md`), each outside the
  profile's own reads or inherent to a block:
  - the conversation of a blocked pair leaves both inboxes at the block and its reads answer the
    blocked side `404` while sending in it answers `403` (a chat with a suspended collector stays
    readable): the blocked side can tell;
  - a new conversation refused for a block answers `403` (the NOBODY words) where one with an
    unknown, suspended or deleted collector answers `404`, so a caller who still holds the
    blocker's id and compares it with the profile's `404` can tell;
  - signing out, or asking from a second account, shows the blocker's public binders and cards
    (a block binds two accounts; the phone opens no profile for a guest);
  - the blocked side who blocks back reads the blocker's profile again with `isBlocked` (each is
    then the blocker; the opposite rule would tell the first blocker they were blocked back);
  - the blocker's ratings of other collectors still show their handle, name and words to the
    blocked side, as to anyone (a suspended or private rater shows the same way).
