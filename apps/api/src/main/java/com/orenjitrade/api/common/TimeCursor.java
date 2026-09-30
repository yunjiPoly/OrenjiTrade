package com.orenjitrade.api.common;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Opaque keyset cursor of {@link CursorPage}s ordered by a timestamp and an id (messages,
 * conversations, community posts): the position of the last row of the previous slice. Encoded as
 * URL-safe base64 of {@code <epoch microseconds>:<uuid>}; clients never construct it. PostgreSQL
 * keeps microseconds, so every instant is truncated to microseconds before it is compared.
 *
 * @param at timestamp of the last row
 * @param id id of the last row (tie breaker)
 */
public record TimeCursor(Instant at, UUID id) {

    public TimeCursor {
        at = at.truncatedTo(ChronoUnit.MICROS);
    }

    /** The opaque form. */
    public String encode() {
        long micros = ChronoUnit.MICROS.between(Instant.EPOCH, at);
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString((micros + ":" + id).getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Parses a cursor parameter; {@code null} or blank means "from the start". A malformed cursor
     * is {@code 400 VALIDATION_FAILED} on the {@code cursor} field.
     */
    public static @Nullable TimeCursor decode(@Nullable String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }
        try {
            String text =
                    new String(
                            Base64.getUrlDecoder().decode(cursor.trim()), StandardCharsets.UTF_8);
            int colon = text.indexOf(':');
            if (colon <= 0) {
                throw invalid();
            }
            long micros = Long.parseLong(text.substring(0, colon));
            UUID id = UUID.fromString(text.substring(colon + 1));
            return new TimeCursor(Instant.EPOCH.plus(micros, ChronoUnit.MICROS), id);
        } catch (IllegalArgumentException | ArithmeticException e) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return ApiException.validation(
                "Validation failed",
                List.of(new ProblemFieldError("cursor", "The cursor is not valid")));
    }
}
