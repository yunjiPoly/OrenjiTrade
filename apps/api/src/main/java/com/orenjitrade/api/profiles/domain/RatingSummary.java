package com.orenjitrade.api.profiles.domain;

import org.jspecify.annotations.Nullable;

/**
 * Average and count of the ratings a collector received.
 *
 * @param average mean rating, {@code null} without ratings
 * @param count number of ratings
 */
public record RatingSummary(@Nullable Double average, int count) {

    public static final RatingSummary NONE = new RatingSummary(null, 0);
}
