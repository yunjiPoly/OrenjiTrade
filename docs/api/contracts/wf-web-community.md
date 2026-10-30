# Web stage WF contract — Messages › Community

> Owner prompt of 2026-10-28 ([`docs/product/specs/2026-10-28-web-redesign-stages.md`](../../product/specs/2026-10-28-web-redesign-stages.md)),
> stage WF; spec [`2026-10-20-web-redesign.md`](../../product/specs/2026-10-20-web-redesign.md)
> section 10.7 (and 10.8), decision 11; board W22. The web reads the phone's rooms of stage R11
> ([r11-community-rooms.md](r11-community-rooms.md)) unchanged: **no community endpoint, field or
> rule changes**. The one API change of the stage is WE's leftover R2-2 (two additive keys in two
> notification types' `data`, below). No migration (the next is still **V135**), no field removed
> or retyped, the phone unchanged. Field-level truth: `../openapi.json`.

All under `/api/v1`, signed in (the community is for members: Messages answers a guest with "Messages
are for members"), while the `publicChat` flag is on (404 `FEATURE_DISABLED` otherwise: the web says
"The community is closed right now"). Places are a state or province and a country, never a city or
a coordinate (ADR 0017). Deals ship by mail (ADR 0018); nothing is paid or sponsored (ADR 0019).

## What the web reads and writes

| Screen | Requests |
| --- | --- |
| The inbox column | `GET /community/channels?region={browsed region}`: the region's five rooms with their `lastPost` (the newest post the caller may see; no place). The web orders them as the phone does (the browsed game's room first, then the order of `GET /games`) and keeps "new posts" as the phone does, per account in this browser (`localStorage` `orenji.community.visits.{uid}`, removed on sign-out); nothing is stored on the server |
| A room | `GET /community/channels/{slug}/posts?limit=30` and its cursor pages ("Show older posts"); the first page again every 15 s while the room is on screen and the tab visible, and when the tab comes back (the phone's rule; rooms have no push). `place`, `payload.card`, `payload.binder` (`deckCore`, `askingPriceText`, `imageUrl`), `payload.binderUnavailable` and `payload.photos` as R11 sends them |
| Posting | `POST /community/channels/{slug}/posts {body, cardPrintingId? | binderId?}`: never `photoUploadIds` (the web adds no photo: community photos are stage S4). The refusals in the phone's words: 429 `RATE_LIMITED`, 409 `DUPLICATE_POST`, 422 `POST_BLOCKED`, 404 `FEATURE_DISABLED` / `NOT_FOUND`, a network error with "Try again" |
| "Share a card" | `GET /inventory/items?game={room's game}&markedPublic=true&sort=updated&direction=desc&size=30[&query]`: your cards set to public, shared as their printing (`cardPrintingId`) |
| "Share a binder or deck core" | `GET /binders`: your public, unsold binders of the room's game (or without a game) |
| Your own post | `PATCH /community/posts/{id}` (Edit, while `canEdit`), `DELETE /community/posts/{id}` (Delete) |
| Someone else's post | "Message {h}": `POST /conversations {recipientId}`, then Messages opens the chat; "Report this post": `POST /reports/collectors` with `context {source: POST, postId}` (the dialog shows the post: handle, "{province} · {time}", the text cut to 140 characters); "Block {h}": `POST /users/{id}/block` (Undo: `DELETE /users/{id}/block`); a moderator's "Remove": `POST /admin/community/posts/{id}/remove {reason}` |

Not used by the web: reply threads (`/community/posts/{id}/replies`; "No reply threads", spec
10.7), `POST /uploads/images?kind=COMMUNITY`. Both stay on the API.

**Privacy.** The rooms and their posts were already read by
`GeoPrivacyContractTest.messagingAndCommunityResponsesNeverCarryGeography` (every room of every
region as every seed account; collector7, not discoverable, and a discoverable account with a
PRIVATE profile post first, so the `null` place rules run for every reader). The web reads nothing
more. A blocked author's posts are left out by the API (both directions, in the SQL); the web also
drops them from the open room at once after a block, and the next read agrees.

## The account deletion and other collectors' rating and sale notifications (WE review R2-2)

New `RATING_RECEIVED` and `SALE_RECORDED` notification rows carry the other collector's id in their
`data`, beside the handle they already had (additive keys; the phone and the web ignore them):

| Type | New key | Value |
| --- | --- | --- |
| `RATING_RECEIVED` | `raterId` | the rater's account id |
| `SALE_RECORDED` | `sellerId` | the seller's account id |

The account deletion job renames these rows ("Deleted collector") by that id, so a handle the
deleted account once held, or that another account held before it, never renames someone else's
rows. An older row written before this change (no id) is still found by the handle the account
held when it was deleted, but only when it was written once the account existed: a row older than
the account cannot be its row. An older row of another collector who held the handle while this
account existed would lose its name too; that hides a name, where the other way round would keep a
deleted collector's handle in front of others. `DeletedCollectorDealNotificationsIT`
(`aReusedHandleRenamesOnlyTheDeletedAccountsRows`) pins it.
