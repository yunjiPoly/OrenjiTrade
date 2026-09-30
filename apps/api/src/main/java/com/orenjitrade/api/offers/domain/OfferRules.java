package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.offers.domain.OfferTerms.TradeLine;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Currency;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Pure validation rules of offers (Phase 8 contract "Tables" and "Endpoints"). */
public final class OfferRules {

    public static final int MESSAGE_MAX = 500;
    public static final int REASON_MAX = 500;
    public static final int TRADE_ITEMS_MAX = 10;
    public static final int QUANTITY_MAX = 9999;
    public static final int DEFAULT_EXPIRY_HOURS = 72;
    public static final int MAX_EXPIRY_HOURS = 168;
    public static final BigDecimal CASH_MAX = new BigDecimal("9999999999.99");

    private OfferRules() {}

    /** The kind implied by the parts of a proposal (cash, cards or both). */
    public static OfferKind kindOf(@Nullable BigDecimal cashAmount, List<TradeLine> tradeItems) {
        if (tradeItems.isEmpty()) {
            return OfferKind.CASH;
        }
        return cashAmount == null ? OfferKind.TRADE : OfferKind.MIXED;
    }

    /** Field errors of the terms (400 VALIDATION_FAILED); empty when valid. */
    public static List<ProblemFieldError> validate(OfferTerms terms) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (terms.kind().hasCash()) {
            BigDecimal cash = terms.cashAmount();
            if (cash == null) {
                errors.add(
                        new ProblemFieldError(
                                "cashAmount", "is required for CASH and MIXED offers"));
            } else if (cash.signum() <= 0
                    || cash.compareTo(CASH_MAX) > 0
                    || cash.stripTrailingZeros().scale() > 2) {
                errors.add(
                        new ProblemFieldError(
                                "cashAmount",
                                "must be between 0.01 and 9999999999.99 with at most 2 decimals"));
            }
            if (terms.currency() == null || !isCurrency(terms.currency())) {
                errors.add(new ProblemFieldError("currency", "must be an ISO 4217 currency code"));
            }
        } else if (terms.cashAmount() != null) {
            errors.add(new ProblemFieldError("cashAmount", "must be empty for TRADE offers"));
        }
        if (terms.kind().hasTradeItems()) {
            if (terms.tradeItems().isEmpty()) {
                errors.add(
                        new ProblemFieldError(
                                "tradeItemIds", "must list at least one of your cards"));
            } else if (terms.tradeItems().size() > TRADE_ITEMS_MAX) {
                errors.add(
                        new ProblemFieldError(
                                "tradeItemIds",
                                "must list at most " + TRADE_ITEMS_MAX + " of your cards"));
            }
            Set<UUID> seen = new HashSet<>();
            for (TradeLine line : terms.tradeItems()) {
                if (!seen.add(line.inventoryItemId())) {
                    errors.add(
                            new ProblemFieldError(
                                    "tradeItemIds", "must not list the same card twice"));
                    break;
                }
            }
            for (TradeLine line : terms.tradeItems()) {
                if (line.quantity() < 1 || line.quantity() > QUANTITY_MAX) {
                    errors.add(
                            new ProblemFieldError(
                                    "tradeItemIds", "quantities must be between 1 and 9999"));
                    break;
                }
            }
        } else if (!terms.tradeItems().isEmpty()) {
            errors.add(new ProblemFieldError("tradeItemIds", "must be empty for CASH offers"));
        }
        if (terms.message() != null && terms.message().length() > MESSAGE_MAX) {
            errors.add(
                    new ProblemFieldError(
                            "message", "must be at most " + MESSAGE_MAX + " characters"));
        }
        return errors;
    }

    /** Field errors of an expiry request ({@code expiresInHours}: 1 to 168, default 72). */
    public static List<ProblemFieldError> validateExpiry(@Nullable Integer hours) {
        if (hours != null && (hours < 1 || hours > MAX_EXPIRY_HOURS)) {
            return List.of(
                    new ProblemFieldError(
                            "expiresInHours", "must be between 1 and " + MAX_EXPIRY_HOURS));
        }
        return List.of();
    }

    /** When a proposal made at {@code now} expires ({@code expiresInHours}, default 72 hours). */
    public static Instant expiresAt(Instant now, @Nullable Integer hours) {
        return now.truncatedTo(ChronoUnit.MICROS)
                .plus(Duration.ofHours(hours == null ? DEFAULT_EXPIRY_HOURS : hours));
    }

    /**
     * Why a listing refuses a new offer ({@code 422 OFFERS_NOT_ACCEPTED}): offers switched off for
     * the card, a card that is not available (NOT_AVAILABLE, COLLECTION_ONLY), or a kind that does
     * not fit the availability. Empty when the offer may be made.
     */
    public static Optional<String> refusal(
            Availability availability,
            boolean acceptsOffers,
            OfferKind kind,
            boolean sellerAcceptsMixed) {
        if (availability == Availability.NOT_AVAILABLE
                || availability == Availability.COLLECTION_ONLY) {
            return Optional.of("This card is not available for trade or sale");
        }
        if (!acceptsOffers) {
            return Optional.of("This card does not accept offers");
        }
        return kindRefusal(availability, kind, sellerAcceptsMixed);
    }

    /**
     * Whether the kind fits the availability: CASH needs SALE or TRADE_OR_SALE, TRADE needs TRADE
     * or TRADE_OR_SALE, MIXED needs TRADE_OR_SALE and a seller who accepts mixed offers.
     */
    public static Optional<String> kindRefusal(
            Availability availability, OfferKind kind, boolean sellerAcceptsMixed) {
        return switch (kind) {
            case CASH ->
                    availability == Availability.SALE || availability == Availability.TRADE_OR_SALE
                            ? Optional.empty()
                            : Optional.of("This card is offered for trade only");
            case TRADE ->
                    availability == Availability.TRADE || availability == Availability.TRADE_OR_SALE
                            ? Optional.empty()
                            : Optional.of("This card is offered for sale only");
            case MIXED -> {
                if (availability != Availability.TRADE_OR_SALE) {
                    yield Optional.of("Mixed offers need a card offered for trade or sale");
                }
                yield sellerAcceptsMixed
                        ? Optional.empty()
                        : Optional.of("This collector does not accept mixed offers");
            }
        };
    }

    /** Upper-case ISO code, or {@code fallback} when absent. */
    public static String currency(@Nullable String currency, String fallback) {
        return currency == null || currency.isBlank()
                ? fallback
                : currency.trim().toUpperCase(Locale.ROOT);
    }

    /** A cash amount with 2 decimals (validated before). */
    public static @Nullable BigDecimal amount(@Nullable BigDecimal cash) {
        if (cash == null) {
            return null;
        }
        try {
            return cash.setScale(2, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException e) {
            return cash;
        }
    }

    /** Stripped text, {@code null} when blank. */
    public static @Nullable String text(@Nullable String value) {
        if (value == null) {
            return null;
        }
        String stripped = value.strip();
        return stripped.isEmpty() ? null : stripped;
    }

    static boolean isCurrency(String code) {
        if (!code.matches("^[A-Z]{3}$")) {
            return false;
        }
        try {
            Currency.getInstance(code);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
