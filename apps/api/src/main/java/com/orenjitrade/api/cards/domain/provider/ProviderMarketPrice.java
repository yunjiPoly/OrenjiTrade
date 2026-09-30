package com.orenjitrade.api.cards.domain.provider;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Indicative market price of a printing (display only).
 *
 * @param amount price
 * @param currency ISO 4217 code
 * @param updatedAt when the provider computed it
 */
public record ProviderMarketPrice(BigDecimal amount, String currency, Instant updatedAt) {}
