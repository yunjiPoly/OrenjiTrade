# Phase 5 contract — private messaging, realtime, public community chat, blocking

All under `/api/v1`, authenticated. Trading-focused messaging only.

## Tables

- `conversation(id, kind DIRECT, created_at, last_message_at, last_message_preview, created_by)`
- `conversation_participant(conversation_id, user_id, joined_at, last_read_at, muted bool, archived bool, unique(conversation_id,user_id))` — DIRECT conversations have exactly 2 participants; unique pair enforced via `conversation_pair(user_low, user_high, conversation_id)`.
- `message(id, conversation_id, sender_id, kind TEXT|CARD_LINK|BINDER_LINK|OFFER_LINK|IMAGE|SYSTEM, body text (≤ 4000), payload jsonb (card/binder/offer refs, image storage keys), created_at, edited_at null, deleted_at null, moderation_state OK|FLAGGED|REMOVED)`
- `message_attachment(id, message_id, storage_key, url, width, height, bytes)`
- `user_block(blocker_id, blocked_id, created_at, reason null)`
- `community_channel(id, slug unique, name, kind GAME|REGION|LOOKING_FOR|NEW_LISTINGS|TRADES|GENERAL, game_slug null, region_label null, description, status ACTIVE|ARCHIVED, post_rate_limit_per_hour, created_at)`
- `community_post(id, channel_id, author_id, body (≤ 2000), payload jsonb (card/binder links), created_at, edited_at, deleted_at, moderation_state, reply_count, last_reply_at)`
- `community_reply(id, post_id, author_id, body (≤ 1000), created_at, deleted_at, moderation_state)`
- `moderation_rule(id, kind BANNED_TERM|RATE_LIMIT|THRESHOLD, pattern, action FLAG|BLOCK, scope MESSAGE|POST|TAG|PROFILE, active, updated_by, updated_at)` (ADR 0014)
- `moderation_flag(id, subject_type, subject_id, rule_id null, reason, created_at, resolved_at, resolved_by)`
- Indexes: `message(conversation_id, created_at desc)`, `community_post(channel_id, created_at desc)`, `user_block(blocked_id)`.

## Private messaging

- `GET /conversations?cursor=&limit=` → `CursorPage<ConversationSummary>` `{ id, other: {id, handle, displayName, avatarUrl, onlineStatus}, lastMessage: {preview, kind, createdAt, senderId}, unreadCount, muted, archived }`
- `POST /conversations` `{ "recipientId": "uuid" }` → existing or new conversation (409 never; idempotent). Checks: recipient messagingPermission, block in either direction (`403 MESSAGING_BLOCKED`), recipient not deleted/suspended, sender profile complete when recipient requires MEMBERS_WITH_PROFILE.
- `GET /conversations/{id}/messages?cursor=&limit=50` → `CursorPage<MessageResponse>` (newest first) `{ id, senderId, kind, body, payload: { card?: {id,name,printingCode,imageUrl}, binder?: {id,name,ownerHandle}, offer?: {id,status,summary}, image?: {url,width,height} }, createdAt, editedAt, readByOther: bool, moderationState }`
- `POST /conversations/{id}/messages` `{ kind, body, cardPrintingId?, binderId?, offerId?, imageUploadId? }` (rate-limited 30/min; banned-term check → `422 MESSAGE_BLOCKED` with generic reason) → 201 MessageResponse. Emits `MessageSent` (notification + realtime).
- `POST /conversations/{id}/read` `{ "lastReadMessageId": "…" }` → 204 (updates last_read_at, realtime read receipt)
- `PATCH /conversations/{id}` `{ muted?, archived? }`
- `POST /uploads/images` multipart (kind=MESSAGE|INVENTORY) → `{ uploadId, url }` (re-encoded, ≤ 8 MB, virus/moderation hook), consumed by message creation within 1 h.
- `POST /users/{id}/block` / `DELETE /users/{id}/block`, `GET /me/blocks` → blocked users list. Blocking hides conversations both ways and prevents new ones.

## Realtime

STOMP over WebSocket at `/ws` (SockJS fallback off; native WS). Handshake auth: `Authorization`
header or `?access_token=` (ID token) validated by the same `IdentityTokenVerifier`.
Subscriptions (server-enforced ownership): `/user/queue/messages` (new MessageResponse +
conversationId), `/user/queue/receipts` (`{conversationId, userId, lastReadMessageId}`),
`/user/queue/notifications` (Phase 6), `/user/queue/presence`. Client sends `/app/typing`
`{conversationId}` → other participant receives `/user/queue/typing`. Cross-instance fan-out:
`RealtimePublisher` publishes to Redis channel `rt:user:{userId}`; every instance subscribes
and forwards to local sessions. Presence: Redis key `presence:{userId}` TTL 60 s refreshed by
heartbeat; exposed only when `showOnlineStatus`.

## Community chat

- `GET /community/channels?game=&region=` → `[ { id, slug, name, kind, game, regionLabel, description, postCount24h } ]` (seed: Montréal / Yu-Gi-Oh!, Montréal / Pokémon, Montréal / Magic, Montréal / Riftbound, Looking For, New Listings, Trades, General; region channels are created per `public_label` city as users appear — admin can add)
- `GET /community/channels/{slug}/posts?cursor=&limit=` → `CursorPage<PostResponse>` `{ id, author: {id, handle, displayName, avatarUrl}, body, payload, createdAt, editedAt, replyCount, lastReplyAt, canEdit, canDelete }`
- `POST /community/channels/{slug}/posts` `{ body, cardPrintingId?, binderId? }` (rate limit per channel `post_rate_limit_per_hour`, default 10; banned terms; duplicate-body detection within 24 h → `409 DUPLICATE_POST`)
- `GET /community/posts/{id}/replies?cursor=`, `POST /community/posts/{id}/replies`, `DELETE /community/posts/{id}` (author or MODERATOR+), `DELETE /community/replies/{id}`
- Moderator: `POST /admin/community/posts/{id}/remove` `{ reason }`, `POST /admin/community/channels` / `PATCH …/{id}`, `GET /admin/moderation/flags?state=` — audited.
- Report entry points: "Report collector" is available from a message header and a post author menu, using the Phase 7 collector-report endpoint.

## Auto-moderation hooks

`ModerationService.check(scope, text, authorId)` applies active `moderation_rule`s (banned
terms → FLAG or BLOCK), per-user rate thresholds (Redis), and repeated-content detection;
BLOCK returns `422 MESSAGE_BLOCKED`/`POST_BLOCKED`; FLAG stores a `moderation_flag` for review.
No automatic permanent bans; thresholds create flags/strikes only.

## Web

Map page right panel becomes the real Messages panel (conversation list → thread with
composer supporting card/binder link insertion via autocomplete and image attach; typing
indicator; read receipts; block/report menu). `/messages` full-page variant. `/community`
page: channel sidebar, post feed with composer, replies inline, report/block actions.
Mobile: Messages tab (list + thread), Community under Search tab or a segment.
