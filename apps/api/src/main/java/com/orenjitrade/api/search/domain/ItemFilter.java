package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Item-level filters shared by map discovery ({@code hasPrintingId}, {@code hasCardId}, {@code
 * availability}, {@code game}) and the card-holder search (all of them). Validated by the caller.
 *
 * @param printingId the item is this printing
 * @param cardId the item is a printing of this card
 * @param game game slug of the item
 * @param availability how the owner offers it
 * @param condition condition code (exact)
 * @param minPrice lowest asking price (items without a price never match a price filter)
 * @param maxPrice highest asking price
 * @param freshness item freshness (ACTIVE or AGING)
 * @param edition edition code (exact)
 * @param language ISO 639-1 code (exact)
 * @param acceptsOffers whether the owner welcomes offers
 */
public record ItemFilter(
        @Nullable UUID printingId,
        @Nullable UUID cardId,
        @Nullable String game,
        @Nullable SearchAvailability availability,
        @Nullable String condition,
        @Nullable BigDecimal minPrice,
        @Nullable BigDecimal maxPrice,
        @Nullable FreshnessState freshness,
        @Nullable String edition,
        @Nullable String language,
        @Nullable Boolean acceptsOffers) {

    /** Discoverable items only: stale and hidden items never appear in discovery (Phase 4). */
    public static final String DISCOVERABLE = "i.freshness_state IN ('ACTIVE', 'AGING')";

    /** Only the discovery filters (map markers). */
    public static ItemFilter discovery(
            @Nullable UUID printingId,
            @Nullable UUID cardId,
            @Nullable String game,
            @Nullable SearchAvailability availability) {
        return new ItemFilter(
                printingId, cardId, game, availability, null, null, null, null, null, null, null);
    }

    /** Whether something other than the game narrows the items. */
    public boolean narrowsItems() {
        return printingId != null
                || cardId != null
                || availability != null
                || condition != null
                || minPrice != null
                || maxPrice != null
                || freshness != null
                || edition != null
                || language != null
                || acceptsOffers != null;
    }

    /**
     * SQL conditions (each prefixed with {@code AND}) on {@code inventory_item i}, {@code
     * card_printing p} and {@code game g}; their parameters (prefix {@code f_}) are added to {@code
     * params}.
     */
    public String sql(Map<String, Object> params) {
        StringBuilder sql = new StringBuilder();
        if (printingId != null) {
            sql.append(" AND i.printing_id = :f_printingId");
            params.put("f_printingId", printingId);
        }
        if (cardId != null) {
            sql.append(" AND p.card_id = :f_cardId");
            params.put("f_cardId", cardId);
        }
        if (game != null) {
            sql.append(" AND g.slug = :f_game");
            params.put("f_game", game);
        }
        if (availability != null) {
            sql.append(" AND ").append(availability.sql());
        }
        if (condition != null) {
            sql.append(" AND i.condition = :f_condition");
            params.put("f_condition", condition);
        }
        if (minPrice != null) {
            sql.append(" AND i.asking_price >= :f_minPrice");
            params.put("f_minPrice", minPrice);
        }
        if (maxPrice != null) {
            sql.append(" AND i.asking_price <= :f_maxPrice");
            params.put("f_maxPrice", maxPrice);
        }
        if (freshness != null) {
            sql.append(" AND i.freshness_state = :f_freshness");
            params.put("f_freshness", freshness.name());
        }
        if (edition != null) {
            sql.append(" AND i.edition = :f_edition");
            params.put("f_edition", edition);
        }
        if (language != null) {
            sql.append(" AND i.language = :f_language");
            params.put("f_language", language);
        }
        if (acceptsOffers != null) {
            sql.append(acceptsOffers ? " AND i.accepts_offers" : " AND NOT i.accepts_offers");
        }
        return sql.toString();
    }

    /** Names of the filters in use (analytics; no values). */
    public List<String> names() {
        List<String> names = new ArrayList<>();
        if (printingId != null) {
            names.add("printing");
        }
        if (cardId != null) {
            names.add("card");
        }
        if (game != null) {
            names.add("game");
        }
        if (availability != null) {
            names.add("availability");
        }
        if (condition != null) {
            names.add("condition");
        }
        if (minPrice != null || maxPrice != null) {
            names.add("price");
        }
        if (freshness != null) {
            names.add("freshness");
        }
        if (edition != null) {
            names.add("edition");
        }
        if (language != null) {
            names.add("language");
        }
        if (acceptsOffers != null) {
            names.add("accepts_offers");
        }
        return names;
    }
}
