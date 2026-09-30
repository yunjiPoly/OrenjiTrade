package com.orenjitrade.api.ratings.domain;

import org.jspecify.annotations.Nullable;

/**
 * The scores of a rating, each 1-5; only {@code overall} is required.
 *
 * @param overall overall impression
 * @param communication responsiveness and clarity
 * @param conditionAccuracy cards matched the described condition
 * @param shipping packaging and shipping
 * @param meetupReliability punctuality and reliability of meetups
 */
public record RatingScores(
        int overall,
        @Nullable Integer communication,
        @Nullable Integer conditionAccuracy,
        @Nullable Integer shipping,
        @Nullable Integer meetupReliability) {}
