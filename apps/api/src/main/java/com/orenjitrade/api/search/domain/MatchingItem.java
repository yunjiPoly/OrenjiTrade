package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.domain.Availability;
import java.math.BigDecimal;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * An effectively public item of a collector that matches the item filters of a discovery request
 * (listed on the collector's map marker). Never carries private notes.
 *
 * @param itemId item
 * @param printingId printing
 * @param printingCode printing code, e.g. {@code AZR-EN001}
 * @param cardId card
 * @param cardName card name
 * @param game game slug
 * @param availability what the owner offers
 * @param askingPrice asking price, {@code null} when none
 * @param currency ISO 4217 code
 * @param condition condition code
 * @param language ISO 639-1 code
 * @param edition edition code
 * @param acceptsOffers whether offers are welcome
 * @param freshness ACTIVE or AGING (stale items are never matched)
 */
public record MatchingItem(
        UUID itemId,
        UUID printingId,
        @Nullable String printingCode,
        UUID cardId,
        String cardName,
        String game,
        Availability availability,
        @Nullable BigDecimal askingPrice,
        String currency,
        String condition,
        String language,
        String edition,
        boolean acceptsOffers,
        FreshnessState freshness) {}
