package com.orenjitrade.api.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class TimeCursorTest {

    @Test
    void roundTripsAtMicrosecondPrecision() {
        UUID id = UUID.randomUUID();
        Instant at = Instant.parse("2026-09-29T12:34:56.123456789Z");
        TimeCursor cursor = new TimeCursor(at, id);

        assertThat(cursor.at()).isEqualTo(Instant.parse("2026-09-29T12:34:56.123456Z"));
        TimeCursor decoded = TimeCursor.decode(cursor.encode());
        assertThat(decoded).isEqualTo(cursor);
        assertThat(cursor.encode()).doesNotContain("=").doesNotContain("+").doesNotContain("/");
    }

    @Test
    void blankMeansFromTheStart() {
        assertThat(TimeCursor.decode(null)).isNull();
        assertThat(TimeCursor.decode("  ")).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"%%%", "bm90LWEtY3Vyc29y", "MTIzOm5vdC1hLXV1aWQ", "OmFiYw"})
    void malformedCursorsAreValidationErrors(String cursor) {
        assertThatThrownBy(() -> TimeCursor.decode(cursor))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        e -> {
                            assertThat(e.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_FAILED);
                            assertThat(e.getFieldErrors())
                                    .extracting(ProblemFieldError::field)
                                    .containsExactly("cursor");
                        });
    }

    @Test
    void encodesEpochMicrosAndTheId() {
        UUID id = UUID.fromString("00000000-0000-4000-8000-000000000001");
        TimeCursor cursor = new TimeCursor(Instant.EPOCH.plusSeconds(1), id);
        String text = new String(Base64.getUrlDecoder().decode(cursor.encode()));
        assertThat(text).isEqualTo("1000000:" + id);
    }
}
