package com.orenjitrade.api.community.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.moderation.domain.ContentModerationState;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A community post ({@code PostResponse} of the contract).
 *
 * @param id post id
 * @param channelSlug channel
 * @param author author
 * @param body text (≤ 2000)
 * @param payload shared card or binder
 * @param createdAt creation
 * @param editedAt last edit by the author
 * @param replyCount visible replies
 * @param lastReplyAt newest reply
 * @param canEdit the caller wrote the post
 * @param canDelete the caller wrote the post or is a moderator
 * @param moderationState OK or FLAGGED (removed posts are not served)
 */
@Schema(name = "PostResponse", description = "A community post")
public record PostView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "general") String channelSlug,
        @Schema(requiredMode = RequiredMode.REQUIRED) PostAuthor author,
        @Schema(requiredMode = RequiredMode.REQUIRED) String body,
        @Schema(requiredMode = RequiredMode.REQUIRED) PostPayload payload,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant editedAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) int replyCount,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant lastReplyAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean canEdit,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean canDelete,
        @Schema(requiredMode = RequiredMode.REQUIRED) ContentModerationState moderationState) {}
