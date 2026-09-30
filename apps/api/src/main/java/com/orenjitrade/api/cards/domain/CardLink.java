package com.orenjitrade.api.cards.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A printing shared in a private message or a community post (Phase 5): what a client needs to
 * render a card chip and link to the printing page.
 *
 * @param id printing id
 * @param cardId card id
 * @param name card name
 * @param printingCode code printed on the card
 * @param imageUrl front image (placeholder when none is stored), {@code null} when the printing no
 *     longer exists
 */
@Schema(name = "CardLink", description = "A printing shared in a message or post")
public record CardLink(
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Printing id") UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID cardId,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Azure-Eyes Sky Dragon")
                String name,
        @Schema(nullable = true, example = "AZR-EN001") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String printingCode,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String imageUrl) {}
