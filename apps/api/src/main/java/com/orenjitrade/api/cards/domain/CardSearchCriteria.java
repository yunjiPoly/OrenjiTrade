package com.orenjitrade.api.cards.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Validated filters of {@code GET /cards}.
 *
 * @param gameId restrict to one game
 * @param query free text (FTS + trigram fallback), already trimmed; {@code null} lists by name
 * @param setId set filter by id
 * @param setCode set filter by (upper-case) code
 * @param rarity printing rarity (case-insensitive)
 * @param language printing language (ISO 639-1)
 * @param edition printing edition code
 * @param metadataJson JSON object matched with {@code card.metadata @> ...}
 * @param page zero-based page
 * @param size page size
 */
public record CardSearchCriteria(
        @Nullable UUID gameId,
        @Nullable String query,
        @Nullable UUID setId,
        @Nullable String setCode,
        @Nullable String rarity,
        @Nullable String language,
        @Nullable String edition,
        @Nullable String metadataJson,
        int page,
        int size) {

    public boolean hasPrintingFilter() {
        return setId != null
                || setCode != null
                || rarity != null
                || language != null
                || edition != null;
    }
}
