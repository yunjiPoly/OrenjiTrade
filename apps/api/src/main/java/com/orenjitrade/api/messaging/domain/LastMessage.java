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
 * @param systemTopic what a SYSTEM message is about (an old offer or trade, or a sale; stage R4),
 *     {@code null} otherwise
 * @param sale the sale a SYSTEM sale message announces (the phone words the preview per side)
 */
@Schema(name = "LastMessage", description = "Last message of a conversation")
public record LastMessage(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Still available?") String preview,
        @Schema(requiredMode = RequiredMode.REQUIRED) MessageKind kind,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable UUID senderId,
        @Schema(nullable = true) @Nullable SystemMessageTopic systemTopic,
        @Schema(nullable = true) @Nullable SaleNotice sale) {

    /** A last message without a SYSTEM topic. */
    public LastMessage(
            UUID id, String preview, MessageKind kind, Instant createdAt, @Nullable UUID senderId) {
        this(id, preview, kind, createdAt, senderId, null, null);
    }
}
