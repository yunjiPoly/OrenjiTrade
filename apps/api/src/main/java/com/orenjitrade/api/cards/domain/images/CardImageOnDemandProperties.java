package com.orenjitrade.api.cards.domain.images;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.card-images.on-demand.*}: filling the cache from {@code GET
 * /api/v1/public/card-images/{id}} when a re-host-only artwork is not cached yet (ADR 0015).
 *
 * @param enabled whether a request may start a download at all
 * @param waitTimeout how long the request waits for the download before answering with the
 *     placeholder (the download continues in the background)
 * @param maxPerSecond on-demand downloads started per second across all visitors (provider
 *     etiquette); requests above it get the placeholder at once
 */
@ConfigurationProperties(prefix = "orenji.card-images.on-demand")
public record CardImageOnDemandProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("3s") Duration waitTimeout,
        @DefaultValue("2") double maxPerSecond) {

    public CardImageOnDemandProperties {
        if (waitTimeout == null || waitTimeout.isNegative() || waitTimeout.toSeconds() > 30) {
            throw new IllegalArgumentException(
                    "orenji.card-images.on-demand.wait-timeout must be between 0 and 30 seconds");
        }
        if (!(maxPerSecond > 0) || maxPerSecond > 10) {
            throw new IllegalArgumentException(
                    "orenji.card-images.on-demand.max-per-second must be > 0 and <= 10");
        }
    }
}
