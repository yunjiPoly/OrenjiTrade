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
| Every non-public request of a suspended account | `403 ACCOUNT_SUSPENDED` | unchanged: `403 ACCOUNT_SUSPENDED`, message "This account is suspended", `suspendedUntil` (ISO instant) while the suspension has an end |
| The realtime connection (`/ws`, STOMP CONNECT) | refused (`RealtimeAuthenticator`) | unchanged: refused |
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
- **The moderator's reason is not sent.** `user_account.suspension_reason` and a report's
  resolution note are moderators' notes written for the audit log, and a report's note can name or
  hint at the reporter. A separate "message to the collector" would need its own field on the
  admin page (the paused web). Recorded as an owner follow-up.
- Tests: `SuspensionKeepsTheLoginIT` (an admin suspension and a report's never call the identity
  provider; a ban does; unsuspend enables; every request kind refused and nothing written; an
  open-ended one without `suspendedUntil`; the reason never in the answer; an expired suspension),
  `AuditIT`, `ReportFlowIT`, `RealtimeIT` (an admin suspension refused at CONNECT both ways, back
  after unsuspend); the phone's `auth-gate.test.tsx` and `account-states.test.tsx`; native flow
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
| `POST /conversations {recipientId}` | `403 MESSAGING_BLOCKED` "This collector cannot receive messages right now" (was "You cannot message this collector") | `403 MESSAGING_BLOCKED` "You cannot message this collector" (unchanged) |

- The block is decided right after the account is found and before any of its data (privacy
  settings, profile, ratings, listings) is read: in one query for the profile and its ratings and
  references (`BlockRepository.hidesFrom`, through `BlockRelationProvider.isHiddenByBlock`), and,
  for cards, binders and wishes, before the privacy settings (both directions, as before). The
  bodies are compared with an unknown handle's apart from `requestId`, `timestamp` and the handle
  in `instance` (`BlockAnsweredAsNotFoundIT`).
- `isBlocked` now reaches the blocker only, so it no longer tells the blocked side anything.
- The `errorCode` of a refused message stays `MESSAGING_BLOCKED` for every refusal (blocks,
  inactive participants, the messaging permission); its `title` "Messaging blocked" is the code's
  and the same for all of them. The phone and the paused web word a refusal by its `errorCode`
  ("You cannot message this collector. They may have blocked messages or you blocked them."), so
  neither changed.
- Not changed, recorded as owner follow-ups (`IMPLEMENTATION_STATUS.md`): the conversation of a
  blocked pair leaves both inboxes at the block (a chat with a suspended collector stays), and a
  new conversation refused for a block answers `403` where one with a suspended or deleted
  collector answers `404`.
