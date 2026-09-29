package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A card with its full metadata and printings.
 *
 * @param id card id
 * @param game game slug
 * @param name card name
 * @param slug URL slug
 * @param cardType main type
 * @param subtype sub type
 * @param text rules text
 * @param metadata every game-specific attribute
 * @param primaryImageUrl front image of the earliest printing (placeholder when none)
 * @param printings printings, earliest set first
 */
@Schema(name = "CardDetail", description = "Card with metadata and printings")
public record CardDetail(
        UUID id,
        String game,
        String name,
        String slug,
        @Nullable String cardType,
        @Nullable String subtype,
        String text,
        Map<String, Object> metadata,
        @Nullable String primaryImageUrl,
        List<PrintingSummary> printings) {}
