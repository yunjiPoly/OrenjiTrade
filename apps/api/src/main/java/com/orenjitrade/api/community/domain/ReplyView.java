package com.orenjitrade.api.community.domain;

import com.orenjitrade.api.moderation.domain.ContentModerationState;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;

/**
 * A reply to a community post.
 *
 * @param id reply id
 * @param postId the post
 * @param author author
 * @param body text (≤ 1000)
 * @param createdAt creation
 * @param canDelete the caller wrote the reply or is a moderator
 * @param moderationState OK or FLAGGED
 */
@Schema(name = "ReplyResponse", description = "A reply to a community post")
public record ReplyView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID postId,
        @Schema(requiredMode = RequiredMode.REQUIRED) PostAuthor author,
        @Schema(requiredMode = RequiredMode.REQUIRED) String body,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean canDelete,
        @Schema(requiredMode = RequiredMode.REQUIRED) ContentModerationState moderationState) {}
