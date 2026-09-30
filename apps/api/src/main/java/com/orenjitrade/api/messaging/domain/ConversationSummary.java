package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A conversation in the caller's list ({@code GET /conversations}) or as returned by {@code POST
 * /conversations} and {@code PATCH /conversations/{id}}.
 *
 * @param id conversation id
 * @param other the other participant
 * @param lastMessage last message, {@code null} before the first one
 * @param unreadCount messages of the other participant after the caller's read marker
 * @param muted the caller muted the conversation (no notifications, Phase 6)
 * @param archived the caller archived the conversation (a new message un-archives it)
 * @param createdAt creation
 */
@Schema(name = "ConversationSummary", description = "A private conversation of the caller")
public record ConversationSummary(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) ConversationParticipant other,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable LastMessage lastMessage,
        @Schema(requiredMode = RequiredMode.REQUIRED) int unreadCount,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean muted,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean archived,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {}
