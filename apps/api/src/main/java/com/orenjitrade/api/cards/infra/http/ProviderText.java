package com.orenjitrade.api.cards.infra.http;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/** Small text helpers shared by the provider mappers. */
public final class ProviderText {

    private static final Pattern LEADING_NUMBER = Pattern.compile("^([^0-9]*)([0-9]+)(.*)$");

    private ProviderText() {}

    public static String trim(@Nullable String value) {
        return value == null ? "" : value.strip();
    }

    public static String upper(@Nullable String value) {
        return trim(value).toUpperCase(Locale.ROOT);
    }

    public static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max).strip();
    }

    /** An ISO date ({@code 2026-10-20}, a longer timestamp is cut to its date), else null. */
    public static @Nullable LocalDate parseDate(@Nullable String value) {
        String text = trim(value);
        if (text.length() < 10) {
            return null;
        }
        try {
            return LocalDate.parse(text.substring(0, 10));
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /**
     * Collector numbers in printed order: {@code 2} before {@code 10}, {@code 12} before {@code
     * 12a}, then plain text order ({@code TG01}, {@code SWSH001}, {@code ★5}).
     */
    public static int compareCollectorNumbers(String a, String b) {
        Matcher left = LEADING_NUMBER.matcher(a);
        Matcher right = LEADING_NUMBER.matcher(b);
        if (left.matches() && right.matches()) {
            int prefix = left.group(1).compareTo(right.group(1));
            if (prefix != 0) {
                return prefix;
            }
            int number = compareDigits(left.group(2), right.group(2));
            if (number != 0) {
                return number;
            }
            int rest = left.group(3).compareTo(right.group(3));
            if (rest != 0) {
                return rest;
            }
        }
        return a.compareTo(b);
    }

    private static int compareDigits(String a, String b) {
        String x = a.replaceFirst("^0+(?=.)", "");
        String y = b.replaceFirst("^0+(?=.)", "");
        if (x.length() != y.length()) {
            return Integer.compare(x.length(), y.length());
        }
        int digits = x.compareTo(y);
        return digits != 0 ? digits : Integer.compare(a.length(), b.length());
    }
}
