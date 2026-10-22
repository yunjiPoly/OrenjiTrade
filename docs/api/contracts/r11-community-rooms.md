# Stage R11 contract — Messages › Community: one simple room per game

> Owner prompt of 2026-10-19/20
> ([`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md)),
> section "R11. Messages › Community (32, 33): one simple room per game"; mockup v50 screens 32
> and 33 (and 22's Chats | Community tabs). Extends [phase5-chat.md](phase5-chat.md) ("Community
> chat" and "Uploads"). Migration V134; every API change is additive (new optional fields, a new
> enum value, a new optional request field): the paused web builds and passes its checks against
> the regenerated client, unchanged. Field-level truth: `../openapi.json`.

All under `/api/v1`, signed in (anonymous: 401), while the `publicChat` flag is on (404
`FEATURE_DISABLED` otherwise; V134 switches it on unless an admin chose its value, and it stays
the kill switch). Places are a state or province and a country, never a city or a coordinate
(ADR 0017). Deals ship by mail (ADR 0018); nothing is paid or sponsored (ADR 0019).

## The rooms (V134)

One room per platform region and game, 15 in all: `community_channel` rows of kind `REGION` with
`game` and `regionLabel`, slug `{region}-{game}`:

| Region | Rooms (in the games' order) |
| --- | --- |
| `americas-north` | `americas-north-yugioh`, `americas-north-pokemon`, `americas-north-mtg`, `americas-north-onepiece`, `americas-north-riftbound` |
| `americas-south` | `americas-south-yugioh` … `americas-south-riftbound` |
| `europe` | `europe-yugioh` … `europe-riftbound` |

- `name`: the game's name as the mockup writes it ("Yu-Gi-Oh!", "Pokémon", "Magic: The Gathering",
  "One Piece", "Riftbound"); `description`: "{game} collectors in {region}: trades and sales by
  mail."; `postRateLimitPerHour` 10 (data, `/admin/community/channels`).
- **Every other channel is `ARCHIVED`** (V041's looking-for, new-listings, trades and general,
  V110's three region channels, the old city channels, any channel an admin added): not listed,
  posts and reads 404, nothing deleted (moderators and the authors' exports keep their posts). An
  admin can still add or reactivate channels through `/admin/community/channels` (the web).

## `GET /community/channels`

Unchanged parameters (`game`, `region`). Each channel gains:

| Field | Rule |
| --- | --- |
| `lastPost` | nullable `CommunityLastPost`: the newest post **the caller may see** — not deleted, not removed, its author active (or a suspension over) and not blocked in either direction with the caller — or `null` |
| `lastPost.id` | the post |
| `lastPost.authorHandle` | its author's handle (no display name, no avatar, **no place**) |
| `lastPost.body` | its text on one line (runs of white space as one space), cut to 140 characters with "…" (never in the middle of an emoji) |
| `lastPost.createdAt` | when it was posted |
| `lastPost.mine` | the caller wrote it |

The phone asks `?region={browsed region}` and orders the five rooms itself (the browsed game's room
first, then the games' order). "New posts" is the phone's own memory: the newest post read in each
room, kept per account on the phone (nothing is stored on the server).

## `GET /community/channels/{slug}/posts`

Unchanged paging and rules (blocks both ways, suspended and deleted accounts, deleted and removed
posts left out). Each post gains:

| Field | Rule |
| --- | --- |
| `place` | nullable `Place` (`subdivisionName`, `countryName`, `label`, codes): the author's state or province and country **only when the author is discoverable and their profile is not private** (the privacy matrix's `canSeeLocation`, the profile's own rule); `null` otherwise, the author's own posts included (you read what others read). Never a city |
| `payload.photos` | the post's photos in order (`PostPhoto`: `url`, `width`, `height`), `[]` when none |
| `payload.binder.deckCore` | posts only: `true` while the shared binder is a deck core buyers can find (public, unsold, its owner's listings public, the owner not blocked with the reader); `false` otherwise. Absent in messages |
| `payload.binder.askingPriceText` | posts only, while `deckCore`: its price as typed ("$95"); absent otherwise |
| `payload.binder.imageUrl` | posts only, while the binder can be found: its first photo, else the first card picture buyers see; absent otherwise |

The card link (`payload.card`) is unchanged (it opens Who has this card on that printing).

## `POST /community/channels/{slug}/posts`

`CreatePostRequest` gains `photoUploadIds` (optional, at most 4 uuids, in order):

- each the uploadId of a `POST /uploads/images?kind=COMMUNITY` of the caller, from the last hour,
  not attached yet, each once: otherwise **400** `VALIDATION_FAILED` on `photoUploadIds` (five or
  more, a repeated id, another collector's upload, a `MESSAGE` upload, a used or expired one);
- the body stays required (1–2000 characters): a post is never photos alone;
- the uploads are locked with the post and marked attached when it is stored; a refused post (409
  `DUPLICATE_POST`, 429 `RATE_LIMITED`, 422 `POST_BLOCKED`) leaves them unattached, so the phone
  can send the same photos again within the hour (it uploads them again on "Try again").

Errors as before: 409 `DUPLICATE_POST` (the same text by the caller in the last 24 hours; the
phone says "You already posted this."), 429 `RATE_LIMITED` above the room's
`postRateLimitPerHour` (10; "You can post up to 10 times an hour in each room. Try again later."),
422 `POST_BLOCKED`, 403 `AGE_CONFIRMATION_REQUIRED`. **Posts never notify anyone** (no
notification, no push; the analytics event `community_post_created` is unchanged).

## `DELETE /community/posts/{id}` and `POST /admin/community/posts/{id}/remove`

As before, and the post's photo rows and their stored files are deleted once the deletion or the
removal commits. Account deletion deletes the photos of every post of the account with its posts'
text. The account export lists each post's photo URLs.

## `POST /uploads/images`

`kind` gains `COMMUNITY` (`UploadKind`):

| Kind | Limit | Attached with |
| --- | --- | --- |
| `MESSAGE` (default) | 8 MB | an `IMAGE` message's `imageUploadId` |
| `COMMUNITY` | **3 MB** (owner, 2026-10-08) | a post's `photoUploadIds` |
| `INVENTORY` | refused (400) | inventory photos keep `POST /inventory/items/{id}/images` |

Same pipeline for both: JPEG, PNG or WebP sniffed from the content (a video or anything else: 415
`UNSUPPORTED_MEDIA_TYPE`), decompression-bomb guard, re-encoded as a JPEG of at most 1600 px
**without any EXIF or GPS data**, the inspector hook, 413 `PAYLOAD_TOO_LARGE` above the kind's
limit ("The image must be at most 3 MB"), attachable for an hour (the upload-cleanup job deletes
the rest with their files). A `COMMUNITY` upload cannot be attached to a message, nor a `MESSAGE`
upload to a post.

## Privacy

`GeoPrivacyContractTest.messagingAndCommunityResponsesNeverCarryGeography` reads every room of every
region and every post in them as every seed account: a post's place is its author's seeded state or
province and country, `null` for collectors who are not discoverable, never a city; the room list's
newest post carries no place; no coordinate, distance or radius anywhere.

## What the phone does with it

- **Messages** (screen 22): the tabs Chats | Community while `publicChat` is on; Chats has an orange
  dot while a chat is unread ("Chats, {n} unread"); the tab bar's badge counts chats only.
- **Community** (screen 32): the region pill (the browsed region; "Not your region. Back to …"
  while away), the browsed region's five rooms (`?region=`), the browsed game's first, then the
  games' order; a row is the game's tile and name, "{handle}: {text}" and its time, bold with an
  orange dot while someone posted after the last visit on this phone; "No posts yet. Say hi!"; the
  footnote "Every collector in {region} can read these rooms. Keep deals and addresses in private
  chats."
- **A room** (screen 33): back, the tile, the name and "{region} · public room", Room rules (the
  four rules, "You can post up to 10 times an hour in each room.", "Got it"), the banner, posts like
  a chat (newest at the bottom, day separators; avatar, handle, "{province} · {time}", text, up to 4
  photos, a shared card or binder or deck core), "⋯" (Message {handle}, Report this post, Block
  {handle} in red; Delete on one's own), the message box ("+": Send a photo, Share a card, Share a
  binder or deck core; "Write to the room"; the send button orange with text). No reply threads,
  no editing on the phone (both stay on the API and the paused web).
