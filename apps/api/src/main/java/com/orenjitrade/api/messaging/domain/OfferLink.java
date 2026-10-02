package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * An offer referenced by an OFFER_LINK or SYSTEM message (Phase 8): the live proposal of the
 * offer's counter chain when read by one of its parties.
 *
 * @param id offer id (the live proposal of the chain; open {@code /offers/{id}})
 * @param status offer status (OPEN, COUNTERED, ACCEPTED, DECLINED, CANCELLED, EXPIRED)
 * @param summary short description of the terms
 * @param imageUrl picture of the offered card (OrenjiTrade's own card image or placeholder URL from
 *     the cards module, ADR 0015), resolved when read and never stored with the message; {@code
 *     null} when the offers module cannot tell (the message then shows its stored state)
 */
@Schema(name = "OfferLink", description = "Offer referenced by a message (Phase 8)")
public record OfferLink(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) String status,
        @Schema(requiredMode = RequiredMode.REQUIRED) String summary,
        @Schema(
                        nullable = true,
                        description =
                                "Picture of the offered card (OrenjiTrade's own card image or"
                                        + " placeholder URL)")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String imageUrl) {}
