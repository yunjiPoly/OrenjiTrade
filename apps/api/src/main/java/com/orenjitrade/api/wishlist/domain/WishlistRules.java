package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.location.domain.DistanceBucket;
import java.math.BigDecimal;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The matching rules of the Phase 6 contract as pure Java (unit-tested), twin of the SQL of {@code
 * WishlistMatchRepository}: the item's condition is at least the minimum (conditions are ordered
 * best first in the game's {@code GameSchema}), the asking price does not exceed the maximum (same
 * currency; unpriced items pass), the availability suits the trade preference.
 */
public final class WishlistRules {

    private WishlistRules() {}

    /** SQL predicate of the trade preference ({@code w} = wishlist item, {@code i} = item). */
    public static final String TRADE_SQL =
            "(w.trade_preference = 'ANY'"
                    + " OR (w.trade_preference = 'TRADE' AND i.availability IN ('TRADE',"
                    + " 'TRADE_OR_SALE'))"
                    + " OR (w.trade_preference = 'SALE' AND i.availability IN ('SALE',"
                    + " 'TRADE_OR_SALE')))";

    /**
     * SQL predicate of the condition rank; {@code gc.conditions} = the game's ordered conditions.
     */
    public static final String CONDITION_SQL =
            "(w.condition_min IS NULL OR array_position(gc.conditions, i.condition)"
                    + " <= array_position(gc.conditions, w.condition_min))";

    /** SQL predicate of the price. */
    public static final String PRICE_SQL =
            "(w.max_price IS NULL OR i.asking_price IS NULL OR (w.currency = i.currency AND"
                    + " i.asking_price <= w.max_price))";

    /**
     * Whether {@code condition} is at least {@code minimum} in the game's order (best first);
     * unknown codes never satisfy a minimum.
     */
    public static boolean conditionSatisfies(
            List<String> conditions, String condition, @Nullable String minimum) {
        if (minimum == null) {
            return true;
        }
        int rank = conditions.indexOf(condition);
        int required = conditions.indexOf(minimum);
        return rank >= 0 && required >= 0 && rank <= required;
    }

    /** Whether an item offered with {@code availability} suits the preference. */
    public static boolean tradeCompatible(TradePreference preference, Availability availability) {
        return switch (preference) {
            case ANY -> true;
            case TRADE ->
                    availability == Availability.TRADE
                            || availability == Availability.TRADE_OR_SALE;
            case SALE ->
                    availability == Availability.SALE || availability == Availability.TRADE_OR_SALE;
        };
    }

    /** Whether the asking price is acceptable. */
    public static boolean priceAcceptable(
            @Nullable BigDecimal maxPrice,
            String wishCurrency,
            @Nullable BigDecimal askingPrice,
            String itemCurrency) {
        if (maxPrice == null || askingPrice == null) {
            return true;
        }
        return wishCurrency.equals(itemCurrency) && askingPrice.compareTo(maxPrice) <= 0;
    }

    /** Human wording of a distance bucket for notification texts ("~5-10 km away"). */
    public static String distanceText(DistanceBucket bucket) {
        return switch (bucket) {
            case LT_1KM -> "less than 1 km away";
            case KM_1_5 -> "~1-5 km away";
            case KM_5_10 -> "~5-10 km away";
            case KM_10_25 -> "~10-25 km away";
            case KM_25_50 -> "~25-50 km away";
            case GT_50KM -> "more than 50 km away";
        };
    }
}
