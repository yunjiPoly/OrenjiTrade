package com.orenjitrade.api.offers.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.jspecify.annotations.Nullable;

/**
 * Texts of offer notifications and SYSTEM messages (pure). Never private notes, the parties' own
 * notes or locations: card names, terms and display names only.
 */
public final class OfferTexts {

    private OfferTexts() {}

    /** "40.00 CAD", "2 cards in trade", "20.00 CAD + 1 card". */
    public static String terms(
            OfferKind kind,
            @Nullable BigDecimal cashAmount,
            @Nullable String currency,
            int tradeCards) {
        String cash = money(cashAmount, currency);
        String cards = tradeCards + (tradeCards == 1 ? " card" : " cards");
        return switch (kind) {
            case CASH -> cash;
            case TRADE -> cards + " in trade";
            case MIXED -> cash + " + " + cards;
        };
    }

    /** "40.00 CAD for Azure-Eyes Sky Dragon". */
    public static String summary(
            OfferKind kind,
            @Nullable BigDecimal cashAmount,
            @Nullable String currency,
            int tradeCards,
            String cardName) {
        return terms(kind, cashAmount, currency, tradeCards) + " for " + cardName;
    }

    /** "40.00 CAD" (empty without an amount). */
    public static String money(@Nullable BigDecimal amount, @Nullable String currency) {
        if (amount == null) {
            return "";
        }
        return amount.setScale(2, RoundingMode.HALF_UP).toPlainString()
                + (currency == null ? "" : " " + currency);
    }

    /** SYSTEM message of an offer event in the pair conversation. */
    public static String systemMessage(OfferEventType event, String actorName, String summary) {
        return switch (event) {
            case CREATED -> actorName + " made an offer: " + summary + ".";
            case COUNTERED -> actorName + " made a counter-offer: " + summary + ".";
            case ACCEPTED ->
                    actorName
                            + " accepted the offer: "
                            + summary
                            + ". The trade is open; arrange the exchange on the trade page.";
            case DECLINED -> actorName + " declined the offer: " + summary + ".";
            case CANCELLED -> actorName + " withdrew the offer: " + summary + ".";
            case EXPIRED -> "The offer expired without an answer: " + summary + ".";
            case VIEWED -> summary;
        };
    }

    /**
     * Notification title of an offer event for a recipient.
     *
     * @param event what happened
     * @param cardName the card
     * @param forActor whether the recipient is the acting party (acceptance notifies both)
     */
    public static String title(OfferEventType event, String cardName, boolean forActor) {
        return switch (event) {
            case CREATED -> "New offer on " + cardName;
            case COUNTERED -> "Counter-offer on " + cardName;
            case ACCEPTED -> forActor ? "Trade opened for " + cardName : "Offer accepted";
            case DECLINED -> "Offer declined";
            case CANCELLED -> "Offer withdrawn";
            case EXPIRED -> "Offer expired";
            case VIEWED -> cardName;
        };
    }

    /** Notification body of an offer event for a recipient (see {@link #title}). */
    public static String body(
            OfferEventType event, String actorName, String summary, boolean forActor) {
        return switch (event) {
            case CREATED -> actorName + " offered " + summary + ".";
            case COUNTERED -> actorName + " answered with " + summary + ".";
            case ACCEPTED ->
                    forActor
                            ? "You accepted "
                                    + summary
                                    + ". Arrange the exchange on the trade page."
                            : actorName
                                    + " accepted "
                                    + summary
                                    + ". Arrange the exchange on the trade page.";
            case DECLINED -> actorName + " declined " + summary + ".";
            case CANCELLED -> actorName + " withdrew their offer of " + summary + ".";
            case EXPIRED -> "The offer of " + summary + " expired without an answer.";
            case VIEWED -> summary;
        };
    }
}
