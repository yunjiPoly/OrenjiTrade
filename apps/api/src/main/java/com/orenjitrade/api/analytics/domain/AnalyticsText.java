package com.orenjitrade.api.analytics.domain;

import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Scrubs free text (search queries) before it enters an analytics event: e-mail addresses, decimal
 * numbers (a coordinate typed into a search box) and long digit runs (phone or card numbers) are
 * masked, whitespace is collapsed and the result is truncated. Pure and thread-safe.
 */
public final class AnalyticsText {

    /** Longest text kept in an event (Phase 4 contract: "query text truncated"). */
    public static final int MAX_LENGTH = 64;

    static final String EMAIL_MASK = "[email]";
    static final String NUMBER_MASK = "[number]";

    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+");
    private static final Pattern DECIMAL = Pattern.compile("[-+]?\\d+[.,]\\d+");
    private static final Pattern LONG_DIGITS = Pattern.compile("\\d{6,}");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern CONTROL = Pattern.compile("\\p{Cntrl}");

    private AnalyticsText() {}

    /** The scrubbed, truncated text; {@code null} when nothing is left. */
    public static @Nullable String sanitize(@Nullable String text) {
        return sanitize(text, MAX_LENGTH);
    }

    /** The scrubbed text truncated to {@code maxLength} characters; {@code null} when blank. */
    public static @Nullable String sanitize(@Nullable String text, int maxLength) {
        if (text == null) {
            return null;
        }
        String cleaned = CONTROL.matcher(text).replaceAll(" ");
        cleaned = EMAIL.matcher(cleaned).replaceAll(EMAIL_MASK);
        cleaned = DECIMAL.matcher(cleaned).replaceAll(NUMBER_MASK);
        cleaned = LONG_DIGITS.matcher(cleaned).replaceAll(NUMBER_MASK);
        cleaned = WHITESPACE.matcher(cleaned).replaceAll(" ").trim();
        if (cleaned.isEmpty()) {
            return null;
        }
        if (cleaned.codePointCount(0, cleaned.length()) > maxLength) {
            cleaned = cleaned.substring(0, cleaned.offsetByCodePoints(0, maxLength)).trim();
        }
        return cleaned;
    }
}
