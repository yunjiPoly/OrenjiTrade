package com.orenjitrade.api.offers.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.offers.domain.OfferTerms.TradeLine;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Pure offer rules: terms, expiry, the listing's refusals and the texts. */
class OfferRulesTest {

    private static final UUID CARD = UUID.randomUUID();

    @Test
    void theKindFollowsTheParts() {
        assertThat(OfferRules.kindOf(new BigDecimal("10"), List.of())).isEqualTo(OfferKind.CASH);
        assertThat(OfferRules.kindOf(null, List.of(new TradeLine(CARD, 1))))
                .isEqualTo(OfferKind.TRADE);
        assertThat(OfferRules.kindOf(new BigDecimal("10"), List.of(new TradeLine(CARD, 1))))
                .isEqualTo(OfferKind.MIXED);
    }

    @Test
    void termsAreValidated() {
        assertThat(fields(terms(OfferKind.CASH, "40.00", "CAD", List.of()))).isEmpty();
        assertThat(fields(terms(OfferKind.CASH, null, "CAD", List.of())))
                .containsExactly("cashAmount");
        assertThat(fields(terms(OfferKind.CASH, "0", "CAD", List.of())))
                .containsExactly("cashAmount");
        assertThat(fields(terms(OfferKind.CASH, "1.005", "CAD", List.of())))
                .containsExactly("cashAmount");
        assertThat(fields(terms(OfferKind.CASH, "10000000000.00", "CAD", List.of())))
                .containsExactly("cashAmount");
        assertThat(fields(terms(OfferKind.CASH, "10", "XYZ", List.of())))
                .containsExactly("currency");
        assertThat(fields(terms(OfferKind.CASH, "10", "CAD", List.of(new TradeLine(CARD, 1)))))
                .containsExactly("tradeItemIds");
        assertThat(fields(terms(OfferKind.TRADE, null, null, List.of())))
                .containsExactly("tradeItemIds");
        assertThat(fields(terms(OfferKind.TRADE, "5", null, List.of(new TradeLine(CARD, 1)))))
                .containsExactly("cashAmount");
        assertThat(
                        fields(
                                terms(
                                        OfferKind.TRADE,
                                        null,
                                        null,
                                        List.of(new TradeLine(CARD, 1), new TradeLine(CARD, 2)))))
                .containsExactly("tradeItemIds");
        assertThat(fields(terms(OfferKind.TRADE, null, null, List.of(new TradeLine(CARD, 0)))))
                .containsExactly("tradeItemIds");
        List<TradeLine> eleven =
                java.util.stream.IntStream.range(0, 11)
                        .mapToObj(index -> new TradeLine(UUID.randomUUID(), 1))
                        .toList();
        assertThat(fields(terms(OfferKind.TRADE, null, null, eleven)))
                .containsExactly("tradeItemIds");
        assertThat(fields(terms(OfferKind.MIXED, "5", "CAD", List.of(new TradeLine(CARD, 1)))))
                .isEmpty();
        OfferTerms longMessage =
                new OfferTerms(
                        OfferKind.CASH, new BigDecimal("5"), "CAD", List.of(), "x".repeat(501));
        assertThat(OfferRules.validate(longMessage))
                .extracting(ProblemFieldError::field)
                .containsExactly("message");
    }

    @Test
    void expiryDefaultsTo72HoursAndIsCappedAtAWeek() {
        Instant now = Instant.parse("2026-09-30T12:00:00Z");
        assertThat(OfferRules.expiresAt(now, null)).isEqualTo(now.plus(Duration.ofHours(72)));
        assertThat(OfferRules.expiresAt(now, 168)).isEqualTo(now.plus(Duration.ofDays(7)));
        assertThat(OfferRules.validateExpiry(168)).isEmpty();
        assertThat(OfferRules.validateExpiry(169)).hasSize(1);
        assertThat(OfferRules.validateExpiry(0)).hasSize(1);
    }

    @Test
    void listingsRefuseOffersThatDoNotFit() {
        assertThat(OfferRules.refusal(Availability.TRADE_OR_SALE, false, OfferKind.CASH, true))
                .isPresent();
        assertThat(OfferRules.refusal(Availability.NOT_AVAILABLE, true, OfferKind.CASH, true))
                .isPresent();
        assertThat(OfferRules.refusal(Availability.COLLECTION_ONLY, true, OfferKind.TRADE, true))
                .isPresent();
        assertThat(OfferRules.refusal(Availability.SALE, true, OfferKind.CASH, true)).isEmpty();
        assertThat(OfferRules.refusal(Availability.SALE, true, OfferKind.TRADE, true)).isPresent();
        assertThat(OfferRules.refusal(Availability.TRADE, true, OfferKind.TRADE, true)).isEmpty();
        assertThat(OfferRules.refusal(Availability.TRADE, true, OfferKind.CASH, true)).isPresent();
        assertThat(OfferRules.refusal(Availability.TRADE, true, OfferKind.MIXED, true)).isPresent();
        assertThat(OfferRules.refusal(Availability.TRADE_OR_SALE, true, OfferKind.MIXED, true))
                .isEmpty();
        assertThat(OfferRules.refusal(Availability.TRADE_OR_SALE, true, OfferKind.MIXED, false))
                .isPresent();
        assertThat(OfferRules.kindRefusal(Availability.TRADE_OR_SALE, OfferKind.CASH, false))
                .isEmpty();
    }

    @Test
    void sameDealIgnoresTheMessageAndTheScale() {
        OfferTerms one =
                new OfferTerms(
                        OfferKind.MIXED,
                        new BigDecimal("40"),
                        "CAD",
                        List.of(new TradeLine(CARD, 1)),
                        "first");
        OfferTerms other =
                new OfferTerms(
                        OfferKind.MIXED,
                        new BigDecimal("40.00"),
                        "CAD",
                        List.of(new TradeLine(CARD, 1)),
                        "second");
        assertThat(one.sameDealAs(other)).isTrue();
        assertThat(
                        one.sameDealAs(
                                new OfferTerms(
                                        OfferKind.MIXED,
                                        new BigDecimal("40"),
                                        "CAD",
                                        List.of(new TradeLine(CARD, 2)),
                                        null)))
                .isFalse();
    }

    @Test
    void textsDescribeTheTermsWithoutPrivateData() {
        assertThat(OfferTexts.terms(OfferKind.CASH, new BigDecimal("40"), "CAD", 0))
                .isEqualTo("40.00 CAD");
        assertThat(OfferTexts.terms(OfferKind.TRADE, null, null, 1)).isEqualTo("1 card in trade");
        assertThat(OfferTexts.summary(OfferKind.MIXED, new BigDecimal("20.5"), "CAD", 2, "Azure"))
                .isEqualTo("20.50 CAD + 2 cards for Azure");
        assertThat(OfferTexts.systemMessage(OfferEventType.CREATED, "Maïka", "40.00 CAD for Azure"))
                .isEqualTo("Maïka made an offer: 40.00 CAD for Azure.");
        assertThat(OfferTexts.title(OfferEventType.ACCEPTED, "Azure", true))
                .isEqualTo("Trade opened for Azure");
        assertThat(OfferTexts.title(OfferEventType.ACCEPTED, "Azure", false))
                .isEqualTo("Offer accepted");
        assertThat(OfferTexts.body(OfferEventType.EXPIRED, "", "40.00 CAD for Azure", false))
                .isEqualTo("The offer of 40.00 CAD for Azure expired without an answer.");
    }

    private static OfferTerms terms(
            OfferKind kind, String cash, String currency, List<TradeLine> lines) {
        return new OfferTerms(
                kind, cash == null ? null : new BigDecimal(cash), currency, lines, null);
    }

    private static List<String> fields(OfferTerms terms) {
        return OfferRules.validate(terms).stream()
                .map(ProblemFieldError::field)
                .distinct()
                .toList();
    }
}
