package com.orenjitrade.api.wishlist.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.wishlist.infra.WishlistAlertRepository.Candidate;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Pure rules of the stage S2 wishlist: price terms (parsing, the admin list's validation, the
 * approximate amount), which listings fit a wish (selection, "Near Mint only") and the alert text
 * and link.
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
    void priceTermsAreParsedFromTheirLabel() {
        assertThat(PriceTerm.parse("85% TCG")).contains(new PriceTerm("85% TCG", 85, false));
        assertThat(PriceTerm.parse(" 100% TCG+ ")).contains(new PriceTerm("100% TCG+", 100, true));
        assertThat(PriceTerm.parse("200% TCG")).isPresent();
        for (String invalid :
                Arrays.asList(
                        null,
                        "",
                        "85%",
                        "85 % TCG",
                        "085% TCG",
                        "0% TCG",
                        "201% TCG",
                        "85% tcg",
                        "85% TCG++",
                        "-5% TCG",
                        "cheap")) {
            assertThat(PriceTerm.parse(invalid)).as(String.valueOf(invalid)).isEmpty();
        }
    }

    @Test
    void theApproximateAmountIsTheTermsShareOfTheMarketPrice() {
        assertThat(PriceTerm.parse("85% TCG").orElseThrow().approximate(new BigDecimal("25.00")))
                .isEqualByComparingTo("21.25");
        assertThat(PriceTerm.parse("90% TCG").orElseThrow().approximate(new BigDecimal("0.99")))
                .isEqualByComparingTo("0.89");
        assertThat(PriceTerm.parse("100% TCG+").orElseThrow().approximate(new BigDecimal("18.5")))
                .isEqualByComparingTo("18.50");
    }

    @Test
    void theAdminListIsValidatedAndNormalised() {
        assertThat(WishlistSettings.validate(List.of(" 80% TCG", "100% TCG+", "80% TCG")))
                .containsExactly("80% TCG", "100% TCG+");
        assertThat(WishlistSettings.validate(WishlistSettings.DEFAULT_PRICE_TERMS))
                .containsExactlyElementsOf(WishlistSettings.DEFAULT_PRICE_TERMS);
        assertThatThrownBy(() -> WishlistSettings.validate(List.of()))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> WishlistSettings.validate(null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> WishlistSettings.validate(List.of("80% TCG", "cheap")))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(
                        () ->
                                WishlistSettings.validate(
                                        List.of(
                                                "1% TCG",
                                                "2% TCG", "3% TCG", "4% TCG", "5% TCG", "6% TCG",
                                                "7% TCG", "8% TCG", "9% TCG", "10% TCG",
                                                "11% TCG")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void nearMintOnlyAcceptsNearMintOrBetter() {
        assertThat(WishlistAlertRules.conditionFits(CONDITIONS, "MINT", true)).isTrue();
        assertThat(WishlistAlertRules.conditionFits(CONDITIONS, "NEAR_MINT", true)).isTrue();
        assertThat(WishlistAlertRules.conditionFits(CONDITIONS, "LIGHTLY_PLAYED", true)).isFalse();
        assertThat(WishlistAlertRules.conditionFits(CONDITIONS, "DAMAGED", true)).isFalse();
        assertThat(WishlistAlertRules.conditionFits(CONDITIONS, "UNKNOWN", true)).isFalse();
        assertThat(WishlistAlertRules.conditionFits(CONDITIONS, "DAMAGED", false)).isTrue();
        assertThat(WishlistAlertRules.conditionFits(List.of("GOOD"), "GOOD", true)).isFalse();
        // Not stated (cards added on the phone, stage R2): a possible match either way.
        assertThat(WishlistAlertRules.conditionFits(CONDITIONS, null, true)).isTrue();
        assertThat(WishlistAlertRules.conditionFits(CONDITIONS, null, false)).isTrue();
        assertThat(WishlistAlertRules.NEAR_MINT_SQL).contains("i.condition IS NULL");
        assertThat(WishlistAlertRules.NEAR_MINT_SQL)
                .contains("w.near_mint_only")
                .contains("'NEAR_MINT'");
    }

    @Test
    void aSelectionFitsItsPrintingOrAnyPrintingOfItsRarity() {
        UUID card = UUID.randomUUID();
        UUID printing = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        assertThat(WishlistAlertRules.selectionFits(card, printing, null, card, printing, "UR"))
                .isTrue();
        assertThat(WishlistAlertRules.selectionFits(card, printing, null, card, other, "UR"))
                .isFalse();
        assertThat(WishlistAlertRules.selectionFits(card, null, null, card, other, "UR")).isTrue();
        assertThat(WishlistAlertRules.selectionFits(card, null, "UR", card, other, "UR")).isTrue();
        assertThat(WishlistAlertRules.selectionFits(card, null, "SR", card, other, "UR")).isFalse();
        assertThat(
                        WishlistAlertRules.selectionFits(
                                card, null, null, UUID.randomUUID(), other, "UR"))
                .isFalse();
    }

    @Test
    void theAlertNamesCardCodeRarityHandleAndPlaceAndLinksToTheSelection() {
        UUID card = UUID.randomUUID();
        UUID printing = UUID.randomUUID();
        PublicPlace quebec =
                new PublicPlace("americas-north", "CA", "Canada", "CA-QC", "Quebec", false);
        Candidate exact = candidate(card, printing, null, "AZR-EN001", "Ultra Rare", quebec);
        assertThat(WishlistAlerts.body(exact))
                .isEqualTo(
                        "Azure-Eyes Sky Dragon AZR-EN001 Ultra Rare was just listed by @seller in"
                                + " Quebec, Canada.");
        assertThat(WishlistAlerts.deepLink(exact))
                .isEqualTo("/cards/" + card + "?printing=" + printing);

        PublicPlace puertoRico =
                new PublicPlace("americas-north", "PR", "Puerto Rico", "PR", "Puerto Rico", true);
        Candidate rarity =
                candidate(card, null, "Collector's Rare", null, "Collector's Rare", puertoRico);
        assertThat(WishlistAlerts.body(rarity))
                .isEqualTo(
                        "Azure-Eyes Sky Dragon Collector's Rare was just listed by @seller in"
                                + " Puerto Rico.");
        assertThat(WishlistAlerts.deepLink(rarity))
                .isEqualTo("/cards/" + card + "?rarity=Collector%27s%20Rare")
                .matches("^/(?!/)[\\w\\-/?=&.%~]*$");

        Candidate any = candidate(card, null, null, "AZR-EN001", null, quebec);
        assertThat(WishlistAlerts.deepLink(any))
                .as("any printing is said explicitly, so the card page picks no printing")
                .isEqualTo("/cards/" + card + "?printing=any")
                .matches("^/(?!/)[\\w\\-/?=&.%~]*$");
        assertThat(WishlistAlerts.request(any, null).dedupKey())
                .isEqualTo("wishlist-alert:" + any.wisherId() + ":" + any.itemId());
    }

    @Test
    void theAlertCarriesTheRowOfThePhoneWithTheProvinceOnly() {
        UUID card = UUID.randomUUID();
        PublicPlace quebec =
                new PublicPlace("americas-north", "CA", "Canada", "CA-QC", "Quebec", false);
        Map<String, ?> data =
                WishlistAlerts.request(candidate(card, null, null, "AZR-EN001", null, quebec), null)
                        .data();
        assertThat(data.get("collectorHandle")).isEqualTo("seller");
        assertThat(data.get("province")).as("the province, not the country").isEqualTo("Quebec");
        assertThat(data.get("askingPriceText")).isEqualTo("$14.00");
        assertThat(data.get("askingPrice")).isEqualTo("14.00");
        assertThat(data.get("currency")).isEqualTo("CAD");
        assertThat(data.get("cardName")).isEqualTo("Azure-Eyes Sky Dragon");

        PublicPlace puertoRico =
                new PublicPlace("americas-north", "PR", "Puerto Rico", "PR", "Puerto Rico", true);
        assertThat(WishlistAlerts.province(puertoRico)).isEqualTo("Puerto Rico");
        Candidate unpriced =
                new Candidate(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        card,
                        null,
                        null,
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        "Azure-Eyes Sky Dragon",
                        null,
                        null,
                        "yugioh",
                        null,
                        null,
                        "CAD",
                        "seller",
                        puertoRico);
        Map<String, ?> plain = WishlistAlerts.request(unpriced, null).data();
        assertThat(plain).doesNotContainKeys("askingPriceText", "askingPrice", "currency");
        assertThat(plain.get("province")).isEqualTo("Puerto Rico");
    }

    private static Candidate candidate(
            UUID card,
            UUID printing,
            String wishRarity,
            String code,
            String itemRarity,
            PublicPlace place) {
        return new Candidate(
                UUID.randomUUID(),
                UUID.randomUUID(),
                card,
                printing,
                wishRarity,
                UUID.randomUUID(),
                printing == null ? UUID.randomUUID() : printing,
                UUID.randomUUID(),
                "Azure-Eyes Sky Dragon",
                code,
                itemRarity,
                "yugioh",
                "$14.00",
                new BigDecimal("14.00"),
                "CAD",
                "seller",
                place);
    }
}
