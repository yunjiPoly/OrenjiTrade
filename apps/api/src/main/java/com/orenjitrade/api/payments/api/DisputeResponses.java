package com.orenjitrade.api.payments.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.payments.domain.DisputeReason;
import com.orenjitrade.api.payments.domain.DisputeStatus;
import com.orenjitrade.api.payments.domain.DisputeViews.DisputeView;
import com.orenjitrade.api.payments.domain.DisputeViews.ViewerRole;
import com.orenjitrade.api.payments.domain.EvidenceKind;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeEventRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeMessageRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeRow;
import com.orenjitrade.api.payments.domain.PaymentRows.EvidenceRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.ShipmentRow;
import com.orenjitrade.api.payments.domain.PaymentStatus;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.trades.api.TradeResponses.ShipmentSummary;
import com.orenjitrade.api.trades.domain.TradeRow;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.json.JsonMapper;

/**
 * Response bodies of {@code /api/v1/disputes} (Phase 9). Parties see each other by handle and
 * display name only (never a location); admins appear as "OrenjiTrade support" to the parties;
 * evidence files are served by an authorised route, never by a storage key.
 */
public final class DisputeResponses {

    static final String SUPPORT_NAME = "OrenjiTrade support";

    private DisputeResponses() {}

    /** A party of a dispute. */
    @Schema(name = "DisputeParty", description = "A party of a dispute (no location)")
    public record PartyResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String displayName,
            @Schema(nullable = true) @Nullable String avatarUrl) {

        static PartyResponse from(UUID id, @Nullable MemberCard card) {
            if (card == null) {
                return new PartyResponse(id, "deleted", "Former member", null);
            }
            return new PartyResponse(id, card.handle(), card.displayName(), card.avatarUrl());
        }
    }

    /** The payment of a dispute. */
    @Schema(name = "DisputePayment", description = "The protected payment a dispute holds")
    public record PaymentResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) PaymentStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "40.00") BigDecimal amount,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "0.00")
                    BigDecimal refundedAmount,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal payoutAmount,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean payoutFrozen,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant disputeWindowEndsAt) {

        static PaymentResponse from(PaymentRow row) {
            return new PaymentResponse(
                    row.id(),
                    row.status(),
                    row.amount(),
                    row.currency(),
                    row.refundedAmount(),
                    row.payoutAmount(),
                    row.payoutFrozen(),
                    row.disputeWindowEndsAt());
        }
    }

    /** One piece of evidence. */
    @Schema(name = "DisputeEvidence", description = "Evidence of a party")
    public record EvidenceResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) EvidenceKind kind,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "BUYER or SELLER")
                    String role,
            @Schema(nullable = true, description = "Text, caption or tracking details")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String body,
            @Schema(nullable = true, description = "TRACKING: https link")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String url,
            @Schema(
                            nullable = true,
                            description =
                                    "IMAGE / DOCUMENT: API path of the file (parties and admins,"
                                            + " bearer token required)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String fileUrl,
            @Schema(nullable = true, example = "image/jpeg")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String contentType,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Integer sizeBytes,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static EvidenceResponse from(EvidenceRow row) {
            return new EvidenceResponse(
                    row.id(),
                    row.kind(),
                    row.partyRole(),
                    row.body(),
                    row.url(),
                    row.storageKey() == null
                            ? null
                            : "/api/v1/disputes/"
                                    + row.disputeId()
                                    + "/evidence/"
                                    + row.id()
                                    + "/file",
                    row.contentType(),
                    row.sizeBytes(),
                    row.createdAt());
        }
    }

    /** A timeline entry. */
    @Schema(name = "DisputeEvent", description = "Entry of a dispute's timeline")
    public record EventResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "OPENED, EVIDENCE_ADDED, MESSAGE_POSTED, NOTE_ADDED,"
                                            + " UNDER_REVIEW, FROZEN, UNFROZEN, RESOLVED")
                    String event,
            @Schema(nullable = true, description = "BUYER, SELLER, ADMIN or null (platform)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String actorRole,
            @Schema(requiredMode = RequiredMode.REQUIRED) Map<String, Object> details,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {}

    /** A message of the thread. */
    @Schema(name = "DisputeMessage", description = "Message of a dispute thread")
    public record MessageResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "BUYER, SELLER or ADMIN")
                    String authorRole,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Display name (admins: OrenjiTrade support)")
                    String authorName,
            @Schema(requiredMode = RequiredMode.REQUIRED) String body,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static MessageResponse from(
                DisputeMessageRow row, Map<UUID, MemberCard> members, boolean adminViewer) {
            String name;
            if ("ADMIN".equals(row.authorRole())) {
                @Nullable MemberCard author =
                        row.authorId() == null ? null : members.get(row.authorId());
                name =
                        adminViewer && author != null
                                ? SUPPORT_NAME + " (" + author.handle() + ")"
                                : SUPPORT_NAME;
            } else {
                @Nullable MemberCard author =
                        row.authorId() == null ? null : members.get(row.authorId());
                name = author == null ? "Former member" : author.displayName();
            }
            return new MessageResponse(
                    row.id(), row.authorRole(), name, row.body(), row.createdAt());
        }
    }

    /** {@code GET /disputes/{id}} and the answers of the dispute routes. */
    @Schema(name = "Dispute", description = "A dispute as its parties and admins see it")
    public record DisputeResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID tradeId,
            @Schema(requiredMode = RequiredMode.REQUIRED) DisputeStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) DisputeReason reason,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "The buyer's description")
                    String description,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant openedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant resolvedAt,
            @Schema(nullable = true, description = "Admin note shown with the decision")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String resolutionNote,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal refundAmount,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "BUYER, SELLER or ADMIN")
                    String viewerRole,
            @Schema(requiredMode = RequiredMode.REQUIRED) PartyResponse buyer,
            @Schema(requiredMode = RequiredMode.REQUIRED) PartyResponse seller,
            @Schema(requiredMode = RequiredMode.REQUIRED) PaymentResponse payment,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable ShipmentSummary shipment,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "40.00 CAD for Azure-Eyes Sky Dragon")
                    String summary,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<EvidenceResponse> evidence,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Oldest first")
                    List<EventResponse> timeline,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Oldest first")
                    List<MessageResponse> messages,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean canAddEvidence,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean canPostMessage,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Evidence items the caller may still add (max 10)")
                    int evidenceLeft) {

        static DisputeResponse from(DisputeView view, JsonMapper jsonMapper) {
            DisputeRow dispute = view.dispute();
            TradeRow trade = view.trade();
            boolean admin = view.viewerRole() == ViewerRole.ADMIN;
            @Nullable ShipmentRow shipment = view.shipment();
            return new DisputeResponse(
                    dispute.id(),
                    dispute.tradeId(),
                    dispute.status(),
                    dispute.reason(),
                    dispute.description(),
                    dispute.openedAt(),
                    dispute.updatedAt(),
                    dispute.resolvedAt(),
                    dispute.resolutionNote(),
                    dispute.refundAmount(),
                    view.viewerRole().name(),
                    PartyResponse.from(trade.buyerId(), view.members().get(trade.buyerId())),
                    PartyResponse.from(trade.sellerId(), view.members().get(trade.sellerId())),
                    PaymentResponse.from(view.payment()),
                    shipment == null
                            ? null
                            : new ShipmentSummary(
                                    shipment.carrier(),
                                    shipment.trackingNumber(),
                                    shipment.notes(),
                                    shipment.shippedAt(),
                                    shipment.deliveredAt()),
                    view.summary(),
                    view.evidence().stream().map(EvidenceResponse::from).toList(),
                    view.events().stream().map(event -> event(event, trade, jsonMapper)).toList(),
                    view.messages().stream()
                            .map(message -> MessageResponse.from(message, view.members(), admin))
                            .toList(),
                    view.canAddEvidence(),
                    view.canPostMessage(),
                    view.evidenceLeft());
        }
    }

    static EventResponse event(DisputeEventRow row, TradeRow trade, JsonMapper jsonMapper) {
        @Nullable String role;
        if (row.actorId() == null) {
            role = null;
        } else if (row.actorId().equals(trade.buyerId())) {
            role = "BUYER";
        } else if (row.actorId().equals(trade.sellerId())) {
            role = "SELLER";
        } else {
            role = "ADMIN";
        }
        return new EventResponse(
                row.id(),
                row.event(),
                role,
                details(row.detailsJson(), jsonMapper),
                row.createdAt());
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> details(@Nullable String json, JsonMapper jsonMapper) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return jsonMapper.readValue(json, LinkedHashMap.class);
        } catch (RuntimeException e) {
            return Map.of();
        }
    }
}
