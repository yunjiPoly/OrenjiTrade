package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Indicative market price of a printing (display only, never a transaction price).
 *
 * @param amount price
 * @param currency ISO 4217 code
 * @param updatedAt when the provider computed it
 * @param source where the price comes from: {@link #SOURCE_YGOPRODECK} (the {@code set_price} of
 *     the YGOPRODeck card database, TCGplayer-based, USD), {@link #SOURCE_SAMPLE} (the fictional
 *     local sample catalog) or {@link #SOURCE_CATALOG} (entered by OrenjiTrade staff)
 */
@Schema(name = "MarketPrice", description = "Indicative market price (display only)")
public record MarketPrice(
        @Schema(example = "18.50") BigDecimal amount,
        @Schema(example = "USD") String currency,
        @Nullable Instant updatedAt,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = SOURCE_YGOPRODECK,
                        allowableValues = {SOURCE_YGOPRODECK, SOURCE_SAMPLE, SOURCE_CATALOG},
                        description =
                                "YGOPRODECK: the set price of the YGOPRODeck card database"
                                        + " (TCGplayer-based, USD), dated by its last update;"
                                        + " SAMPLE: the fictional local sample catalog; CATALOG:"
                                        + " entered by OrenjiTrade staff")
                String source) {

    public static final String SOURCE_YGOPRODECK = "YGOPRODECK";
    public static final String SOURCE_SAMPLE = "SAMPLE";
    public static final String SOURCE_CATALOG = "CATALOG";

    /** The source of a printing's price from its provider ({@code external_ref ->> 'provider'}). */
    public static String sourceOf(@Nullable String provider) {
        if (provider == null) {
            return SOURCE_CATALOG;
        }
        return switch (provider) {
            case "ygoprodeck" -> SOURCE_YGOPRODECK;
            case "mock" -> SOURCE_SAMPLE;
            default -> SOURCE_CATALOG;
        };
    }
}
