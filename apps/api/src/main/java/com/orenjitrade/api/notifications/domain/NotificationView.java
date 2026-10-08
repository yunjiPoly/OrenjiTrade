package com.orenjitrade.api.notifications.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A notification as its recipient sees it: the REST representation ({@code GET /notifications}) and
 * the payload of the realtime queue {@code /user/queue/notifications}.
 *
 * @param id notification id
 * @param type type
 * @param title title
 * @param body body
 * @param data ids of the objects concerned and a {@code deepLink} path
 * @param createdAt creation time
 * @param readAt when the recipient read it, {@code null} while unread
 */
@Schema(name = "NotificationResponse", description = "An in-app notification")
public record NotificationView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) NotificationType type,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Wishlist match: Azure-Eyes")
                String title,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example =
                                "Azure-Eyes Sky Dragon AZR-EN001 was listed by @collector1 in"
                                        + " Quebec, Canada.")
                String body,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "Ids of the objects concerned and `deepLink` (web path, e.g."
                                        + " /wishlist/<id> or /messages/<conversationId>)."
                                        + " Notifications about one card (WISHLIST_MATCH,"
                                        + " OFFER_*, TRADE_UPDATE, PAYMENT_UPDATE,"
                                        + " SHIPMENT_STATUS, DISPUTE_UPDATE) add `cardName`,"
                                        + " `game` and `cardImageUrl` (OrenjiTrade's own card"
                                        + " picture or placeholder URL; API-relative in realtime"
                                        + " pushes)")
                Map<String, Object> data,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true, description = "Null while unread")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant readAt) {}
