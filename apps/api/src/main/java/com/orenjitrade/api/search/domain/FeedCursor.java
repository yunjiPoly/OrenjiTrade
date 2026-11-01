package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The opaque cursor of Home's feed ({@code GET /api/v1/feed}): the position of the last post of the
 * previous page ({@code at}, {@code id}) and the time the first page was read ({@code asOf}).
 *
 * <p>A new-card post is dated by its newest card, so its date moves when a card joins its hour. On
 * the pages after the first, new-card posts are dated by the cards listed until {@code asOf} only:
 * a card listed after the first page can no longer lift a post nobody has seen yet above the cursor
 * and out of every page (R7 review F2). A post whose newest card leaves between two pages can still
 * come back once, later, with its new time: clients keep the copy they already show.
 *
 * <p>Encoded as URL-safe base64 of {@code <at µs>:<uuid>:<asOf µs>}; clients never build it.
 * PostgreSQL keeps microseconds, so both instants are truncated to microseconds.
 *
 * @param at the time of the last post of the previous page
 * @param id the id of the last post of the previous page (tie breaker)
 * @param asOf the time the first page was read ({@link FeedRules#asOf})
 */
public record FeedCursor(Instant at, UUID id, Instant asOf) {

    public FeedCursor {
        at = at.truncatedTo(ChronoUnit.MICROS);
        asOf = asOf.truncatedTo(ChronoUnit.MICROS);
    }

    /** The opaque form. */
    public String encode() {
        String text = micros(at) + ":" + id + ":" + micros(asOf);
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Parses a cursor parameter; {@code null} or blank means the first page. A malformed cursor is
     * {@code 400 VALIDATION_FAILED} on the {@code cursor} field.
     */
    public static @Nullable FeedCursor decode(@Nullable String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }
        try {
            String text =
                    new String(
                            Base64.getUrlDecoder().decode(cursor.trim()), StandardCharsets.UTF_8);
            String[] parts = text.split(":", -1);
            if (parts.length != 3) {
                throw invalid();
            }
            return new FeedCursor(
                    instant(Long.parseLong(parts[0])),
                    UUID.fromString(parts[1]),
                    instant(Long.parseLong(parts[2])));
        } catch (IllegalArgumentException | ArithmeticException | DateTimeException e) {
            throw invalid();
        }
    }

    private static long micros(Instant instant) {
        return ChronoUnit.MICROS.between(Instant.EPOCH, instant);
    }

    private static Instant instant(long micros) {
        return Instant.EPOCH.plus(micros, ChronoUnit.MICROS);
    }

    private static ApiException invalid() {
        return ApiException.validation(
                "Validation failed",
                List.of(new ProblemFieldError("cursor", "The cursor is not valid")));
    }
}
