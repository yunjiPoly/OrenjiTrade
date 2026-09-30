package com.orenjitrade.api.moderation.domain;

import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A {@code RATE_LIMIT} or {@code THRESHOLD} rule parsed from its {@code <count>/<seconds>} pattern
 * (V042 checks the syntax; anything else is ignored with a warning by the service).
 *
 * @param id rule id
 * @param limit writes (or repetitions) allowed per window
 * @param windowSeconds window length
 * @param action BLOCK or FLAG
 */
public record RateRule(UUID id, int limit, int windowSeconds, ModerationAction action) {

    private static final Pattern SYNTAX = Pattern.compile("^([1-9][0-9]{0,5})/([1-9][0-9]{0,6})$");

    /** Parses {@code <count>/<seconds>}; empty for anything else. */
    public static Optional<RateRule> parse(UUID id, String pattern, ModerationAction action) {
        Matcher matcher = SYNTAX.matcher(pattern.trim());
        if (!matcher.matches()) {
            return Optional.empty();
        }
        return Optional.of(
                new RateRule(
                        id,
                        Integer.parseInt(matcher.group(1)),
                        Integer.parseInt(matcher.group(2)),
                        action));
    }

    public long windowMillis() {
        return windowSeconds * 1000L;
    }
}
