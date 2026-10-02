package com.orenjitrade.api.wishlist.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.wishlist.infra.WishlistMatchRepository.Candidate;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The matching rules of the Phase 6 contract in Java (twins of the SQL predicates): condition rank
 * against the game's ordered conditions, price and currency, trade preference against the
 * availability; notification texts carry buckets, never distances.
 */
class WishlistRulesTest {

    private static final List<String> CONDITIONS =
            List.of(
                    "MINT",
                    "NEAR_MINT",
                    "LIGHTLY_PLAYED",
                    "MODERATELY_PLAYED",
                    "HEAVILY_PLAYED",
                    "DAMAGED");

    @Test
    void conditionMustBeAtLeastTheMinimum() {
        assertThat(WishlistRules.conditionSatisfies(CONDITIONS, "DAMAGED", null)).isTrue();
        assertThat(WishlistRules.conditionSatisfies(CONDITIONS, "MINT", "LIGHTLY_PLAYED")).isTrue();
        assertThat(WishlistRules.conditionSatisfies(CONDITIONS, "NEAR_MINT", "LIGHTLY_PLAYED"))
                .isTrue();
        assertThat(WishlistRules.conditionSatisfies(CONDITIONS, "LIGHTLY_PLAYED", "LIGHTLY_PLAYED"))
                .isTrue();
        assertThat(
                        WishlistRules.conditionSatisfies(
                                CONDITIONS, "MODERATELY_PLAYED", "LIGHTLY_PLAYED"))
                .isFalse();
        assertThat(WishlistRules.conditionSatisfies(CONDITIONS, "GRADED_10", "LIGHTLY_PLAYED"))
                .as("unknown item condition")
                .isFalse();
        assertThat(WishlistRules.conditionSatisfies(CONDITIONS, "MINT", "PRISTINE"))
                .as("unknown minimum")
                .isFalse();
    }

    @Test
    void priceMustNotExceedTheMaximumInTheSameCurrency() {
        BigDecimal sixty = new BigDecimal("60.00");
        assertThat(WishlistRules.priceAcceptable(null, "CAD", new BigDecimal("999"), "CAD"))
                .isTrue();
        assertThat(WishlistRules.priceAcceptable(sixty, "CAD", null, "CAD"))
                .as("unpriced items pass")
                .isTrue();
        assertThat(WishlistRules.priceAcceptable(sixty, "CAD", new BigDecimal("60"), "CAD"))
                .isTrue();
        assertThat(WishlistRules.priceAcceptable(sixty, "CAD", new BigDecimal("60.01"), "CAD"))
                .isFalse();
        assertThat(WishlistRules.priceAcceptable(sixty, "CAD", new BigDecimal("10"), "USD"))
                .as("another currency never meets a set maximum")
                .isFalse();
    }

    @Test
    void tradePreferenceMatchesTheAvailability() {
        for (Availability availability : Availability.values()) {
            assertThat(WishlistRules.tradeCompatible(TradePreference.ANY, availability)).isTrue();
        }
        assertThat(WishlistRules.tradeCompatible(TradePreference.TRADE, Availability.TRADE))
                .isTrue();
        assertThat(WishlistRules.tradeCompatible(TradePreference.TRADE, Availability.TRADE_OR_SALE))
                .isTrue();
        assertThat(WishlistRules.tradeCompatible(TradePreference.TRADE, Availability.SALE))
                .isFalse();
        assertThat(
                        WishlistRules.tradeCompatible(
                                TradePreference.TRADE, Availability.COLLECTION_ONLY))
                .isFalse();
        assertThat(WishlistRules.tradeCompatible(TradePreference.SALE, Availability.SALE)).isTrue();
        assertThat(WishlistRules.tradeCompatible(TradePreference.SALE, Availability.TRADE_OR_SALE))
                .isTrue();
        assertThat(WishlistRules.tradeCompatible(TradePreference.SALE, Availability.TRADE))
                .isFalse();
    }

    @Test
    void notificationTextsUseDistanceBuckets() {
        assertThat(WishlistRules.distanceText(DistanceBucket.LT_1KM))
                .isEqualTo("less than 1 km away");
        assertThat(WishlistRules.distanceText(DistanceBucket.KM_1_5)).isEqualTo("~1-5 km away");
        assertThat(WishlistRules.distanceText(DistanceBucket.GT_50KM))
                .isEqualTo("more than 50 km away");

        UUID wish = UUID.fromString("00000000-0000-4000-8f00-000000000201");
        UUID item = UUID.fromString("00000000-0000-4000-8c00-000000010101");
        UUID wisher = UUID.fromString("00000000-0000-4000-8000-000000000002");
        UUID owner = UUID.fromString("00000000-0000-4000-8000-000000000001");
        UUID match = UUID.fromString("00000000-0000-4000-8f00-00000000aaaa");
        UUID printing = UUID.fromString("00000000-0000-4000-8e00-000000000001");
        Candidate candidate =
                new Candidate(
                        wish,
                        wisher,
                        item,
                        printing,
                        owner,
                        "Azure-Eyes Sky Dragon",
                        "AZR-EN001",
                        new BigDecimal("45.00"),
                        "CAD",
                        "yugioh",
                        7_213.456);
        String picture = "/api/v1/public/card-images/00000000-0000-4000-8d00-000000000001";
        NotificationRequest request =
                WishlistMatcher.request(candidate, match, DistanceBucket.KM_5_10, picture);
        assertThat(request.userId()).isEqualTo(wisher);
        assertThat(request.type()).isEqualTo(NotificationType.WISHLIST_MATCH);
        assertThat(request.title()).isEqualTo("Wishlist match: Azure-Eyes Sky Dragon");
        assertThat(request.body())
                .isEqualTo(
                        "Azure-Eyes Sky Dragon AZR-EN001 was listed ~5-10 km away for 45.00"
                                + " CAD.");
        assertThat(request.dedupKey()).isEqualTo("wishlist:" + wish + ":" + item);
        assertThat(request.data())
                .containsEntry("wishlistItemId", wish.toString())
                .containsEntry("matchId", match.toString())
                .containsEntry("inventoryItemId", item.toString())
                .containsEntry("collectorId", owner.toString())
                .containsEntry("distanceBucket", "KM_5_10")
                .containsEntry("deepLink", "/wishlist/" + wish)
                .containsEntry("cardName", "Azure-Eyes Sky Dragon")
                .containsEntry("game", "yugioh")
                .containsEntry("cardImageUrl", picture);
        assertThat(request.toString()).doesNotContain("7213").doesNotContain("7_213");

        Candidate unpriced =
                new Candidate(
                        wish,
                        wisher,
                        item,
                        printing,
                        owner,
                        "Tidebinder",
                        null,
                        null,
                        "CAD",
                        "mtg",
                        400);
        NotificationRequest unpricedRequest =
                WishlistMatcher.request(unpriced, match, DistanceBucket.LT_1KM, null);
        assertThat(unpricedRequest.body()).isEqualTo("Tidebinder was listed less than 1 km away.");
        assertThat(unpricedRequest.data())
                .containsEntry("cardName", "Tidebinder")
                .doesNotContainKey("cardImageUrl");
    }
}
