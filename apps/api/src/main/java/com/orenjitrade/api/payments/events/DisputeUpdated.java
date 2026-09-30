package com.orenjitrade.api.payments.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published inside the transaction of every dispute change (Phase 9): OPENED, EVIDENCE_ADDED,
 * MESSAGE_POSTED, FROZEN, UNFROZEN, RESOLVED. Consumed after commit for notifications and
 * analytics. Ids and codes only (never descriptions, evidence or messages).
 *
 * @param disputeId the dispute
 * @param tradeId the trade
 * @param event what happened
 * @param status the dispute's status after the event
 * @param reason the dispute reason
 * @param buyerId the buyer
 * @param sellerId the seller
 * @param actorId the acting account ({@code null} for the platform)
 * @param actorRole BUYER, SELLER or ADMIN ({@code null} for the platform)
 * @param subjectId the evidence or message concerned, if any
 * @param occurredAt when
 */
public record DisputeUpdated(
        UUID disputeId,
        UUID tradeId,
        String event,
        String status,
        String reason,
        UUID buyerId,
        UUID sellerId,
        @Nullable UUID actorId,
        @Nullable String actorRole,
        @Nullable UUID subjectId,
        Instant occurredAt) {}
