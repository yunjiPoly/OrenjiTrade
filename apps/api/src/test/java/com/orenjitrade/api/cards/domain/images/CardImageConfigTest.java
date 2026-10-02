package com.orenjitrade.api.cards.domain.images;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.cards.infra.ygoprodeck.YgoProDeckProperties;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.BindException;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * Start-up validation of the cache and provider settings through Spring Boot's binder (what the
 * application does with {@code CARD_IMAGE_LOCAL_CACHE_MAX_MB}): above 500 MB the application
 * refuses to start, it never lowers the value silently; smaller limits are allowed.
 */
class CardImageConfigTest {

    private static CardImageCacheProperties cache(Map<String, String> values) {
        Map<String, String> source = new HashMap<>();
        values.forEach((key, value) -> source.put("orenji.card-images.cache." + key, value));
        return new Binder(new MapConfigurationPropertySource(source))
                .bindOrCreate("orenji.card-images.cache", CardImageCacheProperties.class);
    }

    @Test
    void theDefaultLimitIsFiveHundredMegabytes() {
        CardImageCacheProperties properties = cache(Map.of());
        assertThat(properties.maxMb()).isEqualTo(500);
        assertThat(properties.limitBytes()).isEqualTo(500L * 1024 * 1024);
        assertThat(properties.targetWidth()).isEqualTo(320);
        assertThat(properties.jpegQuality()).isEqualTo(0.82f);
        assertThat(properties.maxDownloadBytes()).isEqualTo(2L * 1024 * 1024);
        assertThat(properties.maxParallelDownloads()).isEqualTo(4);
    }

    @Test
    void limitsAboveFiveHundredMegabytesAreRejected() {
        assertThatThrownBy(() -> cache(Map.of("max-mb", "501")))
                .isInstanceOf(BindException.class)
                .rootCause()
                .hasMessageContaining("CARD_IMAGE_LOCAL_CACHE_MAX_MB")
                .hasMessageContaining("between 1 and 500")
                .hasMessageContaining("501");
        assertThatThrownBy(() -> cache(Map.of("max-mb", "100000")))
                .isInstanceOf(BindException.class);
        assertThatThrownBy(() -> cache(Map.of("max-mb", "0"))).isInstanceOf(BindException.class);
        assertThatThrownBy(() -> cache(Map.of("max-mb", "-5"))).isInstanceOf(BindException.class);
    }

    @Test
    void smallerLimitsAreAllowed() {
        assertThat(cache(Map.of("max-mb", "1")).limitBytes()).isEqualTo(1024L * 1024);
        assertThat(cache(Map.of("max-mb", "500")).maxMb()).isEqualTo(500);
        assertThat(cache(Map.of("max-mb", "5")).maxMb()).isEqualTo(5);
    }

    @Test
    void otherCacheSettingsAreValidated() {
        assertThatThrownBy(() -> cache(Map.of("target-width", "10")))
                .isInstanceOf(BindException.class);
        assertThatThrownBy(() -> cache(Map.of("max-parallel-downloads", "64")))
                .isInstanceOf(BindException.class);
        assertThatThrownBy(() -> cache(Map.of("reservation-ttl", "30s", "download-timeout", "60s")))
                .isInstanceOf(BindException.class);
    }

    @Test
    void providerRequestRateHasAHardCeiling() {
        Map<String, String> source = new HashMap<>();
        source.put("orenji.card-providers.ygoprodeck.requests-per-second", "16");
        assertThatThrownBy(
                        () ->
                                new Binder(new MapConfigurationPropertySource(source))
                                        .bindOrCreate(
                                                "orenji.card-providers.ygoprodeck",
                                                YgoProDeckProperties.class))
                .isInstanceOf(BindException.class)
                .rootCause()
                .hasMessageContaining("<= 15.0");
        YgoProDeckProperties defaults =
                new Binder(new MapConfigurationPropertySource(Map.of()))
                        .bindOrCreate(
                                "orenji.card-providers.ygoprodeck", YgoProDeckProperties.class);
        assertThat(defaults.requestsPerSecond()).isEqualTo(5.0);
        assertThat(defaults.apiBaseUrl()).isEqualTo("https://db.ygoprodeck.com/api/v7/");
        assertThat(defaults.imageBaseUrl())
                .isEqualTo("https://images.ygoprodeck.com/images/cards/");
        assertThat(defaults.userAgent()).startsWith("OrenjiTrade");
    }
}
