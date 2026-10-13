package com.orenjitrade.api.wishlist.domain;

import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Which public items fit a wish (stage S2), as pure Java (unit-tested) beside the SQL of {@code
 * WishlistAlertRepository}: the wished printing, or any printing of the wished card of the wished
 * rarity (when one is set); with "Near Mint only", a Near Mint or better condition in the game's
 * {@code GameSchema} order (conditions are ordered best first: MINT, NEAR_MINT, ...). The region
 * rule (same platform region) and the visibility rules live in the SQL only.
 */
public final class WishlistAlertRules {

    /** The condition "Near Mint only" accepts at worst. */
    public static final String NEAR_MINT = "NEAR_MINT";

    /**
     * SQL predicate of "Near Mint only" ({@code w} = wish, {@code i} = item, {@code gc.conditions}
     * = the game's ordered conditions).
     */
    public static final String NEAR_MINT_SQL =
            "(NOT w.near_mint_only OR array_position(gc.conditions, i.condition)"
                    + " <= array_position(gc.conditions, '"
                    + NEAR_MINT
                    + "'))";

    private WishlistAlertRules() {}

    /**
     * Whether an item in {@code condition} fits a wish asking (or not) for Near Mint only; unknown
     * codes never fit a Near Mint wish.
     */
    public static boolean conditionFits(
            List<String> conditions, String condition, boolean nearMintOnly) {
        if (!nearMintOnly) {
            return true;
        }
        int rank = conditions.indexOf(condition);
        int required = conditions.indexOf(NEAR_MINT);
        return rank >= 0 && required >= 0 && rank <= required;
    }

    /**
     * Whether a printing fits a wish's selection: the wished printing, or (any printing) the wished
     * card in the wished rarity when one is set.
     */
    public static boolean selectionFits(
            UUID wishCardId,
            @Nullable UUID wishPrintingId,
            @Nullable String wishRarity,
            UUID itemCardId,
            UUID itemPrintingId,
            @Nullable String itemRarity) {
        if (wishPrintingId != null) {
            return wishPrintingId.equals(itemPrintingId);
        }
        return wishCardId.equals(itemCardId)
                && (wishRarity == null || wishRarity.equals(itemRarity));
    }
}
