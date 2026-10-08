package com.orenjitrade.api.users.domain;

import java.util.List;
import java.util.Locale;
import org.jspecify.annotations.Nullable;

/**
 * The languages the legal texts are published in. One {@code legal_document} version covers both:
 * the French text is a translation of the English draft, so a consent records the version and the
 * language that was shown ({@code user_consent.language}).
 */
public final class ConsentLanguage {

    public static final String ENGLISH = "en";
    public static final String FRENCH = "fr";
    public static final List<String> ALL = List.of(ENGLISH, FRENCH);

    /** Bean Validation pattern for request fields. */
    public static final String PATTERN = "en|fr";

    private ConsentLanguage() {}

    /** Lower-cased, trimmed code; English when absent (the language of every pre-V104 consent). */
    public static String normalize(@Nullable String language) {
        if (language == null || language.isBlank()) {
            return ENGLISH;
        }
        String code = language.trim().toLowerCase(Locale.ROOT);
        if (!ALL.contains(code)) {
            throw new IllegalArgumentException("Unsupported consent language: " + language);
        }
        return code;
    }
}
