package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Indicative market price of a printing (display only, never a transaction price).
 *
 * @param amount price
 * @param currency ISO 4217 code
 * @param updatedAt when the provider computed it
 */
@Schema(name = "MarketPrice", description = "Indicative market price (display only)")
public record MarketPrice(
        @Schema(example = "18.50") BigDecimal amount,
        @Schema(example = "CAD") String currency,
        @Nullable Instant updatedAt) {}
