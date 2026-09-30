package com.orenjitrade.api.users.domain;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Derives the initial handle of a freshly provisioned account from the email local part: lower
 * case, accents stripped, anything outside {@code [a-z0-9_]} replaced by {@code _}, 3 to 24
 * characters. Collisions are resolved by the caller with {@link #withSuffix(String, int)}.
 */
public final class HandleGenerator {

    public static final int MIN_LENGTH = 3;
    public static final int MAX_LENGTH = 24;
    public static final Pattern VALID = Pattern.compile("^[a-z0-9_]{3,24}$");

    static final String FALLBACK = "collector";

    private static final Pattern INVALID_CHARS = Pattern.compile("[^a-z0-9_]+");
    private static final Pattern REPEATED_UNDERSCORES = Pattern.compile("_{2,}");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");

    private HandleGenerator() {}

    /** The sanitised base handle for an email (or {@code collector} when there is none). */
    public static String baseFrom(@Nullable String email) {
        String local = email == null ? "" : email;
        int at = local.indexOf('@');
        if (at >= 0) {
            local = local.substring(0, at);
        }
        String normalised = Normalizer.normalize(local, Normalizer.Form.NFD);
        normalised = DIACRITICS.matcher(normalised).replaceAll("");
        String sanitised = normalised.toLowerCase(Locale.ROOT);
        sanitised = INVALID_CHARS.matcher(sanitised).replaceAll("_");
        sanitised = REPEATED_UNDERSCORES.matcher(sanitised).replaceAll("_");
        sanitised = trimUnderscores(sanitised);
        if (sanitised.length() < MIN_LENGTH) {
            sanitised = sanitised.isEmpty() ? FALLBACK : FALLBACK + "_" + sanitised;
        }
        if (sanitised.length() > MAX_LENGTH) {
            sanitised = trimUnderscores(sanitised.substring(0, MAX_LENGTH));
        }
        return sanitised;
    }

    /** {@code base} followed by {@code _<n>}, truncated so the result stays within 24 chars. */
    public static String withSuffix(String base, int n) {
        String suffix = "_" + n;
        int keep = Math.min(base.length(), MAX_LENGTH - suffix.length());
        return trimUnderscores(base.substring(0, keep)) + suffix;
    }

    public static boolean isValid(String handle) {
        return VALID.matcher(handle).matches();
    }

    private static String trimUnderscores(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && value.charAt(start) == '_') {
            start++;
        }
        while (end > start && value.charAt(end - 1) == '_') {
            end--;
        }
        return value.substring(start, end);
    }
}
