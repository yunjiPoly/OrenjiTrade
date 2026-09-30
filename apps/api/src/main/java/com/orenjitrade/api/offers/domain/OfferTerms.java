package com.orenjitrade.api.offers.domain;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The terms of one proposal: the kind, the cash part and the buyer's cards in trade.
 *
 * @param kind CASH, TRADE or MIXED
 * @param cashAmount cash part ({@code null} for TRADE)
 * @param currency ISO 4217 code of the cash part ({@code null} for TRADE)
 * @param tradeItems the buyer's cards (empty for CASH)
 * @param message optional note of the proposing party
 */
public record OfferTerms(
        OfferKind kind,
        @Nullable BigDecimal cashAmount,
        @Nullable String currency,
        List<TradeLine> tradeItems,
        @Nullable String message) {

    public OfferTerms {
        tradeItems = List.copyOf(tradeItems);
    }

    /**
     * One card of the buyer offered in trade.
     *
     * @param inventoryItemId the buyer's inventory item
     * @param quantity copies offered (at least 1)
     */
    public record TradeLine(UUID inventoryItemId, int quantity) {}

    /** Whether two terms propose the same deal (the message is not part of the deal). */
    public boolean sameDealAs(OfferTerms other) {
        return kind == other.kind
                && sameAmount(cashAmount, other.cashAmount)
                && java.util.Objects.equals(currency, other.currency)
                && new java.util.HashSet<>(tradeItems)
                        .equals(new java.util.HashSet<>(other.tradeItems));
    }

    private static boolean sameAmount(@Nullable BigDecimal one, @Nullable BigDecimal other) {
        if (one == null || other == null) {
            return one == other;
        }
        return one.compareTo(other) == 0;
    }
}
