package com.orenjitrade.api.analytics.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Privacy guards of {@link AnalyticsEvent} and the text scrubbing of {@link AnalyticsText}. */
class AnalyticsEventTest {

    private static final Instant NOW = Instant.parse("2026-09-29T12:00:00Z");

    private static AnalyticsEvent event(Map<String, Object> payload) {
        return AnalyticsEvent.of("search_performed", NOW, null, "r5058c-8174", "Mile End", payload);
    }

    @Test
    void sanitizeMasksEmailsCoordinatesAndLongNumbersAndTruncates() {
        assertThat(AnalyticsText.sanitize("  maika@example.com  wants   azure "))
                .isEqualTo("[email] wants azure");
        assertThat(AnalyticsText.sanitize("near 45.52341,-73.58127 please"))
                .isEqualTo("near [number],[number] please");
        assertThat(AnalyticsText.sanitize("call 5145550199")).isEqualTo("call [number]");
        assertThat(AnalyticsText.sanitize("AZR-EN001")).isEqualTo("AZR-EN001");
        assertThat(AnalyticsText.sanitize("   ")).isNull();
        assertThat(AnalyticsText.sanitize(null)).isNull();
        String longText = "x".repeat(200);
        assertThat(AnalyticsText.sanitize(longText)).hasSize(AnalyticsText.MAX_LENGTH);
        assertThat(AnalyticsText.sanitize("line\nbreak\ttab")).isEqualTo("line break tab");
    }

    @Test
    void payloadStringsAreScrubbedAndNullsDropped() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("query", "sell to bob@example.org at 45.5");
        payload.put("result_count", 3L);
        payload.put("radius_km", 10);
        payload.put("anonymous", true);
        payload.put("types", List.of("cards", "a@b.co"));
        payload.put("card_id", UUID.fromString("00000000-0000-4000-8000-000000000001"));
        payload.put("missing", null);
        AnalyticsEvent event = event(payload);
        assertThat(event.payload())
                .containsEntry("query", "sell to [email] at [number]")
                .containsEntry("result_count", 3L)
                .containsEntry("radius_km", 10)
                .containsEntry("anonymous", true)
                .containsEntry("types", List.of("cards", "[email]"))
                .containsEntry("card_id", "00000000-0000-4000-8000-000000000001")
                .doesNotContainKey("missing");
        assertThat(event.version()).isEqualTo(AnalyticsEvent.VERSION);
        assertThat(event.eventId()).isNotNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"lat", "lng", "latitude", "email", "handle", "user_id", "centre"})
    void locationAndContactKeysAreRefused(String key) {
        assertThatThrownBy(() -> event(Map.of(key, "x")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void hashKeysKeepTheirDigestAndRefuseAnythingElse() {
        assertThat(event(Map.of("owner_hash", "d3d775515dd4717b1e9a1009c614e072")).payload())
                .containsEntry("owner_hash", "d3d775515dd4717b1e9a1009c614e072");
        assertThatThrownBy(() -> event(Map.of("owner_hash", "collector1")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void floatingPointValuesAreRefused() {
        assertThatThrownBy(() -> event(Map.of("distance", 45.52341)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> event(Map.of("nested", Map.of("a", 1))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> event(Map.of("list", List.of(1, 2))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void geographyIsAGridCellAndActorsAreHashes() {
        assertThatThrownBy(
                        () ->
                                AnalyticsEvent.of(
                                        "search_performed",
                                        NOW,
                                        null,
                                        "45.52,-73.58",
                                        null,
                                        Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                AnalyticsEvent.of(
                                        "search_performed",
                                        NOW,
                                        "00000000-0000-4000-8000-000000000001",
                                        null,
                                        null,
                                        Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                AnalyticsEvent.of(
                                        "Search Performed", NOW, null, null, null, Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
        AnalyticsEvent event =
                AnalyticsEvent.of(
                        "card_viewed",
                        NOW,
                        "0123456789abcdef0123456789abcdef",
                        "r-12c34",
                        "Plateau-Mont-Royal, Montréal",
                        Map.of());
        assertThat(event.regionLabel()).isEqualTo("Plateau-Mont-Royal, Montréal");
    }
}
