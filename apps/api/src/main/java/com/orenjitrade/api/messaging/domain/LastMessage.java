package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Summary of the last message of a conversation.
 *
 * @param id message id
 * @param preview first characters of the text, or a label for links and photos
 * @param kind message kind
 * @param createdAt when it was sent
 * @param senderId sender ({@code null} for SYSTEM messages and deleted accounts)
 */
@Schema(name = "LastMessage", description = "Last message of a conversation")
public record LastMessage(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Still available?") String preview,
        @Schema(requiredMode = RequiredMode.REQUIRED) MessageKind kind,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable UUID senderId) {}
