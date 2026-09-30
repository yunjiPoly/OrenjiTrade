package com.orenjitrade.api.binders.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * How {@code POST /binders/{id}/publish} publishes a binder: {@link #PUBLIC} and {@link
 * #UNTIL_DISABLED} make it PUBLIC with no end date; {@link #ONE_HOUR} and {@link #ONE_DAY} make it
 * TEMPORARILY_PUBLIC until now + 1 h / 24 h.
 */
@Schema(name = "PublishMode")
public enum PublishMode {
    PUBLIC(null),
    ONE_HOUR(Duration.ofHours(1)),
    ONE_DAY(Duration.ofDays(1)),
    UNTIL_DISABLED(null);

    private final @Nullable Duration duration;

    PublishMode(@Nullable Duration duration) {
        this.duration = duration;
    }

    public ListingVisibility visibility() {
        return duration == null ? ListingVisibility.PUBLIC : ListingVisibility.TEMPORARILY_PUBLIC;
    }

    /** End of the publication, {@code null} for an open-ended one. */
    public @Nullable Instant publicUntil(Instant now) {
        return duration == null ? null : now.plus(duration);
    }
}
