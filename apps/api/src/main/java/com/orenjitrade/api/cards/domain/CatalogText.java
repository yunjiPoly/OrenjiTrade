package com.orenjitrade.api.cards.domain;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Text helpers of the catalog: slugs, search normalisation (lower-case, accents stripped, as the
 * generated {@code card.normalized_name}), LIKE escaping and printing codes.
 */
public final class CatalogText {

    /** Printing codes: set code, dash, number part (e.g. {@code LOB-EN001}, {@code SVX-045}). */
    public static final Pattern PRINTING_CODE = Pattern.compile("^[A-Z0-9]{2,10}-[A-Z0-9]{1,12}$");

    /** Start of a printing code while typing (e.g. {@code AZR-EN0}). */
    static final Pattern PRINTING_CODE_PREFIX = Pattern.compile("^[A-Z0-9]{2,10}-[A-Z0-9]{0,12}$");

    public static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");

    static final int MAX_SLUG_LENGTH = 100;

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

    private CatalogText() {}

    /** Lower-case, accent-free form used for trigram and LIKE matching. */
    public static String normalise(String text) {
        String decomposed = Normalizer.normalize(text.trim(), Normalizer.Form.NFD);
        return DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
    }

    /** URL slug of a card name: {@code "Émberfang Fox VMAX"} → {@code emberfang-fox-vmax}. */
    public static String slug(String name) {
        String slug = NON_ALNUM.matcher(normalise(name)).replaceAll("-");
        slug = trimDashes(slug);
        if (slug.length() > MAX_SLUG_LENGTH) {
            slug = trimDashes(slug.substring(0, MAX_SLUG_LENGTH));
        }
        return slug.isEmpty() ? "card" : slug;
    }

    /**
     * {@code base-2}, {@code base-3}, ... (a slug of {@link #slug} is at most 100 characters, the
     * column allows 120).
     */
    public static String slugWithSuffix(String base, int n) {
        return base + "-" + n;
    }

    /** Escapes LIKE wildcards ({@code ESCAPE '\'}). */
    public static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** The upper-cased printing code of {@code query} when it is one. */
    public static Optional<String> asPrintingCode(@Nullable String query) {
        if (query == null) {
            return Optional.empty();
        }
        String candidate = query.trim().toUpperCase(Locale.ROOT);
        return PRINTING_CODE.matcher(candidate).matches()
                ? Optional.of(candidate)
                : Optional.empty();
    }

    /** The upper-cased printing-code prefix of {@code query} when it looks like one. */
    public static Optional<String> asPrintingCodePrefix(@Nullable String query) {
        if (query == null) {
            return Optional.empty();
        }
        String candidate = query.trim().toUpperCase(Locale.ROOT);
        return PRINTING_CODE_PREFIX.matcher(candidate).matches()
                ? Optional.of(candidate)
                : Optional.empty();
    }

    /** Upper-cases a printing code for storage; {@code null}/blank stays {@code null}. */
    public static @Nullable String normalisePrintingCode(@Nullable String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private static String trimDashes(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && value.charAt(start) == '-') {
            start++;
        }
        while (end > start && value.charAt(end - 1) == '-') {
            end--;
        }
        return value.substring(start, end);
    }
}
