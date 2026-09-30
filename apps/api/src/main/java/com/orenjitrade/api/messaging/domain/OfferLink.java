package com.orenjitrade.api.messaging.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;

/**
 * An offer referenced by an OFFER_LINK message (reserved: offers arrive with Phase 8).
 *
 * @param id offer id
 * @param status offer status
 * @param summary short description
 */
@Schema(name = "OfferLink", description = "Offer referenced by a message (Phase 8)")
public record OfferLink(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) String status,
        @Schema(requiredMode = RequiredMode.REQUIRED) String summary) {}
