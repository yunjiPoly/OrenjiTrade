package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The sale a SYSTEM message announces (stage R4, Mark as sold): the phone words it for each side
 * ("You marked {name} as sold to {buyer}." / "{seller} marked {name} as sold to you."), with
 * "Tracking {number}" and "Rate {other}". The tracking number is seen by the two collectors only.
 *
 * @param saleId the sale (its undo)
 * @param sellerId the seller
 * @param buyerId the buyer
 * @param kind CARD or DECK_CORE
 * @param name the card or deck core at the time of the sale
 * @param quantity copies sold
 * @param trackingNumber the optional tracking number
 * @param undone the seller undid it (the message is withdrawn)
 */
@Schema(name = "SaleNotice", description = "The sale announced by a SYSTEM message")
public record SaleNotice(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID saleId,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID sellerId,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID buyerId,
        @Schema(requiredMode = RequiredMode.REQUIRED) SubjectKind kind,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Ash Blossom & Joyous Spring")
                String name,
        @Schema(requiredMode = RequiredMode.REQUIRED) int quantity,
        @Schema(nullable = true, example = "7023 2109 8876 5432")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String trackingNumber,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean undone) {}
