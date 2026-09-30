package com.orenjitrade.api.profiles.domain;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Rules for collector-created tag labels: 2 to 24 characters after trimming and collapsing
 * whitespace, starting with a letter or digit, otherwise letters, digits, spaces and {@code ' & + .
 * -}. The slug is the accent-stripped, lower-case label with every other run of characters replaced
 * by {@code -} (so "Cube Drafter" and "cube-drafter" are the same tag).
 */
public final class CustomTagLabels {

    public static final int MIN_LENGTH = 2;
    public static final int MAX_LENGTH = 24;
    static final int MAX_SLUG_LENGTH = 48;

    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern ALLOWED =
            Pattern.compile("^[\\p{L}\\p{N}][\\p{L}\\p{N} '&+.\\-]*$");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_SLUG = Pattern.compile("[^a-z0-9]+");

    private CustomTagLabels() {}

    /** Trimmed label with inner whitespace collapsed to single spaces. */
    public static String normalise(String raw) {
        return WHITESPACE.matcher(raw.trim()).replaceAll(" ");
    }

    /** Why a normalised label is refused, if it is. */
    public static Optional<String> problem(String label) {
        int length = label.codePointCount(0, label.length());
        if (length < MIN_LENGTH || length > MAX_LENGTH) {
            return Optional.of("must be " + MIN_LENGTH + " to " + MAX_LENGTH + " characters");
        }
        if (!ALLOWED.matcher(label).matches()) {
            return Optional.of("may only contain letters, digits, spaces and ' & + . -");
        }
        if (slugOf(label).isEmpty()) {
            return Optional.of("must contain letters or digits");
        }
        return Optional.empty();
    }

    /** The slug of a label ({@code "Cube Drafter"} becomes {@code "cube-drafter"}). */
    public static String slugOf(String label) {
        String decomposed = Normalizer.normalize(label, Normalizer.Form.NFD);
        String ascii = DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
        String slug = NON_SLUG.matcher(ascii).replaceAll("-");
        int start = 0;
        int end = slug.length();
        while (start < end && slug.charAt(start) == '-') {
            start++;
        }
        while (end > start && slug.charAt(end - 1) == '-') {
            end--;
        }
        slug = slug.substring(start, end);
        return slug.length() > MAX_SLUG_LENGTH ? slug.substring(0, MAX_SLUG_LENGTH) : slug;
    }
}
