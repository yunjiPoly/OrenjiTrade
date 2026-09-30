package com.orenjitrade.api.community.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction that stored a community post (Phase 6 notifications, analytics).
 * Ids only, never the text.
 */
public record CommunityPostCreated(
        UUID postId, UUID channelId, String channelSlug, UUID authorId, Instant occurredAt) {}
