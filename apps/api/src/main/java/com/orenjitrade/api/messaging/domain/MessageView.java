package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.moderation.domain.ContentModerationState;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A private message as served to a participant (REST and the realtime queue {@code
 * /user/queue/messages}).
 *
 * @param id message id
 * @param conversationId conversation
 * @param senderId sender ({@code null} for SYSTEM messages and deleted accounts)
 * @param kind kind
 * @param body text (empty for links and photos without text, and for REMOVED messages)
 * @param payload links and photo
 * @param createdAt when it was sent
 * @param editedAt last edit (messages cannot be edited yet)
 * @param readByOther whether the participant who did not send the message has read it
 * @param moderationState OK, FLAGGED (shown normally) or REMOVED (content withheld)
 */
@Schema(name = "MessageResponse", description = "A private message")
public record MessageView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID conversationId,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable UUID senderId,
        @Schema(requiredMode = RequiredMode.REQUIRED) MessageKind kind,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "Is the Azure-Eyes still available?")
                String body,
        @Schema(requiredMode = RequiredMode.REQUIRED) MessagePayload payload,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant editedAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean readByOther,
        @Schema(requiredMode = RequiredMode.REQUIRED) ContentModerationState moderationState) {}
