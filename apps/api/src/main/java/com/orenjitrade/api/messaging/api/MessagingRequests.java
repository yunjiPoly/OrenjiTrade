package com.orenjitrade.api.messaging.api;

import com.orenjitrade.api.messaging.domain.MessageKind;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of the messaging endpoints. */
public final class MessagingRequests {

    private MessagingRequests() {}

    /** {@code POST /conversations}. */
    @Schema(name = "StartConversationRequest")
    public record StartConversationRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Account id of the recipient")
                    @NotNull
                    UUID recipientId) {}

    /** {@code POST /conversations/{id}/messages}. */
    @Schema(name = "SendMessageRequest")
    public record SendMessageRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "TEXT, CARD_LINK, BINDER_LINK or IMAGE (OFFER_LINK arrives with"
                                            + " offers; SYSTEM is never accepted)")
                    @NotNull
                    MessageKind kind,
            @Schema(
                            description = "Text; required for TEXT, optional caption otherwise",
                            maxLength = 4000)
                    @Size(max = 4000)
                    @Nullable String body,
            @Schema(description = "CARD_LINK: the printing to share") @Nullable UUID cardPrintingId,
            @Schema(description = "BINDER_LINK: a public binder") @Nullable UUID binderId,
            @Schema(description = "OFFER_LINK (Phase 8)") @Nullable UUID offerId,
            @Schema(description = "IMAGE: uploadId of POST /uploads/images (within 1 h)")
                    @Nullable UUID imageUploadId) {}

    /** {@code POST /conversations/{id}/read}. */
    @Schema(name = "MarkConversationReadRequest")
    public record MarkReadRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The newest message the caller has seen")
                    @NotNull
                    UUID lastReadMessageId) {}

    /** {@code PATCH /conversations/{id}}: absent fields are kept. */
    @Schema(name = "UpdateConversationRequest")
    public record UpdateConversationRequest(@Nullable Boolean muted, @Nullable Boolean archived) {}

    /** {@code POST /users/{id}/block} (optional body). */
    @Schema(name = "BlockUserRequest")
    public record BlockUserRequest(
            @Schema(
                            description = "Private note (never shown to the blocked collector)",
                            maxLength = 500)
                    @Size(max = 500)
                    @Nullable String reason) {}
}
