package com.orenjitrade.api.search.domain;

import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.jspecify.annotations.Nullable;

/** The {@code kind=} of {@code GET /feed}: every post, or the posts of one kind (Home's chips). */
public enum FeedFilter {
    ALL(Set.of(FeedPostKind.NEW_CARDS, FeedPostKind.WANTED, FeedPostKind.DECK_CORE)),
    NEW_CARDS(Set.of(FeedPostKind.NEW_CARDS)),
    WANTED(Set.of(FeedPostKind.WANTED)),
    DECK_CORES(Set.of(FeedPostKind.DECK_CORE));

    private final Set<FeedPostKind> kinds;

    FeedFilter(Set<FeedPostKind> kinds) {
        this.kinds = kinds;
    }

    /** The kinds of post this filter keeps. */
    public Set<FeedPostKind> kinds() {
        return kinds;
    }

    /** {@code ALL} without a value; empty for an unknown one (any case accepted). */
    public static Optional<FeedFilter> parse(@Nullable String value) {
        if (value == null || value.isBlank()) {
            return Optional.of(ALL);
        }
        try {
            return Optional.of(valueOf(value.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
