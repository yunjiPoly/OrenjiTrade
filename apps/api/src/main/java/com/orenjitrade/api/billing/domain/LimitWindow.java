package com.orenjitrade.api.billing.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.jspecify.annotations.Nullable;

/**
 * Counting window of a usage limit (stored in {@code usage_limit.limit_window}). Windows are
 * aligned on UTC: {@link #DAY} starts at 00:00 UTC, {@link #MONTH} on the first of the month and
 * {@link #TOTAL} never resets.
 */
public enum LimitWindow {
    DAY,
    MONTH,
    TOTAL;

    /** Start of the window containing {@code now} ({@link Instant#EPOCH} for {@link #TOTAL}). */
    public Instant start(Instant now) {
        return switch (this) {
            case DAY -> now.truncatedTo(ChronoUnit.DAYS);
            case MONTH ->
                    LocalDate.ofInstant(now, ZoneOffset.UTC)
                            .withDayOfMonth(1)
                            .atStartOfDay()
                            .toInstant(ZoneOffset.UTC);
            case TOTAL -> Instant.EPOCH;
        };
    }

    /** When the window containing {@code now} ends, {@code null} for {@link #TOTAL}. */
    public @Nullable Instant resetsAt(Instant now) {
        return switch (this) {
            case DAY -> start(now).plus(1, ChronoUnit.DAYS);
            case MONTH ->
                    LocalDate.ofInstant(now, ZoneOffset.UTC)
                            .withDayOfMonth(1)
                            .plusMonths(1)
                            .atStartOfDay()
                            .toInstant(ZoneOffset.UTC);
            case TOTAL -> null;
        };
    }
}
