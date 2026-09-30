package com.orenjitrade.api.moderation.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** {@code moderation_state} of messages, posts and replies. */
@Schema(name = "ContentModerationState")
public enum ContentModerationState {
    /** Nothing to review. */
    OK,
    /** Accepted but waiting for a moderator (a FLAG rule fired); shown normally. */
    FLAGGED,
    /** Removed by a moderator; the text is no longer served. */
    REMOVED
}
