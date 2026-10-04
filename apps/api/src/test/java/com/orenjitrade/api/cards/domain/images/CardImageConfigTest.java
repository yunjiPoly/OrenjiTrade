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
 * application does with {@code CARD_IMAGE_LOCAL_CACHE_MAX_MB}): above 5 GB (5120 MiB, owner
 * decision 2026-10-04) the application refuses to start, it never lowers the value silently;
 * smaller limits are allowed. The limit in bytes exceeds {@link Integer#MAX_VALUE}, so it must be
 * computed in 64 bits.
 */
class CardImageConfigTest {

    private static final long MIB = 1024L * 1024L;

    private static CardImageCacheProperties cache(Map<String, String> values) {
        Map<String, String> source = new HashMap<>();
        values.forEach((key, value) -> source.put("orenji.card-images.cache." + key, value));
        return new Binder(new MapConfigurationPropertySource(source))
                .bindOrCreate("orenji.card-images.cache", CardImageCacheProperties.class);
    }

    @Test
    void theDefaultLimitIsFiveGigabytes() {
        CardImageCacheProperties properties = cache(Map.of());
        assertThat(CardImageCacheProperties.MAX_ALLOWED_MB).isEqualTo(5120);
        assertThat(properties.maxMb()).isEqualTo(5120);
        assertThat(properties.limitBytes()).isEqualTo(5120L * 1024 * 1024);
        assertThat(properties.limitBytes())
                .as("5 GB does not fit in an int (an int multiplication would wrap to 1 GiB)")
                .isEqualTo(5_368_709_120L)
                .isGreaterThan(Integer.MAX_VALUE);
        assertThat(properties.targetWidth()).isEqualTo(320);
        assertThat(properties.jpegQuality()).isEqualTo(0.82f);
        assertThat(properties.maxDownloadBytes()).isEqualTo(2L * 1024 * 1024);
        assertThat(properties.maxParallelDownloads()).isEqualTo(4);
    }

    @Test
    void limitsAboveFiveGigabytesAreRejected() {
        assertThatThrownBy(() -> cache(Map.of("max-mb", "5121")))
                .isInstanceOf(BindException.class)
                .rootCause()
                .hasMessageContaining("CARD_IMAGE_LOCAL_CACHE_MAX_MB")
                .hasMessageContaining("between 1 and 5120")
                .hasMessageContaining("5121");
        assertThatThrownBy(() -> cache(Map.of("max-mb", "6000")))
                .isInstanceOf(BindException.class)
                .rootCause()
                .hasMessageContaining("between 1 and 5120")
                .hasMessageContaining("6000");
        assertThatThrownBy(() -> cache(Map.of("max-mb", "100000")))
                .isInstanceOf(BindException.class);
        // Beyond the int range: refused as well (conversion failure), never wrapped or clamped.
        assertThatThrownBy(() -> cache(Map.of("max-mb", "5000000000")))
                .isInstanceOf(BindException.class);
        assertThatThrownBy(() -> cache(Map.of("max-mb", "0"))).isInstanceOf(BindException.class);
        assertThatThrownBy(() -> cache(Map.of("max-mb", "-5"))).isInstanceOf(BindException.class);
    }

    @Test
    void theCeilingAndSmallerLimitsAreAllowed() {
        CardImageCacheProperties ceiling = cache(Map.of("max-mb", "5120"));
        assertThat(ceiling.maxMb()).isEqualTo(5120);
        assertThat(ceiling.limitBytes()).isEqualTo(5120L * 1024 * 1024);
        assertThat(cache(Map.of("max-mb", "5119")).limitBytes()).isEqualTo(5119L * MIB);
        assertThat(cache(Map.of("max-mb", "2048")).limitBytes())
                .as("2 GiB, one past Integer.MAX_VALUE bytes")
                .isEqualTo(2048L * MIB)
                .isGreaterThan(Integer.MAX_VALUE);
        assertThat(cache(Map.of("max-mb", "500")).maxMb()).isEqualTo(500);
        assertThat(cache(Map.of("max-mb", "500")).limitBytes()).isEqualTo(500L * MIB);
        assertThat(cache(Map.of("max-mb", "5")).maxMb()).isEqualTo(5);
        assertThat(cache(Map.of("max-mb", "1")).limitBytes()).isEqualTo(MIB);
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
